checkGameOver = (game) => {
  if (game) {
      var isOutOfBounds = checkSnakeBounds(game)
      var didSnakeCollide = checkSnakeCollison(game)
      if (isOutOfBounds === true  || didSnakeCollide === true){
          return true
      } else {
          return false
      }
  }
}
checkSnakeBounds = (game) => {
  if (game.snakeArray[0].x < 1 ||
    game.snakeArray[0].x > game.gameBounds.width ||
    game.snakeArray[0].y < 1 ||
    game.snakeArray[0].y > game.gameBounds.height) {
    return true
  }
  return false
}

checkSnakeCollison = (game) => {
  // check the head against all other elements in the array 
  var snakeHead = game.snakeArray[0]
  var collision  = game.snakeArray
    .slice(2,game.snakeArray.length)
    .filter(elem => (elem.x === snakeHead.x))
    .filter(elem => (elem.y === snakeHead.y))
  if (collision.length) {
    return true
  } else {
    return false
  }
}

checkIfFoodEaten = (snakeArray, foodLocation) => {
  if (snakeArray[0].x === foodLocation.x && snakeArray[0].y === foodLocation.y) {
      return true
  } else {
      return false
  }   
}

module.exports = {
  checkGameOver,
  checkSnakeBounds,
  checkSnakeBounds,
  checkIfFoodEaten
}
