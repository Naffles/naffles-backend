const PointsBalance = require('../models/points/pointsBalance');
const PointsTransaction = require('../models/points/pointsTransaction');
const PointsJackpot = require('../models/points/pointsJackpot');
const Achievement = require('../models/points/achievement');
const UserAchievement = require('../models/points/userAchievement');
const PartnerToken = require('../models/points/partnerToken');
const LeaderboardEntry = require('../models/points/leaderboard');

class PointsService {
  constructor() {
    this.activityPointsMap = {
      raffle_creation: 50,
      raffle_ticket_purchase: 1, // Per $10 spent
      gaming_blackjack: 5,
      gaming_coin_toss: 3,
      gaming_rock_paper_scissors: 3,
      gaming_crypto_slots: 8,
      token_staking: 10, // Per day
      referral_bonus: 25,
      daily_login: 5,
      community_task: 15
    };
  }

  // Initialize points system for new user
  async initializeUserPoints(userId) {
    try {
      let pointsBalance = await PointsBalance.findOne({ userId });
      
      if (!pointsBalance) {
        pointsBalance = new PointsBalance({ userId });
        await pointsBalance.save();
      }

      return pointsBalance;
    } catch (error) {
      console.error('Error initializing user points:', error);
      throw error;
    }
  }

  // Award points to user
  async awardPoints(userId, activity, metadata = {}) {
    try {
      const pointsBalance = await this.initializeUserPoints(userId);
      const basePoints = this.activityPointsMap[activity] || 0;
      
      if (basePoints === 0) {
        throw new Error(`Unknown activity: ${activity}`);
      }

      // Calculate multiplier from partner tokens
      let multiplier = 1.0;
      if (metadata.tokenContract && metadata.chainId) {
        const partnerToken = await PartnerToken.findByContract(metadata.tokenContract, metadata.chainId);
        if (partnerToken) {
          const activityType = this.getActivityTypeForPartnerBonus(activity);
          multiplier = partnerToken.getMultiplierForActivity(activityType);
        }
      }

      // Apply additional multipliers
      if (metadata.additionalMultiplier) {
        multiplier *= metadata.additionalMultiplier;
      }

      const finalPoints = Math.floor(basePoints * multiplier);
      const balanceBefore = pointsBalance.balance;

      // Create transaction record
      const transaction = new PointsTransaction({
        userId,
        type: 'earned',
        activity,
        amount: finalPoints,
        balanceBefore,
        balanceAfter: balanceBefore + finalPoints,
        multiplier,
        baseAmount: basePoints,
        metadata,
        description: this.getActivityDescription(activity, metadata),
        isReversible: true
      });

      // Update balance
      pointsBalance.balance += finalPoints;
      pointsBalance.totalEarned += finalPoints;
      pointsBalance.lastActivity = new Date();
      pointsBalance.updateTier();

      // Save both records
      await Promise.all([
        transaction.save(),
        pointsBalance.save()
      ]);

      // Update jackpot
      await this.incrementJackpot(activity, finalPoints);

      // Check for achievements
      await this.checkAchievements(userId, activity, finalPoints, metadata);

      // Update leaderboards
      await this.updateLeaderboards(userId, activity, finalPoints, metadata);

      // Check for jackpot win
      await this.checkJackpotWin(userId, pointsBalance.balance);

      return {
        pointsAwarded: finalPoints,
        newBalance: pointsBalance.balance,
        multiplier,
        transaction: transaction._id
      };
    } catch (error) {
      console.error('Error awarding points:', error);
      throw error;
    }
  }

  // Deduct points from user
  async deductPoints(userId, amount, reason, adminId = null) {
    try {
      const pointsBalance = await this.initializeUserPoints(userId);
      
      if (pointsBalance.balance < amount) {
        throw new Error('Insufficient points balance');
      }

      const balanceBefore = pointsBalance.balance;

      const transaction = new PointsTransaction({
        userId,
        type: adminId ? 'admin_deduct' : 'spent',
        activity: 'admin_manual',
        amount: -amount,
        balanceBefore,
        balanceAfter: balanceBefore - amount,
        baseAmount: -amount,
        metadata: { adminId, reason },
        description: reason || 'Points deducted',
        isReversible: !!adminId
      });

      pointsBalance.balance -= amount;
      pointsBalance.totalSpent += amount;
      pointsBalance.lastActivity = new Date();
      pointsBalance.updateTier();

      await Promise.all([
        transaction.save(),
        pointsBalance.save()
      ]);

      return {
        pointsDeducted: amount,
        newBalance: pointsBalance.balance,
        transaction: transaction._id
      };
    } catch (error) {
      console.error('Error deducting points:', error);
      throw error;
    }
  }

