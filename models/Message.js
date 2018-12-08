const mongoose = require("mongoose")
const Schema = mongoose.Schema

var MessageSchema = new Schema({
  sentBy: String,
  messageText: String,
  roomId: String
}, {timestamps:true})

module.exports = mongoose.model("Message",MessageSchema, "Messages")
