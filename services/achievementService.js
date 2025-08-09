const Achievement = require('../models/points/achievement');
const UserAchievement = require('../models/points/userAchievement');

class AchievementService {
  constructor() {
    this.defaultAchievements = [
      // Gaming Achievements
      {
        name: 'First Game',
        description: 'Play your first game',
        category: 'gaming',
        type: 'count',
        requirements: { activity: 'gaming_sessions', threshold: 1 },
        rewards: { points: 50, badge: 'first-game' },
        rarity: 'common',
        order: 1
      },
      {
        name: 'Gaming Enthusiast',
        description: 'Play 10 games',
        category: 'gaming',
        type: 'count',
        requirements: { activity: 'gaming_sessions', threshold: 10 },
        rewards: { points: 200, badge: 'gaming-enthusiast' },
        rarity: 'uncommon',
        order: 2
      },
      {
        name: 'Gaming Master',
        description: 'Play 100 games',
        category: 'gaming',
        type: 'count',
        requirements: { activity: 'gaming_sessions', threshold: 100 },
        rewards: { points: 1000, badge: 'gaming-master', multiplier: 1.1 },
        rarity: 'rare',
        order: 3
      },
      {
        name: 'Lucky Winner',
        description: 'Win 5 games',
        category: 'gaming',
        type: 'count',
        requirements: { activity: 'gaming_wins', threshold: 5 },
        rewards: { points: 300, badge: 'lucky-winner' },
        rarity: 'uncommon',
        order: 4
      },
      {
        name: 'Winning Streak',
        description: 'Win 25 games',
        category: 'gaming',
        type: 'count',
        requirements: { activity: 'gaming_wins', threshold: 25 },
        rewards: { points: 1500, badge: 'winning-streak', multiplier: 1.2 },
        rarity: 'epic',
        order: 5
      },

      // Raffle Achievements
      {
        name: 'First Raffle',
        description: 'Create your first raffle',
        category: 'raffles',
        type: 'count',
        requirements: { activity: 'raffle_creation', threshold: 1 },
        rewards: { points: 100, badge: 'first-raffle' },
        rarity: 'common',
        order: 10
      },
      {
        name: 'Raffle Creator',
        description: 'Create 5 raffles',
        category: 'raffles',
        type: 'count',
        requirements: { activity: 'raffle_creation', threshold: 5 },
        rewards: { points: 500, badge: 'raffle-creator' },
        rarity: 'uncommon',
        order: 11
      },
      {
        name: 'Raffle Master',
        description: 'Create 25 raffles',
        category: 'raffles',
        type: 'count',
        requirements: { activity: 'raffle_creation', threshold: 25 },
        rewards: { points: 2500, badge: 'raffle-master', multiplier: 1.15 },
        rarity: 'epic',
        order: 12
      },
      {
        name: 'First Win',
        description: 'Win your first raffle',
        category: 'raffles',
        type: 'count',
        requirements: { activity: 'raffle_wins', threshold: 1 },
        rewards: { points: 200, badge: 'first-win' },
        rarity: 'uncommon',
        order: 13
      },
      {
        name: 'Lucky Charm',
        description: 'Win 5 raffles',
        category: 'raffles',
        type: 'count',
        requirements: { activity: 'raffle_wins', threshold: 5 },
        rewards: { points: 1000, badge: 'lucky-charm', multiplier: 1.1 },
        rarity: 'rare',
        order: 14
      },
      {
        name: 'Ticket Collector',
        description: 'Purchase 100 raffle tickets',
        category: 'raffles',
        type: 'count',
        requirements: { activity: 'ticket_purchases', threshold: 100 },
        rewards: { points: 500, badge: 'ticket-collector' },
        rarity: 'uncommon',
        order: 15
      },

      // Social Achievements
      {
        name: 'Social Butterfly',
        description: 'Complete 10 community tasks',
        category: 'social',
        type: 'count',
        requirements: { activity: 'community_participation', threshold: 10 },
        rewards: { points: 300, badge: 'social-butterfly' },
        rarity: 'uncommon',
        order: 20
      },
      {
        name: 'Community Leader',
        description: 'Complete 50 community tasks',
        category: 'social',
        type: 'count',
        requirements: { activity: 'community_participation', threshold: 50 },
        rewards: { points: 1500, badge: 'community-leader', multiplier: 1.1 },
        rarity: 'rare',
        order: 21
      },
      {
        name: 'Referral Champion',
        description: 'Refer 10 users',
        category: 'social',
        type: 'count',
        requirements: { activity: 'referrals', threshold: 10 },
        rewards: { points: 1000, badge: 'referral-champion', multiplier: 1.2 },
        rarity: 'epic',
        order: 22
      },

      // Milestone Achievements
      {
        name: 'Point Collector',
        description: 'Earn 1,000 points',
        category: 'milestones',
        type: 'amount',
        requirements: { activity: 'points_earned', threshold: 1000 },
        rewards: { points: 100, badge: 'point-collector' },
        rarity: 'common',
        order: 30
      },
      {
        name: 'Point Hoarder',
        description: 'Earn 10,000 points',
        category: 'milestones',
        type: 'amount',
        requirements: { activity: 'points_earned', threshold: 10000 },
        rewards: { points: 1000, badge: 'point-hoarder', multiplier: 1.1 },
        rarity: 'rare',
        order: 31
      },
      {
        name: 'Point Legend',
        description: 'Earn 100,000 points',
        category: 'milestones',
        type: 'amount',
        requirements: { activity: 'points_earned', threshold: 100000 },
        rewards: { points: 10000, badge: 'point-legend', multiplier: 1.25 },
        rarity: 'legendary',
        order: 32
      },
      {
        name: 'Daily Dedication',
        description: 'Login for 7 consecutive days',
        category: 'milestones',
        type: 'streak',
        requirements: { activity: 'consecutive_days', threshold: 7 },
        rewards: { points: 350, badge: 'daily-dedication' },
        rarity: 'uncommon',
        order: 33
      },
      {
        name: 'Loyalty Master',
        description: 'Login for 30 consecutive days',
        category: 'milestones',
        type: 'streak',
        requirements: { activity: 'consecutive_days', threshold: 30 },
        rewards: { points: 1500, badge: 'loyalty-master', multiplier: 1.15 },
        rarity: 'epic',
        order: 34
      },

      // Special Achievements
      {
        name: 'Early Adopter',
        description: 'One of the first 1000 users',
        category: 'special',
        type: 'special',
        requirements: { activity: 'special_event', threshold: 1 },
        rewards: { points: 500, badge: 'early-adopter', title: 'Early Adopter' },
        rarity: 'rare',
        order: 40
      },
      {
        name: 'Beta Tester',
        description: 'Participated in beta testing',
        category: 'special',
        type: 'special',
        requirements: { activity: 'special_event', threshold: 1 },
        rewards: { points: 1000, badge: 'beta-tester', title: 'Beta Tester' },
        rarity: 'epic',
        order: 41
      }
    ];
  }

