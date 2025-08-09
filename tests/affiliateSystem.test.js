const mongoose = require('mongoose');
const AffiliateService = require('../services/affiliateService');
const Affiliate = require('../models/affiliate/affiliate');
const AffiliateReferral = require('../models/affiliate/affiliateReferral');
const User = require('../models/user/user');

describe('Affiliate System', () => {
  let testAffiliate;
  let testUser;
  
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/naffles_test');
    }
  });
  
  beforeEach(async () => {
    // Clean up test data
    await Affiliate.deleteMany({});
    await AffiliateReferral.deleteMany({});
    await User.deleteMany({});
    
    // Create test user
    testUser = new User({
      username: 'testuser',
      email: 'test@example.com',
      walletAddress: '0x1234567890123456789012345678901234567890'
    });
    await testUser.save();
    
    // Create test affiliate
    testAffiliate = await AffiliateService.createAffiliate({
      name: 'Test Affiliate',
      email: 'affiliate@example.com',
      commissionRate: 10,
      paymentMethod: 'crypto',
      paymentDetails: {
        cryptoAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
        cryptoNetwork: 'ethereum'
      }
    });
    
    // Approve the affiliate
    testAffiliate.status = 'active';
    testAffiliate.isActive = true;
    await testAffiliate.save();
  });
  
  afterAll(async () => {
    await mongoose.connection.close();
  });
  
  describe('Affiliate Creation', () => {
    test('should create affiliate with unique code', async () => {
      const affiliateData = {
        name: 'New Affiliate',
        email: 'new@example.com',
        commissionRate: 5
      };
      
      const affiliate = await AffiliateService.createAffiliate(affiliateData);
      
      expect(affiliate.name).toBe(affiliateData.name);
      expect(affiliate.email).toBe(affiliateData.email);
      expect(affiliate.commissionRate).toBe(affiliateData.commissionRate);
      expect(affiliate.affiliateCode).toBeDefined();
      expect(affiliate.affiliateId).toBeDefined();
    });
    
    test('should generate unique affiliate codes', async () => {
      const affiliate1 = await AffiliateService.createAffiliate({
        name: 'Affiliate One',
        email: 'one@example.com'
      });
      
      const affiliate2 = await AffiliateService.createAffiliate({
        name: 'Affiliate Two',
        email: 'two@example.com'
      });
      
      expect(affiliate1.affiliateCode).not.toBe(affiliate2.affiliateCode);
    });
  });
  
  describe('Affiliate URL Generation', () => {
    test('should generate correct affiliate URL', () => {
      const baseUrl = 'https://naffles.com';
      const path = '/raffles';
      const code = testAffiliate.affiliateCode;
      
      const url = AffiliateService.generateAffiliateUrl(code, baseUrl, path);
      
      expect(url).toBe(`${baseUrl}${path}?ref=${code}`);
    });
    
    test('should handle URL with existing parameters', () => {
      const baseUrl = 'https://naffles.com';
      const path = '/raffles?category=nft';
      const code = testAffiliate.affiliateCode;
      
      const url = AffiliateService.generateAffiliateUrl(code, baseUrl, path);
      
      expect(url).toContain(`ref=${code}`);
      expect(url).toContain('category=nft');
    });
  });
  
  describe('Affiliate Click Processing', () => {
    test('should create new referral on first click', async () => {
      const result = await AffiliateService.processAffiliateClick(
        testAffiliate.affiliateCode,
        testUser._id,
        'Mozilla/5.0',
        '127.0.0.1',
        'direct'
      );
      
      expect(result.success).toBe(true);
      expect(result.affiliate).toBe(testAffiliate.name);
      
      const referral = await AffiliateReferral.findOne({
        userId: testUser._id,
        affiliateId: testAffiliate._id
      });
      
      expect(referral).toBeTruthy();
      expect(referral.totalClicks).toBe(1);
    });
    
    test('should update existing referral on subsequent clicks', async () => {
      // First click
      await AffiliateService.processAffiliateClick(
        testAffiliate.affiliateCode,
        testUser._id,
        'Mozilla/5.0',
        '127.0.0.1',
        'direct'
      );
      
      // Second click
      await AffiliateService.processAffiliateClick(
        testAffiliate.affiliateCode,
        testUser._id,
        'Mozilla/5.0',
        '127.0.0.1',
        'social'
      );
      
      const referral = await AffiliateReferral.findOne({
        userId: testUser._id,
        affiliateId: testAffiliate._id
      });
      
      expect(referral.totalClicks).toBe(2);
      expect(referral.referralSource).toBe('social');
    });
    
    test('should respect first-click attribution', async () => {
      // Create second affiliate
      const secondAffiliate = await AffiliateService.createAffiliate({
        name: 'Second Affiliate',
        email: 'second@example.com'
      });
      secondAffiliate.status = 'active';
      secondAffiliate.isActive = true;
      await secondAffiliate.save();
      
      // First click from first affiliate
      await AffiliateService.processAffiliateClick(
        testAffiliate.affiliateCode,
        testUser._id,
        'Mozilla/5.0',
        '127.0.0.1'
      );
      
      // Second click from second affiliate (should not create new referral)
      await AffiliateService.processAffiliateClick(
        secondAffiliate.affiliateCode,
        testUser._id,
        'Mozilla/5.0',
        '127.0.0.1'
      );
      
      const referrals = await AffiliateReferral.find({ userId: testUser._id });
      expect(referrals).toHaveLength(1);
      expect(referrals[0].affiliateId.toString()).toBe(testAffiliate._id.toString());
    });
  });
  
  describe('Commission Recording', () => {
    beforeEach(async () => {
      // Create referral for commission tests
      await AffiliateService.processAffiliateClick(
        testAffiliate.affiliateCode,
        testUser._id,
        'Mozilla/5.0',
        '127.0.0.1'
      );
    });
    
    test('should record commission for raffle tickets', async () => {
      const amount = 100;
      const transactionId = 'tx_123';
      
      const result = await AffiliateService.recordCommission(
        testUser._id,
        'raffle_ticket',
        amount,
        transactionId
      );
      
      expect(result.success).toBe(true);
      expect(result.commissionAmount).toBe(10); // 10% of 100
      expect(result.activityType).toBe('raffle_ticket');
      
      const referral = await AffiliateReferral.findOne({ userId: testUser._id });
      expect(referral.hasConverted).toBe(true);
      expect(referral.totalConversions).toBe(1);
      expect(referral.totalCommissionEarned).toBe(10);
      expect(referral.activities).toHaveLength(1);
    });
    
    test('should use activity-specific commission rates', async () => {
      // Set gaming-specific rate
      testAffiliate.activityCommissions.gaming.rate = 5;
      testAffiliate.activityCommissions.gaming.enabled = true;
      await testAffiliate.save();
      
      const result = await AffiliateService.recordCommission(
        testUser._id,
        'gaming',
        100,
        'tx_gaming'
      );
      
      expect(result.success).toBe(true);
      expect(result.commissionAmount).toBe(5); // 5% instead of default 10%
    });
    
    test('should not record commission for disabled activities', async () => {
      // Disable deposits
      testAffiliate.activityCommissions.deposits.enabled = false;
      await testAffiliate.save();
      
      const result = await AffiliateService.recordCommission(
        testUser._id,
        'deposits',
        100,
        'tx_deposit'
      );
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('not eligible');
    });
  });
  
  describe('Affiliate Analytics', () => {
    beforeEach(async () => {
      // Create referral and record some activity
      await AffiliateService.processAffiliateClick(
        testAffiliate.affiliateCode,
        testUser._id,
        'Mozilla/5.0',
        '127.0.0.1'
      );
      
      await AffiliateService.recordCommission(
        testUser._id,
        'raffle_ticket',
        100,
        'tx_123'
      );
    });
    
    test('should get affiliate analytics', async () => {
      const analytics = await AffiliateService.getAffiliateAnalytics(testAffiliate._id);
      
      expect(analytics.affiliate.name).toBe(testAffiliate.name);
      expect(analytics.performance.totalReferrals).toBe(1);
      expect(analytics.performance.totalClicks).toBe(1);
      expect(analytics.performance.totalConversions).toBe(1);
      expect(analytics.performance.totalCommissionEarned).toBe(10);
      expect(analytics.performance.conversionRate).toBe(100);
    });
  });
  
  describe('Commission Payouts', () => {
    beforeEach(async () => {
      // Create referral and record commission
      await AffiliateService.processAffiliateClick(
        testAffiliate.affiliateCode,
        testUser._id,
        'Mozilla/5.0',
        '127.0.0.1'
      );
      
      await AffiliateService.recordCommission(
        testUser._id,
        'raffle_ticket',
        100,
        'tx_123'
      );
    });
    
    test('should process commission payouts', async () => {
      const payoutAmount = 5;
      
      const result = await AffiliateService.processCommissionPayouts(
        testAffiliate._id,
        payoutAmount
      );
      
      expect(result.success).toBe(true);
      expect(result.totalPaid).toBe(payoutAmount);
      expect(result.referralsUpdated).toBe(1);
      
      const referral = await AffiliateReferral.findOne({ userId: testUser._id });
      expect(referral.totalCommissionPaid).toBe(payoutAmount);
      
      const updatedAffiliate = await Affiliate.findById(testAffiliate._id);
      expect(updatedAffiliate.totalCommissionPaid).toBe(payoutAmount);
    });
  });
  
  describe('User Referral Info', () => {
    test('should return no referral for user without referral', async () => {
      const info = await AffiliateService.getUserReferralInfo(testUser._id);
      
      expect(info.hasReferral).toBe(false);
    });
    
    test('should return referral info for referred user', async () => {
      await AffiliateService.processAffiliateClick(
        testAffiliate.affiliateCode,
        testUser._id,
        'Mozilla/5.0',
        '127.0.0.1'
      );
      
      const info = await AffiliateService.getUserReferralInfo(testUser._id);
      
      expect(info.hasReferral).toBe(true);
      expect(info.affiliate.name).toBe(testAffiliate.name);
      expect(info.affiliate.code).toBe(testAffiliate.affiliateCode);
      expect(info.isValid).toBe(true);
    });
  });
});