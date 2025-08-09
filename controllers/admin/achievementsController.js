const achievementService = require('../../services/achievementService');

class AchievementsController {
  // Get all achievements with admin details
  async getAllAchievements(req, res) {
    try {
      const filters = {
        category: req.query.category,
        rarity: req.query.rarity,
        isActive: req.query.isActive !== 'false' // Default to true unless explicitly false
      };

      const achievements = await achievementService.getAllAchievements(filters);
      
      // Get statistics for each achievement
      const achievementsWithStats = await Promise.all(
        achievements.map(async (achievement) => {
          const stats = await achievementService.getAchievementStats(achievement._id);
          return {
            ...achievement.toObject(),
            stats
          };
        })
      );

      res.json({
        success: true,
        data: achievementsWithStats
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

  // Create new achievement
  async createAchievement(req, res) {
    try {
      const achievementData = req.body;
      
      // Validate required fields
      const requiredFields = ['name', 'description', 'category', 'type', 'requirements', 'rewards'];
      for (const field of requiredFields) {
        if (!achievementData[field]) {
          return res.status(400).json({
            success: false,
            message: `${field} is required`
          });
        }
      }

      const achievement = await achievementService.createAchievement(achievementData);
      
      res.status(201).json({
        success: true,
        message: 'Achievement created successfully',
        data: achievement
      });
    } catch (error) {
      console.error('Error creating achievement:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create achievement',
        error: error.message
      });
    }
  }

  // Update achievement
  async updateAchievement(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const achievement = await achievementService.updateAchievement(id, updates);
      
      res.json({
        success: true,
        message: 'Achievement updated successfully',
        data: achievement
      });
    } catch (error) {
      console.error('Error updating achievement:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update achievement',
        error: error.message
      });
    }
  }

  // Delete achievement (soft delete)
  async deleteAchievement(req, res) {
    try {
      const { id } = req.params;
      
      const achievement = await achievementService.deleteAchievement(id);
      
      res.json({
        success: true,
        message: 'Achievement deleted successfully',
        data: achievement
      });
    } catch (error) {
      console.error('Error deleting achievement:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete achievement',
        error: error.message
      });
    }
  }

  // Get achievement statistics
  async getAchievementStats(req, res) {
    try {
      const { id } = req.params;
      
      const stats = await achievementService.getAchievementStats(id);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting achievement stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get achievement statistics',
        error: error.message
      });
    }
  }

  // Get achievement leaderboard
  async getAchievementLeaderboard(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 100;
      
      const leaderboard = await achievementService.getAchievementLeaderboard(limit);
      
      res.json({
        success: true,
        data: leaderboard
      });
    } catch (error) {
      console.error('Error getting achievement leaderboard:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get achievement leaderboard',
        error: error.message
      });
    }
  }

  // Initialize default achievements
  async initializeDefaults(req, res) {
    try {
      await achievementService.initializeDefaultAchievements();
      
      res.json({
        success: true,
        message: 'Default achievements initialized successfully'
      });
    } catch (error) {
      console.error('Error initializing default achievements:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initialize default achievements',
        error: error.message
      });
    }
  }

  // Get achievement categories and types
  async getAchievementOptions(req, res) {
    try {
      const options = {
        categories: ['gaming', 'raffles', 'social', 'milestones', 'special'],
        types: ['count', 'streak', 'amount', 'special'],
        rarities: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
        activities: [
          'raffle_creation',
          'raffle_wins',
          'ticket_purchases',
          'gaming_sessions',
          'gaming_wins',
          'points_earned',
          'consecutive_days',
          'referrals',
          'community_participation',
          'special_event'
        ]
      };

      res.json({
        success: true,
        data: options
      });
    } catch (error) {
      console.error('Error getting achievement options:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get achievement options',
        error: error.message
      });
    }
  }
}

module.exports = new AchievementsController();