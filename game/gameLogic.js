/**
 * checks to see if the snake is outside of the bounds of the board or if it collided with itself
 * @param game Object
 * @return isGameOver 
 */
checkGameOver = (game) => {
  if (game) {
      var isOutOfBounds = checkSnakeBounds(game)
      var didSnakeCollide = checkSnakeCollision(game)
      if (isOutOfBounds === true  || didSnakeCollide === true){
          return true
      } else {
          return false
      }
  }
}

/**
 * is the snake inside of the games boards
 * @param game Object
 * @return true/false is out of bounds
 */
checkSnakeBounds = (game) => {
  if (game.snakeArray[0].x < 1 ||
    game.snakeArray[0].x > game.gameBounds.width ||
    game.snakeArray[0].y < 1 ||
    game.snakeArray[0].y > game.gameBounds.height) {
    return true
  }
  return false
}

/**
 * checks to see if the snake is outside of the bounds of the board or if it collided with itself
 * @param game Object
 * @return true/false if the snake collided with itself
 */
checkSnakeCollision = (game) => {
  // check the head against all other elements in the array 
  var snakeHead = game.snakeArray[0]
  var collision  = game.snakeArray
    .slice(2,game.snakeArray.length) // the snake can't collide with anything below 2
    .filter(elem => (elem.x === snakeHead.x))
    .filter(elem => (elem.y === snakeHead.y))
  if (collision.length) {
    return true
  } else {
    return false
  }
}

module.exports = {
  checkGameOver,
  checkSnakeBounds,
  checkSnakeCollision,
}
