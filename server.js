const dotenv = require('dotenv').config()
const axios = require('axios')
const cors = require('cors')
const bodyParser = require("body-parser")
const cookieParser = require('cookie-parser')
const app = require("express")()
const server = require("http").createServer(app)
const io = require("socket.io")(server)

const socketConn = require('./connections/socketConn')
const port = process.env.PORT || 4000
const routes = require('./routes')

// Security
const helmet = require('helmet') // https://github.com/helmetjs/helmet

// Sanitization
const mongoSanitize = require('express-mongo-sanitize');

// Mongo Connection
const mongoose = require("mongoose")
const mongoDB = process.env.MONGO_URI
mongoose.connect(mongoDB, { 
  useNewUrlParser: true,
  useCreateIndex: true,
})
mongoose.Promise = global.Promise
mongoose.connect(mongoDB, { useNewUrlParser: true })
mongoose.connection.once('open', () => {
  app.emit('ready')
})

app.use(cors())
app.use(cookieParser(process.env.COOKIE_SECRET))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: false}))
// removes $ and .
// These characters are dangerous for performing arbitarty '$where' attacks in the db
app.use(helmet())
app.use(mongoSanitize())
app.use(routes)

//rename this
socketConn.startListening(io)

app.on('ready', () => {
  server.listen(port, () => {
    console.log(`The Magic Is Happening On Port ${port}`)
  })
})