  // Initialize default achievements
  async initializeDefaultAchievements() {
    try {
      for (const achievementData of this.defaultAchievements) {
        const existing = await Achievement.findOne({ name: achievementData.name });
        
        if (!existing) {
          const achievement = new Achievement(achievementData);
          await achievement.save();
          console.log(`Created achievement: ${achievementData.name}`);
        }
      }
      
      console.log('Default achievements initialized');
    } catch (error) {
      console.error('Error initializing default achievements:', error);
      throw error;
    }
  }

  // Get all achievements
  async getAllAchievements(filters = {}) {
    try {
      const query = { isActive: true };
      
      if (filters.category) query.category = filters.category;
      if (filters.rarity) query.rarity = filters.rarity;

      return await Achievement.find(query).sort({ order: 1, name: 1 });
    } catch (error) {
      console.error('Error getting achievements:', error);
      throw error;
    }
  }

  // Get user's achievements
  async getUserAchievements(userId, includeProgress = false) {
    try {
      const query = { userId };
      if (!includeProgress) query.isCompleted = true;

      const userAchievements = await UserAchievement.find(query)
        .populate('achievementId')
        .sort({ completedAt: -1, 'achievementId.order': 1 });

      return userAchievements.map(ua => ({
        achievement: ua.achievementId,
        progress: ua.progress,
        isCompleted: ua.isCompleted,
        completedAt: ua.completedAt,
        pointsAwarded: ua.pointsAwarded,
        currentStreak: ua.currentStreak,
        bestStreak: ua.bestStreak,
        progressPercentage: ua.achievementId ? 
          Math.min((ua.progress / ua.achievementId.requirements.threshold) * 100, 100) : 0
      }));
    } catch (error) {
      console.error('Error getting user achievements:', error);
      throw error;
    }
  }

