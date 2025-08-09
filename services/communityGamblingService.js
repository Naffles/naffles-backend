const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const Raffle = require('../models/raffle/raffle');
const HouseSlot = require('../models/game/houseSlot');
const GameSession = require('../models/game/gameSession');
const raffleService = require('./raffleService');
const houseManagementService = require('./houseManagementService');
const gameSessionService = require('./gameSessionService');
const vrfService = require('./vrfService');

class CommunityGamblingService {
  /**
   * Create community-specific raffle
   * @param {string} communityId - Community ID
   * @param {string} creatorId - Creator user ID
   * @param {Object} raffleData - Raffle configuration data
   * @returns {Promise<Object>} Created raffle
   */
  async createCommunityRaffle(communityId, creatorId, raffleData) {
    try {
      // Verify community exists and user has permission
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      if (!community.features.enableRaffles) {
        throw new Error('Raffles are not enabled for this community');
      }

      const membership = await CommunityMember.findOne({
        userId: creatorId,
        communityId,
        isActive: true
      });

      if (!membership || !membership.hasPermission('canManagePoints')) {
        throw new Error('Insufficient permissions to create community raffles');
      }

      // Enhance raffle data with community information
      const communityRaffleData = {
        ...raffleData,
        communityId,
        isCommunityRaffle: true,
        communityName: community.name,
        // Community raffles can use community points as currency
        allowCommunityPoints: true,
        communityPointsName: community.pointsConfiguration.pointsName
      };

      // Use existing raffle service but with community context
      const raffle = await raffleService.createRaffle(creatorId, communityRaffleData);

      // Update community stats
      await this.updateCommunityGamblingStats(communityId, 'raffle_created');

      return raffle;
    } catch (error) {
      console.error('Error creating community raffle:', error);
      throw error;
    }
  }

  /**
   * Create community allowlist raffle
   * @param {string} communityId - Community ID
   * @param {string} creatorId - Creator user ID
   * @param {Object} allowlistData - Allowlist raffle data
   * @returns {Promise<Object>} Created allowlist raffle
   */
  async createCommunityAllowlistRaffle(communityId, creatorId, allowlistData) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      const membership = await CommunityMember.findOne({
        userId: creatorId,
        communityId,
        isActive: true
      });

      if (!membership || !membership.hasPermission('canManagePoints')) {
        throw new Error('Insufficient permissions to create allowlist raffles');
      }

      // Create allowlist raffle with community-specific settings
      const allowlistRaffleData = {
        ...allowlistData,
        type: 'allowlist',
        communityId,
        isCommunityRaffle: true,
        // Allowlist raffles use VRF for fair selection
        useVRF: true,
        vrfConfiguration: {
          network: 'polygon', // Default to Polygon for VRF
          requestConfirmations: 3
        },
        // Community members get priority access
        communityMemberPriority: true
      };

      const raffle = await this.createCommunityRaffle(communityId, creatorId, allowlistRaffleData);

