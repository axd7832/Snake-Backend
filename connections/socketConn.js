const jwt = require('jsonwebtoken')
const moment = require('moment')
var striptags = require('striptags') // https://www.npmjs.com/package/striptags
// WebSocket Security by Heroku : https://devcenter.heroku.com/articles/websocket-security

const Game = require('../models/Game')


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
                    var inviteeSocket = findOneUserSocketByUsername(response.inviteeUsername)
                    var inviteeCurrentRoom = inviteeSocket.currentRoom
                    joinRoom(socket,inviteeCurrentRoom)
                    // add the invitee to the current game save in the db
                    let query = {hostUsername: inviteeSocket.username, gameStatus: 'Created', gameId: inviteeCurrentRoom}
                    let updatedDoc = {
                        playerTwoUsername: socket.username,
                        gameStatus: 'Awaiting Ready Up'
                    } 
                    Game.findOneAndUpdate(query, updatedDoc, {new: true}, (err, model) => {
                        if (err) {
                            console.log('Could Not Update')
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
                            score: 0,
                            foodLocation: getFoodLocation(),
                            snakeArray: initSnake(),
                            lastMoveTIme: moment().toISOString()
                        }
                        Game.findOneAndUpdate({gameId: roomId}, gameStartObj, {new: true}, (err, game) => {
                            if (err || game === null) {
                                console.log('Could Not Update Game Status to Active')
                            }
                            sendGameData(roomId, game.snakeArray, game.foodLocation)
                        })
                    }
                })
            })  
        })

        socket.on('GAME_COMMAND', (gameUpdate) => {
            var query = {
                gameId: gameUpdate.roomId,
            }
            Game.findOneAndUpdate(query,{new: true}, (err, game) => {
                if (err || game === null) {
                    // console.log(`Could not retrieve game: ${query.gameId}`)
                } else {
                    console.log(game)
                    if (game.gameStatus === 'Active') {
                            // check the time of the last move - 
                        var lastMove = moment(game.lastMoveTime)
                        // console.log(lastMove)
                        var diff = moment().diff(lastMove)
                        if ( diff > 300){
                            // perform all the game operations here
                            console.log('\nMOVING SNAKE\n')
                            console.log(game.snakeArray)
                            var updatedSnakeArr = moveSnake(game.snakeArray, gameUpdate.userInputDirection)
                            Game.findOneAndUpdate(query,{snakeArray: updatedSnakeArr, lastMoveTime: moment().toISOString()},{new:true},(err, updatedGame) => {
                                if (err || updatedGame === null) {
                                    console.log(`Could not retrieve game: ${query.gameId}`)
                                }
                                // UPDATING CLIENTS
                                console.log('UPDATING CLIENTS')
                                console.log(updatedGame)
                                sendGameData(updatedGame.gameId, updatedGame.snakeArray, updatedGame.foodLocation)
                            })
                        } else {
                            console.log('\nNEXT MOVE TOO SOON\n')
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
        console.log(onlineUsers)
        return onlineUsers
    }
    
    // instead of setting a timeout on all requests send, this function will be called after a set amount of time
    // intended to prevent memory issues.
    var removeExpiredRequests = () => {
        //console.log('cleanning requests...')
    }

    var sendGameData = (gameId, snakeArr, foodLoc) => {
        io.to(gameId).emit('GAME_UPDATE',{snakeArr,foodLoc})
    }
    var getFoodLocation = () => {
        return getRandomLocation()
    }
    var initSnake = () => {
        var randomLoc = getRandomLocation()
        var snakeArr = []
        snakeArr.push(createSnakeHead(randomLoc.x,randomLoc.y))
        return snakeArr
    }
    var createSnakeHead = (x, y) => {
        return {
            head: true,
            tail: false,
            x: x,
            y: y
        }
    } 
    var getRandomLocation = () => {
        var x = Math.floor(Math.random()*50)+1
        var y = Math.floor(Math.random()*50)+1
        return {x, y}
    }
    var moveSnake = (snake, dir) => {
        console.log(' \n---- IN MOVE SNAKE. STARTING SNAKE ---------\n')
        // console.log("DIRECTION: "+dir)
        console.log(snake)
        switch (dir) {
            case 'UP':
                // console.log('\nIN UP\n');
                // console.log(snake);
                // console.log(createSnakeHead(snake[0].x - 1, snake[0].y));
                // console.log('Before Unshift');
                // Unshift is doing weird stuff
                console.log('UP')
                snake.unshift(createSnakeHead(snake[0].x, snake[0].y - 1));
                break;
            case 'DOWN':
                console.log('DOWN')
                snake.unshift(createSnakeHead(snake[0].x, snake[0].y + 1));
                // console.log(snake);
                break;
            case 'LEFT':
                console.log('LEFT')
                snake.unshift(createSnakeHead(snake[0].x - 1, snake[0].y));
                // console.log(snake);
                break;
            case 'RIGHT':
                console.log('RIGHT')
                snake.unshift(createSnakeHead(snake[0].x + 1, snake[0].y));
                // console.log(snake);
                break;
            default:
                // console.log('do nothing')
                break;

        
        }
        console.log(snake)
        console.log('\n-------END SNAKE---------\n')
        return snake.splice(0,snake.length)
    }
    // every 5 minutes, remove the expired requests
    setInterval(removeExpiredRequests, 300000)
}