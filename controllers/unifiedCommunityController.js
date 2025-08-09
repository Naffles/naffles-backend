const unifiedCommunityManagementService = require('../services/unifiedCommunityManagementService');

class UnifiedCommunityController {
  // Get unified management dashboard
  async getDashboard(req, res) {
    try {
      const adminUserId = req.user.id;
      
      const dashboard = await unifiedCommunityManagementService.getUnifiedManagementDashboard(
        adminUserId
      );

      res.json({
        success: true,
        data: dashboard
      });
    } catch (error) {
      console.error('Error getting unified dashboard:', error);
      const statusCode = error.message.includes('permissions') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to get unified dashboard',
        error: error.message
      });
    }
  }

  // Get all communities with their points systems
  async getAllCommunitiesWithPointsSystems(req, res) {
    try {
      const adminUserId = req.user.id;
      const options = {
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        isActive: req.query.isActive
      };

      const result = await unifiedCommunityManagementService.getAllCommunitiesWithPointsSystems(
        adminUserId,
        options
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error getting all communities with points systems:', error);
      const statusCode = error.message.includes('permissions') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to get communities with points systems',
        error: error.message
      });
    }
  }

  // Get cross-community analytics
  async getCrossCommunityAnalytics(req, res) {
    try {
      const adminUserId = req.user.id;
      const timeframe = req.query.timeframe || '30d';

      const analytics = await unifiedCommunityManagementService.getCrossCommunityAnalytics(
        adminUserId,
        timeframe
      );

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Error getting cross-community analytics:', error);
      const statusCode = error.message.includes('permissions') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to get cross-community analytics',
        error: error.message
      });
    }
  }

  // Manage community achievement with unified system
  async manageCommunityAchievement(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;
      const achievementData = req.body;

      const achievement = await unifiedCommunityManagementService.manageCommunityAchievement(
        communityId,
        userId,
        achievementData
      );

      res.json({
        success: true,
        message: achievementData._id ? 'Achievement updated successfully' : 'Achievement created successfully',
        data: achievement
      });
    } catch (error) {
      console.error('Error managing community achievement:', error);
      const statusCode = error.message.includes('permissions') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to manage community achievement',
        error: error.message
      });
    }
  }

  // Get community leaderboard with branding
  async getCommunityLeaderboardWithBranding(req, res) {
    try {
      const { communityId } = req.params;
      const options = {
        limit: parseInt(req.query.limit) || 100
      };

      const leaderboard = await unifiedCommunityManagementService.getCommunityLeaderboardWithBranding(
        communityId,
        options
      );

      res.json({
        success: true,
        data: leaderboard
      });
    } catch (error) {
      console.error('Error getting community leaderboard with branding:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get community leaderboard',
        error: error.message
      });
    }
  }

  // Award points through unified system
  async awardPointsUnified(req, res) {
    try {
      const { communityId } = req.params;
      const { userId, activity, metadata } = req.body;

      if (!userId || !activity) {
        return res.status(400).json({
          success: false,
          message: 'User ID and activity are required'
        });
      }

      const result = await unifiedCommunityManagementService.awardPointsUnified(
        userId,
        communityId,
        activity,
        metadata || {}
      );

      res.json({
        success: true,
        message: 'Points awarded successfully through unified system',
        data: result
      });
    } catch (error) {
      console.error('Error awarding points unified:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to award points',
        error: error.message
      });
    }
  }

  // Migrate Naffles to unified system
  async migrateNafflesToUnified(req, res) {
    try {
      const { dryRun } = req.query;
      const adminUserId = req.user.id;

      // Check admin permissions
      const userRole = await unifiedCommunityManagementService.getUserRole(adminUserId);
      if (userRole !== 'naffles_admin' && userRole !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions - Naffles admin access required'
        });
      }

      const result = await unifiedCommunityManagementService.migrateNafflesToUnified(
        dryRun === 'true'
      );

      res.json({
        success: true,
        message: result.dryRun ? 'Migration dry run completed' : 'Migration completed successfully',
        data: result
      });
    } catch (error) {
      console.error('Error migrating Naffles to unified:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to migrate Naffles to unified system',
        error: error.message
      });
    }
  }

  // Get system health status
  async getSystemHealth(req, res) {
    try {
      const adminUserId = req.user.id;

      // Check admin permissions
      const userRole = await unifiedCommunityManagementService.getUserRole(adminUserId);
      if (userRole !== 'naffles_admin' && userRole !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions - Naffles admin access required'
        });
      }

      const health = await unifiedCommunityManagementService.getSystemHealthMetrics();

      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      console.error('Error getting system health:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get system health',
        error: error.message
      });
    }
  }

  // Initialize unified system
  async initializeSystem(req, res) {
    try {
      const adminUserId = req.user.id;

      // Check admin permissions
      const userRole = await unifiedCommunityManagementService.getUserRole(adminUserId);
      if (userRole !== 'naffles_admin' && userRole !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions - Naffles admin access required'
        });
      }

      await unifiedCommunityManagementService.initialize();

      res.json({
        success: true,
        message: 'Unified community management system initialized successfully'
      });
    } catch (error) {
      console.error('Error initializing unified system:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initialize unified system',
        error: error.message
      });
    }
  }
}

module.exports = new UnifiedCommunityController();