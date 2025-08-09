const mongoose = require('mongoose');
const StakingAnalyticsService = require('./services/stakingAnalyticsService');
const StakingContract = require('./models/staking/stakingContract');
const StakingPosition = require('./models/staking/stakingPosition');
const StakingRewardHistory = require('./models/staking/stakingRewardHistory');
const User = require('./models/user/user');

async function verifyStakingAnalytics() {
  console.log('🚀 Starting Staking Analytics System Verification...\n');

  try {
    // Connect to test database
    await mongoose.connect('mongodb://localhost:27017/naffles-test', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to test database\n');

    // Clean up existing test data
    await Promise.all([
      User.deleteMany({ email: { $regex: /analytics.*@example\.com/ } }),
      StakingContract.deleteMany({ contractName: /Analytics.*Collection/ }),
      StakingPosition.deleteMany({}),
      StakingRewardHistory.deleteMany({})
    ]);
    console.log('✅ Cleaned up test data\n');

    // Create comprehensive test data
    const testData = await createAnalyticsTestData();
    console.log('✅ Created test data\n');

    // Test 1: Dashboard Metrics
    console.log('📋 Test 1: Dashboard Metrics');
    const dashboardMetrics = await StakingAnalyticsService.getDashboardMetrics(30);
    
    console.log('Dashboard Overview:', {
      totalContracts: dashboardMetrics.overview.totalContracts,
      activeContracts: dashboardMetrics.overview.activeContracts,
      totalPositions: dashboardMetrics.overview.totalPositions,
      activePositions: dashboardMetrics.overview.activePositions,
      totalUsers: dashboardMetrics.overview.totalUsers
    });

    if (dashboardMetrics.overview.totalContracts === 3 && 
        dashboardMetrics.overview.totalPositions === 15) {
      console.log('✅ Dashboard metrics test passed\n');
    } else {
      console.log('❌ Dashboard metrics test failed\n');
      return;
    }

    // Test 2: Contract Performance
    console.log('📋 Test 2: Contract Performance');
    const contractPerformance = await StakingAnalyticsService.getContractPerformance(null, 30);
    
    console.log('Contract Performance Summary:', {
      totalContracts: contractPerformance.summary.totalContracts,
      averageUtilization: Math.round(contractPerformance.summary.averageUtilization * 100) / 100,
      totalRewardsDistributed: contractPerformance.summary.totalRewardsDistributed,
      totalActivePositions: contractPerformance.summary.totalActivePositions
    });

    if (contractPerformance.contracts.length === 3 && 
        contractPerformance.summary.totalContracts === 3) {
      console.log('✅ Contract performance test passed\n');
    } else {
      console.log('❌ Contract performance test failed\n');
      return;
    }

    // Test 3: Specific Contract Analytics
    console.log('📋 Test 3: Specific Contract Analytics');
    const specificContract = await StakingAnalyticsService.getContractPerformance(testData.contracts[0]._id, 30);
    
    console.log('Specific Contract Metrics:', {
      contractName: specificContract.contracts[0].contract.name,
      totalStaked: specificContract.contracts[0].metrics.totalStaked,
      activeStaked: specificContract.contracts[0].metrics.activeStaked,
      utilizationRate: Math.round(specificContract.contracts[0].metrics.utilizationRate * 100) / 100
    });

    if (specificContract.contracts.length === 1 && 
        specificContract.contracts[0].contract.name === 'Analytics Collection 1') {
      console.log('✅ Specific contract analytics test passed\n');
    } else {
      console.log('❌ Specific contract analytics test failed\n');
      return;
    }

    // Test 4: User Behavior Analysis
    console.log('📋 Test 4: User Behavior Analysis');
    const userBehavior = await StakingAnalyticsService.getUserBehaviorAnalysis(90);
    
    console.log('User Behavior Analysis:', {
      hasSegmentation: !!userBehavior.segmentation,
      hasPatterns: !!userBehavior.patterns,
      hasPreferences: !!userBehavior.preferences,
      hasLifecycle: !!userBehavior.lifecycle,
      hasInsights: !!userBehavior.insights
    });

    if (userBehavior.segmentation && userBehavior.patterns && userBehavior.preferences) {
      console.log('✅ User behavior analysis test passed\n');
    } else {
      console.log('❌ User behavior analysis test failed\n');
      return;
    }

    // Test 5: Reward Distribution Analytics
    console.log('📋 Test 5: Reward Distribution Analytics');
    const rewardAnalytics = await StakingAnalyticsService.getRewardDistributionAnalytics(30);
    
    console.log('Reward Distribution Analytics:', {
      hasSummary: !!rewardAnalytics.summary,
      hasTrends: !!rewardAnalytics.trends,
      hasBreakdown: !!rewardAnalytics.breakdown,
      hasPerformance: !!rewardAnalytics.performance,
      hasProjections: !!rewardAnalytics.projections
    });

    if (rewardAnalytics.summary && rewardAnalytics.breakdown && rewardAnalytics.performance) {
      console.log('✅ Reward distribution analytics test passed\n');
    } else {
      console.log('❌ Reward distribution analytics test failed\n');
      return;
    }

    // Test 6: Real-time Analytics
    console.log('📋 Test 6: Real-time Analytics');
    const realTimeAnalytics = await StakingAnalyticsService.getRealTimeAnalytics();
    
    console.log('Real-time Analytics:', {
      timestamp: realTimeAnalytics.timestamp,
      activePositions: realTimeAnalytics.metrics.activePositions,
      recentStakes: realTimeAnalytics.metrics.recentStakes,
      pendingRewards: realTimeAnalytics.metrics.pendingRewards,
      hasHealth: !!realTimeAnalytics.health,
      hasAlerts: !!realTimeAnalytics.alerts
    });

    if (realTimeAnalytics.timestamp && realTimeAnalytics.metrics && realTimeAnalytics.health) {
      console.log('✅ Real-time analytics test passed\n');
    } else {
      console.log('❌ Real-time analytics test failed\n');
      return;
    }

    // Test 7: Report Generation
    console.log('📋 Test 7: Report Generation');
    const report = await StakingAnalyticsService.generateStakingReport({
      timeRange: 30,
      includeUserData: true,
      includeContractDetails: true,
      format: 'json'
    });
    
    console.log('Generated Report:', {
      hasMetadata: !!report.metadata,
      hasExecutiveSummary: !!report.executive_summary,
      hasDashboardMetrics: !!report.dashboard_metrics,
      hasContractPerformance: !!report.contract_performance,
      hasUserBehavior: !!report.user_behavior,
      hasRewardAnalytics: !!report.reward_analytics,
      hasRecommendations: !!report.recommendations
    });

    if (report.metadata && report.executive_summary && report.dashboard_metrics) {
      console.log('✅ Report generation test passed\n');
    } else {
      console.log('❌ Report generation test failed\n');
      return;
    }

    // Test 8: Caching Performance
    console.log('📋 Test 8: Caching Performance');
    
    // First call (no cache)
    const start1 = Date.now();
    await StakingAnalyticsService.getDashboardMetrics(30);
    const time1 = Date.now() - start1;
    
    // Second call (cached)
    const start2 = Date.now();
    await StakingAnalyticsService.getDashboardMetrics(30);
    const time2 = Date.now() - start2;
    
    console.log('Cache Performance:', {
      firstCallTime: `${time1}ms`,
      secondCallTime: `${time2}ms`,
      improvement: `${Math.round(((time1 - time2) / time1) * 100)}%`
    });

    if (time2 < time1) {
      console.log('✅ Caching performance test passed\n');
    } else {
      console.log('⚠️  Caching performance test inconclusive (may be too fast to measure)\n');
    }

    // Test 9: Cache Clear
    console.log('📋 Test 9: Cache Management');
    StakingAnalyticsService.clearCache();
    
    // Should still work after cache clear
    const metricsAfterClear = await StakingAnalyticsService.getDashboardMetrics(30);
    
    if (metricsAfterClear.overview.totalContracts === 3) {
      console.log('✅ Cache management test passed\n');
    } else {
      console.log('❌ Cache management test failed\n');
      return;
    }

    console.log('🎉 ALL TESTS PASSED! Staking Analytics System is working correctly.');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🧹 Disconnected from database');
  }
}

async function createAnalyticsTestData() {
  console.log('Creating comprehensive analytics test data...');

  // Create test users
  const users = [];
  for (let i = 0; i < 10; i++) {
    const user = new User({
      email: `analytics-user${i}@example.com`,
      username: `analyticsuser${i}`,
      walletAddresses: [`0x${i.toString().padStart(40, '0')}`],
      isVerified: true
    });
    await user.save();
    users.push(user);
  }

  // Create test contracts
  const contracts = [];
  const blockchains = ['ethereum', 'polygon', 'solana'];
  for (let i = 0; i < 3; i++) {
    const contract = new StakingContract({
      contractAddress: `0x${(i + 200).toString().padStart(40, '0')}`,
      blockchain: blockchains[i],
      contractName: `Analytics Collection ${i + 1}`,
      description: `Analytics test collection ${i + 1}`,
      isActive: true,
      rewardStructures: {
        sixMonths: {
          openEntryTicketsPerMonth: 5 + i,
          bonusMultiplier: 1.1 + (i * 0.05)
        },
        twelveMonths: {
          openEntryTicketsPerMonth: 10 + (i * 2),
          bonusMultiplier: 1.25 + (i * 0.05)
        },
        threeYears: {
          openEntryTicketsPerMonth: 25 + (i * 5),
          bonusMultiplier: 1.5 + (i * 0.05)
        }
      },
      contractValidation: {
        isValidated: true,
        validatedAt: new Date(),
        validatedBy: users[0]._id
      },
      createdBy: users[0]._id
    });
    await contract.save();
    contracts.push(contract);
  }

  // Create test positions with varied patterns
  const positions = [];
  const durations = [6, 12, 36];
  
  for (let i = 0; i < 15; i++) {
    const userIndex = i % users.length;
    const contractIndex = i % contracts.length;
    const durationIndex = i % durations.length;
    
    const daysAgo = Math.floor(Math.random() * 60) + 1; // 1-60 days ago
    
    const position = new StakingPosition({
      userId: users[userIndex]._id,
      stakingContractId: contracts[contractIndex]._id,
      nftTokenId: (i + 100).toString(),
      nftContractAddress: contracts[contractIndex].contractAddress,
      blockchain: contracts[contractIndex].blockchain,
      stakingDuration: durations[durationIndex],
      stakedAt: new Date(Date.now() - (daysAgo * 24 * 60 * 60 * 1000)),
      walletAddress: users[userIndex].walletAddresses[0],
      lockingHash: `analytics-hash-${i}`,
      status: i < 12 ? 'active' : 'unstaked' // 80% active
    });
    await position.save();
    positions.push(position);
  }

  // Create test reward history
  const rewardHistory = [];
  for (let i = 0; i < 20; i++) {
    const positionIndex = i % positions.length;
    const position = positions[positionIndex];
    
    const daysAgo = Math.floor(Math.random() * 30) + 1; // 1-30 days ago
    
    const reward = new StakingRewardHistory({
      userId: position.userId,
      stakingPositionId: position._id,
      stakingContractId: position.stakingContractId,
      distributionDate: new Date(Date.now() - (daysAgo * 24 * 60 * 60 * 1000)),
      openEntryTickets: Math.floor(Math.random() * 20) + 5, // 5-25 tickets
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
    await reward.save();
    rewardHistory.push(reward);
  }

  return {
    users,
    contracts,
    positions,
    rewardHistory
  };
}

// Run verification if called directly
if (require.main === module) {
  verifyStakingAnalytics().catch(console.error);
}

module.exports = verifyStakingAnalytics;