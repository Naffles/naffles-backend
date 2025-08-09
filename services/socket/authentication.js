const { getAsync } = require("../../config/redisClient");

// Reusable authentication check function
async function authenticateSocket(socket) {
  const userId = await getAsync(`socketId:${socket.id}`);
  if (!userId) {
    // console.error("Authentication failed for socket:", socket.id);
    socket.emit("error", "Authentication failed or session expired.");
    return null;
  }
  return userId;
}

module.exports = { authenticateSocket }

