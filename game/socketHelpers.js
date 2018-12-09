// helper to get the currentRoom attached to a socket
getSocketCurrentRoom = (socket) => {
  return socket.currentRoom
}

module.exports = {
  getSocketCurrentRoom
}