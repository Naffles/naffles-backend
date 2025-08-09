const User = require("../../../models/user/user");
const { getAsync } = require("../../../config/redisClient");
const { cleanMessage } = require("../../../utils/clean");
const { saveGlobalChatMessage, removeLastMessage } = require("../helpers");
const { getUserProfileImage } = require("../../../utils/image");

let GLOBAL_CHAT_ROOM = "globalChatRoom";
function joinGlobalChat(socket) {
  return async () => {
    if (socket.rooms.has(GLOBAL_CHAT_ROOM)) {
      return;
    }
    socket.join(GLOBAL_CHAT_ROOM);
  };
}

function sendGlobalChatMessage(io, socket) {
  return async ({ message }) => {
    try {
      var message = cleanMessage(message);
      const userId = await getAsync(`socketId:${socket.id}`);
      const user = await User.findById(userId).select("username profileImage");
      if (!user) {
        socket.emit("error", "user not found");
        return;
      }
      const profileImageUrl = await getUserProfileImage(user.profileImage);

      var sender = {
        username: user.username,
        profileImage: profileImageUrl,
        _id: user._id,
      };
      const timestamp = new Date().toISOString();
      // Save message to the database
      const newMessage = {
        userRef: user._id,
        username: user.username,
        profileImage: user.profileImage ? user.profileImage : "",
        message: message,
        timestamp: timestamp
      }
      newMessage._id = await saveGlobalChatMessage(newMessage);
      await removeLastMessage();

      io.in(GLOBAL_CHAT_ROOM).emit("receiveGlobalChatMessage", {
        id: newMessage._id,
        sender: sender,
        message: message,
        timestamp: timestamp,
      });
    } catch (error) {
      console.error("Error handling global chat message:", error);
      socket.emit("error", "Error processing your global chat message.");
    }
  };
}

function sendChatMessage(io, socket) {
  return async ({ gameId, message }) => {
    try {
      var message = cleanMessage(message);
      const privateChatRoom = `privateChatRoom:${gameId}`;
      const userId = await getAsync(`socketId:${socket.id}`);
      const user = await User.findById(userId).select("username profileImage");
      if (!user) {
        socket.emit("error", "user not found");
        return;
      }
      const profileImageUrl = await getUserProfileImage(user.profileImage);
      var sender = {
        username: user.username,
        profileImage: profileImageUrl,
        _id: user._id,
      };

      io.in(privateChatRoom).emit("receivePrivateChatRoomMessage", {
        sender: sender,
        message: message,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error handling global chat message:", error);
      socket.emit(
        "error",
        "Error processing your private room chat message."
      );
    }
  };
}

module.exports = { joinGlobalChat, sendGlobalChatMessage, sendChatMessage }