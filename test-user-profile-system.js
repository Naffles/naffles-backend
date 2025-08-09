const mongoose = require('mongoose');
const User = require('./models/user/user');
const WalletAddress = require('./models/user/walletAddress');
const WalletBalance = require('./models/user/walletBalance');
const ActionItem = require('./models/user/actionItem');
const UserHistory = require('./models/user/userHistory');
const userProfileService = require('./services/userProfileService');

// Test configuration
const TEST_CONFIG = {
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles-test',
  testUserId: null
};

async function connectToDatabase() {
  try {
    await mongoose.connect(TEST_CONFIG.mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
}

async function createTestUser() {
  try {
    console.log('\n📝 Creating test user...');
    
    const testUser = new User({
      username: 'testuser123',
      email: 'test@example.com',
      role: 'user',
      tier: 'silver',
      isVerified: true,
      profileData: {
        displayName: 'Test User',
        bio: 'This is a test user for profile system testing',
        location: 'Test City',
        website: 'https://test.com',
        preferences: {
          notifications: {
            email: true,
            push: true,
            marketing: false,
            gameResults: true,
            raffleUpdates: true,
            stakingRewards: true,
            communityActivity: true,
            achievementUnlocks: true
          },
          privacy: {
            showProfile: true,
            showActivity: true
          }
        }
      },
      authMethods: {
        wallet: true,
        email: true
      },
      temporaryPoints: '1500',
      temporaryPointsAsNumber: 1500,
      loginCount: 25,
      lastLoginAt: new Date(),
      lastActiveAt: new Date()
    });

    await testUser.save();
    TEST_CONFIG.testUserId = testUser._id;
    console.log('✅ Test user created:', testUser.username);
    return testUser;
  } catch (error) {
    console.error('❌ Error creating test user:', error);
    throw error;
  }
}

async function createTestWallets() {
  try {
    console.log('\n💳 Creating test wallets...');
    
    const wallets = [
      {
        userRef: TEST_CONFIG.testUserId,
        address: '0x1234567890123456789012345678901234567890',
        walletType: 'metamask',
        chainId: '1',
        isPrimary: true,
        connectedAt: new Date()
      },
      {
        userRef: TEST_CONFIG.testUserId,
        address: 'ABC123DEF456GHI789JKL012MNO345PQR678STU901',
        walletType: 'phantom',
        chainId: 'solana',
        isPrimary: false,
        connectedAt: new Date()
      }
    ];

    await WalletAddress.insertMany(wallets);
    console.log('✅ Test wallets created');
  } catch (error) {
    console.error('❌ Error creating test wallets:', error);
    throw error;
  }
}

async function createTestWalletBalance() {
  try {
    console.log('\n💰 Creating test wallet balance...');
    
    const walletBalance = new WalletBalance({
      userRef: TEST_CONFIG.testUserId,
      balances: new Map([
        ['eth', '1000000000000000000'], // 1 ETH
        ['usdc', '500000000'], // 500 USDC
        ['sol', '2000000000'] // 2 SOL
      ]),
      fundingBalances: new Map([
        ['eth', '0'],
        ['usdc', '0'],
        ['sol', '0']
      ])
    });

    await walletBalance.save();
    console.log('✅ Test wallet balance created');
  } catch (error) {
    console.error('❌ Error creating test wallet balance:', error);
    throw error;
  }
}

async function createTestActionItems() {
  try {
    console.log('\n🔔 Creating test action items...');
    
    const actionItems = [
      {
        userId: TEST_CONFIG.testUserId,
        type: 'claim_winner',
        title: 'Claim Your Raffle Prize',
        description: 'You won a raffle! Click to claim your prize.',
        actionUrl: '/raffles/claim/123',
        priority: 'high',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        metadata: { raffleId: '123', prizeValue: '$100' }
      },
      {
        userId: TEST_CONFIG.testUserId,
        type: 'staking_reward',
        title: 'Staking Rewards Available',
        description: 'Your monthly staking rewards are ready to claim.',
        actionUrl: '/staking/rewards',
        priority: 'medium',
        metadata: { rewardAmount: 50 }
      }
    ];

    await ActionItem.insertMany(actionItems);
    console.log('✅ Test action items created');
  } catch (error) {
    console.error('❌ Error creating test action items:', error);
    throw error;
  }
}

async function createTestUserHistory() {
  try {
    console.log('\n📊 Creating test user history...');
    
    const historyItems = [
      {
        userRef: TEST_CONFIG.testUserId,
        eventType: 'raffle',
        eventId: new mongoose.Types.ObjectId(),
        status: 'won',
        amount: '100',
        details: 'Won NFT raffle - Bored Ape #1234',
        dateCreated: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      },
      {
        userRef: TEST_CONFIG.testUserId,
        eventType: 'game',
        eventId: new mongoose.Types.ObjectId(),
        status: 'won',
        amount: '50',
        details: 'Blackjack win',
        dateCreated: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      },
      {
        userRef: TEST_CONFIG.testUserId,
        eventType: 'raffle',
        eventId: new mongoose.Types.ObjectId(),
        status: 'lost',
        amount: '25',
        details: 'Raffle entry - Token Giveaway',
        dateCreated: new Date()
      }
    ];

    await UserHistory.insertMany(historyItems);
    console.log('✅ Test user history created');
  } catch (error) {
    console.error('❌ Error creating test user history:', error);
    throw error;
  }
}

async function testUserProfileService() {
  try {
    console.log('\n🧪 Testing User Profile Service...');
    
    // Test comprehensive profile retrieval
    console.log('\n📋 Testing comprehensive profile retrieval...');
    const profile = await userProfileService.getComprehensiveProfile(TEST_CONFIG.testUserId);
    
    console.log('✅ Profile retrieved successfully');
    console.log('   - Username:', profile.username);
    console.log('   - Email:', profile.email);
    console.log('   - Tier:', profile.tier);
    console.log('   - Points Balance:', profile.pointsBalance);
    console.log('   - Wallets:', profile.wallets.length);
    console.log('   - Action Items:', profile.actionItems.length);
    console.log('   - Transaction History:', profile.transactionHistory.length);
    
    // Test profile data update
    console.log('\n📝 Testing profile data update...');
    const updatedProfileData = await userProfileService.updateProfileData(TEST_CONFIG.testUserId, {
      displayName: 'Updated Test User',
      bio: 'Updated bio for testing'
    });
    
    console.log('✅ Profile data updated successfully');
    console.log('   - Display Name:', updatedProfileData.displayName);
    console.log('   - Bio:', updatedProfileData.bio);
    
    // Test notification preferences update
    console.log('\n🔔 Testing notification preferences update...');
    const updatedNotifications = await userProfileService.updateNotificationPreferences(TEST_CONFIG.testUserId, {
      email: false,
      push: true,
      marketing: true,
      gameResults: true,
      raffleUpdates: false,
      stakingRewards: true,
      communityActivity: true,
      achievementUnlocks: true
    });
    
    console.log('✅ Notification preferences updated successfully');
    console.log('   - Email notifications:', updatedNotifications.email);
    console.log('   - Marketing notifications:', updatedNotifications.marketing);
    
    // Test wallet operations
    console.log('\n💳 Testing wallet operations...');
    const wallets = await userProfileService.getUserWallets(TEST_CONFIG.testUserId);
    console.log('✅ Wallets retrieved:', wallets.length);
    
    if (wallets.length > 1) {
      const secondWallet = wallets.find(w => !w.isPrimary);
      if (secondWallet) {
        await userProfileService.setPrimaryWallet(TEST_CONFIG.testUserId, secondWallet.address);
        console.log('✅ Primary wallet updated successfully');
      }
    }
    
    // Test activity summary
    console.log('\n📊 Testing activity summary...');
    const activitySummary = await userProfileService.getUserActivitySummary(TEST_CONFIG.testUserId);
    console.log('✅ Activity summary retrieved');
    console.log('   - Total Raffles Entered:', activitySummary.totalRafflesEntered);
    console.log('   - Total Games Played:', activitySummary.totalGamesPlayed);
    console.log('   - Total Points Earned:', activitySummary.totalPointsEarned);
    
    return true;
  } catch (error) {
    console.error('❌ Error testing user profile service:', error);
    throw error;
  }
}

async function testActionItemOperations() {
  try {
    console.log('\n🔔 Testing action item operations...');
    
    // Get action items
    const actionItems = await userProfileService.getUserActionItems(TEST_CONFIG.testUserId);
    console.log('✅ Action items retrieved:', actionItems.length);
    
    if (actionItems.length > 0) {
      // Mark first action item as completed
      const firstItem = actionItems[0];
      const actionItem = await ActionItem.findById(firstItem.id);
      await actionItem.markCompleted();
      console.log('✅ Action item marked as completed');
      
      // Verify it's no longer in active items
      const updatedItems = await userProfileService.getUserActionItems(TEST_CONFIG.testUserId);
      console.log('✅ Active action items after completion:', updatedItems.length);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error testing action item operations:', error);
    throw error;
  }
}

async function cleanup() {
  try {
    console.log('\n🧹 Cleaning up test data...');
    
    if (TEST_CONFIG.testUserId) {
      await User.findByIdAndDelete(TEST_CONFIG.testUserId);
      await WalletAddress.deleteMany({ userRef: TEST_CONFIG.testUserId });
      await WalletBalance.deleteMany({ userRef: TEST_CONFIG.testUserId });
      await ActionItem.deleteMany({ userId: TEST_CONFIG.testUserId });
      await UserHistory.deleteMany({ userRef: TEST_CONFIG.testUserId });
    }
    
    console.log('✅ Test data cleaned up');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

async function runTests() {
  try {
    console.log('🚀 Starting User Profile System Tests\n');
    
    await connectToDatabase();
    await createTestUser();
    await createTestWallets();
    await createTestWalletBalance();
    await createTestActionItems();
    await createTestUserHistory();
    
    await testUserProfileService();
    await testActionItemOperations();
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await cleanup();
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  TEST_CONFIG
};