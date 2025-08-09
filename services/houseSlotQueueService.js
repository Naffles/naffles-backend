const HouseSlot = require("../models/game/houseSlot");
const GameSession = require("../models/game/gameSession");

class HouseSlotQueueService {
  /**
   * Queue next house slot when current session approaches limit
   * @param {string} currentSessionId - Current session ID
   * @param {string} gameType - Game type
   * @param {string} tokenType - Token type
   * @returns {Object|null} Next house slot reservation or null
   */
  async queueNextHouseSlot(currentSessionId, gameType, tokenType) {
    try {
      // Find current house slot
      const currentHouseSlot = await HouseSlot.findOne({ 
        currentSessionId,
        gameType,
        tokenType 
      });

      if (!currentHouseSlot) {
        console.warn(`Current house slot not found for session ${currentSessionId}`);
        return null;
      }

      // Check if already queued
      if (currentHouseSlot.nextHouseSlotQueued) {
        console.log(`Next house slot already queued for session ${currentSessionId}`);
        return null;
      }

      // Find next available house slot
      const nextHouseSlot = await HouseSlot.findOne({
        gameType,
        tokenType,
        isActive: true,
        currentSessionId: null,
        status: "active",
        _id: { $ne: currentHouseSlot._id } // Exclude current slot
      }).sort({ queuePosition: 1, lastUsed: 1 });

      if (!nextHouseSlot) {
        console.log(`No available house slots to queue for ${gameType}/${tokenType}`);
        return null;
      }

      // Pre-reserve for seamless transition
      const nextSessionId = `${currentSessionId}_next`;
      nextHouseSlot.reserveForSession(nextSessionId, 35); // Slightly longer reservation
      await nextHouseSlot.save();

      // Mark current slot as having queued next
      currentHouseSlot.nextHouseSlotQueued = true;
      await currentHouseSlot.save();

      console.log(`Queued next house slot ${nextHouseSlot._id} for session ${currentSessionId}`);

      return {
        houseSlotId: nextHouseSlot._id.toString(),
        sessionId: nextSessionId,
        roundsAllocated: nextHouseSlot.roundsPerSession,
        queuedAt: new Date()
      };
    } catch (error) {
      console.error("Error queuing next house slot:", error);
      return null;
    }
  }

  /**
   * Implement seamless house slot transition without player interruption
   * @param {string} currentSessionId - Current session ID
   * @param {string} playerId - Player ID
   * @returns {Object} Transition result
   */
  async transitionToNextHouseSlot(currentSessionId, playerId) {
    try {
      const nextSessionId = `${currentSessionId}_next`;
      
      // Find the queued house slot
      const nextHouseSlot = await HouseSlot.findOne({ 
        currentSessionId: nextSessionId 
      });

      if (!nextHouseSlot) {
        throw new Error("No queued house slot found for transition");
      }

      // Release current house slot
      const currentHouseSlot = await HouseSlot.findOne({ 
        currentSessionId 
      });

      if (currentHouseSlot) {
        currentHouseSlot.releaseFromSession();
        await currentHouseSlot.save();
      }

      // Generate new session ID for the transition
      const { v4: uuidv4 } = require('uuid');
      const newSessionId = uuidv4();

      // Update next house slot with new session ID
      nextHouseSlot.currentSessionId = newSessionId;
      nextHouseSlot.sessionRoundsUsed = 0;
      nextHouseSlot.nextHouseSlotQueued = false;
      await nextHouseSlot.save();

      console.log(`Seamless transition completed from ${currentSessionId} to ${newSessionId}`);

      return {
        newSessionId,
        houseSlotId: nextHouseSlot._id.toString(),
        roundsAllocated: nextHouseSlot.roundsPerSession,
        transitionedAt: new Date(),
        seamless: true
      };
    } catch (error) {
      console.error("Error transitioning to next house slot:", error);
      throw error;
    }
  }

  /**
   * Implement session migration for house slot failures
   * @param {string} failedSessionId - Failed session ID
   * @param {string} playerId - Player ID
   * @param {Object} sessionState - Current session state
   * @returns {Object} Migration result
   */
  async migrateSessionForFailure(failedSessionId, playerId, sessionState) {
    try {
      // Find failed house slot
      const failedHouseSlot = await HouseSlot.findOne({ 
        currentSessionId: failedSessionId 
      });

      if (!failedHouseSlot) {
        throw new Error("Failed house slot not found");
      }

      const { gameType, tokenType } = failedHouseSlot;

      // Mark failed house slot as inactive
      failedHouseSlot.isActive = false;
      failedHouseSlot.status = "failed";
      failedHouseSlot.releaseFromSession();
      await failedHouseSlot.save();

      // Find replacement house slot
      const replacementHouseSlot = await HouseSlot.findOne({
        gameType,
        tokenType,
        isActive: true,
        currentSessionId: null,
        status: "active",
        _id: { $ne: failedHouseSlot._id }
      }).sort({ queuePosition: 1, lastUsed: 1 });

      if (!replacementHouseSlot) {
        throw new Error("No replacement house slot available");
      }

      // Generate new session ID
      const { v4: uuidv4 } = require('uuid');
      const newSessionId = uuidv4();

      // Reserve replacement house slot
      replacementHouseSlot.reserveForSession(newSessionId, 30);
      replacementHouseSlot.sessionRoundsUsed = sessionState.roundsUsed || 0;
      await replacementHouseSlot.save();

      console.log(`Session migrated from failed slot ${failedHouseSlot._id} to ${replacementHouseSlot._id}`);

      return {
        newSessionId,
        houseSlotId: replacementHouseSlot._id.toString(),
        failedHouseSlotId: failedHouseSlot._id.toString(),
        roundsAllocated: replacementHouseSlot.roundsPerSession,
        roundsUsed: sessionState.roundsUsed || 0,
        migratedAt: new Date(),
        reason: "house_slot_failure"
      };
    } catch (error) {
      console.error("Error migrating session for failure:", error);
      throw error;
    }
  }

