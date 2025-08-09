const GameSession = require("../models/game/gameSession");
const PlayerQueue = require("../models/game/playerQueue");
const HouseSlot = require("../models/game/houseSlot");
const houseManagementService = require("./houseManagementService");
const { isUserHasEnoughBalance } = require("./socket/helpers");
const { convertToBigInt } = require("../utils/convert");

class GameSessionService {
  /**
   * Create a new game session
   * @param {string} playerId - Player user ID
   * @param {string} gameType - Type of game
   * @param {string} tokenType - Token type
   * @param {string} betAmount - Bet amount as string
   * @param {boolean} isThirdParty - Whether this is a third-party game
   * @param {string} thirdPartyGameId - Third-party game ID (if applicable)
   * @returns {Object} Created game session
   */
  async createGameSession(playerId, gameType, tokenType, betAmount, isThirdParty = false, thirdPartyGameId = null) {
    try {
      // Check if player has sufficient balance
      const hasBalance = await isUserHasEnoughBalance(playerId, tokenType, betAmount);
      if (!hasBalance) {
        throw new Error("Insufficient balance");
      }

      // Check if player already has an active session
      const existingSession = await GameSession.findOne({
        playerId,
        status: { $in: ["waiting_for_house", "in_progress"] }
      });

      if (existingSession) {
        throw new Error("Player already has an active game session");
      }

      let houseSlot = null;
      let status = "waiting_for_house";

      // For Naffles platform games, try to find an available house slot
      if (!isThirdParty) {
        houseSlot = await houseManagementService.findAvailableHouseSlot(gameType, tokenType, betAmount);
        
        if (houseSlot) {
          status = "in_progress";
        } else {
          // Add player to queue if no house slot available
          await this.addPlayerToQueue(playerId, gameType, tokenType, betAmount);
        }
      } else {
        // Third-party games don't need house slots
        status = "in_progress";
      }

      const gameSession = new GameSession({
        playerId,
        houseSlotId: houseSlot ? houseSlot._id : null,
        gameType,
        tokenType,
        betAmount,
        status,
        isThirdParty,
        thirdPartyGameId
      });

      await gameSession.save();

      // If we have a house slot, rotate the slots for fairness
      if (houseSlot && !isThirdParty) {
        await houseManagementService.rotateHouseSlots(gameType, tokenType);
      }

      return gameSession;
    } catch (error) {
      console.error("Error creating game session:", error);
      throw error;
    }
  }

  /**
   * Add player to queue when no house slots are available
   * @param {string} playerId - Player user ID
   * @param {string} gameType - Type of game
   * @param {string} tokenType - Token type
   * @param {string} betAmount - Bet amount as string
   * @returns {Object} Created queue entry
   */
  async addPlayerToQueue(playerId, gameType, tokenType, betAmount) {
    try {
      // Check if player is already in queue
      const existingQueueEntry = await PlayerQueue.findOne({
        playerId,
        gameType,
        tokenType,
        status: "waiting"
      });

      if (existingQueueEntry) {
        throw new Error("Player already in queue for this game type");
      }

      const queuePosition = await PlayerQueue.getNextQueuePosition(gameType, tokenType);

      const queueEntry = new PlayerQueue({
        playerId,
        gameType,
        tokenType,
        betAmount,
        queuePosition
      });

      await queueEntry.save();
      return queueEntry;
    } catch (error) {
      console.error("Error adding player to queue:", error);
      throw error;
    }
  }

  /**
   * Process next player in queue when a house slot becomes available
   * @param {string} gameType - Type of game
   * @param {string} tokenType - Token type
   */
  async processNextInQueue(gameType, tokenType) {
    try {
      const nextInQueue = await PlayerQueue.findOne({
        gameType,
        tokenType,
        status: "waiting"
      }).sort({ queuePosition: 1 }).populate('playerId');

      if (!nextInQueue) {
        return null;
      }

      // Check if the queued player still has sufficient balance
      const hasBalance = await isUserHasEnoughBalance(
        nextInQueue.playerId._id, 
        tokenType, 
        nextInQueue.betAmount
      );

      if (!hasBalance) {
        // Remove from queue if insufficient balance
        nextInQueue.status = "expired";
        await nextInQueue.save();
        
        // Try next player in queue
        return await this.processNextInQueue(gameType, tokenType);
      }

      // Find available house slot
      const houseSlot = await houseManagementService.findAvailableHouseSlot(
        gameType, 
        tokenType, 
        nextInQueue.betAmount
      );

      if (!houseSlot) {
        return null; // No house slot available yet
      }

      // Create game session for queued player
      const gameSession = new GameSession({
        playerId: nextInQueue.playerId._id,
        houseSlotId: houseSlot._id,
        gameType,
        tokenType,
        betAmount: nextInQueue.betAmount,
        status: "in_progress"
      });

      await gameSession.save();

      // Update queue entry
      nextInQueue.matchWithSession(gameSession._id);
      await nextInQueue.save();

      // Rotate house slots
      await houseManagementService.rotateHouseSlots(gameType, tokenType);

      return gameSession;
    } catch (error) {
      console.error("Error processing next in queue:", error);
      throw error;
    }
  }

