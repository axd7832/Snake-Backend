const mongoose = require("mongoose")
const Schema = mongoose.Schema
// Mongoose Schema for a User
var UserSchema = new Schema({
    username: {
        type: String,
        lowecase: true,
        required: [true, 'Username can not be empty.'],
        unique: true
    },
    role: {
        type: String,
        required: [true, 'Role is required.']
    },
    hash: {
        type: String,
        required: [true, 'Hash is required.']
    },
    highscore: Number,
    wins: Number,
}, {timestamps:true})

module.exports = mongoose.model('User',UserSchema, "Users")
