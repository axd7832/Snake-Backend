const jwt = require('jsonwebtoken')
const moment = require('moment')
var striptags = require('striptags') // https://www.npmjs.com/package/striptags
// WebSocket Security by Heroku : https://devcenter.heroku.com/articles/websocket-security
var connectedUsers = []
var activeLobbies = {}

module.exports.startListening = function (io) {
    // const io = require("socket.io")(http)
    //io.listen(http)
    
    //Authentication Middleware
    io.use((socket, next) => {
        if (socket.handshake.query && socket.handshake.query.token){
            jwt.verify(socket.handshake.query.token, process.env.TOKEN_SECRET, (err, decoded) => {
                if(err) return next(new Error('Authentication error'))
                socket.decoded = decoded
                socket.username = decoded.user.username
                console.log(socket.username)
                next()
            })
        } else {
            next(new Error('Authentication error'))
        }    
    })
    // When a user connects to the WS
    // TODO add message id's
    
    io.on('connection', (socket) => {
        console.log('a user connected')
        socket.join('Room 0')
        socket.emit('roomChange', 'Room 0')
        if (connectedUsers.indexOf(socket.username) === -1) {
          connectedUsers.push(socket.username)
        }
        else {
          //emit an error
          //close the socket
          console.log('User Already Logged In')
        }
        // event for a user creating a lobby
        socket.on('CREATE_LOBBY', () => {
            // add player to a new room.
            var roomId = generateRoomId()
            // console.log(roomId)
            var currentRoom = getSocketCurrentRoom(socket)
            socket.leave(currentRoom)
            socket.join(roomId)
            socket.emit('roomChange',roomId)
            var lobby = {
                players : []
            }
            lobby.players.push(socket)
            activeLobbies[roomId] = lobby
            console.log(activeLobbies)
            // add room id, and player info into 
            
        })

        // need a way to close the lobby

        socket.on('invitePlayer', (inviteeUsername) => {
            console.log(inviteeUsername)
            //console.log(connectedSocketUsers)
            // will be undefined if there are no users found
            let foundUserSocket = findOneUserSocketByUsername(inviteeUsername)
            console.log(foundUserSocket)
            if(foundUserSocket) {
                // console.log(foundUserSocket.username)
                // console.log(foundUserSocket.id)
                // create an invite. From, to
                createNewInviteRequest(socket,foundUserSocket)
                

            } else {
                console.log('No User Found')
            }

            // find the username of the player that the invite is being sent to 
            // ensure that the player is real and online
            // emit an invite to the invitee and wait for a response.
            // set a 30 second timeount on the invite

        })

        socket.on('inviteResponse', (response) => {
            console.log(response)
            if (response) {
                if(response.answer && response.inviteeUsername && response.answer === true) {
                    console.log(response.answer)
                    console.log(response.inviteeUsername)
                    var inviteeSocket = findOneUserSocketByUsername(response.inviteeUsername)
                    var inviteeCurrentRoom = getSocketCurrentRoom(inviteeSocket)
                    var socketCurrentRoom = getSocketCurrentRoom(socket)
                    console.log(`Invitee Current Room: ${inviteeCurrentRoom}`)
                    // Leave the current room, emit a room change, join the new room
                    socket.leave(socketCurrentRoom)
                    socket.emit('roomChange',inviteeCurrentRoom) 
                    socket.join(inviteeCurrentRoom)
                    // console.log(inviteeCurrentRoom)
                }
            }
        })

        // event for a user inviting another player
        // add a timeout to ensure that the recipient player accepts / denies invitation

        // start game - start sending game data
        console.log(connectedUsers)
        socket.on('disconnect', () => {
            console.log('a user disconnected')
            if (socket.username) {
              var userIndex = connectedUsers.indexOf(socket.username)
              connectedUsers.splice(userIndex,userIndex+1)
              console.log(connectedUsers)
            }
        })
        socket.on('SEND_MESSAGE', (message) => {
          console.log(message)
          if (validateMessage(message)) {
            //console.log(message)
            var currentRoom = getSocketCurrentRoom(socket)
            //console.log(socket)
            console.log(`sending to ${currentRoom}`)
            io.to(currentRoom).emit('message',sanitizedMessage(message))
          }
        })
    })

    // TODO - move helper functions to another file
    var validateMessage = (message) => {
        if(message) {
          //console.log('inside validate')
          //console.log(message)
          if (!message.username || message.username === '') return false
          if (!message.messageText || message.messageText === '') return false
        } else {
            return false
        }
        return true
    }
    // strip tags to prevent XSS attacks
    var sanitizedMessage = (message) => {
        console.log('in sanitize')
        message.username = striptags(message.username)
        message.messageText = striptags(message.messageText)
        if (message.messageText === '') message.messageText = '-Message Removed-'
        message.timestamp = moment().format('MM/D/YY hh:mm a')
        console.log(message)
        return message
    } 

    var generateRoomId = () => {
        var roomId = `Room ${Object.keys(activeLobbies).length+1}`
        return roomId
    }
    var getAllConnectedSocketUsers = () => {
        var connectedSocketArray = Object.keys(io.sockets.connected).map(function(id) {
            return io.sockets.connected[id]
        })
        return connectedSocketArray
    }

    var findOneUserSocketByUsername = (searchUsername) => {
        var connectedSocketUsers = getAllConnectedSocketUsers()
            //console.log(connectedSocketUsers)
            // will be undefined if there are no users found
        let foundUserSocket = connectedSocketUsers.find(socket => socket.username === searchUsername)
        if(foundUserSocket) return foundUserSocket
        else return null
    }

    var createNewInviteRequest = (fromSocket, toSocket) => {
        if (fromSocket && toSocket) {
            console.log('inside of new invite')
            io.to(`${toSocket.id}`).emit('gameInvite', `${fromSocket.username}`)
        }
        /**
         * io.to(`${foundUserSocket.id}`).emit('gameInvite', 'person has invited you. Do you accept?')
         */
    }
    var getSocketCurrentRoom = (socket) => {
        return Object.keys(io.sockets.adapter.sids[socket.id]).filter(item => item!=socket.id)[0];
    }

    // instead of setting a timeout on all requests send, this function will be called after a set amount of time
    // intended to prevent memory issues.
    var removeExpiredRequests = () => {
        console.log('cleanning requests...')
    }

    // every 10 minutes, remove the expired requests
    setInterval(removeExpiredRequests, 600000)
}