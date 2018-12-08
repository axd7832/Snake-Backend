const jwt = require('jsonwebtoken')
const moment = require('moment')
var striptags = require('striptags') // https://www.npmjs.com/package/striptags
// WebSocket Security by Heroku : https://devcenter.heroku.com/articles/websocket-security

const Game = require('../models/Game')
const MessageDoc = require('../models/Message')

const LOBBY_ROOM = 'Room 0'
var connectedUsers = []
var activeLobbies = {}

module.exports.startListening = function (io) {   
    //Authentication Middleware
    io.use((socket, next) => {
        if (socket.handshake.query && socket.handshake.query.token){
            jwt.verify(socket.handshake.query.token, process.env.TOKEN_SECRET, (err, decoded) => {
                if(err) return next(new Error('Authentication error'))
                socket.decoded = decoded
                socket.username = decoded.user.username
                next()
            })
        } else {
            next(new Error('Authentication error'))
        }    
    })

    // When a user connects to the socket
    io.on('connection', (socket) => {
        socket.join(LOBBY_ROOM)
        // alert UI about room change
        socket.emit('roomChange', LOBBY_ROOM)
        socket.currentRoom = LOBBY_ROOM
        var indexOfUser = connectedUsers.findIndex( user => user.username == socket.username)
        if ( indexOfUser === -1) {
          connectedUsers.push({username:socket.username, socket: socket})
          io.emit("currentOnlinePlayers", getActivePlayerUsernames())
        } else {
          // TODO: emit something to log the user out.
          console.log('User Already Logged In')
        }

        // when a socket disconnects
        socket.on('disconnect', () => {
            if (socket.username) {
              var userIndex = connectedUsers.findIndex(user => user.username == socket.username)
              connectedUsers.splice(userIndex,userIndex+1)
            }
            io.emit("currentOnlinePlayers", getActivePlayerUsernames())
        })

        // event for a user creating a lobby
        socket.on('CREATE_LOBBY', () => {
            // add player to a new room.
            var roomId = generateRoomId()
            // leave the current room, join the inviters room
            joinRoom(socket,roomId)
            var lobby = {
                players : []
            }
            lobby.players.push(socket)
            activeLobbies[roomId] = lobby
            // create the game save in the db
            var newGame = new Game({
                gameId: roomId,
                hostUsername: socket.username,
                gameBounds: {width: 50, height: 50},
                gameStatus: 'Created'
            })
            newGame.save( (err) => {
                if(err) {
                  console.log(err)
                } else{
                  console.log('Game Created')
                }
            })     
        })

        // event for a user inviting another player
        // add a timeout to ensure that the recipient player accepts / denies invitation
        socket.on('invitePlayer', (inviteeUsername) => {
            // will be undefined if there are no users found
            let foundUserSocket = findOneUserSocketByUsername(inviteeUsername)
            if(foundUserSocket) {
                // create an invite. 
                createNewInviteRequest(socket,foundUserSocket)
            } else {
                console.log('No User Found')
            }
        })
        
        // player has already gotten and invite and is responding to it.
        // the response object here must contain the inviting username
        socket.on('inviteResponse', (response) => {
            if (response) {
                if(response.answer && response.inviteeUsername && response.answer === true) {
                    var roomId = generateRoomId()
                    var inviteeSocket = findOneUserSocketByUsername(response.inviteeUsername)
                    var inviteeCurrentRoom = inviteeSocket.currentRoom
                    joinRoom(socket,roomId)
                    joinRoom(inviteeSocket,roomId)

                    var newGame = new Game({
                        gameId: roomId,
                        hostUsername: inviteeSocket.username,
                        playerTwoUsername: socket.username,
                        gameBounds: {width: 50, height: 50},
                        gameStatus: 'Awaiting Ready Up',
                        score: 0,
                        foodLocation: getFoodLocation(),
                        snakeArray: initSnake()
                    })
                    newGame.save( (err) => {
                        if(err) {
                          console.log(err)
                        } else{
                          console.log('Game Created')
                          sendGameData(newGame.gameId,newGame)
                        }
                    })  
                }
            }
        })
        
        // returns the active players to ONE Socket
        socket.on('getOnlinePlayers', () => {
            socket.emit("currentOnlinePlayers", getActivePlayerUsernames())
        })

        socket.on('SEND_MESSAGE', (message) => {
          if (validateMessage(message)) {
            var currentRoom = getSocketCurrentRoom(socket)
            // save the sanitized message to the DB here...
            var Message = new MessageDoc ({
                sentBy: message.username,
                messageText: message.messageText,
                roomId: getSocketCurrentRoom(socket)
            })
            Message.save()
            io.to(currentRoom).emit('message',sanitizedMessage(message))
          }
        })

        // game logic 
        socket.on('GAME_READY_UP', (roomId) => {
            let query = {
                $and: [
                    {gameStatus: 'Awaiting Ready Up'},
                    {gameId: roomId},
                    {
                        $or: [
                            {
                                hostUsername: socket.username
                            },
                            {
                                playerTwoUsername: socket.username
                            }
                        ]
                    }
                ]  
            }
            Game.findOne(query,(err, model) => {
                if (err || model === null) {
                    console.log('Could Not Update')
                }
                // now that I have the model that contains whichever player was trying to ready up
                // check to see which player the user is 
                let playerType = 'Guest'
                if (model.hostUsername === socket.username) {
                    playerType = 'Host'
                } else if (model.playerTwoUsername === socket.username) {
                    playerType = "Player 2"
                }
                let query = {
                    gameId: roomId,
                    gameStatus: 'Awaiting Ready Up',
                }
                updatedDoc = {}
                if (playerType === 'Host') {
                    query.hostUsername = socket.username
                    updatedDoc.hostReady = true
                } else if (playerType === 'Player 2') {
                    query.playerTwoUsername = socket.username
                    updatedDoc.playerTwoReady = true
                }
                Game.findOneAndUpdate(query, updatedDoc, {new: true}, (err, model) => {
                    if (err) {
                        console.log(`Could Not Ready Up: ${socket.username}`)
                    }
                    // check if both of the players are ready
                    if (model.hostReady === true && model.playerTwoReady === true) {
                        var gameStartObj = {
                            gameStatus: 'Active',
                            lastMoveTime: moment().toISOString()
                        }
                        Game.findOneAndUpdate({gameId: roomId}, gameStartObj, {new: true}, (err, game) => {
                            if (err || game === null) {
                                console.log('Could Not Update Game Status to Active')
                            }
                            sendGameData(roomId, game)
                        })
                    }
                })
            })  
        })

        socket.on('GAME_COMMAND', (gameUpdate) => {
            var query = {
                gameId: gameUpdate.roomId,
            }
            //console.log(`IN GAME COMMAND ${socket.username}`)
            Game.findOneAndUpdate(query,{new: true}, (err, game) => {
                if (err || game === null) {
                    console.log(`Could not retrieve game: ${query.gameId}`)
                } else {
                    //console.log(game)
                    if (game.gameStatus === 'Active') {
                        // check the time of the last move - 
                        var lastMove = moment(game.lastMoveTime)
                        // console.log(lastMove)
                        var diff = moment().diff(lastMove)
                        // this is the 'tick' of the game...
                        if ( diff > 100){
                            // perform all the game operations here
                            game.snakeArray = moveSnake(game.snakeArray, gameUpdate.userInputDirection, game.lastMoveDirection)
                            console.log("\nAFTER MOVEMENT\n")
                            console.log(game.snakeArray)
                            if (game.snakeArray[0] !== -1) {
                                console.log("\nVALID MOVE\n")
                                game.lastMoveTime = moment().toISOString()
                                game.lastMoveDirection = gameUpdate.userInputDirection
                                // console.log("SETTING THE NEW SNAKE ARRAY")
                                // console.log(game.snakeArray)
                                var wasFoodEaten = checkIfFoodEaten(game.snakeArray, game.foodLocation)
                                if (wasFoodEaten === true) {
                                    console.log("FOOD EATEN")
                                    game.snakeArray = extendSnake(game.snakeArray,gameUpdate.userInputDirection)
                                    game.foodLocation = getFoodLocation()
                                    game.score += 100
                                }
                                // check if game over
                                var isGameOver = checkGameOver (game)
                                console.log(`\nCHECK GAME OVER ${isGameOver}\n`)      
                                if (isGameOver === true) game.gameStatus = "Completed"                   
                                Game.findOneAndUpdate({gameId: game.gameId},game,{new:true},(err, updatedGame) => {
                                    if (err || updatedGame === null) {
                                        console.log(`Could not retrieve game: ${query.gameId}`)
                                    }
                                    sendGameData(updatedGame.gameId, updatedGame)
                                })
                            }
                        }
                    }
                }
            })
        })
    })

    // join the new room
    var joinRoom = (socket, roomToJoin) => {
        if(socket && roomToJoin) {
            socket.leave(socket.currentRoom)
            socket.join(roomToJoin)
            socket.currentRoom = roomToJoin
            socket.emit('roomChange',roomToJoin)
        }
    }

    // TODO - move helper functions to another file
    var validateMessage = (message) => {
        if(message) {
          if (!message.username || message.username === '') return false
          if (!message.messageText || message.messageText === '') return false
        } else {
            return false
        }
        return true
    }

    // strip tags to prevent XSS attacks
    var sanitizedMessage = (message) => {
        message.username = striptags(message.username)
        message.messageText = striptags(message.messageText)
        if (message.messageText === '') message.messageText = '-Message Removed-'
        message.timestamp = moment().format('MM/D/YY hh:mm a')
        return message
    } 

    // Create a roomId, adds one to the current active lobbies
    var generateRoomId = () => {
        let randomNum = Math.random().toString(36).slice(6)
        var roomId = `Room ${Object.keys(activeLobbies).length+1}${randomNum}`
        return roomId
    }

    // helper to find the socket of a user by username
    var findOneUserSocketByUsername = (searchUsername) => {
        let foundUserSocketIndex = connectedUsers.findIndex(user => user.username === searchUsername)
        if(foundUserSocketIndex !== -1) return connectedUsers[foundUserSocketIndex].socket
        else return null
    }

    // sends an invite to toSocket from fromSocket...
    var createNewInviteRequest = (fromSocket, toSocket) => {
        if (fromSocket && toSocket) {
            io.to(`${toSocket.id}`).emit('gameInvite', `${fromSocket.username}`)
        }
    }

    // helper to get the currentRoom attached to a socket
    var getSocketCurrentRoom = (socket) => {
        return socket.currentRoom
    }

    // helper to return the active players by username
    // TODO remove the current active socket from the returned array
    var getActivePlayerUsernames = () => {
        var onlineUsers = connectedUsers.map(user => user.username)
        // console.log(onlineUsers)
        return onlineUsers
    }
    
    // instead of setting a timeout on all requests send, this function will be called after a set amount of time
    // intended to prevent memory issues.
    var removeExpiredRequests = () => {
        //console.log('cleanning requests...')
    }

    var sendGameData = (gameId, game) => {
        io.to(gameId).emit('GAME_UPDATE',{
            snakeArr: game.snakeArray,
            foodLoc: game.foodLocation,
            gameStatus: game.gameStatus, 
            score: game.score
        })
    }
    var getFoodLocation = () => {
        return getRandomLocation()
    }
    var initSnake = () => {
        var randomLoc = getRandomLocation()
        var snakeArr = []
        snakeArr.push(createSnakeElem(randomLoc.x,randomLoc.y,true))
        return snakeArr
    }
    var createSnakeElem = (x, y, isHead) => {
        return {
            head: isHead,
            tail: isHead,
            x: x,
            y: y
        }
    } 
    var getRandomLocation = () => {
        var x = Math.floor(Math.random()*50)+1
        var y = Math.floor(Math.random()*50)+1
        return {x, y}
    }
    /**
     * @param : current snake array
     * @param : direction of user input
     * @param : last direction of the snake
     * @return : the new snake location or -1 if the move is invalid
     *  */ 
    var moveSnake = (snake, dir, lastDir) => {
        // console.log(' \n---- IN MOVE SNAKE. STARTING SNAKE ---------\n')
        // console.log("DIRECTION: "+dir)
        // console.log("LAST DIRECTION: "+lastDir)
        // console.log(snake)
        switch (dir) {
            case 'UP':
                if (lastDir !== "DOWN"){
                    snake.unshift(createSnakeElem(snake[0].x, snake[0].y - 1,true));
                } else {
                    snake = -1
                }
                break;
            case 'DOWN':
                // console.log('DOWN')
                if (lastDir !== "UP"){
                    snake.unshift(createSnakeElem(snake[0].x, snake[0].y + 1,true));
                } else {
                    snake = -1
                }
                break;
            case 'LEFT':
                // console.log('LEFT')
                if (lastDir !== "RIGHT"){
                    snake.unshift(createSnakeElem(snake[0].x - 1, snake[0].y,true));
                } else {
                    snake = -1
                }
                break;
            case 'RIGHT':
                if (lastDir !== "LEFT"){
                    snake.unshift(createSnakeElem(snake[0].x + 1, snake[0].y,true));
                } else {
                    snake = -1
                }
                break;
            default:
                // console.log('do nothing')
                break;
        }
        if (snake.length > 1) {
            return snake.slice(0,-1)
        } else {
            return snake
        }
    }

    var checkIfFoodEaten = (snakeArray, foodLocation) => {
        if (snakeArray[0].x === foodLocation.x && snakeArray[0].y === foodLocation.y) {
            console.log("RETURNING TRUE")
            return true
        } else {
            console.log("RETURNING FALSE")
            return false
        }   
    }
    
    var checkGameOver = (game) => {
        if (game) {
            var isOutOfBounds = checkSnakeBounds(game)
            var didSnakeCollide = checkSnakeCollison(game)
            if (isOutOfBounds === true  || didSnakeCollide === true){
                return true
            } else {
                return false
            }
        }
    }
    var checkSnakeBounds = (game) => {
        if (game.snakeArray[0].x < 1 ||
            game.snakeArray[0].x > game.gameBounds.width ||
            game.snakeArray[0].y < 1 ||
            game.snakeArray[0].y > game.gameBounds.height) {
            return true
        }
        return false
    }

    var checkSnakeCollison = (game) => {
        console.log("\nIN SNAKE COLLISION")
        console.log(game.snakeArray)
        // check the head against all other elements in the array 
        var snakeHead = game.snakeArray[0]

        var collision  = game.snakeArray.slice(2,game.snakeArray.length)
            .filter(elem => (elem.x === snakeHead.x))
            .filter(elem => (elem.y === snakeHead.y))
        console.log(collision)
        if (collision.length) {
            return true
        } else {
            return false
        }
    }
    var extendSnake = (snakeArray) => {
        var currentSnakeEnd = snakeArray[snakeArray.length-1]
        snakeArray.push(createSnakeElem(currentSnakeEnd.x,currentSnakeEnd.y,false))
        return snakeArray
    }
    // every 5 minutes, remove the expired requests
    setInterval(removeExpiredRequests, 300000)
}