  // Get user's points balance and stats
  async getUserPointsInfo(userId) {
    try {
      const pointsBalance = await this.initializeUserPoints(userId);
      
      // Get recent transactions
      const recentTransactions = await PointsTransaction.find({ userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('metadata.adminId', 'username');

      // Get user achievements
      const achievements = await UserAchievement.find({ userId, isCompleted: true })
        .populate('achievementId')
        .sort({ completedAt: -1 });

      // Get user's rank
      const rank = await this.getUserRank(userId, 'points', 'all_time');

      return {
        balance: pointsBalance.balance,
        totalEarned: pointsBalance.totalEarned,
        totalSpent: pointsBalance.totalSpent,
        tier: pointsBalance.tier,
        tierProgress: pointsBalance.tierProgress,
        rank,
        recentTransactions,
        achievements: achievements.slice(0, 5), // Last 5 achievements
        lastActivity: pointsBalance.lastActivity
      };
    } catch (error) {
      console.error('Error getting user points info:', error);
      throw error;
    }
  }

  // Get points transaction history
  async getTransactionHistory(userId, page = 1, limit = 20, filters = {}) {
    try {
      const skip = (page - 1) * limit;
      const query = { userId };

      if (filters.type) query.type = filters.type;
      if (filters.activity) query.activity = filters.activity;
      if (filters.dateFrom) query.createdAt = { $gte: new Date(filters.dateFrom) };
      if (filters.dateTo) {
        query.createdAt = query.createdAt || {};
        query.createdAt.$lte = new Date(filters.dateTo);
      }

      const transactions = await PointsTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('metadata.adminId', 'username')
        .populate('metadata.raffleId', 'title')
        .populate('metadata.achievementId', 'name');

      const total = await PointsTransaction.countDocuments(query);

      return {
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error getting transaction history:', error);
      throw error;
    }
  }

  // Jackpot management
  async getJackpotInfo() {
    try {
      let jackpot = await PointsJackpot.findOne();
      
      if (!jackpot) {
        jackpot = new PointsJackpot();
        await jackpot.save();
      }

      // Check for time-based increment
      const incrementAmount = jackpot.checkTimeBasedIncrement();
      if (incrementAmount > 0) {
        await jackpot.save();
      }

      return {
        currentAmount: jackpot.currentAmount,
        lastWinner: jackpot.lastWinnerId,
        lastWinAmount: jackpot.lastWinAmount,
        lastWinDate: jackpot.lastWinDate,
        totalWinners: jackpot.totalWinners,
        totalAmountWon: jackpot.totalAmountWon,
        isActive: jackpot.isActive
      };
    } catch (error) {
      console.error('Error getting jackpot info:', error);
      throw error;
    }
  }

  async incrementJackpot(activity, pointsAwarded) {
    try {
      let jackpot = await PointsJackpot.findOne();
      
      if (!jackpot) {
        jackpot = new PointsJackpot();
      }

      let incrementAmount = 0;
      switch (activity) {
        case 'raffle_creation':
          incrementAmount = jackpot.incrementSettings.raffleCreation;
          break;
        case 'raffle_ticket_purchase':
          incrementAmount = jackpot.incrementSettings.ticketPurchase;
          break;
        case 'gaming_blackjack':
        case 'gaming_coin_toss':
        case 'gaming_rock_paper_scissors':
        case 'gaming_crypto_slots':
          incrementAmount = jackpot.incrementSettings.gamePlay;
          break;
        default:
          incrementAmount = 1; // Default increment
      }

      await jackpot.increment(incrementAmount, activity);
    } catch (error) {
      console.error('Error incrementing jackpot:', error);
    }
  }

  async checkJackpotWin(userId, userPoints) {
    try {
      const jackpot = await PointsJackpot.findOne();
      if (!jackpot || !jackpot.canUserWin(userId, userPoints)) {
        return false;
      }

      // Random chance check
      const random = Math.random();
      if (random > jackpot.winConditions.winProbability) {
        return false;
      }

      // Process jackpot win
      const winAmount = jackpot.processWin(userId);
      await jackpot.save();

      // Award jackpot points to user
      await this.awardJackpotPoints(userId, winAmount);

      return {
        won: true,
        amount: winAmount
      };
    } catch (error) {
      console.error('Error checking jackpot win:', error);
      return false;
    }
  }

  async awardJackpotPoints(userId, amount) {
    try {
      const pointsBalance = await this.initializeUserPoints(userId);
      const balanceBefore = pointsBalance.balance;

      const transaction = new PointsTransaction({
        userId,
        type: 'jackpot',
        activity: 'jackpot_win',
        amount,
        balanceBefore,
        balanceAfter: balanceBefore + amount,
        baseAmount: amount,
        description: `Jackpot win: ${amount} points!`,
        isReversible: false
      });

      pointsBalance.balance += amount;
      pointsBalance.totalEarned += amount;
      pointsBalance.lastActivity = new Date();
      pointsBalance.updateTier();

      await Promise.all([
        transaction.save(),
        pointsBalance.save()
      ]);

      return transaction;
    } catch (error) {
      console.error('Error awarding jackpot points:', error);
      throw error;
    }
  }

  // Achievement system
  async checkAchievements(userId, activity, pointsAwarded, metadata) {
    try {
      // Get all active achievements
      const achievements = await Achievement.find({ isActive: true });

      for (const achievement of achievements) {
        if (this.isActivityRelevantToAchievement(activity, achievement)) {
          await this.updateAchievementProgress(userId, achievement, pointsAwarded, metadata);
        }
      }
    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  }

  async updateAchievementProgress(userId, achievement, amount, metadata) {
    try {
      let userAchievement = await UserAchievement.findOne({
        userId,
        achievementId: achievement._id
      });

      if (!userAchievement) {
        userAchievement = new UserAchievement({
          userId,
          achievementId: achievement._id
        });
      }

      const wasCompleted = userAchievement.updateProgress(amount, achievement);
      await userAchievement.save();

      if (wasCompleted) {
        // Award achievement points
        if (achievement.rewards.points > 0) {
          await this.awardAchievementPoints(userId, achievement, userAchievement);
        }

        return {
          achievementUnlocked: true,
          achievement: achievement.name,
          pointsAwarded: achievement.rewards.points
        };
      }

      return { achievementUnlocked: false };
    } catch (error) {
      console.error('Error updating achievement progress:', error);
      return { achievementUnlocked: false };
    }
  }

  async awardAchievementPoints(userId, achievement, userAchievement) {
    try {
      const pointsBalance = await this.initializeUserPoints(userId);
      const balanceBefore = pointsBalance.balance;

      const transaction = new PointsTransaction({
        userId,
        type: 'bonus',
        activity: 'achievement_unlock',
        amount: achievement.rewards.points,
        balanceBefore,
        balanceAfter: balanceBefore + achievement.rewards.points,
        baseAmount: achievement.rewards.points,
        metadata: {
          achievementId: achievement._id,
          achievementName: achievement.name
        },
        description: `Achievement unlocked: ${achievement.name}`,
        isReversible: false
      });

      pointsBalance.balance += achievement.rewards.points;
      pointsBalance.totalEarned += achievement.rewards.points;
      pointsBalance.lastActivity = new Date();
      pointsBalance.updateTier();

      await Promise.all([
        transaction.save(),
        pointsBalance.save()
      ]);

      return transaction;
    } catch (error) {
      console.error('Error awarding achievement points:', error);
      throw error;
    }
  }

  // Leaderboard management
  async updateLeaderboards(userId, activity, pointsAwarded, metadata) {
    try {
      const periods = ['daily', 'weekly', 'monthly', 'all_time'];
      
      for (const period of periods) {
        // Update points leaderboard
        const pointsBalance = await PointsBalance.findOne({ userId });
        if (pointsBalance) {
          await LeaderboardEntry.updateUserEntry(
            userId,
            'points',
            period,
            period === 'all_time' ? pointsBalance.totalEarned : pointsAwarded,
            { pointsEarned: pointsAwarded }
          );
        }

        // Update activity-specific leaderboards
        if (activity.startsWith('gaming_')) {
          await this.updateGamingLeaderboard(userId, period, metadata);
        } else if (activity.startsWith('raffle_')) {
          await this.updateRaffleLeaderboard(userId, period, metadata);
        }
      }

      // Recalculate ranks periodically (this should be done in a background job)
      // For now, we'll do it synchronously for small datasets
      await this.recalculateRanks('points', 'all_time');
    } catch (error) {
      console.error('Error updating leaderboards:', error);
    }
  }

  async updateGamingLeaderboard(userId, period, metadata) {
    try {
      // This would need to aggregate gaming statistics
      // For now, we'll create a placeholder implementation
      const gamesPlayed = 1;
      const totalWagered = metadata.betAmount || 0;
      const totalWon = metadata.winAmount || 0;

      await LeaderboardEntry.updateUserEntry(
        userId,
        'gaming_volume',
        period,
        totalWagered,
        {
          gamesPlayed,
          totalWagered,
          totalWon,
          winRate: totalWon > 0 ? (totalWon / totalWagered) * 100 : 0
        }
      );
    } catch (error) {
      console.error('Error updating gaming leaderboard:', error);
    }
  }

  async updateRaffleLeaderboard(userId, period, metadata) {
    try {
      // This would need to aggregate raffle statistics
      const rafflesCreated = metadata.activity === 'raffle_creation' ? 1 : 0;
      const rafflesWon = metadata.won ? 1 : 0;

      if (rafflesCreated > 0) {
        await LeaderboardEntry.updateUserEntry(
          userId,
          'raffle_created',
          period,
          rafflesCreated,
          { rafflesCreated }
        );
      }

      if (rafflesWon > 0) {
        await LeaderboardEntry.updateUserEntry(
          userId,
          'raffle_wins',
          period,
          rafflesWon,
          { rafflesWon }
        );
      }
    } catch (error) {
      console.error('Error updating raffle leaderboard:', error);
    }
  }

  async getLeaderboard(category, period, limit = 100) {
    try {
      return await LeaderboardEntry.getLeaderboard(category, period, limit);
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      throw error;
    }
  }

  async getUserRank(userId, category, period) {
    try {
      const entry = await LeaderboardEntry.findOne({
        userId,
        category,
        period
      });

      return entry ? entry.rank : null;
    } catch (error) {
      console.error('Error getting user rank:', error);
      return null;
    }
  }

  async recalculateRanks(category, period) {
    try {
      const entries = await LeaderboardEntry.find({ category, period })
        .sort({ value: -1 });

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        entry.previousRank = entry.rank;
        entry.rank = i + 1;
        entry.calculateChange();
        await entry.save();
      }
    } catch (error) {
      console.error('Error recalculating ranks:', error);
    }
  }

  // Helper methods
  getActivityTypeForPartnerBonus(activity) {
    if (activity.startsWith('gaming_')) return 'gaming';
    if (activity === 'raffle_ticket_purchase') return 'raffleTickets';
    if (activity === 'raffle_creation') return 'raffleCreation';
    if (activity === 'token_staking') return 'staking';
    return 'gaming'; // Default
  }

  getActivityDescription(activity, metadata) {
    const descriptions = {
      raffle_creation: 'Created a raffle',
      raffle_ticket_purchase: 'Purchased raffle tickets',
      gaming_blackjack: 'Played Blackjack',
      gaming_coin_toss: 'Played Coin Toss',
      gaming_rock_paper_scissors: 'Played Rock Paper Scissors',
      gaming_crypto_slots: 'Played Crypto Slots',
      token_staking: 'Token staking reward',
      referral_bonus: 'Referral bonus',
      daily_login: 'Daily login bonus',
      community_task: 'Completed community task',
      achievement_unlock: `Achievement unlocked: ${metadata.achievementName}`,
      jackpot_win: 'Jackpot winner!'
    };

    return descriptions[activity] || 'Points earned';
  }

  isActivityRelevantToAchievement(activity, achievement) {
    const activityMap = {
      raffle_creation: ['raffle_creation'],
      raffle_ticket_purchase: ['ticket_purchases'],
      gaming_blackjack: ['gaming_sessions', 'gaming_wins'],
      gaming_coin_toss: ['gaming_sessions', 'gaming_wins'],
      gaming_rock_paper_scissors: ['gaming_sessions', 'gaming_wins'],
      gaming_crypto_slots: ['gaming_sessions', 'gaming_wins'],
      daily_login: ['consecutive_days'],
      referral_bonus: ['referrals'],
      community_task: ['community_participation']
    };

    const relevantActivities = activityMap[activity] || [];
    return relevantActivities.includes(achievement.requirements.activity);
  }
}

module.exports = new PointsService();