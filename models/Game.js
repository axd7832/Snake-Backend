const mongoose = require("mongoose")
const Schema = mongoose.Schema

var GameSchema = new Schema({
  hostUsername: {
    type: String,
    required: [true, 'Host Username can not be empty.'],
  },
  playerTwoUsername: {
    type: String,
  },
  gameId: String,
  hostReady: Boolean,
  playerTwoReady: Boolean,
  gameStatus: String,
  snakeArray: Array,
  foodLocation: Object,
  score: Number,
  lastMoveTime: { type : Date, default: Date.now }
}, {timestamps:true})

module.exports = mongoose.model('Game',GameSchema, "Games")
