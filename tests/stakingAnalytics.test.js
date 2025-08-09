const mongoose = require('mongoose');
const StakingAnalyticsService = require('../services/stakingAnalyticsService');
const StakingContract = require('../models/staking/stakingContract');
const StakingPosition = require('../models/staking/stakingPosition');
const StakingRewardHistory = require('../models/staking/stakingRewardHistory');
const User = require('../models/user/user');
const testEnvironment = require('./testEnvironment');

describe('Staking Analytics Service', () => {
  let testUsers = [];
  let testContracts = [];
  let testPositions = [];
  let testRewardHistory = [];

  beforeAll(async () => {
    await testEnvironment.setup();
  });

  afterAll(async () => {
    await testEnvironment.cleanup();
  });

  beforeEach(async () => {
    await testEnvironment.reset();
    await createTestData();
  });

  async function createTestData() {
    // Create test users
    for (let i = 0; i < 5; i++) {
      const user = new User({
        email: `testuser${i}@example.com`,
        username: `testuser${i}`,
        walletAddresses: [`0x${i.toString().padStart(40, '0')}`],
        isVerified: true
      });
      await user.save();
      testUsers.push(user);
    }

    // Create test contracts
    for (let i = 0; i < 3; i++) {
      const contract = new StakingContract({
        contractAddress: `0x${(i + 100).toString().padStart(40, '0')}`,
        blockchain: ['ethereum', 'polygon', 'solana'][i],
        contractName: `Test Collection ${i + 1}`,
        description: `Test collection ${i + 1} for analytics`,
        isActive: true,
        rewardStructures: {
          sixMonths: {
            openEntryTicketsPerMonth: 5 + i,
            bonusMultiplier: 1.1 + (i * 0.1)
          },
          twelveMonths: {
            openEntryTicketsPerMonth: 10 + (i * 2),
            bonusMultiplier: 1.25 + (i * 0.1)
          },
          threeYears: {
            openEntryTicketsPerMonth: 25 + (i * 5),
            bonusMultiplier: 1.5 + (i * 0.1)
          }
        },
        contractValidation: {
          isValidated: true,
          validatedAt: new Date(),
          validatedBy: testUsers[0]._id
        },
        createdBy: testUsers[0]._id
      });
      await contract.save();
      testContracts.push(contract);
    }

    // Create test positions
    const durations = [6, 12, 36];
    for (let i = 0; i < 15; i++) {
      const userIndex = i % testUsers.length;
      const contractIndex = i % testContracts.length;
      const durationIndex = i % durations.length;
      
      const position = new StakingPosition({
        userId: testUsers[userIndex]._id,
        stakingContractId: testContracts[contractIndex]._id,
        nftTokenId: (i + 1).toString(),
        nftContractAddress: testContracts[contractIndex].contractAddress,
        blockchain: testContracts[contractIndex].blockchain,
        stakingDuration: durations[durationIndex],
        stakedAt: new Date(Date.now() - (i * 7 * 24 * 60 * 60 * 1000)), // Staggered over weeks
        walletAddress: testUsers[userIndex].walletAddresses[0],
        lockingHash: `test-hash-${i}`,
        status: i < 12 ? 'active' : 'unstaked' // Most are active
      });
      await position.save();
      testPositions.push(position);
    }

    // Create test reward history
    for (let i = 0; i < 10; i++) {
      const positionIndex = i % testPositions.length;
      const position = testPositions[positionIndex];
      const contract = testContracts.find(c => c._id.equals(position.stakingContractId));
      
      const rewardHistory = new StakingRewardHistory({
        userId: position.userId,
        stakingPositionId: position._id,
        stakingContractId: position.stakingContractId,
        distributionDate: new Date(Date.now() - (i * 3 * 24 * 60 * 60 * 1000)), // Every 3 days
        openEntryTickets: 10 + i,
        bonusMultiplier: 1.25,
        distributionType: 'monthly',
        nftTokenId: position.nftTokenId,
        nftContractAddress: position.nftContractAddress,
        blockchain: position.blockchain,
        stakingDuration: position.stakingDuration,
        stakingStartDate: position.stakedAt,
        stakingEndDate: position.unstakeAt,
        status: 'distributed'
      });
      await rewardHistory.save();
      testRewardHistory.push(rewardHistory);
    }
  }

  describe('Dashboard Metrics', () => {
    test('should get comprehensive dashboard metrics', async () => {
      const metrics = await StakingAnalyticsService.getDashboardMetrics(30);

      expect(metrics).toHaveProperty('overview');
      expect(metrics).toHaveProperty('breakdown');
      expect(metrics).toHaveProperty('performance');
      expect(metrics).toHaveProperty('trends');

      // Overview checks
      expect(metrics.overview.totalContracts).toBe(3);
      expect(metrics.overview.activeContracts).toBe(3);
      expect(metrics.overview.totalPositions).toBe(15);
      expect(metrics.overview.activePositions).toBe(12);
      expect(metrics.overview.totalUsers).toBe(5);

      // Breakdown checks
      expect(metrics.breakdown.contracts).toHaveLength(3);
      expect(metrics.breakdown.durations).toHaveLength(3);
      expect(metrics.breakdown.blockchains).toHaveLength(3);

      // Performance checks
      expect(typeof metrics.performance.averageStakingDuration).toBe('number');
      expect(typeof metrics.performance.rewardDistributionRate).toBe('number');
      expect(typeof metrics.performance.userRetentionRate).toBe('number');
      expect(Array.isArray(metrics.performance.contractUtilization)).toBe(true);

      // Trends checks
      expect(Array.isArray(metrics.trends.stakingTrend)).toBe(true);
      expect(Array.isArray(metrics.trends.rewardTrend)).toBe(true);
      expect(Array.isArray(metrics.trends.userGrowthTrend)).toBe(true);
    });

    test('should handle different time ranges', async () => {
      const metrics7 = await StakingAnalyticsService.getDashboardMetrics(7);
      const metrics30 = await StakingAnalyticsService.getDashboardMetrics(30);

      expect(metrics7.overview.totalContracts).toBe(metrics30.overview.totalContracts);
      expect(metrics7.overview.totalPositions).toBe(metrics30.overview.totalPositions);
      
      // Recent activity might differ
      expect(typeof metrics7.overview.recentStakes).toBe('number');
      expect(typeof metrics30.overview.recentStakes).toBe('number');
    });
  });

  describe('Contract Performance', () => {
    test('should get performance for all contracts', async () => {
      const performance = await StakingAnalyticsService.getContractPerformance(null, 30);

      expect(performance).toHaveProperty('contracts');
      expect(performance).toHaveProperty('summary');
      expect(performance.contracts).toHaveLength(3);

      const contract = performance.contracts[0];
      expect(contract).toHaveProperty('contract');
      expect(contract).toHaveProperty('metrics');
      expect(contract).toHaveProperty('breakdown');
      expect(contract).toHaveProperty('rewardStructures');

      // Contract details
      expect(contract.contract).toHaveProperty('id');
      expect(contract.contract).toHaveProperty('name');
      expect(contract.contract).toHaveProperty('address');
      expect(contract.contract).toHaveProperty('blockchain');

      // Metrics
      expect(typeof contract.metrics.totalStaked).toBe('number');
      expect(typeof contract.metrics.activeStaked).toBe('number');
      expect(typeof contract.metrics.totalRewards).toBe('number');
      expect(typeof contract.metrics.uniqueUsers).toBe('number');
      expect(typeof contract.metrics.averageDuration).toBe('number');
      expect(typeof contract.metrics.rewardEfficiency).toBe('number');
      expect(typeof contract.metrics.utilizationRate).toBe('number');

      // Summary
      expect(performance.summary.totalContracts).toBe(3);
      expect(typeof performance.summary.averageUtilization).toBe('number');
      expect(typeof performance.summary.totalRewardsDistributed).toBe('number');
      expect(typeof performance.summary.totalActivePositions).toBe('number');
    });

    test('should get performance for specific contract', async () => {
      const contractId = testContracts[0]._id;
      const performance = await StakingAnalyticsService.getContractPerformance(contractId, 30);

      expect(performance.contracts).toHaveLength(1);
      expect(performance.contracts[0].contract.id).toEqual(contractId);
      expect(performance.contracts[0].contract.name).toBe('Test Collection 1');
    });

    test('should calculate correct metrics', async () => {
      const contractId = testContracts[0]._id;
      const performance = await StakingAnalyticsService.getContractPerformance(contractId, 30);
      
      const contract = performance.contracts[0];
      
      // Check that utilization rate is between 0 and 1
      expect(contract.metrics.utilizationRate).toBeGreaterThanOrEqual(0);
      expect(contract.metrics.utilizationRate).toBeLessThanOrEqual(1);
      
      // Check that reward efficiency is calculated
      expect(typeof contract.metrics.rewardEfficiency).toBe('number');
      expect(contract.metrics.rewardEfficiency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('User Behavior Analysis', () => {
    test('should analyze user behavior patterns', async () => {
      const analysis = await StakingAnalyticsService.getUserBehaviorAnalysis(90);

      expect(analysis).toHaveProperty('segmentation');
      expect(analysis).toHaveProperty('patterns');
      expect(analysis).toHaveProperty('rewardBehavior');
      expect(analysis).toHaveProperty('preferences');
      expect(analysis).toHaveProperty('lifecycle');
      expect(analysis).toHaveProperty('insights');

      // Preferences should have duration and blockchain data
      expect(analysis.preferences).toHaveProperty('durations');
      expect(analysis.preferences).toHaveProperty('blockchains');
    });
  });

  describe('Reward Distribution Analytics', () => {
    test('should get reward distribution analytics', async () => {
      const analytics = await StakingAnalyticsService.getRewardDistributionAnalytics(30);

      expect(analytics).toHaveProperty('summary');
      expect(analytics).toHaveProperty('trends');
      expect(analytics).toHaveProperty('breakdown');
      expect(analytics).toHaveProperty('performance');
      expect(analytics).toHaveProperty('projections');

      // Breakdown should have contract and duration data
      expect(analytics.breakdown).toHaveProperty('byContract');
      expect(analytics.breakdown).toHaveProperty('byDuration');

      // Performance should have success rates and user participation
      expect(analytics.performance).toHaveProperty('successRates');
      expect(analytics.performance).toHaveProperty('userParticipation');
    });
  });

  describe('Real-time Analytics', () => {
    test('should get real-time analytics', async () => {
      const analytics = await StakingAnalyticsService.getRealTimeAnalytics();

      expect(analytics).toHaveProperty('timestamp');
      expect(analytics).toHaveProperty('metrics');
      expect(analytics).toHaveProperty('health');
      expect(analytics).toHaveProperty('alerts');

      // Timestamp should be recent
      expect(analytics.timestamp).toBeInstanceOf(Date);
      expect(Date.now() - analytics.timestamp.getTime()).toBeLessThan(5000); // Within 5 seconds

      // Metrics should have current data
      expect(typeof analytics.metrics.activePositions).toBe('number');
      expect(typeof analytics.metrics.recentStakes).toBe('number');
      expect(typeof analytics.metrics.pendingRewards).toBe('number');
      expect(typeof analytics.metrics.recentDistributions).toBe('number');
    });
  });

  describe('Report Generation', () => {
    test('should generate comprehensive staking report', async () => {
      const report = await StakingAnalyticsService.generateStakingReport({
        timeRange: 30,
        includeUserData: true,
        includeContractDetails: true,
        format: 'json'
      });

      expect(report).toHaveProperty('metadata');
      expect(report).toHaveProperty('executive_summary');
      expect(report).toHaveProperty('dashboard_metrics');
      expect(report).toHaveProperty('contract_performance');
      expect(report).toHaveProperty('user_behavior');
      expect(report).toHaveProperty('reward_analytics');
      expect(report).toHaveProperty('recommendations');

      // Metadata checks
      expect(report.metadata.generatedAt).toBeInstanceOf(Date);
      expect(report.metadata.timeRange).toBe(30);
      expect(report.metadata.reportType).toBe('comprehensive_staking_report');

      // Executive summary checks
      expect(typeof report.executive_summary.totalValue).toBe('number');
      expect(typeof report.executive_summary.activeStaking).toBe('number');
      expect(typeof report.executive_summary.rewardsDistributed).toBe('number');
      expect(typeof report.executive_summary.userEngagement).toBe('number');
      expect(Array.isArray(report.executive_summary.keyInsights)).toBe(true);
    });

    test('should generate report without user data', async () => {
      const report = await StakingAnalyticsService.generateStakingReport({
        timeRange: 30,
        includeUserData: false,
        includeContractDetails: true,
        format: 'json'
      });

      expect(report.user_behavior).toBeNull();
      expect(report.contract_performance).toHaveProperty('contracts');
    });

    test('should generate report with summary contract details', async () => {
      const report = await StakingAnalyticsService.generateStakingReport({
        timeRange: 30,
        includeUserData: false,
        includeContractDetails: false,
        format: 'json'
      });

      expect(report.contract_performance).toHaveProperty('totalContracts');
      expect(report.contract_performance).not.toHaveProperty('contracts');
    });
  });

  describe('Caching', () => {
    test('should cache results for performance', async () => {
      // First call
      const start1 = Date.now();
      const metrics1 = await StakingAnalyticsService.getDashboardMetrics(30);
      const time1 = Date.now() - start1;

      // Second call (should be cached)
      const start2 = Date.now();
      const metrics2 = await StakingAnalyticsService.getDashboardMetrics(30);
      const time2 = Date.now() - start2;

      // Results should be identical
      expect(metrics1).toEqual(metrics2);
      
      // Second call should be faster (cached)
      expect(time2).toBeLessThan(time1);
    });

    test('should clear cache', async () => {
      // Get metrics to populate cache
      await StakingAnalyticsService.getDashboardMetrics(30);
      
      // Clear cache
      StakingAnalyticsService.clearCache();
      
      // Should work after cache clear
      const metrics = await StakingAnalyticsService.getDashboardMetrics(30);
      expect(metrics).toHaveProperty('overview');
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Mock a database error
      const originalFind = StakingContract.find;
      StakingContract.find = jest.fn().mockRejectedValue(new Error('Database error'));

      await expect(StakingAnalyticsService.getDashboardMetrics(30))
        .rejects.toThrow('Failed to get dashboard metrics');

      // Restore original method
      StakingContract.find = originalFind;
    });

    test('should handle invalid contract ID', async () => {
      const invalidId = new mongoose.Types.ObjectId();
      const performance = await StakingAnalyticsService.getContractPerformance(invalidId, 30);

      expect(performance.contracts).toHaveLength(0);
      expect(performance.summary.totalContracts).toBe(0);
    });

    test('should handle empty data sets', async () => {
      // Clear all test data
      await Promise.all([
        StakingContract.deleteMany({}),
        StakingPosition.deleteMany({}),
        StakingRewardHistory.deleteMany({}),
        User.deleteMany({})
      ]);

      const metrics = await StakingAnalyticsService.getDashboardMetrics(30);

      expect(metrics.overview.totalContracts).toBe(0);
      expect(metrics.overview.totalPositions).toBe(0);
      expect(metrics.overview.totalUsers).toBe(0);
      expect(metrics.breakdown.contracts).toHaveLength(0);
    });
  });

  describe('Data Accuracy', () => {
    test('should calculate accurate contract breakdown', async () => {
      const metrics = await StakingAnalyticsService.getDashboardMetrics(30);
      
      // Should have 3 contracts
      expect(metrics.breakdown.contracts).toHaveLength(3);
      
      // Total positions across contracts should match
      const totalFromBreakdown = metrics.breakdown.contracts.reduce(
        (sum, contract) => sum + contract.totalPositions, 0
      );
      expect(totalFromBreakdown).toBe(metrics.overview.totalPositions);
    });

    test('should calculate accurate duration breakdown', async () => {
      const metrics = await StakingAnalyticsService.getDashboardMetrics(30);
      
      // Should have 3 duration categories
      expect(metrics.breakdown.durations).toHaveLength(3);
      
      // Total positions across durations should match
      const totalFromDurations = metrics.breakdown.durations.reduce(
        (sum, duration) => sum + duration.count, 0
      );
      expect(totalFromDurations).toBe(metrics.overview.totalPositions);
    });

    test('should calculate accurate blockchain breakdown', async () => {
      const metrics = await StakingAnalyticsService.getDashboardMetrics(30);
      
      // Should have 3 blockchain categories
      expect(metrics.breakdown.blockchains).toHaveLength(3);
      
      // Total positions across blockchains should match
      const totalFromBlockchains = metrics.breakdown.blockchains.reduce(
        (sum, blockchain) => sum + blockchain.count, 0
      );
      expect(totalFromBlockchains).toBe(metrics.overview.totalPositions);
    });
  });
});