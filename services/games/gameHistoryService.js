const GameSession = require('../../models/game/gameSession');
const mongoose = require('mongoose');

/**
 * Game History and Audit Trail Service
 * Tracks detailed game history and provides audit capabilities
 */
class GameHistoryService {
  /**
   * Record a game action for audit trail
   * @param {string} sessionId - Game session ID
   * @param {string} action - Action taken
   * @param {Object} actionData - Action data
   * @param {Object} gameStateBefore - Game state before action
   * @param {Object} gameStateAfter - Game state after action
   * @returns {Object} Audit record
   */
  async recordGameAction(sessionId, action, actionData, gameStateBefore, gameStateAfter) {
    try {
      const auditRecord = {
        sessionId,
        action,
        actionData,
        gameStateBefore,
        gameStateAfter,
        timestamp: new Date(),
        vrfRequestId: gameStateAfter.vrfRequestId || null,
        randomnessUsed: gameStateAfter.randomness || null
      };

      // Store in session's audit trail
      await GameSession.findByIdAndUpdate(sessionId, {
        $push: {
          'gameState.auditTrail': auditRecord
        }
      });

      return auditRecord;
    } catch (error) {
      console.error('Error recording game action:', error);
      throw error;
    }
  }

  /**
   * Get complete game history for a session
   * @param {string} sessionId - Game session ID
   * @returns {Object} Complete game history
   */
  async getGameHistory(sessionId) {
    try {
      const session = await GameSession.findById(sessionId)
        .populate('playerId', 'username email')
        .populate('houseSlotId')
        .lean();

      if (!session) {
        throw new Error('Game session not found');
      }

      return {
        sessionId: session._id,
        playerId: session.playerId,
        gameType: session.gameType,
        betAmount: session.betAmount,
        tokenType: session.tokenType,
        status: session.status,
        result: session.result,
        gameState: session.gameState,
        auditTrail: session.gameState?.auditTrail || [],
        vrfRequests: this.extractVRFRequests(session),
        createdAt: session.createdAt,
        completedAt: session.completedAt,
        duration: session.completedAt ? 
          session.completedAt.getTime() - session.createdAt.getTime() : null
      };
    } catch (error) {
      console.error('Error getting game history:', error);
      throw error;
    }
  }

