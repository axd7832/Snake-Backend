/**
 * Initalizer for the snake array
 * @return snakeArr Snake with 1 element in it
 */
initSnake = () => {
  var randomLoc = getRandomLocation()
  var snakeArr = []
  snakeArr.push(createSnakeElem(randomLoc.x,randomLoc.y,true))
  return snakeArr
}

/**
 * Creates the object to be added to the snake
 * @param x coord
 * @param y coord
 * @param isHead should make the node a head node
 * @return isGameOver 
 */
createSnakeElem = (x, y, isHead) => {
  return {
      head: isHead,
      tail: isHead,
      x: x,
      y: y
  }
} 


/**
* @param : current snake array
* @param : direction of user input
* @param : last direction of the snake
* @return : the new snake location or -1 if the move is invalid
*  */ 
moveSnake = (snake, dir, lastDir) => {
  switch (dir) {
      case 'UP':
          if (lastDir !== "DOWN"){
              snake.unshift(createSnakeElem(snake[0].x, snake[0].y - 1,true));
          } else {
              snake = -1
          }
          break;
      case 'DOWN':
          if (lastDir !== "UP"){
              snake.unshift(createSnakeElem(snake[0].x, snake[0].y + 1,true));
          } else {
              snake = -1
          }
          break;
      case 'LEFT':
          if (lastDir !== "RIGHT"){
              snake.unshift(createSnakeElem(snake[0].x - 1, snake[0].y,true));
          } else {
              snake = -1
          }
          break;
      case 'RIGHT':
          if (lastDir !== "LEFT"){
              snake.unshift(createSnakeElem(snake[0].x + 1, snake[0].y,true));
          } else {
              snake = -1
          }
          break;
      default:
          // console.log('do nothing')
          break;
  }
  if (snake.length > 1) {
      return snake.slice(0,-1)
  } else {
      return snake
  }
}

/**
 * extends the snake by one
 * @param game Object
 * @return isGameOver 
 */
extendSnake = (snakeArray) => {
  var currentSnakeEnd = snakeArray[snakeArray.length-1]
  snakeArray.push(createSnakeElem(currentSnakeEnd.x,currentSnakeEnd.y,false))
  return snakeArray
}

//export the functions
module.exports = {
  initSnake,
  createSnakeElem,
  moveSnake,
  extendSnake
}
