var striptags = require('striptags') // https://www.npmjs.com/package/striptags
const moment = require('moment')
/**
 * This function will check to see if the head of the snake is at the location of the food
 * @param snakeArray Array
 * @param foodLocation Array
 * @return Boolean - true/false if the food was eaten
 */
checkIfFoodEaten = (snakeArray, foodLocation) => {
  if (snakeArray[0].x === foodLocation.x && snakeArray[0].y === foodLocation.y) {
      return true
  } else {
      return false
  }   
}

/**
 * Get a new food location
 * @return new food location {x:0,y:0}
 */
getFoodLocation = () => {
  return getRandomLocation()
}

/**
 * This function will return a random room id
 * @param snakeArray Array
 * @return roomId (Room 1refe3f)
 */
generateRoomId = (activeLobbies) => {
  let randomNum = Math.random().toString(36).slice(6)
  var roomId = `Room ${Object.keys(activeLobbies).length+1}${randomNum}`
  return roomId
}
/**
 * Returns a random location on the game board
 * @return randomLocatin (x:0,y:0)
 */
getRandomLocation = () => {
  var x = Math.floor(Math.random()*50)+1
  var y = Math.floor(Math.random()*50)+1
  return {x, y}
}

/**
 * Ensures that the message has a username attached to it and text
 * @param message Message 
 * @return true/false depending if the message is valid
 */
validateMessage = (message) => {
  if(message) {
    if (!message.username || message.username === '') return false
    if (!message.messageText || message.messageText === '') return false
  } else {
      return false
  }
  return true
}

/**
 * removes tags from the message
 * @param snakeArray Array
 * @param foodLocation Array
 */
sanitizedMessage = (message) => {
  message.username = striptags(message.username)
  message.messageText = striptags(message.messageText)
  if (message.messageText === '') message.messageText = '-Message Removed-'
  message.timestamp = moment().format('MM/D/YY hh:mm a')
  return message
} 

/**
 * removes tags from the message
 * @param text what the server wants to say to the clients
 * @return message
 */
createMessageFromServer = (text) => {
  if (text !== null && text !== '') {
    return {
      username: 'Server',
      messageText: text,
      timestamp: moment().format('MM/D/YY hh:mm a')
    }
  }
}

// export these functions
module.exports = {
  checkIfFoodEaten,
  getFoodLocation,
  generateRoomId,
  getRandomLocation,
  validateMessage,
  sanitizedMessage,
  createMessageFromServer
}