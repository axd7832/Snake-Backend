var striptags = require('striptags') // https://www.npmjs.com/package/striptags
const moment = require('moment')

checkIfFoodEaten = (snakeArray, foodLocation) => {
  if (snakeArray[0].x === foodLocation.x && snakeArray[0].y === foodLocation.y) {
      return true
  } else {
      return false
  }   
}
getFoodLocation = () => {
  return getRandomLocation()
}
// Create a roomId, adds one to the current active lobbies
generateRoomId = (activeLobbies) => {
  let randomNum = Math.random().toString(36).slice(6)
  var roomId = `Room ${Object.keys(activeLobbies).length+1}${randomNum}`
  return roomId
}
getRandomLocation = () => {
  var x = Math.floor(Math.random()*50)+1
  var y = Math.floor(Math.random()*50)+1
  return {x, y}
}

validateMessage = (message) => {
  if(message) {
    if (!message.username || message.username === '') return false
    if (!message.messageText || message.messageText === '') return false
  } else {
      return false
  }
  return true
}

// strip tags to prevent XSS attacks
sanitizedMessage = (message) => {
  message.username = striptags(message.username)
  message.messageText = striptags(message.messageText)
  if (message.messageText === '') message.messageText = '-Message Removed-'
  message.timestamp = moment().format('MM/D/YY hh:mm a')
  return message
} 
module.exports = {
  checkIfFoodEaten,
  getFoodLocation,
  generateRoomId,
  getRandomLocation,
  validateMessage,
  sanitizedMessage
}