const mongoose = require("mongoose")
const Schema = mongoose.Schema
// Mongoose Schema for a Message
var MessageSchema = new Schema({
  sentBy: String,
  messageText: String,
  roomId: String
}, {timestamps:true})

module.exports = mongoose.model("Message",MessageSchema, "Messages")
