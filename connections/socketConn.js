const jwt = require('jsonwebtoken')
const moment = require('moment')
var striptags = require('striptags') // https://www.npmjs.com/package/striptags
// WebSocket Security by Heroku : https://devcenter.heroku.com/articles/websocket-security


module.exports.startListening = function (io) {
    // const io = require("socket.io")(http)
    //io.listen(http)
    var connectedUsers = []
    console.log(io)
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

        console.log(connectedUsers)
        socket.on('disconnect', (message) => {
            console.log('a user disconnected')
            if (socket.username) {
              var userIndex = connectedUsers.indexOf(socket.username)
              connectedUsers.splice(userIndex,userIndex+1)
              console.log(connectedUsers)
            }
        })
        socket.on('SEND_MESSAGE', (message) => {
          if (validateMessage(message)) {
            io.emit('message',sanitizedMessage(message))
          }
        })
    })
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

    // How to get all clients in a room
    // io.of('/').in('Room0').clients( function (err, clients) {
    //     console.log(clients)
    // })
}