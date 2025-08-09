const pointsService = require('../services/pointsService');
const achievementService = require('../services/achievementService');
const leaderboardService = require('../services/leaderboardService');

class PointsController {
  // Get user's points information
  async getUserPoints(req, res) {
    try {
      const userId = req.user.id;
      const pointsInfo = await pointsService.getUserPointsInfo(userId);
      
      res.json({
        success: true,
        data: pointsInfo
      });
    } catch (error) {
      console.error('Error getting user points:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user points',
        error: error.message
      });
    }
  }

  // Get points transaction history
  async getTransactionHistory(req, res) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const filters = {
        type: req.query.type,
        activity: req.query.activity,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo
      };

      const history = await pointsService.getTransactionHistory(userId, page, limit, filters);
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Error getting transaction history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get transaction history',
        error: error.message
      });
    }
  }

  // Award points (admin only)
  async awardPoints(req, res) {
    try {
      const { userId, activity, metadata } = req.body;
      
      if (!userId || !activity) {
        return res.status(400).json({
          success: false,
          message: 'User ID and activity are required'
        });
      }

      const result = await pointsService.awardPoints(userId, activity, metadata);
      
      res.json({
        success: true,
        message: 'Points awarded successfully',
        data: result
      });
    } catch (error) {
      console.error('Error awarding points:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to award points',
        error: error.message
      });
    }
  }

  // Deduct points (admin only)
  async deductPoints(req, res) {
    try {
      const { userId, amount, reason } = req.body;
      const adminId = req.user.id;
      
      if (!userId || !amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid user ID and amount are required'
        });
      }

      const result = await pointsService.deductPoints(userId, amount, reason, adminId);
      
      res.json({
        success: true,
        message: 'Points deducted successfully',
        data: result
      });
    } catch (error) {
      console.error('Error deducting points:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to deduct points',
        error: error.message
      });
    }
  }

  // Get jackpot information
  async getJackpot(req, res) {
    try {
      const jackpotInfo = await pointsService.getJackpotInfo();
      
      res.json({
        success: true,
        data: jackpotInfo
      });
    } catch (error) {
      console.error('Error getting jackpot info:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get jackpot information',
        error: error.message
      });
    }
  }

  // Get achievements
  async getAchievements(req, res) {
    try {
      const filters = {
        category: req.query.category,
        rarity: req.query.rarity
      };

      const achievements = await achievementService.getAllAchievements(filters);
      
      res.json({
        success: true,
        data: achievements
      });
    } catch (error) {
      console.error('Error getting achievements:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get achievements',
        error: error.message
      });
    }
  }

  // Get user's achievements
  async getUserAchievements(req, res) {
    try {
      const userId = req.user.id;
      const includeProgress = req.query.includeProgress === 'true';

      const achievements = await achievementService.getUserAchievements(userId, includeProgress);
      
      res.json({
        success: true,
        data: achievements
      });
    } catch (error) {
      console.error('Error getting user achievements:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user achievements',
        error: error.message
      });
    }
  }

  // Get achievement summary
  async getAchievementSummary(req, res) {
    try {
      const userId = req.user.id;
      const summary = await achievementService.getUserAchievementSummary(userId);
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Error getting achievement summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get achievement summary',
        error: error.message
      });
    }
  }

  // Get leaderboard
  async getLeaderboard(req, res) {
    try {
      const category = req.params.category || 'points';
      const period = req.params.period || 'all_time';
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;

      const leaderboard = await leaderboardService.getLeaderboard(category, period, limit, offset);
      
      res.json({
        success: true,
        data: leaderboard
      });
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get leaderboard',
        error: error.message
      });
    }
  }

  // Get user's leaderboard position
  async getUserPosition(req, res) {
    try {
      const userId = req.user.id;
      const category = req.params.category || 'points';
      const period = req.params.period || 'all_time';

      const position = await leaderboardService.getUserPosition(userId, category, period);
      
      res.json({
        success: true,
        data: position
      });
    } catch (error) {
      console.error('Error getting user position:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user position',
        error: error.message
      });
    }
  }

  // Get leaderboard options
  async getLeaderboardOptions(req, res) {
    try {
      const options = leaderboardService.getAvailableOptions();
      
      res.json({
        success: true,
        data: options
      });
    } catch (error) {
      console.error('Error getting leaderboard options:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get leaderboard options',
        error: error.message
      });
    }
  }

  // Get points statistics (admin only)
  async getPointsStats(req, res) {
    try {
      // This would aggregate various points statistics
      const stats = {
        totalPointsIssued: 0,
        totalActiveUsers: 0,
        jackpotInfo: await pointsService.getJackpotInfo(),
        leaderboardStats: await leaderboardService.getLeaderboardStats()
      };

      // Add more statistics as needed
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting points stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get points statistics',
        error: error.message
      });
    }
  }

  // Bulk award points (admin only)
  async bulkAwardPoints(req, res) {
    try {
      const { userIds, activity, metadata } = req.body;
      
      if (!Array.isArray(userIds) || userIds.length === 0 || !activity) {
        return res.status(400).json({
          success: false,
          message: 'User IDs array and activity are required'
        });
      }

      const results = [];
      const errors = [];

      for (const userId of userIds) {
        try {
          const result = await pointsService.awardPoints(userId, activity, metadata);
          results.push({ userId, ...result });
        } catch (error) {
          errors.push({ userId, error: error.message });
        }
      }

      res.json({
        success: true,
        message: `Points awarded to ${results.length} users`,
        data: {
          successful: results,
          failed: errors
        }
      });
    } catch (error) {
      console.error('Error bulk awarding points:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk award points',
        error: error.message
      });
    }
  }
}

module.exports = new PointsController();