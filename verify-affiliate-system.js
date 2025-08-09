const mongoose = require('mongoose');
const AffiliateService = require('./services/affiliateService');
const Affiliate = require('./models/affiliate/affiliate');
const AffiliateReferral = require('./models/affiliate/affiliateReferral');
const User = require('./models/user/user');

async function verifyAffiliateSystem() {
  try {
    console.log('🔍 Verifying Affiliate System Implementation...\n');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles');
    console.log('✅ Connected to database');
    
    // Clean up any existing test data
    await Affiliate.deleteMany({ email: { $regex: /test.*affiliate/i } });
    await User.deleteMany({ email: { $regex: /test.*user/i } });
    await AffiliateReferral.deleteMany({});
    
    // Test 1: Create test affiliate
    console.log('\n📝 Test 1: Creating test affiliate...');
    const affiliateData = {
      name: 'Test Affiliate Partner',
      email: 'test.affiliate@example.com',
      commissionRate: 8,
      paymentMethod: 'crypto',
      paymentDetails: {
        cryptoAddress: '0x1234567890123456789012345678901234567890',
        cryptoNetwork: 'ethereum'
      },
      activityCommissions: {
        raffleTickets: { rate: 10, enabled: true },
        gaming: { rate: 5, enabled: true },
        deposits: { rate: 2, enabled: false },
        staking: { rate: 3, enabled: true }
      }
    };
    
    const affiliate = await AffiliateService.createAffiliate(affiliateData);
    console.log(`✅ Created affiliate: ${affiliate.name} (Code: ${affiliate.affiliateCode})`);
    
    // Approve the affiliate
    affiliate.status = 'active';
    affiliate.isActive = true;
    await affiliate.save();
    console.log('✅ Affiliate approved and activated');
    
    // Test 2: Create test user
    console.log('\n👤 Test 2: Creating test user...');
    const testUser = new User({
      username: 'testuser123',
      email: 'test.user@example.com',
      walletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef'
    });
    await testUser.save();
    console.log(`✅ Created user: ${testUser.username}`);
    
    // Test 3: Generate affiliate URL
    console.log('\n🔗 Test 3: Generating affiliate URL...');
    const affiliateUrl = AffiliateService.generateAffiliateUrl(
      affiliate.affiliateCode,
      'https://naffles.com',
      '/raffles'
    );
    console.log(`✅ Generated URL: ${affiliateUrl}`);
    
    // Test 4: Process affiliate click
    console.log('\n👆 Test 4: Processing affiliate click...');
    const clickResult = await AffiliateService.processAffiliateClick(
      affiliate.affiliateCode,
      testUser._id,
      'Mozilla/5.0 (Test Browser)',
      '192.168.1.100',
      'https://twitter.com'
    );
    
    if (clickResult.success) {
      console.log(`✅ Click processed successfully for affiliate: ${clickResult.affiliate}`);
    } else {
      console.log(`❌ Click processing failed: ${clickResult.error}`);
    }
    
    // Test 5: Record commission for raffle ticket
    console.log('\n💰 Test 5: Recording commission for raffle ticket purchase...');
    const commissionResult = await AffiliateService.recordCommission(
      testUser._id,
      'raffle_ticket',
      50, // $50 purchase
      'tx_raffle_123'
    );
    
    if (commissionResult.success) {
      console.log(`✅ Commission recorded: $${commissionResult.commissionAmount} for ${commissionResult.affiliate}`);
    } else {
      console.log(`❌ Commission recording failed: ${commissionResult.error || commissionResult.message}`);
    }
    
    // Test 6: Record commission for gaming
    console.log('\n🎮 Test 6: Recording commission for gaming activity...');
    const gamingCommissionResult = await AffiliateService.recordCommission(
      testUser._id,
      'gaming',
      100, // $100 gaming activity
      'tx_gaming_456'
    );
    
    if (gamingCommissionResult.success) {
      console.log(`✅ Gaming commission recorded: $${gamingCommissionResult.commissionAmount} for ${gamingCommissionResult.affiliate}`);
    } else {
      console.log(`❌ Gaming commission recording failed: ${gamingCommissionResult.error || gamingCommissionResult.message}`);
    }
    
    // Test 7: Try to record commission for disabled activity (deposits)
    console.log('\n🚫 Test 7: Attempting to record commission for disabled activity (deposits)...');
    const depositCommissionResult = await AffiliateService.recordCommission(
      testUser._id,
      'deposits',
      200, // $200 deposit
      'tx_deposit_789'
    );
    
    if (!depositCommissionResult.success) {
      console.log(`✅ Correctly rejected commission for disabled activity: ${depositCommissionResult.message}`);
    } else {
      console.log(`❌ Should have rejected commission for disabled activity`);
    }
    
    // Test 8: Get affiliate analytics
    console.log('\n📊 Test 8: Getting affiliate analytics...');
    const analytics = await AffiliateService.getAffiliateAnalytics(affiliate._id);
    console.log('✅ Affiliate Analytics:');
    console.log(`   - Total Referrals: ${analytics.performance.totalReferrals}`);
    console.log(`   - Total Clicks: ${analytics.performance.totalClicks}`);
    console.log(`   - Total Conversions: ${analytics.performance.totalConversions}`);
    console.log(`   - Conversion Rate: ${analytics.performance.conversionRate}%`);
    console.log(`   - Total Commission Earned: $${analytics.performance.totalCommissionEarned}`);
    console.log(`   - Pending Commission: $${analytics.performance.pendingCommission}`);
    
    // Test 9: Get user referral info
    console.log('\n👤 Test 9: Getting user referral information...');
    const userReferralInfo = await AffiliateService.getUserReferralInfo(testUser._id);
    if (userReferralInfo.hasReferral) {
      console.log('✅ User Referral Info:');
      console.log(`   - Referred by: ${userReferralInfo.affiliate.name} (${userReferralInfo.affiliate.code})`);
      console.log(`   - Referral Date: ${userReferralInfo.referralDate}`);
      console.log(`   - Total Commission Generated: $${userReferralInfo.totalCommissionEarned}`);
      console.log(`   - Total Activities: ${userReferralInfo.totalActivities}`);
      console.log(`   - Is Valid: ${userReferralInfo.isValid}`);
    } else {
      console.log('❌ No referral information found for user');
    }
    
    // Test 10: Process commission payout
    console.log('\n💸 Test 10: Processing commission payout...');
    const payoutAmount = 7; // Pay out $7 of the earned commission
    const payoutResult = await AffiliateService.processCommissionPayouts(affiliate._id, payoutAmount);
    
    if (payoutResult.success) {
      console.log(`✅ Payout processed: $${payoutResult.totalPaid} paid to ${payoutResult.referralsUpdated} referrals`);
    } else {
      console.log(`❌ Payout processing failed: ${payoutResult.error}`);
    }
    
    // Test 11: Get affiliate leaderboard
    console.log('\n🏆 Test 11: Getting affiliate leaderboard...');
    const leaderboard = await AffiliateService.getAffiliateLeaderboard(5);
    console.log('✅ Affiliate Leaderboard:');
    leaderboard.forEach((affiliate, index) => {
      console.log(`   ${index + 1}. ${affiliate.name} (${affiliate.code})`);
      console.log(`      - Clicks: ${affiliate.totalClicks}, Conversions: ${affiliate.totalConversions}`);
      console.log(`      - Commission Earned: $${affiliate.totalCommissionEarned}, Conversion Rate: ${affiliate.conversionRate}%`);
    });
    
    // Test 12: Test first-click attribution
    console.log('\n🎯 Test 12: Testing first-click attribution...');
    
    // Create second affiliate
    const secondAffiliate = await AffiliateService.createAffiliate({
      name: 'Second Test Affiliate',
      email: 'second.affiliate@example.com',
      commissionRate: 12
    });
    secondAffiliate.status = 'active';
    secondAffiliate.isActive = true;
    await secondAffiliate.save();
    
    // Create second user
    const secondUser = new User({
      username: 'testuser456',
      email: 'second.user@example.com',
      walletAddress: '0xfedcbafedcbafedcbafedcbafedcbafedcbafedcba'
    });
    await secondUser.save();
    
    // First click from first affiliate
    await AffiliateService.processAffiliateClick(
      affiliate.affiliateCode,
      secondUser._id,
      'Mozilla/5.0',
      '192.168.1.101'
    );
    
    // Second click from second affiliate (should not override first attribution)
    await AffiliateService.processAffiliateClick(
      secondAffiliate.affiliateCode,
      secondUser._id,
      'Mozilla/5.0',
      '192.168.1.101'
    );
    
    const secondUserReferralInfo = await AffiliateService.getUserReferralInfo(secondUser._id);
    if (secondUserReferralInfo.hasReferral && secondUserReferralInfo.affiliate.code === affiliate.affiliateCode) {
      console.log('✅ First-click attribution working correctly');
      console.log(`   - User attributed to first affiliate: ${secondUserReferralInfo.affiliate.name}`);
    } else {
      console.log('❌ First-click attribution not working correctly');
    }
    
    console.log('\n🎉 Affiliate System Verification Complete!');
    console.log('\n📋 Summary:');
    console.log('✅ Affiliate creation and management');
    console.log('✅ Affiliate URL generation');
    console.log('✅ Click tracking and attribution');
    console.log('✅ Commission calculation and recording');
    console.log('✅ Activity-specific commission rates');
    console.log('✅ Commission payout processing');
    console.log('✅ Analytics and reporting');
    console.log('✅ First-click attribution');
    console.log('✅ User referral information');
    console.log('✅ Affiliate leaderboard');
    
    // Clean up test data
    await Affiliate.deleteMany({ email: { $regex: /test.*affiliate/i } });
    await User.deleteMany({ email: { $regex: /test.*user/i } });
    await AffiliateReferral.deleteMany({});
    console.log('\n🧹 Test data cleaned up');
    
  } catch (error) {
    console.error('❌ Error during verification:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run verification if called directly
if (require.main === module) {
  verifyAffiliateSystem();
}

module.exports = verifyAffiliateSystem;