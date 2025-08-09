const mongoose = require('mongoose');
const StakingRewardDistributionService = require('./services/stakingRewardDistributionService');
const StakingPosition = require('./models/staking/stakingPosition');
const StakingContract = require('./models/staking/stakingContract');
const StakingRewardHistory = require('./models/staking/stakingRewardHistory');
const RaffleTicket = require('./models/raffle/raffleTicket');
const Raffle = require('./models/raffle/raffle');
const User = require('./models/user/user');
const TestEnvironment = require('./tests/testEnvironment');

class StakingRewardDistributionVerification {
  constructor() {
    this.testEnv = TestEnvironment;
    this.results = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  async runVerification() {
    console.log('🚀 Starting Staking Reward Distribution System Verification...\n');

    try {
      await this.testEnv.setup();
      console.log('✅ Test environment setup completed\n');

      await this.testBasicRewardDistribution();
      await this.testRewardHistoryTracking();
      await this.testOpenEntryRaffleIntegration();
      await this.testPendingRewardsCalculation();
      await this.testRewardClaims();
      await this.testMissedDistributions();
      await this.testManualDistribution();
      await this.testNotificationSystem();
      await this.testErrorHandling();

      await this.printResults();

    } catch (error) {
      console.error('❌ Verification failed with error:', error);
      this.results.errors.push(`Setup Error: ${error.message}`);
    } finally {
      await this.testEnv.teardown();
      console.log('\n🧹 Test environment cleaned up');
    }
  }

  async testBasicRewardDistribution() {
    console.log('📋 Testing Basic Reward Distribution...');
    
    try {
      await this.testEnv.clearData();

      // Create test data
      const { user, contract, position } = await this.createTestData();

      // Test reward distribution
      const result = await StakingRewardDistributionService.distributeMonthlyRewards();

      this.assert(result.success === true, 'Distribution should succeed');
      this.assert(result.totalProcessed === 1, 'Should process one position');
      this.assert(result.successful === 1, 'Should have one successful distribution');
      this.assert(result.failed === 0, 'Should have no failed distributions');

      // Verify position was updated
      const updatedPosition = await StakingPosition.findById(position._id);
      this.assert(updatedPosition.totalRewardsEarned === 12, 'Position should have 12 rewards earned');
      this.assert(updatedPosition.lastRewardDistribution !== null, 'Position should have last reward distribution date');

      // Verify contract statistics
      const updatedContract = await StakingContract.findById(contract._id);
      this.assert(updatedContract.totalRewardsDistributed === 12, 'Contract should have 12 total rewards distributed');

      console.log('✅ Basic Reward Distribution test passed\n');

    } catch (error) {
      this.recordError('Basic Reward Distribution', error);
    }
  }

  async testRewardHistoryTracking() {
    console.log('📋 Testing Reward History Tracking...');
    
    try {
      await this.testEnv.clearData();

      const { user, contract, position } = await this.createTestData();

      // Distribute rewards
      await StakingRewardDistributionService.distributeMonthlyRewards();

      // Check reward history
      const rewardHistory = await StakingRewardHistory.findOne({
        userId: user._id,
        stakingPositionId: position._id
      });

      this.assert(rewardHistory !== null, 'Reward history should be created');
      this.assert(rewardHistory.openEntryTickets === 12, 'Should have 12 tickets in history');
      this.assert(rewardHistory.bonusMultiplier === 1.25, 'Should have correct bonus multiplier');
      this.assert(rewardHistory.effectiveValue === 15, 'Should have correct effective value (12 * 1.25)');
      this.assert(rewardHistory.distributionType === 'monthly', 'Should be monthly distribution type');
      this.assert(rewardHistory.status === 'distributed', 'Should have distributed status');

      // Test user reward history retrieval
      const userHistory = await StakingRewardDistributionService.getUserRewardHistory(user._id);
      this.assert(userHistory.rewardHistory.length === 1, 'User should have one reward history entry');
      this.assert(userHistory.pagination.total === 1, 'Total should be 1');

      console.log('✅ Reward History Tracking test passed\n');

    } catch (error) {
      this.recordError('Reward History Tracking', error);
    }
  }

  async testOpenEntryRaffleIntegration() {
    console.log('📋 Testing Open-Entry Raffle Integration...');
    
    try {
      await this.testEnv.clearData();

      const { user, contract, position } = await this.createTestData();

      // Distribute rewards
      await StakingRewardDistributionService.distributeMonthlyRewards();

      // Check open-entry raffle creation
      const openEntryRaffles = await Raffle.find({
        lotteryTypeEnum: 'OPEN_ENTRY',
        'status.isActive': true
      });

      this.assert(openEntryRaffles.length === 1, 'Should create one open-entry raffle');

      const raffle = openEntryRaffles[0];
      this.assert(raffle.raffleTypeEnum === 'UNLIMITED', 'Should be unlimited raffle type');
      this.assert(raffle.coinType === 'nafflings', 'Should use nafflings as coin type');
      this.assert(raffle.perTicketPrice === '0', 'Should have zero ticket price');
      this.assert(raffle.ticketsAvailableOpenEntry === 12, 'Should have 12 open-entry tickets');

      // Check raffle tickets creation
      const tickets = await RaffleTicket.find({
        purchasedBy: user._id,
        raffle: raffle._id,
        isFree: true,
        isOpenEntry: true
      });

      this.assert(tickets.length === 12, 'Should create 12 raffle tickets');
      tickets.forEach((ticket, index) => {
        this.assert(ticket.naffleTicketId.startsWith('STAKE-'), `Ticket ${index} should have STAKE- prefix`);
      });

      console.log('✅ Open-Entry Raffle Integration test passed\n');

    } catch (error) {
      this.recordError('Open-Entry Raffle Integration', error);
    }
  }

  async testPendingRewardsCalculation() {
    console.log('📋 Testing Pending Rewards Calculation...');
    
    try {
      await this.testEnv.clearData();

      const { user, contract, position } = await this.createTestData();

      // Test pending rewards before distribution
      const pendingBefore = await StakingRewardDistributionService.calculateUserPendingRewards(user._id);
      this.assert(pendingBefore.totalPendingTickets === 12, 'Should have 12 pending tickets before distribution');
      this.assert(pendingBefore.positionRewards.length === 1, 'Should have one position with pending rewards');

      // Distribute rewards
      await StakingRewardDistributionService.distributeMonthlyRewards();

      // Test pending rewards after distribution
      const pendingAfter = await StakingRewardDistributionService.calculateUserPendingRewards(user._id);
      this.assert(pendingAfter.totalPendingTickets === 0, 'Should have no pending tickets after distribution');

      console.log('✅ Pending Rewards Calculation test passed\n');

    } catch (error) {
      this.recordError('Pending Rewards Calculation', error);
    }
  }

  async testRewardClaims() {
    console.log('📋 Testing Reward Claims...');
    
    try {
      await this.testEnv.clearData();

      const { user, contract, position } = await this.createTestData();

      // Test successful claim
      const claimRequests = [{
        positionId: position._id,
        claimAmount: 5
      }];

      const claimResult = await StakingRewardDistributionService.processRewardClaims(user._id, claimRequests);
      this.assert(claimResult.successful === 1, 'Should have one successful claim');
      this.assert(claimResult.failed === 0, 'Should have no failed claims');
      this.assert(claimResult.results[0].ticketsClaimed === 5, 'Should claim 5 tickets');

      // Test claim exceeding available rewards
      const excessiveClaimRequests = [{
        positionId: position._id,
        claimAmount: 50
      }];

      const excessiveClaimResult = await StakingRewardDistributionService.processRewardClaims(user._id, excessiveClaimRequests);
      this.assert(excessiveClaimResult.successful === 0, 'Should have no successful excessive claims');
      this.assert(excessiveClaimResult.failed === 1, 'Should have one failed excessive claim');

      console.log('✅ Reward Claims test passed\n');

    } catch (error) {
      this.recordError('Reward Claims', error);
    }
  }

  async testMissedDistributions() {
    console.log('📋 Testing Missed Distributions...');
    
    try {
      await this.testEnv.clearData();

      const { user, contract, position } = await this.createTestData();

      // Set position to have missed rewards (2 months ago)
      await StakingPosition.findByIdAndUpdate(position._id, {
        stakedAt: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000), // 70 days ago
        lastRewardDistribution: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000)
      });

      const result = await StakingRewardDistributionService.checkAndProcessMissedDistributions();

      this.assert(result.success === true, 'Missed distribution check should succeed');
      this.assert(result.processedPositions === 1, 'Should process one position');
      this.assert(result.successful === 1, 'Should have one successful missed distribution');
      this.assert(result.results[0].monthsMissed === 2, 'Should detect 2 missed months');
      this.assert(result.results[0].ticketsDistributed === 24, 'Should distribute 24 tickets (2 months * 12)');

      console.log('✅ Missed Distributions test passed\n');

    } catch (error) {
      this.recordError('Missed Distributions', error);
    }
  }

  async testManualDistribution() {
    console.log('📋 Testing Manual Distribution...');
    
    try {
      await this.testEnv.clearData();

      const { user, contract, position } = await this.createTestData();

      // Test manual distribution for specific position
      const specificResult = await StakingRewardDistributionService.manualDistribution([position._id]);
      this.assert(specificResult.success === true, 'Manual distribution for specific position should succeed');
      this.assert(specificResult.totalProcessed === 1, 'Should process one position');

      // Reset position for next test
      await StakingPosition.findByIdAndUpdate(position._id, {
        lastRewardDistribution: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
        totalRewardsEarned: 0,
        rewardHistory: []
      });

      // Test manual distribution for all eligible positions
      const allResult = await StakingRewardDistributionService.manualDistribution();
      this.assert(allResult.success === true, 'Manual distribution for all positions should succeed');
      this.assert(allResult.totalProcessed === 1, 'Should process one position');

      console.log('✅ Manual Distribution test passed\n');

    } catch (error) {
      this.recordError('Manual Distribution', error);
    }
  }

  async testNotificationSystem() {
    console.log('📋 Testing Notification System...');
    
    try {
      await this.testEnv.clearData();

      const { user, contract, position } = await this.createTestData();

      // Test notification service integration
      const stakingNotificationService = require('./services/stakingNotificationService');
      
      const notificationResult = await stakingNotificationService.sendRewardNotification(user, {
        ticketsReceived: 12,
        contractName: contract.contractName,
        nftId: `${position.blockchain}:${position.nftContractAddress}:${position.nftTokenId}`,
        bonusMultiplier: 1.25,
        rewardHistoryId: new mongoose.Types.ObjectId()
      });

      this.assert(notificationResult.success === true, 'Notification should be sent successfully');

      // Check notification queue status
      const queueStatus = stakingNotificationService.getQueueStatus();
      this.assert(queueStatus.queueLength >= 0, 'Queue should have valid length');

      console.log('✅ Notification System test passed\n');

    } catch (error) {
      this.recordError('Notification System', error);
    }
  }

  async testErrorHandling() {
    console.log('📋 Testing Error Handling...');
    
    try {
      await this.testEnv.clearData();

      const { user, contract, position } = await this.createTestData();

      // Test with inactive contract
      await StakingContract.findByIdAndUpdate(contract._id, { isActive: false });

      const result = await StakingRewardDistributionService.distributeMonthlyRewards();
      this.assert(result.totalProcessed === 1, 'Should still process the position');
      this.assert(result.successful === 0, 'Should have no successful distributions');
      this.assert(result.failed === 1, 'Should have one failed distribution');
      this.assert(result.results[0].success === false, 'Distribution should fail');

      // Test distribution statistics tracking
      const stats = StakingRewardDistributionService.getDistributionStats();
      this.assert(typeof stats.totalDistributed === 'number', 'Should track total distributed');
      this.assert(typeof stats.totalPositionsProcessed === 'number', 'Should track total positions processed');
      this.assert(typeof stats.totalErrors === 'number', 'Should track total errors');

      console.log('✅ Error Handling test passed\n');

    } catch (error) {
      this.recordError('Error Handling', error);
    }
  }

  async createTestData() {
    // Create test user
    const user = new User({
      email: 'test@example.com',
      username: 'testuser',
      walletAddresses: ['0x1234567890123456789012345678901234567890'],
      isVerified: true
    });
    await user.save();

    // Create test staking contract
    const contract = new StakingContract({
      contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      blockchain: 'ethereum',
      contractName: 'Test NFT Collection',
      description: 'Test collection for staking',
      isActive: true,
      rewardStructures: {
        sixMonths: {
          openEntryTicketsPerMonth: 5,
          bonusMultiplier: 1.1
        },
        twelveMonths: {
          openEntryTicketsPerMonth: 12,
          bonusMultiplier: 1.25
        },
        threeYears: {
          openEntryTicketsPerMonth: 30,
          bonusMultiplier: 1.5
        }
      },
      contractValidation: {
        isValidated: true,
        validatedAt: new Date(),
        validatedBy: user._id
      },
      createdBy: user._id
    });
    await contract.save();

    // Create test staking position
    const position = new StakingPosition({
      userId: user._id,
      stakingContractId: contract._id,
      nftTokenId: '123',
      nftContractAddress: contract.contractAddress,
      blockchain: contract.blockchain,
      stakingDuration: 12, // 12 months
      stakedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
      walletAddress: user.walletAddresses[0],
      lockingHash: 'test-locking-hash',
      status: 'active'
    });
    await position.save();

    return { user, contract, position };
  }

  assert(condition, message) {
    this.results.totalTests++;
    if (condition) {
      this.results.passed++;
    } else {
      this.results.failed++;
      this.results.errors.push(`Assertion failed: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  recordError(testName, error) {
    this.results.failed++;
    this.results.errors.push(`${testName}: ${error.message}`);
    console.log(`❌ ${testName} test failed: ${error.message}\n`);
  }

  async printResults() {
    console.log('📊 VERIFICATION RESULTS');
    console.log('========================');
    console.log(`Total Tests: ${this.results.totalTests}`);
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);
    console.log(`Success Rate: ${((this.results.passed / this.results.totalTests) * 100).toFixed(2)}%`);

    if (this.results.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      this.results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }

    if (this.results.failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Staking Reward Distribution System is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the errors above.');
    }
  }
}

// Run verification if called directly
if (require.main === module) {
  const verification = new StakingRewardDistributionVerification();
  verification.runVerification().catch(console.error);
}

module.exports = StakingRewardDistributionVerification;