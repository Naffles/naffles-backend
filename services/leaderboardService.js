const LeaderboardEntry = require('../models/points/leaderboard');
const PointsBalance = require('../models/points/pointsBalance');
const PointsTransaction = require('../models/points/pointsTransaction');

class LeaderboardService {
  constructor() {
    this.categories = {
      points: 'Points',
      gaming_wins: 'Gaming Wins',
      gaming_volume: 'Gaming Volume',
      raffle_wins: 'Raffle Wins',
      raffle_created: 'Raffles Created',
      referrals: 'Referrals'
    };

    this.periods = {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      all_time: 'All Time'
    };
  }

  // Get leaderboard for specific category and period
  async getLeaderboard(category, period, limit = 100, offset = 0) {
    try {
      if (!this.categories[category]) {
        throw new Error(`Invalid category: ${category}`);
      }

      if (!this.periods[period]) {
        throw new Error(`Invalid period: ${period}`);
      }

      const { periodStart, periodEnd } = this.getPeriodDates(period);

      const leaderboard = await LeaderboardEntry.find({
        category,
        period,
        periodStart: { $lte: periodStart },
        periodEnd: { $gte: periodEnd }
      })
      .populate('userId', 'username walletAddresses profileData')
      .sort({ rank: 1 })
      .skip(offset)
      .limit(limit);

      const total = await LeaderboardEntry.countDocuments({
        category,
        period,
        periodStart: { $lte: periodStart },
        periodEnd: { $gte: periodEnd }
      });

      return {
        category: this.categories[category],
        period: this.periods[period],
        entries: leaderboard.map(entry => ({
          rank: entry.rank,
          previousRank: entry.previousRank,
          change: entry.change,
          user: {
            id: entry.userId._id,
            username: entry.username,
            walletAddress: entry.walletAddress,
            profileData: entry.userId.profileData
          },
          value: entry.value,
          metadata: entry.metadata,
          updatedAt: entry.updatedAt
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      };
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      throw error;
    }
  }

  // Get user's position in leaderboard
  async getUserPosition(userId, category, period) {
    try {
      const { periodStart, periodEnd } = this.getPeriodDates(period);

      const entry = await LeaderboardEntry.findOne({
        userId,
        category,
        period,
        periodStart: { $lte: periodStart },
        periodEnd: { $gte: periodEnd }
      });

      if (!entry) {
        return null;
      }

      // Get users around this position
      const surroundingEntries = await LeaderboardEntry.find({
        category,
        period,
        periodStart: { $lte: periodStart },
        periodEnd: { $gte: periodEnd },
        rank: {
          $gte: Math.max(1, entry.rank - 2),
          $lte: entry.rank + 2
        }
      })
      .populate('userId', 'username walletAddresses')
      .sort({ rank: 1 });

      return {
        userEntry: {
          rank: entry.rank,
          previousRank: entry.previousRank,
          change: entry.change,
          value: entry.value,
          metadata: entry.metadata
        },
        surrounding: surroundingEntries.map(e => ({
          rank: e.rank,
          username: e.username,
          value: e.value,
          isCurrentUser: e.userId._id.toString() === userId.toString()
        }))
      };
    } catch (error) {
      console.error('Error getting user position:', error);
      throw error;
    }
  }

  // Update user's leaderboard entry
  async updateUserEntry(userId, category, period, value, metadata = {}) {
    try {
      const { periodStart, periodEnd } = this.getPeriodDates(period);

      // Find or create entry
      let entry = await LeaderboardEntry.findOne({
        userId,
        category,
        period,
        periodStart: { $lte: periodStart },
        periodEnd: { $gte: periodEnd }
      });

      if (!entry) {
        // Get user info
        const User = require('../models/user/user'); // Assuming user model exists
        const user = await User.findById(userId);
        
        if (!user) {
          throw new Error('User not found');
        }

        entry = new LeaderboardEntry({
          userId,
          username: user.username || user.walletAddresses[0].substring(0, 8),
          walletAddress: user.walletAddresses[0],
          category,
          period,
          value: 0,
          rank: 999999, // Will be recalculated
          periodStart,
          periodEnd,
          metadata: {}
        });
      }

      // Update value and metadata
      if (period === 'all_time') {
        entry.value = value; // Absolute value for all-time
      } else {
        entry.value += value; // Increment for time periods
      }
      
      entry.metadata = { ...entry.metadata, ...metadata };
      entry.updatedAt = new Date();

      await entry.save();
      return entry;
    } catch (error) {
      console.error('Error updating user entry:', error);
      throw error;
    }
  }

  // Recalculate ranks for a category and period
  async recalculateRanks(category, period) {
    try {
      const { periodStart, periodEnd } = this.getPeriodDates(period);

      const entries = await LeaderboardEntry.find({
        category,
        period,
        periodStart: { $lte: periodStart },
        periodEnd: { $gte: periodEnd }
      }).sort({ value: -1 });

      // Update ranks in batches to avoid memory issues
      const batchSize = 100;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        const updates = batch.map((entry, index) => ({
          updateOne: {
            filter: { _id: entry._id },
            update: {
              $set: {
                previousRank: entry.rank,
                rank: i + index + 1
              }
            }
          }
        }));

        await LeaderboardEntry.bulkWrite(updates);
      }

      // Calculate changes
      await this.calculateRankChanges(category, period);

      console.log(`Recalculated ranks for ${category} ${period}: ${entries.length} entries`);
    } catch (error) {
      console.error('Error recalculating ranks:', error);
      throw error;
    }
  }

  // Calculate rank changes
  async calculateRankChanges(category, period) {
    try {
      const { periodStart, periodEnd } = this.getPeriodDates(period);

      const entries = await LeaderboardEntry.find({
        category,
        period,
        periodStart: { $lte: periodStart },
        periodEnd: { $gte: periodEnd }
      });

      const updates = entries.map(entry => {
        let change = 'same';
        if (entry.previousRank === null || entry.previousRank === undefined) {
          change = 'new';
        } else if (entry.rank < entry.previousRank) {
          change = 'up';
        } else if (entry.rank > entry.previousRank) {
          change = 'down';
        }

        return {
          updateOne: {
            filter: { _id: entry._id },
            update: { $set: { change } }
          }
        };
      });

      if (updates.length > 0) {
        await LeaderboardEntry.bulkWrite(updates);
      }
    } catch (error) {
      console.error('Error calculating rank changes:', error);
      throw error;
    }
  }

  // Rebuild leaderboards from scratch
  async rebuildLeaderboards() {
    try {
      console.log('Starting leaderboard rebuild...');

      // Clear existing leaderboard entries
      await LeaderboardEntry.deleteMany({});

      // Rebuild points leaderboards
      await this.rebuildPointsLeaderboards();

      // Rebuild gaming leaderboards
      await this.rebuildGamingLeaderboards();

      // Rebuild raffle leaderboards
      await this.rebuildRaffleLeaderboards();

      console.log('Leaderboard rebuild completed');
    } catch (error) {
      console.error('Error rebuilding leaderboards:', error);
      throw error;
    }
  }

  // Rebuild points leaderboards
  async rebuildPointsLeaderboards() {
    try {
      const periods = ['daily', 'weekly', 'monthly', 'all_time'];

      for (const period of periods) {
        const { periodStart, periodEnd } = this.getPeriodDates(period);

        let aggregationPipeline;
        
        if (period === 'all_time') {
          // Use total earned from points balance
          const pointsBalances = await PointsBalance.find({})
            .populate('userId', 'username walletAddresses')
            .sort({ totalEarned: -1 });

          for (let i = 0; i < pointsBalances.length; i++) {
            const balance = pointsBalances[i];
            if (balance.userId) {
              await this.createLeaderboardEntry(
                balance.userId._id,
                balance.userId.username || balance.userId.walletAddresses[0].substring(0, 8),
                balance.userId.walletAddresses[0],
                'points',
                period,
                balance.totalEarned,
                i + 1,
                periodStart,
                periodEnd,
                { pointsEarned: balance.totalEarned }
              );
            }
          }
        } else {
          // Aggregate points from transactions for time periods
          aggregationPipeline = [
            {
              $match: {
                type: 'earned',
                createdAt: { $gte: periodStart, $lte: periodEnd }
              }
            },
            {
              $group: {
                _id: '$userId',
                totalPoints: { $sum: '$amount' },
                transactionCount: { $sum: 1 }
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
            { $sort: { totalPoints: -1 } }
          ];

          const results = await PointsTransaction.aggregate(aggregationPipeline);

          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            await this.createLeaderboardEntry(
              result._id,
              result.user.username || result.user.walletAddresses[0].substring(0, 8),
              result.user.walletAddresses[0],
              'points',
              period,
              result.totalPoints,
              i + 1,
              periodStart,
              periodEnd,
              { pointsEarned: result.totalPoints, transactionCount: result.transactionCount }
            );
          }
        }
      }

      console.log('Points leaderboards rebuilt');
    } catch (error) {
      console.error('Error rebuilding points leaderboards:', error);
      throw error;
    }
  }

  // Rebuild gaming leaderboards (placeholder - would need actual gaming data)
  async rebuildGamingLeaderboards() {
    try {
      // This would need to aggregate from actual gaming session data
      // For now, we'll create placeholder implementation
      console.log('Gaming leaderboards rebuild - placeholder');
    } catch (error) {
      console.error('Error rebuilding gaming leaderboards:', error);
      throw error;
    }
  }

  // Rebuild raffle leaderboards (placeholder - would need actual raffle data)
  async rebuildRaffleLeaderboards() {
    try {
      // This would need to aggregate from actual raffle data
      // For now, we'll create placeholder implementation
      console.log('Raffle leaderboards rebuild - placeholder');
    } catch (error) {
      console.error('Error rebuilding raffle leaderboards:', error);
      throw error;
    }
  }

  // Helper method to create leaderboard entry
  async createLeaderboardEntry(userId, username, walletAddress, category, period, value, rank, periodStart, periodEnd, metadata) {
    try {
      const entry = new LeaderboardEntry({
        userId,
        username,
        walletAddress,
        category,
        period,
        value,
        rank,
        periodStart,
        periodEnd,
        metadata,
        change: 'new'
      });

      await entry.save();
      return entry;
    } catch (error) {
      console.error('Error creating leaderboard entry:', error);
      throw error;
    }
  }

  // Get period dates
  getPeriodDates(period) {
    const now = new Date();
    let periodStart, periodEnd;

    switch (period) {
      case 'daily':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        const dayOfWeek = now.getDay();
        periodStart = new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'all_time':
        periodStart = new Date(0);
        periodEnd = new Date('2099-12-31');
        break;
      default:
        throw new Error(`Invalid period: ${period}`);
    }

    return { periodStart, periodEnd };
  }

  // Get available categories and periods
  getAvailableOptions() {
    return {
      categories: this.categories,
      periods: this.periods
    };
  }

  // Get leaderboard statistics
  async getLeaderboardStats() {
    try {
      const stats = await LeaderboardEntry.aggregate([
        {
          $group: {
            _id: { category: '$category', period: '$period' },
            entryCount: { $sum: 1 },
            lastUpdated: { $max: '$updatedAt' }
          }
        },
        {
          $group: {
            _id: null,
            totalEntries: { $sum: '$entryCount' },
            leaderboards: {
              $push: {
                category: '$_id.category',
                period: '$_id.period',
                entryCount: '$entryCount',
                lastUpdated: '$lastUpdated'
              }
            }
          }
        }
      ]);

      return stats[0] || { totalEntries: 0, leaderboards: [] };
    } catch (error) {
      console.error('Error getting leaderboard stats:', error);
      throw error;
    }
  }
}

module.exports = new LeaderboardService();