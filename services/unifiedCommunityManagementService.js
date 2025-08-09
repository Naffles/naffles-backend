const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const CommunityPointsBalance = require('../models/points/communityPointsBalance');
const CommunityPointsTransaction = require('../models/points/communityPointsTransaction');
const CommunityAchievement = require('../models/points/communityAchievement');

// Import existing services for backward compatibility
const pointsService = require('./pointsService');
const achievementService = require('./achievementService');
const leaderboardService = require('./leaderboardService');
const communityPointsService = require('./communityPointsService');
const communityManagementService = require('./communityManagementService');

class UnifiedCommunityManagementService {
  constructor() {
    this.nafflesCommunityId = null;
    this.initialized = false;
  }

  /**
   * Initialize the unified management system
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure Naffles flagship community exists
      const nafflesCommunity = await Community.createNafflesCommunity();
      this.nafflesCommunityId = nafflesCommunity._id;
      this.initialized = true;
      
      console.log('Unified Community Management System initialized');
    } catch (error) {
      console.error('Error initializing unified management system:', error);
      throw error;
    }
  }

  /**
   * Get all communities with their points systems
   * @param {string} adminUserId - Admin user ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Communities with points system info
   */
  async getAllCommunitiesWithPointsSystems(adminUserId, options = {}) {
    try {
      await this.initialize();

      // Check admin permissions
      const userRole = await this.getUserRole(adminUserId);
      if (userRole !== 'naffles_admin' && userRole !== 'super_admin') {
        throw new Error('Insufficient permissions - Naffles admin access required');
      }

      const page = parseInt(options.page) || 1;
      const limit = parseInt(options.limit) || 20;
      const skip = (page - 1) * limit;

      const query = {};
      if (options.search) {
        query.$or = [
          { name: { $regex: options.search, $options: 'i' } },
          { description: { $regex: options.search, $options: 'i' } }
        ];
      }

      if (options.isActive !== undefined) {
        query.isActive = options.isActive;
      }

      // Get communities with aggregated points data
      const communities = await Community.aggregate([
        { $match: query },
        {
          $lookup: {
            from: 'communitypointsbalances',
            localField: '_id',
            foreignField: 'communityId',
            as: 'pointsBalances'
          }
        },
        {
          $lookup: {
            from: 'communitypointstransactions',
            localField: '_id',
            foreignField: 'communityId',
            as: 'pointsTransactions'
          }
        },
        {
          $lookup: {
            from: 'communityachievements',
            localField: '_id',
            foreignField: 'communityId',
            as: 'achievements'
          }
        },
        {
          $addFields: {
            pointsSystemStats: {
              totalUsers: { $size: '$pointsBalances' },
              totalPointsInCirculation: { $sum: '$pointsBalances.balance' },
              totalTransactions: { $size: '$pointsTransactions' },
              totalAchievements: { $size: '$achievements' },
              pointsName: '$pointsConfiguration.pointsName',
              pointsSymbol: '$pointsConfiguration.pointsSymbol',
              hasJackpot: {
                $and: [
                  '$isNafflesCommunity',
                  '$features.enableJackpot'
                ]
              }
            }
          }
        },
        {
          $project: {
            pointsBalances: 0,
            pointsTransactions: 0,
            achievements: 0
          }
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]);

      const total = await Community.countDocuments(query);

      return {
        communities,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error getting all communities with points systems:', error);
      throw error;
    }
  }

  /**
   * Get cross-community analytics showing separate points systems
   * @param {string} adminUserId - Admin user ID
   * @param {string} timeframe - Analytics timeframe
   * @returns {Promise<Object>} Cross-community analytics
   */
  async getCrossCommunityAnalytics(adminUserId, timeframe = '30d') {
    try {
      await this.initialize();

      // Check admin permissions
      const userRole = await this.getUserRole(adminUserId);
      if (userRole !== 'naffles_admin' && userRole !== 'super_admin') {
        throw new Error('Insufficient permissions - Naffles admin access required');
      }

      const timeframeMs = this.getTimeframeMs(timeframe);
      const startDate = new Date(Date.now() - timeframeMs);

      // Get overall platform statistics
      const totalCommunities = await Community.countDocuments({ isActive: true });
      const totalMembers = await CommunityMember.countDocuments({ isActive: true });

      // Get points system distribution
      const pointsSystemStats = await Community.aggregate([
        { $match: { isActive: true } },
        {
          $lookup: {
            from: 'communitypointsbalances',
            localField: '_id',
            foreignField: 'communityId',
            as: 'balances'
          }
        },
        {
          $group: {
            _id: {
              isNafflesCommunity: '$isNafflesCommunity',
              pointsName: '$pointsConfiguration.pointsName',
              hasJackpot: {
                $and: ['$isNafflesCommunity', '$features.enableJackpot']
              }
            },
            communityCount: { $sum: 1 },
            totalUsers: { $sum: { $size: '$balances' } },
            totalPointsIssued: { $sum: '$stats.totalPointsIssued' },
            totalActivities: { $sum: '$stats.totalActivities' },
            avgMemberCount: { $avg: '$stats.memberCount' }
          }
        },
        {
          $project: {
            _id: 0,
            systemType: {
              $cond: [
                '$_id.isNafflesCommunity',
                'Naffles Flagship',
                'User Community'
              ]
            },
            pointsName: '$_id.pointsName',
            hasJackpot: '$_id.hasJackpot',
            communityCount: 1,
            totalUsers: 1,
            totalPointsIssued: 1,
            totalActivities: 1,
            avgMemberCount: { $round: ['$avgMemberCount', 0] }
          }
        }
      ]);

      // Get recent activity across all communities
      const recentActivity = await CommunityPointsTransaction.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $lookup: {
            from: 'communities',
            localField: 'communityId',
            foreignField: '_id',
            as: 'community'
          }
        },
        { $unwind: '$community' },
        {
          $group: {
            _id: {
              communityId: '$communityId',
              activity: '$activity',
              pointsName: '$pointsName'
            },
            count: { $sum: 1 },
            totalPoints: { $sum: '$amount' },
            communityName: { $first: '$community.name' },
            isNafflesCommunity: { $first: '$community.isNafflesCommunity' }
          }
        },
        {
          $group: {
            _id: '$_id.communityId',
            communityName: { $first: '$communityName' },
            pointsName: { $first: '$_id.pointsName' },
            isNafflesCommunity: { $first: '$isNafflesCommunity' },
            activities: {
              $push: {
                activity: '$_id.activity',
                count: '$count',
                totalPoints: '$totalPoints'
              }
            },
            totalTransactions: { $sum: '$count' },
            totalPointsAwarded: { $sum: '$totalPoints' }
          }
        },
        { $sort: { totalTransactions: -1 } },
        { $limit: 20 }
      ]);

      // Get top communities by activity
      const topCommunities = await Community.aggregate([
        { $match: { isActive: true } },
        {
          $lookup: {
            from: 'communitypointstransactions',
            localField: '_id',
            foreignField: 'communityId',
            pipeline: [
              { $match: { createdAt: { $gte: startDate } } }
            ],
            as: 'recentTransactions'
          }
        },
        {
          $addFields: {
            recentActivityCount: { $size: '$recentTransactions' },
            recentPointsIssued: { $sum: '$recentTransactions.amount' }
          }
        },
        {
          $project: {
            name: 1,
            'pointsConfiguration.pointsName': 1,
            'pointsConfiguration.pointsSymbol': 1,
            isNafflesCommunity: 1,
            'features.enableJackpot': 1,
            'stats.memberCount': 1,
            'stats.totalPointsIssued': 1,
            recentActivityCount: 1,
            recentPointsIssued: 1
          }
        },
        { $sort: { recentActivityCount: -1 } },
        { $limit: 10 }
      ]);

      // Get jackpot information (Naffles only)
      let jackpotInfo = null;
      if (this.nafflesCommunityId) {
        try {
          const nafflesCommunity = await Community.findById(this.nafflesCommunityId);
          if (nafflesCommunity && nafflesCommunity.features.enableJackpot) {
            // Get jackpot info from existing system
            jackpotInfo = await pointsService.getJackpotInfo();
          }
        } catch (error) {
          console.error('Error getting jackpot info:', error);
        }
      }

      return {
        overview: {
          totalCommunities,
          totalMembers,
          timeframe,
          separatePointsSystems: pointsSystemStats.length
        },
        pointsSystemDistribution: pointsSystemStats,
        recentActivity,
        topCommunities,
        jackpotInfo,
        systemFeatures: {
          unifiedManagement: true,
          separatePointsSystems: true,
          nafflesExclusiveFeatures: ['jackpot', 'systemWideEarning'],
          crossCommunityAnalytics: true
        }
      };
    } catch (error) {
      console.error('Error getting cross-community analytics:', error);
      throw error;
    }
  }

  /**
   * Manage community-specific achievements with custom points naming
   * @param {string} communityId - Community ID
   * @param {string} userId - User ID
   * @param {Object} achievementData - Achievement data
   * @returns {Promise<Object>} Created/updated achievement
   */
  async manageCommunityAchievement(communityId, userId, achievementData) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      // Check permissions
      const canManage = await this.canUserManageCommunityAchievements(userId, communityId);
      if (!canManage) {
        throw new Error('Insufficient permissions to manage community achievements');
      }

      // Ensure achievement uses community's points naming
      if (achievementData.rewards && achievementData.rewards.points) {
        achievementData.rewards.pointsName = community.pointsConfiguration.pointsName;
        achievementData.rewards.pointsSymbol = community.pointsConfiguration.pointsSymbol;
      }

      let achievement;
      if (achievementData._id) {
        // Update existing achievement
        achievement = await CommunityAchievement.findOneAndUpdate(
          { _id: achievementData._id, communityId },
          achievementData,
          { new: true }
        );
      } else {
        // Create new achievement
        achievement = new CommunityAchievement({
          ...achievementData,
          communityId,
          isNafflesCommunity: community.isNafflesCommunity
        });
        await achievement.save();
      }

      return achievement;
    } catch (error) {
      console.error('Error managing community achievement:', error);
      throw error;
    }
  }

  /**
   * Get community-specific leaderboard with custom points naming
   * @param {string} communityId - Community ID
   * @param {Object} options - Leaderboard options
   * @returns {Promise<Object>} Leaderboard with community branding
   */
  async getCommunityLeaderboardWithBranding(communityId, options = {}) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      const leaderboard = await communityPointsService.getCommunityLeaderboard(
        communityId,
        options.limit || 100
      );

      return {
        communityId,
        communityName: community.name,
        pointsName: community.pointsConfiguration.pointsName,
        pointsSymbol: community.pointsConfiguration.pointsSymbol,
        isNafflesCommunity: community.isNafflesCommunity,
        hasJackpot: community.isNafflesCommunity && community.features.enableJackpot,
        leaderboard,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('Error getting community leaderboard with branding:', error);
      throw error;
    }
  }

  /**
   * Award points with unified management but separate systems
   * @param {string} userId - User ID
   * @param {string} communityId - Community ID
   * @param {string} activity - Activity type
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Points award result
   */
  async awardPointsUnified(userId, communityId, activity, metadata = {}) {
    try {
      await this.initialize();

      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      // Use community points service for separate points systems
      const result = await communityPointsService.awardCommunityPoints(
        userId,
        communityId,
        activity,
        metadata
      );

      // For Naffles community, also handle system-wide features
      if (community.isNafflesCommunity && community.features.enableSystemWideEarning) {
        // Additional system-wide processing for Naffles community
        await this.handleNafflesSystemWideEarning(userId, activity, result.pointsAwarded, metadata);
      }

      return {
        ...result,
        systemType: community.isNafflesCommunity ? 'naffles_flagship' : 'user_community',
        hasSystemWideFeatures: community.isNafflesCommunity && community.features.enableSystemWideEarning
      };
    } catch (error) {
      console.error('Error awarding points unified:', error);
      throw error;
    }
  }

  /**
   * Handle Naffles system-wide earning features
   * @param {string} userId - User ID
   * @param {string} activity - Activity type
   * @param {number} pointsAwarded - Points awarded
   * @param {Object} metadata - Metadata
   */
  async handleNafflesSystemWideEarning(userId, activity, pointsAwarded, metadata) {
    try {
      // Handle jackpot for Naffles community
      if (activity.startsWith('gaming_') || activity === 'raffle_creation') {
        await pointsService.incrementJackpot(activity, pointsAwarded);
        
        // Check for jackpot win
        const userBalance = await CommunityPointsBalance.findOne({
          userId,
          communityId: this.nafflesCommunityId
        });
        
        if (userBalance) {
          await pointsService.checkJackpotWin(userId, userBalance.balance);
        }
      }

      // Handle system-wide achievements (if any)
      // This could include cross-platform achievements that span multiple activities
      
    } catch (error) {
      console.error('Error handling Naffles system-wide earning:', error);
      // Don't throw error to avoid breaking the main points award flow
    }
  }

  /**
   * Migrate existing Naffles points to unified system
   * @param {boolean} dryRun - Whether to perform a dry run
   * @returns {Promise<Object>} Migration result
   */
  async migrateNafflesToUnified(dryRun = false) {
    try {
      await this.initialize();

      const CommunityPointsMigration = require('../scripts/migrateToCommunityPoints');
      const migration = new CommunityPointsMigration();

      if (dryRun) {
        console.log('Performing dry run migration...');
        // Return what would be migrated without actually doing it
        const PointsBalance = require('../models/points/pointsBalance');
        const PointsTransaction = require('../models/points/pointsTransaction');
        const Achievement = require('../models/points/achievement');

        const balanceCount = await PointsBalance.countDocuments();
        const transactionCount = await PointsTransaction.countDocuments();
        const achievementCount = await Achievement.countDocuments();

        return {
          dryRun: true,
          wouldMigrate: {
            balances: balanceCount,
            transactions: transactionCount,
            achievements: achievementCount
          },
          nafflesCommunityId: this.nafflesCommunityId
        };
      } else {
        console.log('Performing actual migration...');
        await migration.migrate();
        
        return {
          success: true,
          nafflesCommunityId: this.nafflesCommunityId,
          message: 'Naffles points successfully migrated to unified system'
        };
      }
    } catch (error) {
      console.error('Error migrating Naffles to unified system:', error);
      throw error;
    }
  }

  /**
   * Get unified management dashboard data
   * @param {string} adminUserId - Admin user ID
   * @returns {Promise<Object>} Dashboard data
   */
  async getUnifiedManagementDashboard(adminUserId) {
    try {
      await this.initialize();

      // Check admin permissions
      const userRole = await this.getUserRole(adminUserId);
      if (userRole !== 'naffles_admin' && userRole !== 'super_admin') {
        throw new Error('Insufficient permissions - Naffles admin access required');
      }

      // Get system overview
      const systemOverview = await this.getCrossCommunityAnalytics(adminUserId, '7d');
      
      // Get recent communities
      const recentCommunities = await Community.find({ isActive: true })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name pointsConfiguration.pointsName stats.memberCount isNafflesCommunity createdAt');

      // Get system health metrics
      const systemHealth = await this.getSystemHealthMetrics();

      return {
        overview: systemOverview.overview,
        recentCommunities,
        systemHealth,
        features: {
          unifiedManagement: true,
          separatePointsSystems: true,
          crossCommunityAnalytics: true,
          nafflesExclusiveFeatures: true
        },
        nafflesCommunityId: this.nafflesCommunityId
      };
    } catch (error) {
      console.error('Error getting unified management dashboard:', error);
      throw error;
    }
  }

  /**
   * Get system health metrics
   * @returns {Promise<Object>} System health data
   */
  async getSystemHealthMetrics() {
    try {
      const totalCommunities = await Community.countDocuments({ isActive: true });
      const totalUsers = await CommunityMember.countDocuments({ isActive: true });
      const totalPointsBalances = await CommunityPointsBalance.countDocuments();
      const recentTransactions = await CommunityPointsTransaction.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      return {
        totalCommunities,
        totalUsers,
        totalPointsBalances,
        recentTransactions,
        systemStatus: 'healthy',
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('Error getting system health metrics:', error);
      return {
        systemStatus: 'error',
        error: error.message,
        lastUpdated: new Date()
      };
    }
  }

  /**
   * Check if user can manage community achievements
   * @param {string} userId - User ID
   * @param {string} communityId - Community ID
   * @returns {Promise<boolean>} Can manage
   */
  async canUserManageCommunityAchievements(userId, communityId) {
    try {
      // Check if user is Naffles admin
      const userRole = await this.getUserRole(userId);
      if (userRole === 'naffles_admin' || userRole === 'super_admin') {
        return true;
      }

      // Check community membership and permissions
      const membership = await CommunityMember.findOne({
        userId,
        communityId,
        isActive: true
      });

      return membership && membership.hasPermission('canManageAchievements');
    } catch (error) {
      console.error('Error checking achievement management permissions:', error);
      return false;
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

  /**
   * Get user role (would integrate with existing user system)
   * @param {string} userId - User ID
   * @returns {Promise<string>} User role
   */
  async getUserRole(userId) {
    // This would integrate with the existing user role system
    // For now, return 'user' as default
    // TODO: Integrate with actual user role system
    return 'user';
  }
}

module.exports = new UnifiedCommunityManagementService();