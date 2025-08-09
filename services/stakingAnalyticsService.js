const StakingContract = require('../models/staking/stakingContract');
const StakingPosition = require('../models/staking/stakingPosition');
const StakingRewardHistory = require('../models/staking/stakingRewardHistory');
const User = require('../models/user/user');
const mongoose = require('mongoose');

class StakingAnalyticsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get comprehensive dashboard metrics for admin overview
   */
  async getDashboardMetrics(timeRange = 30) {
    const cacheKey = `dashboard-${timeRange}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange);

      const [
        totalContracts,
        activeContracts,
        totalPositions,
        activePositions,
        totalUsers,
        activeUsers,
        recentStakes,
        totalRewardsDistributed,
        recentRewards,
        contractBreakdown,
        durationBreakdown,
        blockchainBreakdown
      ] = await Promise.all([
        StakingContract.countDocuments(),
        StakingContract.countDocuments({ isActive: true, 'contractValidation.isValidated': true }),
        StakingPosition.countDocuments(),
        StakingPosition.countDocuments({ status: 'active' }),
        StakingPosition.distinct('userId').then(users => users.length),
        StakingPosition.distinct('userId', { status: 'active' }).then(users => users.length),
        StakingPosition.countDocuments({ stakedAt: { $gte: startDate } }),
        StakingRewardHistory.aggregate([
          { $group: { _id: null, total: { $sum: '$openEntryTickets' } } }
        ]).then(result => result[0]?.total || 0),
        StakingRewardHistory.countDocuments({ distributionDate: { $gte: startDate } }),
        this.getContractBreakdown(),
        this.getDurationBreakdown(),
        this.getBlockchainBreakdown()
      ]);

      const metrics = {
        overview: {
          totalContracts,
          activeContracts,
          totalPositions,
          activePositions,
          totalUsers,
          activeUsers,
          recentStakes,
          totalRewardsDistributed,
          recentRewards
        },
        breakdown: {
          contracts: contractBreakdown,
          durations: durationBreakdown,
          blockchains: blockchainBreakdown
        },
        performance: {
          averageStakingDuration: await this.getAverageStakingDuration(),
          rewardDistributionRate: await this.getRewardDistributionRate(timeRange),
          userRetentionRate: await this.getUserRetentionRate(timeRange),
          contractUtilization: await this.getContractUtilization()
        },
        trends: {
          stakingTrend: await this.getStakingTrend(timeRange),
          rewardTrend: await this.getRewardTrend(timeRange),
          userGrowthTrend: await this.getUserGrowthTrend(timeRange)
        }
      };

      this.setCache(cacheKey, metrics);
      return metrics;
    } catch (error) {
      throw new Error(`Failed to get dashboard metrics: ${error.message}`);
    }
  }

  /**
   * Get detailed contract performance analytics
   */
  async getContractPerformance(contractId = null, timeRange = 30) {
    const cacheKey = `contract-performance-${contractId || 'all'}-${timeRange}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange);

      const contractQuery = contractId ? { _id: contractId } : {};
      const contracts = await StakingContract.find(contractQuery);

      const performanceData = [];

      for (const contract of contracts) {
        const [
          totalStaked,
          activeStaked,
          totalRewards,
          uniqueUsers,
          averageDuration,
          recentActivity,
          monthlyDistribution
        ] = await Promise.all([
          StakingPosition.countDocuments({ stakingContractId: contract._id }),
          StakingPosition.countDocuments({ stakingContractId: contract._id, status: 'active' }),
          StakingRewardHistory.aggregate([
            { $match: { stakingContractId: contract._id } },
            { $group: { _id: null, total: { $sum: '$openEntryTickets' } } }
          ]).then(result => result[0]?.total || 0),
          StakingPosition.distinct('userId', { stakingContractId: contract._id }).then(users => users.length),
          StakingPosition.aggregate([
            { $match: { stakingContractId: contract._id } },
            { $group: { _id: null, avg: { $avg: '$stakingDuration' } } }
          ]).then(result => result[0]?.avg || 0),
          StakingPosition.countDocuments({ 
            stakingContractId: contract._id, 
            stakedAt: { $gte: startDate } 
          }),
          this.getMonthlyDistributionData(contract._id, 6) // Last 6 months
        ]);

        const durationBreakdown = await StakingPosition.aggregate([
          { $match: { stakingContractId: contract._id } },
          { $group: { _id: '$stakingDuration', count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]);

        const rewardEfficiency = totalStaked > 0 ? (totalRewards / totalStaked) : 0;
        const utilizationRate = activeStaked / Math.max(totalStaked, 1);

        performanceData.push({
          contract: {
            id: contract._id,
            name: contract.contractName,
            address: contract.contractAddress,
            blockchain: contract.blockchain,
            isActive: contract.isActive,
            isValidated: contract.contractValidation.isValidated
          },
          metrics: {
            totalStaked,
            activeStaked,
            totalRewards,
            uniqueUsers,
            averageDuration: Math.round(averageDuration * 100) / 100,
            recentActivity,
            rewardEfficiency: Math.round(rewardEfficiency * 100) / 100,
            utilizationRate: Math.round(utilizationRate * 100) / 100
          },
          breakdown: {
            durations: durationBreakdown,
            monthlyDistribution
          },
          rewardStructures: contract.rewardStructures
        });
      }

      const result = {
        contracts: performanceData,
        summary: {
          totalContracts: contracts.length,
          averageUtilization: performanceData.reduce((sum, c) => sum + c.metrics.utilizationRate, 0) / contracts.length,
          totalRewardsDistributed: performanceData.reduce((sum, c) => sum + c.metrics.totalRewards, 0),
          totalActivePositions: performanceData.reduce((sum, c) => sum + c.metrics.activeStaked, 0)
        }
      };

      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      throw new Error(`Failed to get contract performance: ${error.message}`);
    }
  }

  /**
   * Get user behavior analysis and insights
   */
  async getUserBehaviorAnalysis(timeRange = 90) {
    const cacheKey = `user-behavior-${timeRange}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange);

      const [
        userSegmentation,
        stakingPatterns,
        rewardClaiming,
        durationPreferences,
        blockchainPreferences,
        userLifecycle
      ] = await Promise.all([
        this.getUserSegmentation(),
        this.getStakingPatterns(timeRange),
        this.getRewardClaimingBehavior(timeRange),
        this.getDurationPreferences(),
        this.getBlockchainPreferences(),
        this.getUserLifecycleAnalysis(timeRange)
      ]);

      const analysis = {
        segmentation: userSegmentation,
        patterns: stakingPatterns,
        rewardBehavior: rewardClaiming,
        preferences: {
          durations: durationPreferences,
          blockchains: blockchainPreferences
        },
        lifecycle: userLifecycle,
        insights: await this.generateUserInsights(userSegmentation, stakingPatterns, rewardClaiming)
      };

      this.setCache(cacheKey, analysis);
      return analysis;
    } catch (error) {
      throw new Error(`Failed to get user behavior analysis: ${error.message}`);
    }
  }

  /**
   * Get reward distribution analytics
   */
  async getRewardDistributionAnalytics(timeRange = 30) {
    const cacheKey = `reward-distribution-${timeRange}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange);

      const [
        distributionSummary,
        monthlyTrends,
        contractDistribution,
        durationDistribution,
        successRates,
        userParticipation
      ] = await Promise.all([
        this.getDistributionSummary(startDate),
        this.getMonthlyDistributionTrends(6), // Last 6 months
        this.getContractDistributionBreakdown(startDate),
        this.getDurationDistributionBreakdown(startDate),
        this.getDistributionSuccessRates(startDate),
        this.getUserParticipationMetrics(startDate)
      ]);

      const analytics = {
        summary: distributionSummary,
        trends: monthlyTrends,
        breakdown: {
          byContract: contractDistribution,
          byDuration: durationDistribution
        },
        performance: {
          successRates,
          userParticipation
        },
        projections: await this.getRewardProjections()
      };

      this.setCache(cacheKey, analytics);
      return analytics;
    } catch (error) {
      throw new Error(`Failed to get reward distribution analytics: ${error.message}`);
    }
  }

  /**
   * Generate comprehensive staking report
   */
  async generateStakingReport(options = {}) {
    const {
      timeRange = 30,
      includeUserData = false,
      includeContractDetails = true,
      format = 'json'
    } = options;

    try {
      const [
        dashboardMetrics,
        contractPerformance,
        userBehavior,
        rewardAnalytics
      ] = await Promise.all([
        this.getDashboardMetrics(timeRange),
        this.getContractPerformance(null, timeRange),
        includeUserData ? this.getUserBehaviorAnalysis(timeRange) : null,
        this.getRewardDistributionAnalytics(timeRange)
      ]);

      const report = {
        metadata: {
          generatedAt: new Date(),
          timeRange,
          reportType: 'comprehensive_staking_report',
          version: '1.0'
        },
        executive_summary: {
          totalValue: dashboardMetrics.overview.totalPositions,
          activeStaking: dashboardMetrics.overview.activePositions,
          rewardsDistributed: dashboardMetrics.overview.totalRewardsDistributed,
          userEngagement: dashboardMetrics.overview.activeUsers,
          keyInsights: await this.generateExecutiveInsights(dashboardMetrics, contractPerformance)
        },
        dashboard_metrics: dashboardMetrics,
        contract_performance: includeContractDetails ? contractPerformance : contractPerformance.summary,
        user_behavior: userBehavior,
        reward_analytics: rewardAnalytics,
        recommendations: await this.generateRecommendations(dashboardMetrics, contractPerformance, rewardAnalytics)
      };

      if (format === 'csv') {
        return this.convertReportToCSV(report);
      }

      return report;
    } catch (error) {
      throw new Error(`Failed to generate staking report: ${error.message}`);
    }
  }

  /**
   * Get real-time analytics for live dashboard
   */
  async getRealTimeAnalytics() {
    try {
      const [
        activePositions,
        recentStakes,
        pendingRewards,
        recentDistributions,
        systemHealth
      ] = await Promise.all([
        StakingPosition.countDocuments({ status: 'active' }),
        StakingPosition.countDocuments({ 
          stakedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
        }),
        this.getTotalPendingRewards(),
        StakingRewardHistory.countDocuments({ 
          distributionDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
        }),
        this.getSystemHealthMetrics()
      ]);

      return {
        timestamp: new Date(),
        metrics: {
          activePositions,
          recentStakes,
          pendingRewards,
          recentDistributions
        },
        health: systemHealth,
        alerts: await this.getSystemAlerts()
      };
    } catch (error) {
      throw new Error(`Failed to get real-time analytics: ${error.message}`);
    }
  }

  // Helper methods for data aggregation

  async getContractBreakdown() {
    return await StakingContract.aggregate([
      {
        $lookup: {
          from: 'stakingpositions',
          localField: '_id',
          foreignField: 'stakingContractId',
          as: 'positions'
        }
      },
      {
        $project: {
          contractName: 1,
          blockchain: 1,
          isActive: 1,
          totalPositions: { $size: '$positions' },
          activePositions: {
            $size: {
              $filter: {
                input: '$positions',
                cond: { $eq: ['$$this.status', 'active'] }
              }
            }
          }
        }
      },
      { $sort: { totalPositions: -1 } }
    ]);
  }

  async getDurationBreakdown() {
    return await StakingPosition.aggregate([
      { $group: { _id: '$stakingDuration', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
  }

  async getBlockchainBreakdown() {
    return await StakingPosition.aggregate([
      { $group: { _id: '$blockchain', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
  }

  async getAverageStakingDuration() {
    const result = await StakingPosition.aggregate([
      { $group: { _id: null, avg: { $avg: '$stakingDuration' } } }
    ]);
    return result[0]?.avg || 0;
  }

  async getRewardDistributionRate(timeRange) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRange);

    const [totalEligible, totalDistributed] = await Promise.all([
      StakingPosition.countDocuments({ 
        status: 'active',
        stakedAt: { $lt: startDate }
      }),
      StakingRewardHistory.countDocuments({ 
        distributionDate: { $gte: startDate } 
      })
    ]);

    return totalEligible > 0 ? (totalDistributed / totalEligible) : 0;
  }

  async getUserRetentionRate(timeRange) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRange);

    const [totalUsers, activeUsers] = await Promise.all([
      StakingPosition.distinct('userId', { stakedAt: { $lt: startDate } }).then(users => users.length),
      StakingPosition.distinct('userId', { status: 'active' }).then(users => users.length)
    ]);

    return totalUsers > 0 ? (activeUsers / totalUsers) : 0;
  }

  async getContractUtilization() {
    const contracts = await StakingContract.find({ isActive: true });
    const utilization = [];

    for (const contract of contracts) {
      const [total, active] = await Promise.all([
        StakingPosition.countDocuments({ stakingContractId: contract._id }),
        StakingPosition.countDocuments({ stakingContractId: contract._id, status: 'active' })
      ]);

      utilization.push({
        contractId: contract._id,
        contractName: contract.contractName,
        utilization: total > 0 ? (active / total) : 0
      });
    }

    return utilization;
  }

  async getStakingTrend(timeRange) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRange);

    const dailyData = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const nextDate = new Date(currentDate);
      nextDate.setDate(nextDate.getDate() + 1);

      const count = await StakingPosition.countDocuments({
        stakedAt: {
          $gte: currentDate,
          $lt: nextDate
        }
      });

      dailyData.push({
        date: new Date(currentDate),
        count
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dailyData;
  }

  async getRewardTrend(timeRange) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRange);

    return await StakingRewardHistory.aggregate([
      {
        $match: {
          distributionDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$distributionDate' },
            month: { $month: '$distributionDate' },
            day: { $dayOfMonth: '$distributionDate' }
          },
          totalTickets: { $sum: '$openEntryTickets' },
          totalDistributions: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);
  }

  async getUserGrowthTrend(timeRange) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRange);

    return await StakingPosition.aggregate([
      {
        $match: {
          stakedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$stakedAt' },
            month: { $month: '$stakedAt' },
            day: { $dayOfMonth: '$stakedAt' }
          },
          newUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          _id: 1,
          newUserCount: { $size: '$newUsers' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);
  }

  // Additional helper methods would continue here...
  // (getUserSegmentation, getStakingPatterns, etc.)

  // Cache management
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = new StakingAnalyticsService();