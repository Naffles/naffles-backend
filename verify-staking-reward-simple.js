const mongoose = require('mongoose');
const StakingRewardDistributionService = require('./services/stakingRewardDistributionService');
const StakingPosition = require('./models/staking/stakingPosition');
const StakingContract = require('./models/staking/stakingContract');
const StakingRewardHistory = require('./models/staking/stakingRewardHistory');
const RaffleTicket = require('./models/raffle/raffleTicket');
const Raffle = require('./models/raffle/raffle');
const User = require('./models/user/user');

async function verifyStakingRewardDistribution() {
  console.log('🚀 Starting Staking Reward Distribution System Verification...\n');

  try {
    // Connect to test database
    await mongoose.connect('mongodb://localhost:27017/naffles-test', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to test database\n');

    // Clean up existing test data
    await Promise.all([
      User.deleteMany({ email: { $regex: /test.*@example\.com/ } }),
      StakingContract.deleteMany({ contractName: /Test.*Collection/ }),
      StakingPosition.deleteMany({}),
      StakingRewardHistory.deleteMany({}),
      RaffleTicket.deleteMany({ naffleTicketId: { $regex: /^STAKE-/ } }),
      Raffle.deleteMany({ lotteryTypeEnum: 'OPEN_ENTRY' })
    ]);
    console.log('✅ Cleaned up test data\n');

    // Test 1: Basic Reward Distribution
    console.log('📋 Test 1: Basic Reward Distribution');
    const testData = await createTestData();
    
    const distributionResult = await StakingRewardDistributionService.distributeMonthlyRewards();
    console.log('Distribution Result:', {
      success: distributionResult.success,
      totalProcessed: distributionResult.totalProcessed,
      successful: distributionResult.successful,
      failed: distributionResult.failed
    });

    if (distributionResult.success && distributionResult.successful === 1) {
      console.log('✅ Basic reward distribution test passed\n');
    } else {
      console.log('❌ Basic reward distribution test failed\n');
      return;
    }

    // Test 2: Reward History Tracking
    console.log('📋 Test 2: Reward History Tracking');
    const rewardHistory = await StakingRewardHistory.findOne({
      userId: testData.user._id,
      stakingPositionId: testData.position._id
    });

    if (rewardHistory && rewardHistory.openEntryTickets === 12) {
      console.log('✅ Reward history tracking test passed\n');
    } else {
      console.log('❌ Reward history tracking test failed\n');
      return;
    }

    // Test 3: Open-Entry Raffle Integration
    console.log('📋 Test 3: Open-Entry Raffle Integration');
    const openEntryRaffles = await Raffle.find({
      lotteryTypeEnum: 'OPEN_ENTRY',
      'status.isActive': true
    });

    const raffleTickets = await RaffleTicket.find({
      purchasedBy: testData.user._id,
      isFree: true,
      isOpenEntry: true
    });

    if (openEntryRaffles.length === 1 && raffleTickets.length === 12) {
      console.log('✅ Open-entry raffle integration test passed\n');
    } else {
      console.log('❌ Open-entry raffle integration test failed\n');
      console.log(`Found ${openEntryRaffles.length} raffles and ${raffleTickets.length} tickets`);
      return;
    }

    // Test 4: Pending Rewards Calculation
    console.log('📋 Test 4: Pending Rewards Calculation');
    
    // Create another position for pending rewards test
    const newPosition = new StakingPosition({
      userId: testData.user._id,
      stakingContractId: testData.contract._id,
      nftTokenId: '456',
      nftContractAddress: testData.contract.contractAddress,
      blockchain: testData.contract.blockchain,
      stakingDuration: 6, // 6 months
      stakedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
      walletAddress: testData.user.walletAddresses[0],
      lockingHash: 'test-locking-hash-2',
      status: 'active'
    });
    await newPosition.save();

    const pendingRewards = await StakingRewardDistributionService.calculateUserPendingRewards(testData.user._id);
    
    if (pendingRewards.totalPendingTickets === 5) { // 6-month position should have 5 pending tickets
      console.log('✅ Pending rewards calculation test passed\n');
    } else {
      console.log('❌ Pending rewards calculation test failed\n');
      console.log(`Expected 5 pending tickets, got ${pendingRewards.totalPendingTickets}`);
      return;
    }

    // Test 5: User Reward History
    console.log('📋 Test 5: User Reward History');
    const userHistory = await StakingRewardDistributionService.getUserRewardHistory(testData.user._id);
    
    if (userHistory.rewardHistory.length === 1 && userHistory.pagination.total === 1) {
      console.log('✅ User reward history test passed\n');
    } else {
      console.log('❌ User reward history test failed\n');
      return;
    }

    // Test 6: Notification System
    console.log('📋 Test 6: Notification System');
    const stakingNotificationService = require('./services/stakingNotificationService');
    
    const notificationResult = await stakingNotificationService.sendRewardNotification(testData.user, {
      ticketsReceived: 12,
      contractName: testData.contract.contractName,
      nftId: `${testData.position.blockchain}:${testData.position.nftContractAddress}:${testData.position.nftTokenId}`,
      bonusMultiplier: 1.25,
      rewardHistoryId: rewardHistory._id
    });

    if (notificationResult.success) {
      console.log('✅ Notification system test passed\n');
    } else {
      console.log('❌ Notification system test failed\n');
      return;
    }

    console.log('🎉 ALL TESTS PASSED! Staking Reward Distribution System is working correctly.');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🧹 Disconnected from database');
  }
}

async function createTestData() {
  // Create test user
  const user = new User({
    email: 'test-reward@example.com',
    username: 'testrewarduser',
    walletAddresses: ['0x1234567890123456789012345678901234567890'],
    isVerified: true
  });
  await user.save();

  // Create test staking contract
  const contract = new StakingContract({
    contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    blockchain: 'ethereum',
    contractName: 'Test Reward Collection',
    description: 'Test collection for reward distribution',
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

// Run verification if called directly
if (require.main === module) {
  verifyStakingRewardDistribution().catch(console.error);
}

module.exports = verifyStakingRewardDistribution;