  /**
   * Create session-aware queue management with capacity planning
   * @param {string} gameType - Game type
   * @param {string} tokenType - Token type
   * @returns {Object} Queue management info
   */
  async getQueueManagementInfo(gameType, tokenType) {
    try {
      // Get all house slots for this game/token combination
      const allHouseSlots = await HouseSlot.find({
        gameType,
        tokenType,
        isActive: true
      }).sort({ queuePosition: 1 });

      // Categorize slots
      const activeSlots = allHouseSlots.filter(slot => slot.currentSessionId && !slot.isSessionExpired());
      const availableSlots = allHouseSlots.filter(slot => !slot.currentSessionId && slot.status === "active");
      const queuedSlots = allHouseSlots.filter(slot => slot.currentSessionId && slot.currentSessionId.includes("_next"));
      const expiredSlots = allHouseSlots.filter(slot => slot.currentSessionId && slot.isSessionExpired());

      // Calculate capacity metrics
      const totalCapacity = allHouseSlots.length;
      const activeCapacity = activeSlots.length;
      const availableCapacity = availableSlots.length;
      const utilizationRate = totalCapacity > 0 ? (activeCapacity / totalCapacity) * 100 : 0;

      // Predict queue needs
      const slotsNearLimit = activeSlots.filter(slot => slot.isSessionNearLimit(0.8));
      const predictedQueueNeeds = slotsNearLimit.length - queuedSlots.length;

      // Calculate average session duration
      const avgSessionDuration = await this.calculateAverageSessionDuration(gameType, tokenType);

      return {
        gameType,
        tokenType,
        capacity: {
          total: totalCapacity,
          active: activeCapacity,
          available: availableCapacity,
          queued: queuedSlots.length,
          expired: expiredSlots.length,
          utilizationRate: Math.round(utilizationRate * 100) / 100
        },
        queuePrediction: {
          slotsNearLimit: slotsNearLimit.length,
          currentlyQueued: queuedSlots.length,
          predictedNeeds: Math.max(0, predictedQueueNeeds),
          shouldQueueMore: predictedQueueNeeds > 0
        },
        performance: {
          avgSessionDuration,
          totalSessions: activeSlots.reduce((sum, slot) => sum + slot.gamesPlayed, 0)
        },
        timestamp: new Date()
      };
    } catch (error) {
      console.error("Error getting queue management info:", error);
      throw error;
    }
  }

  /**
   * Calculate average session duration for capacity planning
   * @param {string} gameType - Game type
   * @param {string} tokenType - Token type
   * @returns {number} Average session duration in minutes
   */
  async calculateAverageSessionDuration(gameType, tokenType) {
    try {
      // Get recent completed sessions
      const recentSessions = await GameSession.find({
        gameType,
        tokenType,
        status: "completed",
        completedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      }).limit(100);

      if (recentSessions.length === 0) {
        return 30; // Default 30 minutes
      }

      const totalDuration = recentSessions.reduce((sum, session) => {
        const duration = (session.completedAt - session.createdAt) / (1000 * 60); // Convert to minutes
        return sum + duration;
      }, 0);

      return Math.round(totalDuration / recentSessions.length);
    } catch (error) {
      console.error("Error calculating average session duration:", error);
      return 30; // Default fallback
    }
  }

  /**
   * Auto-queue house slots based on capacity planning
   * @param {string} gameType - Game type
   * @param {string} tokenType - Token type
   * @returns {Array} Array of queued house slots
   */
  async autoQueueHouseSlots(gameType, tokenType) {
    try {
      const queueInfo = await this.getQueueManagementInfo(gameType, tokenType);
      
      if (!queueInfo.queuePrediction.shouldQueueMore) {
        return [];
      }

      const queuedSlots = [];
      const slotsToQueue = Math.min(queueInfo.queuePrediction.predictedNeeds, queueInfo.capacity.available);

      // Find active sessions that need queuing
      const activeSessions = await HouseSlot.find({
        gameType,
        tokenType,
        currentSessionId: { $ne: null, $not: /.*_next$/ },
        nextHouseSlotQueued: false
      });

      const sessionsNearLimit = activeSessions.filter(slot => slot.isSessionNearLimit(0.8));

      for (let i = 0; i < Math.min(slotsToQueue, sessionsNearLimit.length); i++) {
        const session = sessionsNearLimit[i];
        const queuedSlot = await this.queueNextHouseSlot(
          session.currentSessionId,
          gameType,
          tokenType
        );
        
        if (queuedSlot) {
          queuedSlots.push(queuedSlot);
        }
      }

      console.log(`Auto-queued ${queuedSlots.length} house slots for ${gameType}/${tokenType}`);
      return queuedSlots;
    } catch (error) {
      console.error("Error auto-queuing house slots:", error);
      return [];
    }
  }

  /**
   * Clean up expired queue reservations
   * @returns {number} Number of cleaned up reservations
   */
  async cleanupExpiredQueueReservations() {
    try {
      const expiredSlots = await HouseSlot.find({
        currentSessionId: { $regex: /.*_next$/ },
        sessionExpiresAt: { $lt: new Date() }
      });

      let cleanedCount = 0;
      for (const slot of expiredSlots) {
        slot.releaseFromSession();
        await slot.save();
        cleanedCount++;
      }

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} expired queue reservations`);
      }

      return cleanedCount;
    } catch (error) {
      console.error("Error cleaning up expired queue reservations:", error);
      return 0;
    }
  }
}

module.exports = new HouseSlotQueueService();