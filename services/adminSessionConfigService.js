const HouseSlot = require("../models/game/houseSlot");
const houseSlotQueueService = require("./houseSlotQueueService");
const connectionMonitorService = require("./connectionMonitorService");

class AdminSessionConfigService {
  /**
   * Get current session configuration for a game type
   * @param {string} gameType - Game type
   * @param {string} tokenType - Token type
   * @returns {Object} Current session configuration
   */
  async getSessionConfiguration(gameType, tokenType) {
    try {
      // Get sample house slot to check current defaults
      const sampleHouseSlot = await HouseSlot.findOne({
        gameType,
        tokenType,
        isActive: true
      });

      const defaultConfig = {
        roundsPerSession: 20,
        safetyMultiplier: 10
      };

      const currentConfig = sampleHouseSlot ? {
        roundsPerSession: sampleHouseSlot.roundsPerSession,
        safetyMultiplier: sampleHouseSlot.safetyMultiplier
      } : defaultConfig;

      // Get queue management info
      const queueInfo = await houseSlotQueueService.getQueueManagementInfo(gameType, tokenType);

      return {
        gameType,
        tokenType,
        configuration: currentConfig,
        queueStatus: queueInfo,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error("Error getting session configuration:", error);
      throw error;
    }
  }

  /**
   * Update session configuration for house slots
   * @param {string} gameType - Game type
   * @param {string} tokenType - Token type
   * @param {Object} config - New configuration
   * @returns {Object} Update result
   */
  async updateSessionConfiguration(gameType, tokenType, config) {
    try {
      const { roundsPerSession, safetyMultiplier } = config;

      // Validate configuration
      if (roundsPerSession && (roundsPerSession < 1 || roundsPerSession > 1000)) {
        throw new Error("Rounds per session must be between 1 and 1000");
      }

      if (safetyMultiplier && (safetyMultiplier < 1 || safetyMultiplier > 100)) {
        throw new Error("Safety multiplier must be between 1 and 100");
      }

      // Update all house slots for this game/token combination
      const updateQuery = {};
      if (roundsPerSession !== undefined) {
        updateQuery.roundsPerSession = roundsPerSession;
      }
      if (safetyMultiplier !== undefined) {
        updateQuery.safetyMultiplier = safetyMultiplier;
      }

      const updateResult = await HouseSlot.updateMany(
        { gameType, tokenType },
        { $set: updateQuery }
      );

      console.log(`Updated ${updateResult.modifiedCount} house slots for ${gameType}/${tokenType}`);

      return {
        success: true,
        gameType,
        tokenType,
        updatedConfiguration: config,
        houseSlotsUpdated: updateResult.modifiedCount,
        updatedAt: new Date()
      };
    } catch (error) {
      console.error("Error updating session configuration:", error);
      throw error;
    }
  }

  /**
   * Calculate minimum funding requirements
   * @param {string} gameType - Game type
   * @param {string} tokenType - Token type
   * @param {string} maxPayout - Maximum payout per round
   * @param {Object} config - Session configuration
   * @returns {Object} Funding calculation
   */
  calculateMinimumFunding(gameType, tokenType, maxPayout, config) {
    try {
      const { roundsPerSession = 20, safetyMultiplier = 10 } = config;
      
      const maxPayoutBigInt = BigInt(maxPayout);
      const minFunding = BigInt(safetyMultiplier) * BigInt(roundsPerSession) * maxPayoutBigInt;

      return {
        gameType,
        tokenType,
        configuration: {
          roundsPerSession,
          safetyMultiplier,
          maxPayoutPerRound: maxPayout
        },
        minimumFunding: minFunding.toString(),
        calculatedAt: new Date(),
        formula: `${safetyMultiplier} × ${roundsPerSession} × ${maxPayout} = ${minFunding.toString()}`
      };
    } catch (error) {
      console.error("Error calculating minimum funding:", error);
      throw error;
    }
  }

  /**
   * Get session monitoring dashboard data
   * @param {string} gameType - Game type (optional)
   * @param {string} tokenType - Token type (optional)
   * @returns {Object} Dashboard data
   */
  async getSessionMonitoringDashboard(gameType = null, tokenType = null) {
    try {
      let filter = {};
      if (gameType) filter.gameType = gameType;
      if (tokenType) filter.tokenType = tokenType;

      // Get active sessions
      const activeSessions = await HouseSlot.find({
        ...filter,
        currentSessionId: { $ne: null, $not: /.*_next$/ },
        isActive: true
      });

      // Get queued sessions
      const queuedSessions = await HouseSlot.find({
        ...filter,
        currentSessionId: { $regex: /.*_next$/ },
        isActive: true
      });

      // Get connection monitoring data
      const activeConnections = connectionMonitorService.getAllActiveConnections();

      // Calculate session statistics
      const sessionStats = {
        totalActiveSessions: activeSessions.length,
        totalQueuedSessions: queuedSessions.length,
        totalActiveConnections: activeConnections.length,
        sessionsNearLimit: activeSessions.filter(slot => slot.isSessionNearLimit(0.8)).length,
        expiredSessions: activeSessions.filter(slot => slot.isSessionExpired()).length
      };

      // Get session details
      const sessionDetails = activeSessions.map(slot => ({
        sessionId: slot.currentSessionId,
        houseSlotId: slot._id.toString(),
        gameType: slot.gameType,
        tokenType: slot.tokenType,
        roundsUsed: slot.sessionRoundsUsed,
        roundsTotal: slot.roundsPerSession,
        roundsRemaining: slot.roundsPerSession - slot.sessionRoundsUsed,
        utilizationRate: Math.round((slot.sessionRoundsUsed / slot.roundsPerSession) * 100),
        isNearLimit: slot.isSessionNearLimit(0.8),
        isExpired: slot.isSessionExpired(),
        sessionExpiresAt: slot.sessionExpiresAt,
        nextSlotQueued: slot.nextHouseSlotQueued
      }));

      return {
        filter: { gameType, tokenType },
        statistics: sessionStats,
        activeSessions: sessionDetails,
        queuedSessions: queuedSessions.map(slot => ({
          sessionId: slot.currentSessionId,
          houseSlotId: slot._id.toString(),
          gameType: slot.gameType,
          tokenType: slot.tokenType,
          queuedFor: slot.currentSessionId.replace('_next', ''),
          expiresAt: slot.sessionExpiresAt
        })),
        connections: activeConnections,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error("Error getting session monitoring dashboard:", error);
      throw error;
    }
  }

  /**
   * Get session performance analytics
   * @param {string} gameType - Game type
   * @param {string} tokenType - Token type
   * @param {number} days - Number of days to analyze (default 7)
   * @returns {Object} Performance analytics
   */
  async getSessionPerformanceAnalytics(gameType, tokenType, days = 7) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Get house slots for this game/token
      const houseSlots = await HouseSlot.find({
        gameType,
        tokenType,
        updatedAt: { $gte: startDate }
      });

      if (houseSlots.length === 0) {
        return {
          gameType,
          tokenType,
          period: `${days} days`,
          analytics: {
            totalSessions: 0,
            averageSessionDuration: 0,
            averageRoundsPerSession: 0,
            sessionCompletionRate: 0,
            houseWinRate: 0,
            totalVolume: "0"
          },
          lastUpdated: new Date()
        };
      }

      // Calculate analytics
      const totalSessions = houseSlots.reduce((sum, slot) => sum + slot.gamesPlayed, 0);
      const totalWinnings = houseSlots.reduce((sum, slot) => sum + BigInt(slot.totalWinnings || "0"), BigInt(0));
      const totalLosses = houseSlots.reduce((sum, slot) => sum + BigInt(slot.totalLosses || "0"), BigInt(0));
      const totalVolume = totalWinnings + totalLosses;

      const averageRoundsPerSession = houseSlots.reduce((sum, slot) => sum + slot.roundsPerSession, 0) / houseSlots.length;
      
      // Calculate win rate (house perspective)
      const houseWinRate = totalVolume > 0 ? Number(totalWinnings * BigInt(100) / totalVolume) : 0;

      // Get average session duration from queue service
      const avgDuration = await houseSlotQueueService.calculateAverageSessionDuration(gameType, tokenType);

      return {
        gameType,
        tokenType,
        period: `${days} days`,
        analytics: {
          totalSessions,
          totalHouseSlots: houseSlots.length,
          averageSessionDuration: avgDuration,
          averageRoundsPerSession: Math.round(averageRoundsPerSession),
          houseWinRate: Math.round(houseWinRate * 100) / 100,
          totalVolume: totalVolume.toString(),
          totalWinnings: totalWinnings.toString(),
          totalLosses: totalLosses.toString()
        },
        houseSlotBreakdown: houseSlots.map(slot => ({
          houseSlotId: slot._id.toString(),
          ownerId: slot.ownerId.toString(),
          gamesPlayed: slot.gamesPlayed,
          totalWinnings: slot.totalWinnings,
          totalLosses: slot.totalLosses,
          currentFunds: slot.currentFunds,
          isActive: slot.isActive,
          status: slot.status
        })),
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error("Error getting session performance analytics:", error);
      throw error;
    }
  }

  /**
   * Get all available game types and tokens for configuration
   * @returns {Object} Available options
   */
  async getAvailableGameTypesAndTokens() {
    try {
      const distinctGameTypes = await HouseSlot.distinct('gameType');
      const distinctTokenTypes = await HouseSlot.distinct('tokenType');

      return {
        gameTypes: distinctGameTypes,
        tokenTypes: distinctTokenTypes,
        combinations: []
      };
    } catch (error) {
      console.error("Error getting available game types and tokens:", error);
      throw error;
    }
  }

  /**
   * Bulk update session configurations
   * @param {Array} updates - Array of update configurations
   * @returns {Object} Bulk update result
   */
  async bulkUpdateSessionConfigurations(updates) {
    try {
      const results = [];
      
      for (const update of updates) {
        const { gameType, tokenType, configuration } = update;
        
        try {
          const result = await this.updateSessionConfiguration(gameType, tokenType, configuration);
          results.push({
            gameType,
            tokenType,
            success: true,
            result
          });
        } catch (error) {
          results.push({
            gameType,
            tokenType,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      return {
        totalUpdates: updates.length,
        successCount,
        failureCount,
        results,
        updatedAt: new Date()
      };
    } catch (error) {
      console.error("Error bulk updating session configurations:", error);
      throw error;
    }
  }
}

module.exports = new AdminSessionConfigService();