  /**
   * Complete a game session with results
   * @param {string} sessionId - Game session ID
   * @param {Object} result - Game result object
   * @returns {Object} Updated game session
   */
  async completeGameSession(sessionId, result) {
    try {
      const session = await GameSession.findById(sessionId).populate('houseSlotId');
      if (!session) {
        throw new Error("Game session not found");
      }

      if (session.status !== "in_progress") {
        throw new Error("Game session is not in progress");
      }

      // Update session with result
      session.complete(result);
      await session.save();

      // Update house slot if applicable
      if (session.houseSlotId && !session.isThirdParty) {
        const houseSlot = session.houseSlotId;
        
        if (result.winner === "house") {
          houseSlot.processWin(result.housePayout);
        } else if (result.winner === "player") {
          houseSlot.processLoss(result.playerPayout);
        }
        
        await houseSlot.save();

        // Process next player in queue if house slot is still active
        if (houseSlot.isActive) {
          await this.processNextInQueue(session.gameType, session.tokenType);
        }
      }

      return session;
    } catch (error) {
      console.error("Error completing game session:", error);
      throw error;
    }
  }

  /**
   * Cancel a game session
   * @param {string} sessionId - Game session ID
   * @param {string} reason - Cancellation reason
   * @returns {Object} Updated game session
   */
  async cancelGameSession(sessionId, reason = "cancelled") {
    try {
      const session = await GameSession.findById(sessionId);
      if (!session) {
        throw new Error("Game session not found");
      }

      session.cancel(reason);
      await session.save();

      // If session was waiting for house, remove from queue
      if (session.status === "waiting_for_house") {
        await PlayerQueue.updateOne(
          { playerId: session.playerId, gameType: session.gameType, tokenType: session.tokenType },
          { status: "cancelled" }
        );
      }

      return session;
    } catch (error) {
      console.error("Error cancelling game session:", error);
      throw error;
    }
  }

  /**
   * Get active game session for a player
   * @param {string} playerId - Player user ID
   * @returns {Object|null} Active game session or null
   */
  async getActiveSessionForPlayer(playerId) {
    try {
      return await GameSession.findOne({
        playerId,
        status: { $in: ["waiting_for_house", "in_progress"] }
      }).populate('houseSlotId');
    } catch (error) {
      console.error("Error getting active session for player:", error);
      throw error;
    }
  }

  /**
   * Get player's queue position
   * @param {string} playerId - Player user ID
   * @param {string} gameType - Type of game
   * @param {string} tokenType - Token type
   * @returns {Object|null} Queue entry or null
   */
  async getPlayerQueuePosition(playerId, gameType, tokenType) {
    try {
      return await PlayerQueue.findOne({
        playerId,
        gameType,
        tokenType,
        status: "waiting"
      });
    } catch (error) {
      console.error("Error getting player queue position:", error);
      throw error;
    }
  }

  /**
   * Clean up expired sessions and queue entries
   */
  async cleanupExpiredEntries() {
    try {
      const now = new Date();

      // Cancel expired game sessions
      await GameSession.updateMany(
        { 
          expiresAt: { $lt: now },
          status: { $in: ["waiting_for_house", "in_progress"] }
        },
        { 
          status: "expired",
          completedAt: now
        }
      );

      // Mark expired queue entries
      await PlayerQueue.updateMany(
        { 
          expiresAt: { $lt: now },
          status: "waiting"
        },
        { status: "expired" }
      );

      console.log("Cleaned up expired game sessions and queue entries");
    } catch (error) {
      console.error("Error cleaning up expired entries:", error);
    }
  }
}

module.exports = new GameSessionService();