      return raffle;
    } catch (error) {
      console.error('Error creating community allowlist raffle:', error);
      throw error;
    }
  }

  /**
   * Create community gaming session
   * @param {string} communityId - Community ID
   * @param {string} creatorId - Creator user ID
   * @param {Object} gameConfig - Game configuration
   * @returns {Promise<Object>} Created game session
   */
  async createCommunityGamingSession(communityId, creatorId, gameConfig) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      if (!community.features.enableGaming) {
        throw new Error('Gaming is not enabled for this community');
      }

      const membership = await CommunityMember.findOne({
        userId: creatorId,
        communityId,
        isActive: true
      });

      if (!membership || !membership.hasPermission('canManagePoints')) {
        throw new Error('Insufficient permissions to create community gaming sessions');
      }

      // Enhance game configuration with community settings
      const communityGameConfig = {
        ...gameConfig,
        communityId,
        isCommunityGame: true,
        communityName: community.name,
        // Allow community points as betting currency
        allowedCurrencies: [
          ...(gameConfig.allowedCurrencies || []),
          {
            type: 'community_points',
            name: community.pointsConfiguration.pointsName,
            symbol: community.pointsConfiguration.pointsSymbol || 'CP'
          }
        ],
        // Community-specific game settings
        communitySettings: {
          maxBetCommunityPoints: gameConfig.maxBetCommunityPoints || 1000,
          minBetCommunityPoints: gameConfig.minBetCommunityPoints || 1,
          houseEdge: gameConfig.houseEdge || 0.02 // 2% default house edge
        }
      };

      // Create game session using existing service
      const gameSession = await gameSessionService.createGameSession(
        creatorId,
        communityGameConfig
      );

      // Update community stats
      await this.updateCommunityGamblingStats(communityId, 'game_created');

      return gameSession;
    } catch (error) {
      console.error('Error creating community gaming session:', error);
      throw error;
    }
  }

  /**
   * Fund community house slot
   * @param {string} communityId - Community ID
   * @param {string} ownerId - House slot owner ID
   * @param {Object} houseSlotData - House slot configuration
   * @returns {Promise<Object>} Created house slot
   */
  async fundCommunityHouseSlot(communityId, ownerId, houseSlotData) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      const membership = await CommunityMember.findOne({
        userId: ownerId,
        communityId,
        isActive: true
      });

      if (!membership || !membership.hasPermission('canManagePoints')) {
        throw new Error('Insufficient permissions to fund community house slots');
      }

      // Create community-specific house slot
      const communityHouseSlotData = {
        ...houseSlotData,
        communityId,
        isCommunityHouseSlot: true,
        communityName: community.name,
        // Community house slots can accept community points
        acceptedCurrencies: [
          ...(houseSlotData.acceptedCurrencies || []),
          {
            type: 'community_points',
            name: community.pointsConfiguration.pointsName,
            balance: houseSlotData.communityPointsBalance || 0
          }
        ],
        // Community-specific settings
        communitySettings: {
          profitSharingEnabled: houseSlotData.profitSharingEnabled || false,
          communityProfitShare: houseSlotData.communityProfitShare || 0.1, // 10% to community
          memberOnlyAccess: houseSlotData.memberOnlyAccess || false
        }
      };

      // Use existing house management service
      const houseSlot = await houseManagementService.createHouseSlot(
        ownerId,
        communityHouseSlotData
      );

      // Update community stats
      await this.updateCommunityGamblingStats(communityId, 'house_slot_created');

      return houseSlot;
    } catch (error) {
      console.error('Error funding community house slot:', error);
      throw error;
    }
  }

  /**
   * Get community gambling analytics
   * @param {string} communityId - Community ID
   * @param {string} userId - User ID (must have analytics permissions)
   * @param {string} timeframe - Time frame for analytics
   * @returns {Promise<Object>} Gambling analytics
   */
  async getCommunityGamblingAnalytics(communityId, userId, timeframe = '30d') {
    try {
      // Check permissions
      const membership = await CommunityMember.findOne({
        userId,
        communityId,
        isActive: true
      });

      if (!membership || !membership.hasPermission('canViewAnalytics')) {
        throw new Error('Insufficient permissions to view gambling analytics');
      }

      const timeframeMs = this.getTimeframeMs(timeframe);
      const startDate = new Date(Date.now() - timeframeMs);

      // Get raffle analytics
      const raffleAnalytics = await Raffle.aggregate([
        {
          $match: {
            communityId: new mongoose.Types.ObjectId(communityId),
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalValue: { $sum: '$prizeValue' },
            totalTicketsSold: { $sum: '$ticketsSold' },
            avgTicketPrice: { $avg: '$ticketPrice' }
          }
        }
      ]);

      // Get gaming analytics
      const gamingAnalytics = await GameSession.aggregate([
        {
          $match: {
            communityId: new mongoose.Types.ObjectId(communityId),
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$gameType',
            sessionCount: { $sum: 1 },
            totalVolume: { $sum: '$totalVolume' },
            totalProfit: { $sum: '$houseProfit' },
            avgSessionDuration: { $avg: '$duration' }
          }
        }
      ]);

      // Get house slot analytics
      const houseSlotAnalytics = await HouseSlot.aggregate([
        {
          $match: {
            communityId: new mongoose.Types.ObjectId(communityId),
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            totalSlots: { $sum: 1 },
            totalFunding: { $sum: '$totalBalance' },
            totalProfit: { $sum: '$totalProfit' },
            avgUtilization: { $avg: '$utilizationRate' }
          }
        }
      ]);

      return {
        timeframe,
        raffles: raffleAnalytics,
        gaming: gamingAnalytics,
        houseSlots: houseSlotAnalytics[0] || {
          totalSlots: 0,
          totalFunding: 0,
          totalProfit: 0,
          avgUtilization: 0
        }
      };
    } catch (error) {
      console.error('Error getting community gambling analytics:', error);
      throw error;
    }
  }

  /**
   * Get community raffles
   * @param {string} communityId - Community ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Community raffles
   */
  async getCommunityRaffles(communityId, options = {}) {
    try {
      const query = {
        communityId: new mongoose.Types.ObjectId(communityId),
        isCommunityRaffle: true
      };

      if (options.status) {
        query.status = options.status;
      }

      if (options.type) {
        query.type = options.type;
      }

      const raffles = await Raffle.find(query)
        .populate('createdBy', 'username')
        .sort({ createdAt: -1 })
        .limit(options.limit || 50)
        .skip(options.skip || 0);

      return raffles;
    } catch (error) {
      console.error('Error getting community raffles:', error);
      throw error;
    }
  }

  /**
   * Get community gaming sessions
   * @param {string} communityId - Community ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Community gaming sessions
   */
  async getCommunityGamingSessions(communityId, options = {}) {
    try {
      const query = {
        communityId: new mongoose.Types.ObjectId(communityId),
        isCommunityGame: true
      };

      if (options.gameType) {
        query.gameType = options.gameType;
      }

      if (options.status) {
        query.status = options.status;
      }

      const sessions = await GameSession.find(query)
        .populate('createdBy', 'username')
        .sort({ createdAt: -1 })
        .limit(options.limit || 50)
        .skip(options.skip || 0);

      return sessions;
    } catch (error) {
      console.error('Error getting community gaming sessions:', error);
      throw error;
    }
  }

  /**
   * Get community house slots
   * @param {string} communityId - Community ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Community house slots
   */
  async getCommunityHouseSlots(communityId, options = {}) {
    try {
      const query = {
        communityId: new mongoose.Types.ObjectId(communityId),
        isCommunityHouseSlot: true
      };

      if (options.status) {
        query.status = options.status;
      }

      const houseSlots = await HouseSlot.find(query)
        .populate('ownerId', 'username')
        .sort({ createdAt: -1 })
        .limit(options.limit || 50)
        .skip(options.skip || 0);

      return houseSlots;
    } catch (error) {
      console.error('Error getting community house slots:', error);
      throw error;
    }
  }

  /**
   * Process community points betting
   * @param {string} communityId - Community ID
   * @param {string} userId - User ID
   * @param {string} gameType - Game type
   * @param {number} betAmount - Bet amount in community points
   * @param {Object} gameData - Game-specific data
   * @returns {Promise<Object>} Game result
   */
  async processCommunityPointsBet(communityId, userId, gameType, betAmount, gameData) {
    try {
      // Verify user is community member
      const membership = await CommunityMember.findOne({
        userId,
        communityId,
        isActive: true
      });

      if (!membership) {
        throw new Error('User is not a member of this community');
      }

      // Check user's community points balance
      const communityPointsService = require('./communityPointsService');
      const userPoints = await communityPointsService.getUserCommunityPointsInfo(userId, communityId);

      if (userPoints.balance < betAmount) {
        throw new Error('Insufficient community points balance');
      }

      // Process the bet using existing gaming infrastructure
      // This would integrate with the specific game services
      const gameResult = await this.processGameBet(gameType, betAmount, gameData);

      // Update user's community points based on result
      if (gameResult.won) {
        await communityPointsService.awardCommunityPoints(
          userId,
          communityId,
          `gaming_${gameType}`,
          {
            amount: gameResult.winnings,
            gameId: gameResult.gameId,
            betAmount
          }
        );
      } else {
        await communityPointsService.deductCommunityPoints(
          userId,
          communityId,
          betAmount,
          `Gaming loss - ${gameType}`,
          null // System deduction
        );
      }

      // Update community gambling stats
      await this.updateCommunityGamblingStats(communityId, `game_${gameType}_played`);

      return {
        ...gameResult,
        pointsBalance: userPoints.balance + (gameResult.won ? gameResult.winnings : -betAmount)
      };
    } catch (error) {
      console.error('Error processing community points bet:', error);
      throw error;
    }
  }

  /**
   * Manage community raffle with VRF
   * @param {string} raffleId - Raffle ID
   * @param {string} action - Action to perform
   * @param {Object} data - Action data
   * @returns {Promise<Object>} Action result
   */
  async manageCommunityRaffleVRF(raffleId, action, data = {}) {
    try {
      const raffle = await Raffle.findById(raffleId);
      if (!raffle || !raffle.isCommunityRaffle) {
        throw new Error('Community raffle not found');
      }

      switch (action) {
        case 'request_random':
          // Request VRF random number for winner selection
          const vrfRequest = await vrfService.requestRandomNumber({
            raffleId,
            numWords: 1,
            callbackGasLimit: 200000
          });
          
          raffle.vrfRequestId = vrfRequest.requestId;
          raffle.status = 'drawing';
          await raffle.save();
          
          return { success: true, vrfRequestId: vrfRequest.requestId };

        case 'fulfill_random':
          // Process VRF fulfillment and select winner
          const randomNumber = data.randomNumber;
          const winner = await this.selectRaffleWinner(raffle, randomNumber);
          
          raffle.winnerId = winner.userId;
          raffle.winnerTicketNumber = winner.ticketNumber;
          raffle.status = 'completed';
          raffle.completedAt = new Date();
          await raffle.save();
          
          return { success: true, winner };

        default:
          throw new Error('Invalid raffle action');
      }
    } catch (error) {
      console.error('Error managing community raffle VRF:', error);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Process game bet (placeholder for game-specific logic)
   * @param {string} gameType - Game type
   * @param {number} betAmount - Bet amount
   * @param {Object} gameData - Game data
   * @returns {Promise<Object>} Game result
   */
  async processGameBet(gameType, betAmount, gameData) {
    // This would integrate with specific game services
    // For now, return a mock result
    const won = Math.random() > 0.5;
    const winnings = won ? betAmount * 2 : 0;

    return {
      gameId: new mongoose.Types.ObjectId(),
      won,
      winnings,
      gameType,
      betAmount
    };
  }

  /**
   * Select raffle winner using VRF random number
   * @param {Object} raffle - Raffle object
   * @param {string} randomNumber - VRF random number
   * @returns {Promise<Object>} Winner information
   */
  async selectRaffleWinner(raffle, randomNumber) {
    // Convert random number to ticket selection
    const totalTickets = raffle.ticketsSold;
    const winningTicketNumber = (parseInt(randomNumber) % totalTickets) + 1;

    // Find the winner (this would query the raffle tickets)
    // For now, return mock winner data
    return {
      userId: new mongoose.Types.ObjectId(),
      ticketNumber: winningTicketNumber,
      username: 'winner_user'
    };
  }

  /**
   * Update community gambling statistics
   * @param {string} communityId - Community ID
   * @param {string} activity - Activity type
   * @returns {Promise<void>}
   */
  async updateCommunityGamblingStats(communityId, activity) {
    try {
      const community = await Community.findById(communityId);
      if (community) {
        community.stats.totalActivities += 1;
        await community.save();
      }
    } catch (error) {
      console.error('Error updating community gambling stats:', error);
    }
  }

  /**
   * Get timeframe in milliseconds
   * @param {string} timeframe - Timeframe string
   * @returns {number} Milliseconds
   */
  getTimeframeMs(timeframe) {
    const timeframes = {
      '1d': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    };
    return timeframes[timeframe] || timeframes['30d'];
  }
}

module.exports = new CommunityGamblingService();