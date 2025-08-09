const { clientRegistration, clientDisconnection } = require("./handlers/userEvents");
const { joinGlobalChat, sendGlobalChatMessage, sendChatMessage } = require("./handlers/chatEvents");
const {
  challengerCancelJoinRequest,
  challengerJoinRequest,
  creatorRejectJoinRequest,
  creatorAcceptJoinRequest,
  updatePlayerChoice,
  playerLeaveGame,
  emitGlobalMessageForNewGameCreated,
  rematch,
  creatorRequestBetUpdate,
  challengerRejectBetUpdate,
  challengerAcceptBetChangeRequest,
} = require("./handlers/gameEvents");
const { updateJackpotByActivity } = require("./handlers/jackpotEvents");
const userLogService = require("../../services/userLog");

// Import new real-time services
const realTimeService = require("../realtime/realTimeService");
const chatService = require("../realtime/chatService");
const notificationService = require("../realtime/notificationService");
const { getAsync } = require("../../config/redisClient");

function setupSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // User events
    socket.on("register", clientRegistration(socket));
    socket.on("disconnect", clientDisconnection(socket));

    // Enhanced chat events
    socket.on("joinGlobalChat", async () => {
      const userId = await getAsync(`socketId:${socket.id}`);
      if (userId) {
        await chatService.joinGlobalChat(socket, userId);
      }
    });

    socket.on("joinCommunityChat", async (data) => {
      const userId = await getAsync(`socketId:${socket.id}`);
      if (userId && data.communityId) {
        await chatService.joinCommunityChat(socket, userId, data.communityId);
      }
    });

    socket.on("joinGameChat", async (data) => {
      const userId = await getAsync(`socketId:${socket.id}`);
      if (userId && data.gameId) {
        await chatService.joinGameChat(socket, userId, data.gameId);
      }
    });

    socket.on("sendGlobalMessage", async (data) => {
      const userId = await getAsync(`socketId:${socket.id}`);
      if (userId && data.message) {
        await chatService.sendGlobalMessage(socket, userId, data.message);
      }
    });

    socket.on("sendCommunityMessage", async (data) => {
      const userId = await getAsync(`socketId:${socket.id}`);
      if (userId && data.communityId && data.message) {
        await chatService.sendCommunityMessage(socket, userId, data.communityId, data.message);
      }
    });

    socket.on("sendGameMessage", async (data) => {
      const userId = await getAsync(`socketId:${socket.id}`);
      if (userId && data.gameId && data.message) {
        await chatService.sendGameMessage(socket, userId, data.gameId, data.message);
      }
    });

    // Legacy chat events (for backward compatibility)
    socket.on("joinGlobalChat", joinGlobalChat(socket));
    socket.on("sendGlobalChatMessage", sendGlobalChatMessage(io, socket));
    socket.on("sendChatMessage", sendChatMessage(io, socket));

    // Real-time raffle events
    socket.on("joinRaffleRoom", async (data) => {
      if (data.raffleId) {
        realTimeService.joinRaffleRoom(socket, data.raffleId);
      }
    });

    socket.on("leaveRaffleRoom", async (data) => {
      if (data.raffleId) {
        realTimeService.leaveRaffleRoom(socket, data.raffleId);
      }
    });

    socket.on("joinRaffleList", () => {
      realTimeService.joinRaffleListRoom(socket);
    });

    // Leaderboard events
    socket.on("joinLeaderboard", () => {
      realTimeService.joinLeaderboardRoom(socket);
    });

    socket.on("requestLeaderboardUpdate", async () => {
      const leaderboard = await realTimeService.updateLeaderboard();
      socket.emit('leaderboardUpdate', leaderboard);
    });

    // Notification events
    socket.on("getNotifications", async (data) => {
      const userId = await getAsync(`socketId:${socket.id}`);
      if (userId) {
        const notifications = await notificationService.getUserNotifications(userId, data);
        socket.emit('notificationsData', notifications);
      }
    });

    socket.on("markNotificationRead", async (data) => {
      const userId = await getAsync(`socketId:${socket.id}`);
      if (userId && data.notificationId) {
        await notificationService.markAsRead(userId, data.notificationId);
      }
    });

    socket.on("markAllNotificationsRead", async () => {
      const userId = await getAsync(`socketId:${socket.id}`);
      if (userId) {
        await notificationService.markAllAsRead(userId);
      }
    });

    socket.on("deleteNotification", async (data) => {
      const userId = await getAsync(`socketId:${socket.id}`);
      if (userId && data.notificationId) {
        await notificationService.deleteNotification(userId, data.notificationId);
      }
    });

    // User room management
    socket.on("joinUserRoom", async () => {
      const userId = await getAsync(`socketId:${socket.id}`);
      if (userId) {
        realTimeService.joinUserRoom(socket, userId);
        
        // Send current notification count
        const count = await notificationService.getNotificationCount(userId);
        socket.emit('notificationCountUpdate', { count });
      }
    });

    // Game events
    socket.on("joinRequest", challengerJoinRequest(socket));
    socket.on("cancelJoinRequest", challengerCancelJoinRequest(socket));
    socket.on("rejectJoinRequest", creatorRejectJoinRequest(io, socket));
    socket.on("acceptJoinRequest", creatorAcceptJoinRequest(io, socket));

    socket.on("playerChoice", updatePlayerChoice(io, socket));
    socket.on("leaveGame", playerLeaveGame(socket));
    socket.on("createNewGame", emitGlobalMessageForNewGameCreated(io, socket));

    socket.on("rematch", rematch(io, socket));
    socket.on("requestBetUpdate", creatorRequestBetUpdate(socket));
    socket.on("rejectBetChangeRequest", challengerRejectBetUpdate(io, socket));
    socket.on("acceptBetChangeRequest", challengerAcceptBetChangeRequest(io, socket));

    // Jackpot events
    socket.on("jackpotActivity", updateJackpotByActivity(io, socket));

    // User events
    socket.on("userActivity", (eventDetails) => {
      userLogService.logUserEvent(...eventDetails, socket)
        .then(log => {
          console.log("User activity logged:", log);
        })
        .catch(error => {
          console.log("Error occured:", error);
        })
    });

    // Handle socket disconnection
    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
      chatService.leaveAllRooms(socket);
    });
  });

  // Initialize real-time services
  realTimeService.initializeRaffleTracking();
  
  // Start periodic leaderboard updates
  setInterval(async () => {
    await realTimeService.updateLeaderboard();
  }, 30000); // Update every 30 seconds
}

module.exports = setupSocketHandlers;