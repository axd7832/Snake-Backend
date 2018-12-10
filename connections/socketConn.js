const jwt = require('jsonwebtoken')
const moment = require('moment')
// WebSocket Security by Heroku : https://devcenter.heroku.com/articles/websocket-security

// Mongoose Schemas
const Game = require('../models/Game')
const MessageDoc = require('../models/Message')

// Exported Logic
require('../game/gameHelpers')
require('../game/gameLogic')
require('../game/socketHelpers')
require('../game/snakeLogic')

const LOBBY_ROOM = 'Room 0'
var connectedUsers = []
var activeLobbies = {}

module.exports.startListening = function (io) {   
    //Authentication Middleware - Runs before anything else
    io.use((socket, next) => {
        if (socket.handshake.query && socket.handshake.query.token){
            // Authorization of a a valid JWT
            // JWT must be signed with Server's Secret Key
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

    /**
     * The main WebSocket function
     */
    io.on('connection', (socket) => {
        socket.join(LOBBY_ROOM)
        // alert UI about room change
        socket.emit('roomChange', LOBBY_ROOM)
        socket.currentRoom = LOBBY_ROOM
        var indexOfUser = connectedUsers.findIndex( user => user.username == socket.username)
        if ( indexOfUser === -1) {
          connectedUsers.push({username:socket.username, socket: socket})
          io.emit("currentOnlinePlayers", getActivePlayerUsernames(socket.username))
        } else {
          console.log('User Already Logged In')
        }

        // when a socket disconnects
        // emit the current players when someone joins or leaves 
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
            var roomId = generateRoomId(activeLobbies)
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
                    var roomId = generateRoomId(activeLobbies)
                    var inviteeSocket = findOneUserSocketByUsername(response.inviteeUsername)
                    // send the players to a new room
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
        /**
         * After a game has been played, option to play again
         * Moves the users to a new room with a new game
         * TODO: Change the unique id of a game from the roomId
         */
        socket.on('PLAY_AGAIN', (roomId) => {
            if (roomId) {
                Game.findOne({gameId:roomId},(err, game) => {
                    if (err || game === null) console.log('Could Not Update')
                    else {
                        var roomId = generateRoomId(activeLobbies)
                        var inviteeSocket = findOneUserSocketByUsername(game.playerTwoUsername)
                        var hostSocket = findOneUserSocketByUsername(game.hostUsername)
                        // send the users to the new room
                        joinRoom(hostSocket,roomId)
                        joinRoom(inviteeSocket,roomId)
                        if (hostSocket && inviteeSocket) {
                            var newGame = new Game({
                                gameId: roomId,
                                hostUsername: inviteeSocket.username,
                                playerTwoUsername: hostSocket.username,
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
                                    sendGameData(newGame.gameId,newGame)
                                }
                            })  
                        }
                    }
                })    
            }
        })
        
        /** 
         * returns the active players to ONE Socket 
         * */
        socket.on('getOnlinePlayers', () => {
            socket.emit("currentOnlinePlayers", getActivePlayerUsernames(socket.username))
        })

        /** 
         * Returns the top 20 players with the highest scores (Top 10 Games) Descending
        */
        socket.on('getLeaderboards', () => {
            Game.find({gameStatus:'Completed'})
                .sort('-score')
                .exec((err, results) => {
                if (!err && results !== null){
                    var leaderboards = []
                    results.forEach((game, index) => {
                        var p1 = {rank: index+1, username: game.hostUsername, score: game.score}
                        var p2 = {rank: index+1, username: game.playerTwoUsername, score: game.score}
                        leaderboards.push(p1)
                        leaderboards.push(p2)
                    })
                    socket.emit("currentLeaderboards", leaderboards.splice(0,20))
                }
            })
        })

        /**
         * Processes the message for chat, sends to the users current room
         */
        socket.on('SEND_MESSAGE', (message) => {
            // calls the message validation
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

        /** 
         * Called when users Ready Up for the game 
         * When both players are Ready, the game is started and inputs are allowed
        */
        socket.on('GAME_READY_UP', (roomId) => {
            // Searches for a game where the user is either the host or player2
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

        /**
         * Commands from the frontend (W,A,S,D)
         * Ensures that the game is active and updates the game
         */
        socket.on('GAME_COMMAND', (gameUpdate) => {
            var query = {
                gameId: gameUpdate.roomId,
            }
            Game.findOneAndUpdate(query,{new: true}, (err, game) => {
                if (err || game === null) {
                    console.log(`Could not retrieve game: ${query.gameId}`)
                } else {
                    if (game.gameStatus === 'Active') {
                        // check the time of the last move - 
                        var lastMove = moment(game.lastMoveTime)
                        var diff = moment().diff(lastMove)
                        // this is the 'tick' of the game...
                        if ( diff > 100){
                            // perform all the game operations here
                            game.snakeArray = moveSnake(game.snakeArray, gameUpdate.userInputDirection, game.lastMoveDirection)
                            if (game.snakeArray[0] !== -1) {
                                game.lastMoveTime = moment().toISOString()
                                // used to stop the snake from moving backwards
                                game.lastMoveDirection = gameUpdate.userInputDirection 
                                var wasFoodEaten = checkIfFoodEaten(game.snakeArray, game.foodLocation)
                                if (wasFoodEaten === true) {
                                    game.snakeArray = extendSnake(game.snakeArray,gameUpdate.userInputDirection)
                                    game.foodLocation = getFoodLocation()
                                    game.score += 100
                                }
                                // check if game over
                                var isGameOver = checkGameOver (game)
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

    /** 
     * Takes a socket and a new roomId and joins the room
     * */
    var joinRoom = (socket, roomToJoin) => {
        if(socket && roomToJoin) {
            socket.leave(socket.currentRoom)
            socket.join(roomToJoin)
            socket.currentRoom = roomToJoin
            socket.emit('roomChange',roomToJoin)
        }
    }

    // helper to find the socket of a user by username
    var findOneUserSocketByUsername = (searchUsername) => {
        let foundUserSocketIndex = connectedUsers.findIndex(user => user.username === searchUsername)
        if(foundUserSocketIndex !== -1) return connectedUsers[foundUserSocketIndex].socket
        else return null
    }

    /**  
     * helper to return the active players by username
     * TODO remove the current active socket from the returned array */
    var getActivePlayerUsernames = (username) => {
        var onlineUsers = connectedUsers.map(user => user.username)
        // if username is passed in, remove it from the onlineUsers 
        if (username) {
            onlineUsers = onlineUsers.filter(user => user !== username)
        }
        return onlineUsers
    }
    // sends an invite to toSocket from fromSocket...
    var createNewInviteRequest = (fromSocket, toSocket) => {
      if (fromSocket && toSocket) {
          io.to(`${toSocket.id}`).emit('gameInvite', `${fromSocket.username}`)
      }
    }

    // instead of setting a timeout on all requests send, this function will be called after a set amount of time
    // intended to prevent memory issues.
    var removeExpiredRequests = () => {
        // remove all games that are older than 10 minutes old
        // and are status: 'Created' or 'Awaiting Ready Up'
        var query = {
            $and: [
                {
                    updatedAt: {
                        $lt: moment(new Date()).subtract(10, "minutes").toDate()
                    }
                },
                {
                    $or: [
                        {
                            gameStatus: 'Game Created'
                        },
                        {
                            gameStatus: 'Awaiting Ready Up'
                        }
                    ]
                }
            ]  
        }

        Game.find(query, (err, games) => {
            if (err || games === null){
                console.log('Errr....')
            } else {
                console.log('Incomplete games deleted...')
            }
        })
    }
    
    /**
     * Emits the updated game to the room (gameId)
     */
    var sendGameData = (gameId, game) => {
        io.to(gameId).emit('GAME_UPDATE',{
            snakeArr: game.snakeArray,
            foodLoc: game.foodLocation,
            gameStatus: game.gameStatus, 
            score: game.score
        })
    }
    
    // every 5 minutes, remove incomplete games
    setInterval(removeExpiredRequests, 300000)
}