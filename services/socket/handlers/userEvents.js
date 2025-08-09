const { GENERAL_REDIS_TIMEOUT } = require("../../../config/config");
const { setAsync, delAsync } = require("../../../config/redisClient");
const Message = require("../../../models/chat/message");
const ActiveGame = require("../../../models/game/activeGame");
const User = require("../../../models/user/user");
const { authenticateSocket } = require("../authentication");

function clientRegistration(socket) {
  return async ({ userId }) => {
    // console.log("REGISTERING: ", userId, socket.id);
    // Store the mapping of userId to socketId in Redis
    await setAsync(`userId:${userId}`, socket.id, "EX", GENERAL_REDIS_TIMEOUT);
    await setAsync(`socketId:${socket.id}`, userId, "EX", GENERAL_REDIS_TIMEOUT);
    // comment out offline/online functionality
    // await setAsync(`user:${userId}:online`, "true", "EX", GENERAL_REDIS_TIMEOUT);

    const userRoom = `user:${userId}`;
    socket.join(userRoom);
    socket.emit("registered", { userId });

    const user = await User.findById(userId);
    if (user) {
      socket.emit("updateTokenBalance", true);
    }
    // // when user refreshes the code reconnect to gameRoom
    // const game = await ActiveGame.findOne({
    //   $or: [{ creator: userId }, { challenger: userId }],
    // });
    // if (!game) {
    //   socket.emit("error", "No game found.");
    //   return;
    // }
    // console.log("REGISTERED: ", userId, socket.id);
  };
}

function clientDisconnection(socket) {
  return async () => {
    const userId = await authenticateSocket(socket);
    if (!userId) return;
    // comment out offline/online functionality
    // await setAsync(`user:${userId}:online`, "false", "EX", GENERAL_REDIS_TIMEOUT);
    // const isOnline = await getAsync(`user:${userId}:online`);
    // if (isOnline === "true") return;
    // Clean up the Redis entries
    await delAsync(`userId:${userId}`);
    await delAsync(`socketId:${socket.id}`);

    const game = await ActiveGame.findOne({
      $or: [{ creator: userId }, { challenger: userId }],
    });
    if (!game) {
      socket.emit("error", "No game found.");
      return;
    }
    // delete redis data
    await delAsync(`game:${game._id}:choice:${game.creator.toString()}`);
    await delAsync(`game:${game._id}:choice:${game.challenger?.toString()}`);
    await delAsync(`gameDrawTimeout:${game._id}:creator:${game.creator.toString()}:challenger:${game.challenger?.toString()}`);
    await delAsync(`rematchRequested:${game._id}`);
    await delAsync(`joinRequest:${game._id}:${game.challenger?.toString()}`);
    await delAsync(`joinRequestIsRoomOccupied:${game._id}`);
    await delAsync(`game:${game._id}:choice:${game.challenger?.toString()}`);
    await delAsync(`game:${game._id}:choice:${game.creator.toString()}`);
    await delAsync(`gameRoomRequestUpdate:${game._id}`);

    const challenger = game?.challenger;
    if (userId == game.creator.toString()) {
      // Delete the game
      await game.deleteOne();
      // Delete the message
      await Message.findOneAndDelete({ game: game._id });
      // Set new active game deleted
      await setAsync('gamezonedashboard:update', true);
    } else {
      game.challenger = null;
      game.status = "waiting";
      game.draw = false;
      game.save();
    }

    const creatorRoom = `user:${game.creator.toString()}`;
    socket.to(creatorRoom).emit("playerLeft", {
      message: `Other player left the game`,
    });

    if (challenger) {
      // Notify the challenger that the creator left the room
      const challengerRoom = `user:${challenger?.toString()}`;
      socket.to(challengerRoom).emit("playerLeft", {
        message: `Other player left the game`,
      });
    }
    console.log("User disconnected:", socket.id);
  };
}

module.exports = { clientRegistration, clientDisconnection }