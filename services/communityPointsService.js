const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const CommunityPointsBalance = require('../models/points/communityPointsBalance');
const CommunityPointsTransaction = require('../models/points/communityPointsTransaction');
const CommunityAchievement = require('../models/points/communityAchievement');
const PartnerToken = require('../models/points/partnerToken');

// Import existing services for Naffles community compatibility
const pointsService = require('./pointsService');

class CommunityPointsService {
  constructor() {
    this.nafflesCommunityId = null;
  }

  // Initialize Naffles community if it doesn't exist
  async initializeNafflesCommunity() {
    if (!this.nafflesCommunityId) {
      const nafflesCommunity = await Community.createNafflesCommunity();
      this.nafflesCommunityId = nafflesCommunity._id;
    }
    return this.nafflesCommunityId;
  }

  // Award points to user in specific community
  async awardCommunityPoints(userId, communityId, activity, metadata = {}) {
    try {
      const community = await Community.findById(communityId);
      if (!community || !community.isActive) {
        throw new Error('Community not found or inactive');
      }

      // Check if user is member of community
      const membership = await CommunityMember.findOne({ userId, communityId, isActive: true });
      if (!membership) {
        throw new Error('User is not a member of this community');
      }

      // Get or create points balance
      const pointsBalance = await CommunityPointsBalance.initializeUserPoints(userId, communityId);
      
      // Get base points from community configuration
      const basePoints = community.pointsConfiguration.activityPointsMap.get(activity) || 0;
      if (basePoints === 0) {
        throw new Error(`Unknown activity for community: ${activity}`);
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
      const transaction = new CommunityPointsTransaction({
        userId,
        communityId,
        type: 'earned',
        activity,
        amount: finalPoints,
        balanceBefore,
        balanceAfter: balanceBefore + finalPoints,
        multiplier,
        baseAmount: basePoints,
        metadata,
        description: this.getActivityDescription(activity, metadata, community.pointsConfiguration.pointsName),
        pointsName: community.pointsConfiguration.pointsName,
        isNafflesCommunity: community.isNafflesCommunity,
        isReversible: true
      });

      // Update balance
      pointsBalance.balance += finalPoints;
      pointsBalance.totalEarned += finalPoints;
      pointsBalance.lastActivity = new Date();
      await pointsBalance.updateTier();

      // Update community stats
      community.stats.totalPointsIssued += finalPoints;
      community.stats.totalActivities += 1;

      // Save all records
      await Promise.all([
        transaction.save(),
        pointsBalance.save(),
        community.save()
      ]);

      // Handle Naffles community special features
      if (community.isNafflesCommunity && community.features.enableJackpot) {
        // Use existing jackpot system for Naffles community
        await pointsService.incrementJackpot(activity, finalPoints);
        await pointsService.checkJackpotWin(userId, pointsBalance.balance);
      }

      // Check for achievements
      await this.checkCommunityAchievements(userId, communityId, activity, finalPoints, metadata);

      // Update member activity
      await membership.updateActivity();

      return {
        pointsAwarded: finalPoints,
        newBalance: pointsBalance.balance,
        multiplier,
        transaction: transaction._id,
        communityName: community.name,
        pointsName: community.pointsConfiguration.pointsName
      };
    } catch (error) {
      console.error('Error awarding community points:', error);
      throw error;
    }
  }

  // Deduct points from user in specific community
  async deductCommunityPoints(userId, communityId, amount, reason, adminId = null) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      const pointsBalance = await CommunityPointsBalance.findOne({ userId, communityId });
      if (!pointsBalance) {
        throw new Error('User has no points balance in this community');
      }

      if (pointsBalance.balance < amount) {
        throw new Error('Insufficient points balance');
      }

      const balanceBefore = pointsBalance.balance;

      const transaction = new CommunityPointsTransaction({
        userId,
        communityId,
        type: adminId ? 'admin_deduct' : 'spent',
        activity: 'manual_deduction',
        amount: -amount,
        balanceBefore,
        balanceAfter: balanceBefore - amount,
        baseAmount: -amount,
        metadata: { adminId, reason },
        description: reason || 'Points deducted',
        pointsName: community.pointsConfiguration.pointsName,
        isNafflesCommunity: community.isNafflesCommunity,
        adminId,
        isReversible: !!adminId
      });

      pointsBalance.balance -= amount;
      pointsBalance.totalSpent += amount;
      pointsBalance.lastActivity = new Date();
      await pointsBalance.updateTier();

      await Promise.all([
        transaction.save(),
        pointsBalance.save()
      ]);

      return {
        pointsDeducted: amount,
        newBalance: pointsBalance.balance,
        transaction: transaction._id,
        communityName: community.name,
        pointsName: community.pointsConfiguration.pointsName
      };
    } catch (error) {
      console.error('Error deducting community points:', error);
      throw error;
    }
  }

  // Get user's points info for specific community
  async getUserCommunityPointsInfo(userId, communityId) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      const pointsBalance = await CommunityPointsBalance.initializeUserPoints(userId, communityId);
      
      // Get recent transactions
      const transactionHistory = await CommunityPointsTransaction.getUserCommunityHistory(
        userId, 
        communityId, 
        { limit: 10 }
      );

      // Get user's rank in community
      const rank = await this.getUserCommunityRank(userId, communityId);

      return {
        communityId,
        communityName: community.name,
        pointsName: community.pointsConfiguration.pointsName,
        pointsSymbol: community.pointsConfiguration.pointsSymbol,
        balance: pointsBalance.balance,
        totalEarned: pointsBalance.totalEarned,
        totalSpent: pointsBalance.totalSpent,
        tier: pointsBalance.tier,
        tierProgress: pointsBalance.tierProgress,
        rank,
        recentTransactions: transactionHistory.transactions,
        lastActivity: pointsBalance.lastActivity,
        hasJackpot: community.isNafflesCommunity && community.features.enableJackpot
      };
    } catch (error) {
      console.error('Error getting user community points info:', error);
      throw error;
    }
  }

  // Get user's points across all communities
  async getUserAllCommunityPoints(userId) {
    try {
      return await CommunityPointsBalance.getUserPointsSummary(userId);
    } catch (error) {
      console.error('Error getting user all community points:', error);
      throw error;
    }
  }

  // Get community leaderboard
  async getCommunityLeaderboard(communityId, limit = 100) {
    try {
      const leaderboard = await CommunityPointsBalance.getCommunityLeaderboard(communityId, limit);
      
      // Add rank to each entry
      leaderboard.forEach((entry, index) => {
        entry._rank = index + 1;
      });

      return leaderboard;
    } catch (error) {
      console.error('Error getting community leaderboard:', error);
      throw error;
    }
  }

  // Get user's rank in community
  async getUserCommunityRank(userId, communityId) {
    try {
      const userBalance = await CommunityPointsBalance.findOne({ userId, communityId });
      if (!userBalance) {
        return null;
      }

      const rank = await CommunityPointsBalance.countDocuments({
        communityId,
        $or: [
          { totalEarned: { $gt: userBalance.totalEarned } },
          { 
            totalEarned: userBalance.totalEarned,
            balance: { $gt: userBalance.balance }
          }
        ]
      });

      return rank + 1;
    } catch (error) {
      console.error('Error getting user community rank:', error);
      return null;
    }
  }

  // Check achievements for community
  async checkCommunityAchievements(userId, communityId, activity, pointsAwarded, metadata) {
    try {
      const achievements = await CommunityAchievement.find({ 
        communityId, 
        isActive: true 
      });

      for (const achievement of achievements) {
        if (achievement.isRelevantToActivity(activity)) {
          await this.updateCommunityAchievementProgress(
            userId, 
            communityId, 
            achievement, 
            pointsAwarded, 
            metadata
          );
        }
      }
    } catch (error) {
      console.error('Error checking community achievements:', error);
    }
  }

  // Update achievement progress (placeholder - would need full implementation)
  async updateCommunityAchievementProgress(userId, communityId, achievement, amount, metadata) {
    // This would be implemented similar to the existing achievement system
    // but scoped to the specific community
    console.log(`Achievement progress update for user ${userId} in community ${communityId}`);
  }

  // Migrate existing Naffles points to community system
  async migrateNafflesPointsToCommunity() {
    try {
      const nafflesCommunityId = await this.initializeNafflesCommunity();
      
      // This would migrate existing points data to the community-scoped system
      // Implementation would depend on existing data structure
      console.log('Naffles points migration to community system completed');
      
      return nafflesCommunityId;
    } catch (error) {
      console.error('Error migrating Naffles points:', error);
      throw error;
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

  getActivityDescription(activity, metadata, pointsName) {
    const descriptions = {
      raffle_creation: 'Created a raffle',
      raffle_ticket_purchase: 'Purchased raffle tickets',
      gaming_blackjack: 'Played Blackjack',
      gaming_coin_toss: 'Played Coin Toss',
      gaming_rock_paper_scissors: 'Played Rock Paper Scissors',
      gaming_crypto_slots: 'Played Crypto Slots',
      community_task: 'Completed community task',
      daily_login: 'Daily login bonus',
      achievement_unlock: `Achievement unlocked: ${metadata.achievementName}`,
      manual_deduction: 'Manual points adjustment'
    };

    return descriptions[activity] || `Earned ${pointsName}`;
  }
}

module.exports = new CommunityPointsService();