  /**
   * Get player's game history with filtering
   * @param {string} playerId - Player ID
   * @param {Object} filters - Filter options
   * @returns {Array} Filtered game history
   */
  async getPlayerGameHistory(playerId, filters = {}) {
    try {
      const query = { playerId };

      // Apply filters
      if (filters.gameType) {
        query.gameType = filters.gameType;
      }

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.tokenType) {
        query.tokenType = filters.tokenType;
      }

      if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) {
          query.createdAt.$gte = new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
          query.createdAt.$lte = new Date(filters.dateTo);
        }
      }

      const sessions = await GameSession.find(query)
        .sort({ createdAt: -1 })
        .limit(filters.limit || 50)
        .skip(filters.offset || 0)
        .lean();

      return sessions.map(session => ({
        sessionId: session._id,
        gameType: session.gameType,
        betAmount: session.betAmount,
        tokenType: session.tokenType,
        status: session.status,
        result: session.result,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
        duration: session.completedAt ? 
          session.completedAt.getTime() - session.createdAt.getTime() : null,
        vrfUsed: !!session.vrfRequestId,
        gameStats: this.calculateGameStats(session)
      }));
    } catch (error) {
      console.error('Error getting player game history:', error);
      throw error;
    }
  }

  /**
   * Get game statistics for analytics
   * @param {Object} filters - Filter options
   * @returns {Object} Game statistics
   */
  async getGameStatistics(filters = {}) {
    try {
      const matchStage = {};

      if (filters.gameType) {
        matchStage.gameType = filters.gameType;
      }

      if (filters.dateFrom || filters.dateTo) {
        matchStage.createdAt = {};
        if (filters.dateFrom) {
          matchStage.createdAt.$gte = new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
          matchStage.createdAt.$lte = new Date(filters.dateTo);
        }
      }

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: '$gameType',
            totalGames: { $sum: 1 },
            completedGames: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            totalBetAmount: {
              $sum: { $toDouble: '$betAmount' }
            },
            playerWins: {
              $sum: { $cond: [{ $eq: ['$result.winner', 'player'] }, 1, 0] }
            },
            houseWins: {
              $sum: { $cond: [{ $eq: ['$result.winner', 'house'] }, 1, 0] }
            },
            draws: {
              $sum: { $cond: [{ $eq: ['$result.winner', 'draw'] }, 1, 0] }
            },
            totalPlayerPayout: {
              $sum: { $toDouble: '$result.playerPayout' }
            },
            totalHousePayout: {
              $sum: { $toDouble: '$result.housePayout' }
            },
            avgGameDuration: {
              $avg: {
                $subtract: ['$completedAt', '$createdAt']
              }
            }
          }
        },
        {
          $project: {
            gameType: '$_id',
            totalGames: 1,
            completedGames: 1,
            completionRate: {
              $divide: ['$completedGames', '$totalGames']
            },
            totalBetAmount: 1,
            playerWins: 1,
            houseWins: 1,
            draws: 1,
            playerWinRate: {
              $divide: ['$playerWins', '$completedGames']
            },
            houseWinRate: {
              $divide: ['$houseWins', '$completedGames']
            },
            drawRate: {
              $divide: ['$draws', '$completedGames']
            },
            totalPlayerPayout: 1,
            totalHousePayout: 1,
            houseEdge: {
              $divide: [
                { $subtract: ['$totalBetAmount', '$totalPlayerPayout'] },
                '$totalBetAmount'
              ]
            },
            avgGameDuration: 1
          }
        }
      ];

      const stats = await GameSession.aggregate(pipeline);

      return {
        gameStats: stats,
        summary: this.calculateSummaryStats(stats)
      };
    } catch (error) {
      console.error('Error getting game statistics:', error);
      throw error;
    }
  }

  /**
   * Verify game integrity
   * @param {string} sessionId - Game session ID
   * @returns {Object} Integrity verification result
   */
  async verifyGameIntegrity(sessionId) {
    try {
      const session = await GameSession.findById(sessionId).lean();
      if (!session) {
        throw new Error('Game session not found');
      }

      const verificationResult = {
        sessionId,
        isValid: true,
        issues: [],
        checks: {
          vrfVerification: false,
          gameLogicVerification: false,
          payoutVerification: false,
          auditTrailVerification: false
        }
      };

      // Verify VRF if used
      if (session.vrfRequestId) {
        verificationResult.checks.vrfVerification = await this.verifyVRFRequest(session.vrfRequestId);
        if (!verificationResult.checks.vrfVerification) {
          verificationResult.issues.push('VRF request could not be verified');
          verificationResult.isValid = false;
        }
      } else {
        verificationResult.checks.vrfVerification = true; // No VRF used, so it's valid
      }

      // Verify game logic
      verificationResult.checks.gameLogicVerification = this.verifyGameLogic(session);
      if (!verificationResult.checks.gameLogicVerification) {
        verificationResult.issues.push('Game logic verification failed');
        verificationResult.isValid = false;
      }

      // Verify payouts
      verificationResult.checks.payoutVerification = this.verifyPayouts(session);
      if (!verificationResult.checks.payoutVerification) {
        verificationResult.issues.push('Payout verification failed');
        verificationResult.isValid = false;
      }

      // Verify audit trail
      verificationResult.checks.auditTrailVerification = this.verifyAuditTrail(session);
      if (!verificationResult.checks.auditTrailVerification) {
        verificationResult.issues.push('Audit trail verification failed');
        verificationResult.isValid = false;
      }

      return verificationResult;
    } catch (error) {
      console.error('Error verifying game integrity:', error);
      throw error;
    }
  }

  /**
   * Export game data for external audit
   * @param {Object} filters - Export filters
   * @returns {Object} Exportable game data
   */
  async exportGameData(filters = {}) {
    try {
      const sessions = await this.getPlayerGameHistory(filters.playerId, filters);
      
      const exportData = {
        exportDate: new Date(),
        filters,
        totalRecords: sessions.length,
        games: sessions.map(session => ({
          ...session,
          auditTrail: session.auditTrail || [],
          vrfVerification: session.vrfRequestId ? 
            `https://polygonscan.com/tx/${session.vrfRequestId}` : null
        }))
      };

      return exportData;
    } catch (error) {
      console.error('Error exporting game data:', error);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Extract VRF requests from session
   * @param {Object} session - Game session
   * @returns {Array} VRF requests
   */
  extractVRFRequests(session) {
    const vrfRequests = [];
    
    if (session.vrfRequestId) {
      vrfRequests.push({
        requestId: session.vrfRequestId,
        randomness: session.randomness,
        timestamp: session.createdAt
      });
    }

    // Extract from audit trail
    if (session.gameState?.auditTrail) {
      session.gameState.auditTrail.forEach(record => {
        if (record.vrfRequestId && !vrfRequests.find(r => r.requestId === record.vrfRequestId)) {
          vrfRequests.push({
            requestId: record.vrfRequestId,
            randomness: record.randomnessUsed,
            timestamp: record.timestamp
          });
        }
      });
    }

    return vrfRequests;
  }

  /**
   * Calculate game statistics for a session
   * @param {Object} session - Game session
   * @returns {Object} Game statistics
   */
  calculateGameStats(session) {
    return {
      gameType: session.gameType,
      duration: session.completedAt ? 
        session.completedAt.getTime() - session.createdAt.getTime() : null,
      winner: session.result?.winner,
      playerPayout: session.result?.playerPayout,
      housePayout: session.result?.housePayout,
      vrfUsed: !!session.vrfRequestId,
      actionsCount: session.gameState?.auditTrail?.length || 0
    };
  }

  /**
   * Calculate summary statistics
   * @param {Array} gameStats - Individual game statistics
   * @returns {Object} Summary statistics
   */
  calculateSummaryStats(gameStats) {
    const totals = gameStats.reduce((acc, stat) => {
      acc.totalGames += stat.totalGames;
      acc.completedGames += stat.completedGames;
      acc.totalBetAmount += stat.totalBetAmount;
      acc.totalPlayerPayout += stat.totalPlayerPayout;
      acc.totalHousePayout += stat.totalHousePayout;
      return acc;
    }, {
      totalGames: 0,
      completedGames: 0,
      totalBetAmount: 0,
      totalPlayerPayout: 0,
      totalHousePayout: 0
    });

    return {
      ...totals,
      overallCompletionRate: totals.completedGames / totals.totalGames,
      overallHouseEdge: (totals.totalBetAmount - totals.totalPlayerPayout) / totals.totalBetAmount,
      gameTypes: gameStats.length
    };
  }

  /**
   * Verify VRF request (placeholder - would integrate with actual VRF verification)
   * @param {string} vrfRequestId - VRF request ID
   * @returns {boolean} Is verified
   */
  async verifyVRFRequest(vrfRequestId) {
    // This would integrate with actual Chainlink VRF verification
    // For now, return true if request ID exists
    return !!vrfRequestId;
  }

  /**
   * Verify game logic
   * @param {Object} session - Game session
   * @returns {boolean} Is valid
   */
  verifyGameLogic(session) {
    // Basic validation - ensure required fields exist
    return !!(session.gameType && session.gameState && session.result);
  }

  /**
   * Verify payouts
   * @param {Object} session - Game session
   * @returns {boolean} Is valid
   */
  verifyPayouts(session) {
    if (!session.result) return false;
    
    const { playerPayout, housePayout } = session.result;
    const betAmount = BigInt(session.betAmount);
    const totalPayout = BigInt(playerPayout || '0') + BigInt(housePayout || '0');
    
    // For most games, total payout should equal bet amount
    return totalPayout >= betAmount;
  }

  /**
   * Verify audit trail
   * @param {Object} session - Game session
   * @returns {boolean} Is valid
   */
  verifyAuditTrail(session) {
    // Basic validation - ensure audit trail exists for completed games
    if (session.status === 'completed') {
      return !!(session.gameState?.auditTrail && session.gameState.auditTrail.length > 0);
    }
    return true;
  }
}

module.exports = new GameHistoryService();