  // Get achievement statistics
  async getAchievementStats(achievementId) {
    try {
      const totalUsers = await UserAchievement.distinct('userId').countDocuments();
      const completedUsers = await UserAchievement.countDocuments({
        achievementId,
        isCompleted: true
      });
      
      const completionRate = totalUsers > 0 ? (completedUsers / totalUsers) * 100 : 0;
      
      const recentCompletions = await UserAchievement.find({
        achievementId,
        isCompleted: true
      })
      .populate('userId', 'username walletAddresses')
      .sort({ completedAt: -1 })
      .limit(10);

      return {
        totalUsers,
        completedUsers,
        completionRate,
        recentCompletions
      };
    } catch (error) {
      console.error('Error getting achievement stats:', error);
      throw error;
    }
  }

  // Create custom achievement
  async createAchievement(achievementData) {
    try {
      const achievement = new Achievement(achievementData);
      await achievement.save();
      return achievement;
    } catch (error) {
      console.error('Error creating achievement:', error);
      throw error;
    }
  }

  // Update achievement
  async updateAchievement(achievementId, updates) {
    try {
      const achievement = await Achievement.findByIdAndUpdate(
        achievementId,
        updates,
        { new: true }
      );
      
      if (!achievement) {
        throw new Error('Achievement not found');
      }
      
      return achievement;
    } catch (error) {
      console.error('Error updating achievement:', error);
      throw error;
    }
  }

  // Delete achievement
  async deleteAchievement(achievementId) {
    try {
      // Soft delete by setting isActive to false
      const achievement = await Achievement.findByIdAndUpdate(
        achievementId,
        { isActive: false },
        { new: true }
      );
      
      if (!achievement) {
        throw new Error('Achievement not found');
      }
      
      return achievement;
    } catch (error) {
      console.error('Error deleting achievement:', error);
      throw error;
    }
  }

  // Get achievement leaderboard
  async getAchievementLeaderboard(limit = 100) {
    try {
      const leaderboard = await UserAchievement.aggregate([
        { $match: { isCompleted: true } },
        {
          $group: {
            _id: '$userId',
            achievementCount: { $sum: 1 },
            totalPoints: { $sum: '$pointsAwarded' },
            lastAchievement: { $max: '$completedAt' }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $project: {
            userId: '$_id',
            username: '$user.username',
            walletAddress: { $arrayElemAt: ['$user.walletAddresses', 0] },
            achievementCount: 1,
            totalPoints: 1,
            lastAchievement: 1
          }
        },
        { $sort: { achievementCount: -1, totalPoints: -1 } },
        { $limit: limit }
      ]);

      return leaderboard;
    } catch (error) {
      console.error('Error getting achievement leaderboard:', error);
      throw error;
    }
  }

  // Get user's achievement progress summary
  async getUserAchievementSummary(userId) {
    try {
      const totalAchievements = await Achievement.countDocuments({ isActive: true });
      const userAchievements = await UserAchievement.find({ userId });
      
      const completed = userAchievements.filter(ua => ua.isCompleted).length;
      const inProgress = userAchievements.filter(ua => !ua.isCompleted && ua.progress > 0).length;
      const totalPointsFromAchievements = userAchievements
        .filter(ua => ua.isCompleted)
        .reduce((sum, ua) => sum + ua.pointsAwarded, 0);

      // Get achievements by category
      const achievementsByCategory = await UserAchievement.aggregate([
        { $match: { userId, isCompleted: true } },
        {
          $lookup: {
            from: 'achievements',
            localField: 'achievementId',
            foreignField: '_id',
            as: 'achievement'
          }
        },
        { $unwind: '$achievement' },
        {
          $group: {
            _id: '$achievement.category',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get rarest achievement
      const rarestAchievement = await UserAchievement.findOne({ userId, isCompleted: true })
        .populate({
          path: 'achievementId',
          match: { rarity: { $in: ['legendary', 'epic', 'rare'] } }
        })
        .sort({ 'achievementId.rarity': 1, completedAt: 1 });

      return {
        totalAchievements,
        completed,
        inProgress,
        completionRate: (completed / totalAchievements) * 100,
        totalPointsFromAchievements,
        achievementsByCategory,
        rarestAchievement: rarestAchievement?.achievementId || null
      };
    } catch (error) {
      console.error('Error getting user achievement summary:', error);
      throw error;
    }
  }
}

module.exports = new AchievementService();