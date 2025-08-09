const StakingPosition = require('../models/staking/stakingPosition');
const StakingContract = require('../models/staking/stakingContract');
const User = require('../models/user/user');
const pointsService = require('./pointsService');
const achievementService = require('./achievementService');
const stakingRewardDistributionService = require('./stakingRewardDistributionService');

class StakingIntegrationService {
  constructor() {
    this.stakingActivityTypes = {
      STAKE_NFT: 'nft_staking',
      UNSTAKE_NFT: 'nft_unstaking',
      REWARD_DISTRIBUTION: 'staking_reward',
      STAKING_MILESTONE: 'staking_milestone'
    };
  }

  // Integrate staking with user management
  async integrateUserStaking(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get user's staking portfolio
      const portfolio = await this.getUserStakingData(userId);
      
      // Update user profile with staking data
      await this.updateUserProfileWithStaking(userId, portfolio);

      return portfolio;
    } catch (error) {
      console.error('Error integrating user staking:', error);
      throw error;
    }
  }

  // Get comprehensive user staking data
  async getUserStakingData(userId) {
    try {
      const [positions, summary, achievements, rewards] = await Promise.all([
        StakingPosition.getUserPortfolio(userId),
        this.calculateStakingSummary(userId),
        this.getStakingAchievements(userId),
        this.getStakingRewards(userId)
      ]);

      return {
        positions,
        summary,
        achievements,
        rewards,
        integrationData: {
          totalValueLocked: summary.totalValueLocked,
          stakingTier: this.calculateStakingTier(summary),
          nextMilestone: this.getNextStakingMilestone(summary),
          stakingScore: this.calculateStakingScore(summary, achievements)
        }
      };
    } catch (error) {
      console.error('Error getting user staking data:', error);
      throw error;
    }
  }

  // Calculate staking summary with integration metrics
  async calculateStakingSummary(userId) {
    try {
      const positions = await StakingPosition.find({ userId });
      
      const summary = {
        totalPositions: positions.length,
        activePositions: positions.filter(p => p.status === 'active').length,
        completedPositions: positions.filter(p => p.status === 'unstaked').length,
        totalRewardsEarned: positions.reduce((sum, p) => sum + p.totalRewardsEarned, 0),
        totalValueLocked: positions.filter(p => p.status === 'active').length,
        averageStakingDuration: 0,
        stakingHistory: {
          totalStaked: positions.length,
          longestStake: 0,
          shortestStake: Infinity,
          averageRewardsPerPosition: 0
        },
        durationBreakdown: {
          sixMonths: positions.filter(p => p.stakingDuration === 6).length,
          twelveMonths: positions.filter(p => p.stakingDuration === 12).length,
          threeYears: positions.filter(p => p.stakingDuration === 36).length
        },
        blockchainBreakdown: {}
      };

      // Calculate averages and extremes
      if (positions.length > 0) {
        const totalDuration = positions.reduce((sum, p) => sum + p.stakingDuration, 0);
        summary.averageStakingDuration = totalDuration / positions.length;
        
        const totalRewards = positions.reduce((sum, p) => sum + p.totalRewardsEarned, 0);
        summary.stakingHistory.averageRewardsPerPosition = totalRewards / positions.length;

        // Find longest and shortest stakes
        positions.forEach(position => {
          const stakeDuration = position.stakingDuration;
          if (stakeDuration > summary.stakingHistory.longestStake) {
            summary.stakingHistory.longestStake = stakeDuration;
          }
          if (stakeDuration < summary.stakingHistory.shortestStake) {
            summary.stakingHistory.shortestStake = stakeDuration;
          }
        });

        // Blockchain breakdown
        positions.forEach(position => {
          const blockchain = position.blockchain;
          if (!summary.blockchainBreakdown[blockchain]) {
            summary.blockchainBreakdown[blockchain] = 0;
          }
          summary.blockchainBreakdown[blockchain]++;
        });
      }

      if (summary.stakingHistory.shortestStake === Infinity) {
        summary.stakingHistory.shortestStake = 0;
      }

      return summary;
    } catch (error) {
      console.error('Error calculating staking summary:', error);
      throw error;
    }
  }

  // Get staking-related achievements
  async getStakingAchievements(userId) {
    try {
      const stakingAchievements = await achievementService.getUserAchievements(userId, true);
      
      return stakingAchievements.filter(achievement => 
        achievement.achievement.category === 'staking' ||
        achievement.achievement.name.toLowerCase().includes('staking') ||
        achievement.achievement.name.toLowerCase().includes('nft')
      );
    } catch (error) {
      console.error('Error getting staking achievements:', error);
      return [];
    }
  }

  // Get staking rewards data
  async getStakingRewards(userId) {
    try {
      const positions = await StakingPosition.find({ userId });
      
      const rewardsData = {
        totalRewardsEarned: 0,
        monthlyRewards: [],
        pendingRewards: 0,
        nextDistribution: null,
        rewardHistory: []
      };

      // Calculate total rewards and build history
      positions.forEach(position => {
        rewardsData.totalRewardsEarned += position.totalRewardsEarned;
        
        position.rewardHistory.forEach(reward => {
          rewardsData.rewardHistory.push({
            positionId: position._id,
            nftTokenId: position.nftTokenId,
            contractAddress: position.nftContractAddress,
            distributedAt: reward.distributedAt,
            openEntryTickets: reward.openEntryTickets,
            bonusMultiplier: reward.bonusMultiplier,
            month: reward.month,
            year: reward.year
          });
        });
      });

      // Sort reward history by date
      rewardsData.rewardHistory.sort((a, b) => b.distributedAt - a.distributedAt);

      // Calculate pending rewards
      const pendingRewards = await stakingRewardDistributionService.calculateUserPendingRewards(userId);
      rewardsData.pendingRewards = pendingRewards.totalPendingRewards;

      // Get next distribution date
      const activePositions = positions.filter(p => p.status === 'active');
      if (activePositions.length > 0) {
        const nextDates = activePositions.map(p => p.getNextRewardDate()).filter(d => d);
        if (nextDates.length > 0) {
          rewardsData.nextDistribution = new Date(Math.min(...nextDates.map(d => d.getTime())));
        }
      }

      // Group monthly rewards
      const monthlyRewardsMap = {};
      rewardsData.rewardHistory.forEach(reward => {
        const key = `${reward.year}-${reward.month.toString().padStart(2, '0')}`;
        if (!monthlyRewardsMap[key]) {
          monthlyRewardsMap[key] = {
            year: reward.year,
            month: reward.month,
            totalTickets: 0,
            distributionCount: 0
          };
        }
        monthlyRewardsMap[key].totalTickets += reward.openEntryTickets;
        monthlyRewardsMap[key].distributionCount++;
      });

      rewardsData.monthlyRewards = Object.values(monthlyRewardsMap)
        .sort((a, b) => b.year - a.year || b.month - a.month)
        .slice(0, 12); // Last 12 months

      return rewardsData;
    } catch (error) {
      console.error('Error getting staking rewards:', error);
      throw error;
    }
  }

  // Update user profile with staking data
  async updateUserProfileWithStaking(userId, stakingData) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Add staking data to user profile
      if (!user.profileData) {
        user.profileData = {};
      }

      user.profileData.staking = {
        totalPositions: stakingData.summary.totalPositions,
        activePositions: stakingData.summary.activePositions,
        totalRewardsEarned: stakingData.summary.totalRewardsEarned,
        stakingTier: stakingData.integrationData.stakingTier,
        stakingScore: stakingData.integrationData.stakingScore,
        lastUpdated: new Date()
      };

      await user.save();
      return user;
    } catch (error) {
      console.error('Error updating user profile with staking:', error);
      throw error;
    }
  }

  // Calculate staking tier based on activity
  calculateStakingTier(summary) {
    const { totalPositions, totalRewardsEarned, averageStakingDuration } = summary;
    
    let score = 0;
    
    // Position count scoring
    if (totalPositions >= 10) score += 30;
    else if (totalPositions >= 5) score += 20;
    else if (totalPositions >= 1) score += 10;
    
    // Rewards scoring
    if (totalRewardsEarned >= 1000) score += 30;
    else if (totalRewardsEarned >= 500) score += 20;
    else if (totalRewardsEarned >= 100) score += 10;
    
    // Duration scoring
    if (averageStakingDuration >= 24) score += 25;
    else if (averageStakingDuration >= 12) score += 15;
    else if (averageStakingDuration >= 6) score += 10;
    
    // Long-term commitment bonus
    if (summary.durationBreakdown.threeYears > 0) score += 15;
    
    if (score >= 80) return 'diamond';
    if (score >= 60) return 'platinum';
    if (score >= 40) return 'gold';
    if (score >= 20) return 'silver';
    return 'bronze';
  }

  // Get next staking milestone
  getNextStakingMilestone(summary) {
    const milestones = [
      { positions: 1, name: 'First Stake', reward: 'Bronze Staker Badge' },
      { positions: 5, name: 'Active Staker', reward: 'Silver Staker Badge' },
      { positions: 10, name: 'Dedicated Staker', reward: 'Gold Staker Badge' },
      { positions: 25, name: 'Staking Master', reward: 'Platinum Staker Badge' },
      { positions: 50, name: 'Staking Legend', reward: 'Diamond Staker Badge' }
    ];

    for (const milestone of milestones) {
      if (summary.totalPositions < milestone.positions) {
        return {
          ...milestone,
          progress: summary.totalPositions,
          remaining: milestone.positions - summary.totalPositions
        };
      }
    }

    return null; // All milestones achieved
  }

  // Calculate overall staking score
  calculateStakingScore(summary, achievements) {
    let score = 0;
    
    // Base score from positions and rewards
    score += summary.totalPositions * 10;
    score += summary.totalRewardsEarned * 0.1;
    score += summary.averageStakingDuration * 2;
    
    // Achievement bonus
    const stakingAchievements = achievements.filter(a => a.isCompleted);
    score += stakingAchievements.length * 50;
    
    // Long-term staking bonus
    if (summary.durationBreakdown.threeYears > 0) {
      score += summary.durationBreakdown.threeYears * 100;
    }
    
    // Multi-blockchain bonus
    const blockchainCount = Object.keys(summary.blockchainBreakdown).length;
    if (blockchainCount > 1) {
      score += blockchainCount * 25;
    }
    
    return Math.round(score);
  }

  // Award points for staking activities
  async awardStakingPoints(userId, activity, metadata = {}) {
    try {
      const pointsMap = {
        [this.stakingActivityTypes.STAKE_NFT]: 100,
        [this.stakingActivityTypes.UNSTAKE_NFT]: 50,
        [this.stakingActivityTypes.REWARD_DISTRIBUTION]: 25,
        [this.stakingActivityTypes.STAKING_MILESTONE]: 200
      };

      const basePoints = pointsMap[activity] || 0;
      if (basePoints === 0) {
        console.warn(`Unknown staking activity: ${activity}`);
        return null;
      }

      // Apply duration multiplier for staking/unstaking
      let multiplier = 1.0;
      if (metadata.stakingDuration) {
        if (metadata.stakingDuration >= 36) multiplier = 2.0;
        else if (metadata.stakingDuration >= 12) multiplier = 1.5;
        else if (metadata.stakingDuration >= 6) multiplier = 1.2;
      }

      const result = await pointsService.awardPoints(userId, activity, {
        ...metadata,
        additionalMultiplier: multiplier,
        source: 'staking_system'
      });

      return result;
    } catch (error) {
      console.error('Error awarding staking points:', error);
      throw error;
    }
  }

  // Connect staking rewards with open-entry raffle ticket system
  async processStakingRewardDistribution(userId, rewardData) {
    try {
      const { openEntryTickets, bonusMultiplier, positionId } = rewardData;
      
      // Award points for receiving rewards
      await this.awardStakingPoints(userId, this.stakingActivityTypes.REWARD_DISTRIBUTION, {
        openEntryTickets,
        bonusMultiplier,
        positionId: positionId.toString()
      });

      // TODO: Integrate with open-entry raffle ticket system
      // This would add tickets to user's open-entry balance
      // await openEntryTicketService.addTickets(userId, openEntryTickets);

      // Check for staking achievements
      await this.checkStakingAchievements(userId, rewardData);

      return {
        pointsAwarded: true,
        ticketsAdded: openEntryTickets,
        achievementsChecked: true
      };
    } catch (error) {
      console.error('Error processing staking reward distribution:', error);
      throw error;
    }
  }

  // Check and update staking-related achievements
  async checkStakingAchievements(userId, activityData) {
    try {
      const stakingData = await this.getUserStakingData(userId);
      const { summary } = stakingData;

      // Check position count achievements
      await this.checkPositionMilestones(userId, summary.totalPositions);
      
      // Check reward achievements
      await this.checkRewardMilestones(userId, summary.totalRewardsEarned);
      
      // Check duration achievements
      await this.checkDurationMilestones(userId, summary);
      
      // Check multi-blockchain achievements
      await this.checkBlockchainDiversityAchievements(userId, summary.blockchainBreakdown);

      return true;
    } catch (error) {
      console.error('Error checking staking achievements:', error);
      return false;
    }
  }

  // Check position count milestones
  async checkPositionMilestones(userId, totalPositions) {
    const milestones = [
      { count: 1, name: 'First Stake', points: 100 },
      { count: 5, name: 'Active Staker', points: 250 },
      { count: 10, name: 'Dedicated Staker', points: 500 },
      { count: 25, name: 'Staking Master', points: 1000 },
      { count: 50, name: 'Staking Legend', points: 2500 }
    ];

    for (const milestone of milestones) {
      if (totalPositions >= milestone.count) {
        await this.awardStakingPoints(userId, this.stakingActivityTypes.STAKING_MILESTONE, {
          milestone: milestone.name,
          positionCount: totalPositions
        });
      }
    }
  }

  // Check reward milestones
  async checkRewardMilestones(userId, totalRewards) {
    const milestones = [
      { rewards: 100, name: 'Reward Collector', points: 200 },
      { rewards: 500, name: 'Reward Accumulator', points: 500 },
      { rewards: 1000, name: 'Reward Master', points: 1000 },
      { rewards: 5000, name: 'Reward Legend', points: 2500 }
    ];

    for (const milestone of milestones) {
      if (totalRewards >= milestone.rewards) {
        await this.awardStakingPoints(userId, this.stakingActivityTypes.STAKING_MILESTONE, {
          milestone: milestone.name,
          totalRewards
        });
      }
    }
  }

  // Check duration-based achievements
  async checkDurationMilestones(userId, summary) {
    if (summary.durationBreakdown.threeYears > 0) {
      await this.awardStakingPoints(userId, this.stakingActivityTypes.STAKING_MILESTONE, {
        milestone: 'Long-term Commitment',
        threeYearStakes: summary.durationBreakdown.threeYears
      });
    }

    if (summary.averageStakingDuration >= 24) {
      await this.awardStakingPoints(userId, this.stakingActivityTypes.STAKING_MILESTONE, {
        milestone: 'Duration Master',
        averageDuration: summary.averageStakingDuration
      });
    }
  }

  // Check blockchain diversity achievements
  async checkBlockchainDiversityAchievements(userId, blockchainBreakdown) {
    const blockchainCount = Object.keys(blockchainBreakdown).length;
    
    if (blockchainCount >= 2) {
      await this.awardStakingPoints(userId, this.stakingActivityTypes.STAKING_MILESTONE, {
        milestone: 'Multi-chain Staker',
        blockchainCount
      });
    }

    if (blockchainCount >= 3) {
      await this.awardStakingPoints(userId, this.stakingActivityTypes.STAKING_MILESTONE, {
        milestone: 'Blockchain Explorer',
        blockchainCount
      });
    }
  }

  // Get staking leaderboard data
  async getStakingLeaderboard(category = 'total_staked', limit = 100) {
    try {
      let aggregationPipeline = [];

      switch (category) {
        case 'total_staked':
          aggregationPipeline = [
            {
              $group: {
                _id: '$userId',
                totalStaked: { $sum: 1 },
                activeStaked: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
                totalRewards: { $sum: '$totalRewardsEarned' }
              }
            },
            { $sort: { totalStaked: -1, totalRewards: -1 } }
          ];
          break;

        case 'total_rewards':
          aggregationPipeline = [
            {
              $group: {
                _id: '$userId',
                totalRewards: { $sum: '$totalRewardsEarned' },
                totalStaked: { $sum: 1 },
                averageRewards: { $avg: '$totalRewardsEarned' }
              }
            },
            { $sort: { totalRewards: -1, totalStaked: -1 } }
          ];
          break;

        case 'long_term_stakers':
          aggregationPipeline = [
            { $match: { stakingDuration: { $gte: 12 } } },
            {
              $group: {
                _id: '$userId',
                longTermStakes: { $sum: 1 },
                averageDuration: { $avg: '$stakingDuration' },
                totalRewards: { $sum: '$totalRewardsEarned' }
              }
            },
            { $sort: { longTermStakes: -1, averageDuration: -1 } }
          ];
          break;

        default:
          throw new Error(`Unknown leaderboard category: ${category}`);
      }

      // Add user lookup and limit
      aggregationPipeline.push(
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
            totalStaked: 1,
            activeStaked: 1,
            totalRewards: 1,
            longTermStakes: 1,
            averageDuration: 1,
            averageRewards: 1
          }
        },
        { $limit: limit }
      );

      const leaderboard = await StakingPosition.aggregate(aggregationPipeline);
      
      // Add rank to each entry
      leaderboard.forEach((entry, index) => {
        entry.rank = index + 1;
      });

      return leaderboard;
    } catch (error) {
      console.error('Error getting staking leaderboard:', error);
      throw error;
    }
  }

  // Get user's staking rank
  async getUserStakingRank(userId, category = 'total_staked') {
    try {
      const leaderboard = await this.getStakingLeaderboard(category, 1000);
      const userEntry = leaderboard.find(entry => entry.userId.toString() === userId.toString());
      
      return userEntry ? userEntry.rank : null;
    } catch (error) {
      console.error('Error getting user staking rank:', error);
      return null;
    }
  }

  // Integration health check
  async performIntegrationHealthCheck() {
    try {
      const healthCheck = {
        timestamp: new Date(),
        services: {},
        overall: 'healthy'
      };

      // Check staking service
      try {
        const stakingStats = await StakingPosition.countDocuments();
        healthCheck.services.staking = {
          status: 'healthy',
          totalPositions: stakingStats
        };
      } catch (error) {
        healthCheck.services.staking = {
          status: 'unhealthy',
          error: error.message
        };
        healthCheck.overall = 'degraded';
      }

      // Check points service integration
      try {
        const pointsTest = await pointsService.getUserPointsInfo('000000000000000000000000');
        healthCheck.services.points = {
          status: 'healthy',
          integration: 'connected'
        };
      } catch (error) {
        healthCheck.services.points = {
          status: 'degraded',
          error: error.message
        };
      }

      // Check achievement service integration
      try {
        const achievementsTest = await achievementService.getAllAchievements();
        healthCheck.services.achievements = {
          status: 'healthy',
          totalAchievements: achievementsTest.length
        };
      } catch (error) {
        healthCheck.services.achievements = {
          status: 'degraded',
          error: error.message
        };
      }

      return healthCheck;
    } catch (error) {
      console.error('Error performing integration health check:', error);
      return {
        timestamp: new Date(),
        overall: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = new StakingIntegrationService();