const mongoose = require('mongoose');
const User = require('./models/user/user');
const WalletAddress = require('./models/user/walletAddress');
const ActionItem = require('./models/user/actionItem');

// Simple test without complex dependencies
async function testUserProfileSystem() {
  try {
    console.log('🚀 Testing User Profile System (Simple)');
    
    // Test user model enhancements
    console.log('\n📝 Testing User Model...');
    
    const testUser = new User({
      username: 'testuser123',
      email: 'test@example.com',
      profileData: {
        displayName: 'Test User',
        bio: 'Test bio',
        preferences: {
          notifications: {
            email: true,
            push: false
          }
        }
      },
      authMethods: {
        wallet: true,
        email: true
      }
    });
    
    // Test user methods
    console.log('✅ User tier calculation:', testUser.calculateTier());
    console.log('✅ Founders key benefits:', testUser.getFoundersKeyBenefits());
    console.log('✅ Has founders key:', testUser.hasFoundersKey());
    
    // Test action item model
    console.log('\n🔔 Testing Action Item Model...');
    
    const actionItem = new ActionItem({
      userId: new mongoose.Types.ObjectId(),
      type: 'claim_winner',
      title: 'Test Action',
      description: 'Test description',
      actionUrl: '/test',
      priority: 'high'
    });
    
    console.log('✅ Action item created');
    console.log('✅ Is expired:', actionItem.isExpired);
    
    // Test wallet address model
    console.log('\n💳 Testing Wallet Address Model...');
    
    const wallet = new WalletAddress({
      userRef: new mongoose.Types.ObjectId(),
      address: '0x1234567890123456789012345678901234567890',
      walletType: 'metamask',
      chainId: '1',
      isPrimary: true
    });
    
    console.log('✅ Wallet address created');
    console.log('✅ Wallet type:', wallet.walletType);
    console.log('✅ Is primary:', wallet.isPrimary);
    
    console.log('\n✅ All basic tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run test
testUserProfileSystem()
  .then(() => {
    console.log('\n🎉 User Profile System test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });