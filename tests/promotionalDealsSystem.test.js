const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const TestEnvironment = require('./testEnvironment');

// Import services and models
const PromotionService = require('../services/promotions/promotionService');
const FeeCalculationEngine = require('../services/promotions/feeCalculationEngine');
const BonusCreditsEngine = require('../services/promotions/bonusCreditsEngine');
const FraudPreventionService = require('../services/promotions/fraudPreventionService');
const PromotionIntegrationService = require('../services/promotions/promotionIntegrationService');

const Promotion = require('../models/promotions/promotion');
const UserPromotion = require('../models/promotions/userPromotion');
const BonusCreditsBalance = require('../models/promotions/bonusCreditsBalance');
const ActivityTracker = require('../models/promotions/activityTracker');
const User = require('../models/user/user');

describe('Promotional Deals System', () => {
  let testEnv;
  let testUser;
  let adminUser;
  let testPromotion;
  let promotionService;
  let feeCalculationEngine;
  let bonusCreditsEngine;
  let fraudPreventionService;
  let integrationService;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    await testEnv.setup();
    
    // Initialize services
    promotionService = new PromotionService();
    feeCalculationEngine = new FeeCalculationEngine();
    bonusCreditsEngine = new BonusCreditsEngine();
    fraudPreventionService = new FraudPreventionService();
    integrationService = new PromotionIntegrationService();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    // Create test users
    testUser = await testEnv.createTestUser({
      username: 'testuser',
      email: 'test@example.com',
      walletAddresses: ['0x1234567890123456789012345678901234567890']
    });

    adminUser = await testEnv.createTestUser({
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin'
    });

    // Create test promotion
    testPromotion = await promotionService.createPromotion({
      name: 'Test Fee Discount',
      description: 'Test promotion for fee discounts',
      type: 'fee_discount',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      feeDiscountConfig: {
        discountPercentage: 20,
        applicableFeeTypes: ['raffle_fee', 'house_fee'],
        maxUsageCount: 5,
        usageResetPeriod: 'monthly'
      },
      targetingCriteria: {
        userType: 'all_users'
      },
      fraudPreventionConfig: {
        maxUsagePerUser: 5,
        cooldownPeriod: 1,
        requiresManualApproval: false
      }
    }, adminUser._id);
  });

  afterEach(async () => {
    // Clean up test data
    await Promotion.deleteMany({});
    await UserPromotion.deleteMany({});
    await BonusCreditsBalance.deleteMany({});
    await ActivityTracker.deleteMany({});
    await User.deleteMany({});
  });

  describe('Promotion Service', () => {
    test('should create a promotion successfully', async () => {
      const promotionData = {
        name: 'New Test Promotion',
        description: 'A new test promotion',
        type: 'deposit_bonus',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        depositBonusConfig: {
          bonusPercentage: 10,
          maxBonusAmount: 100,
          minDepositAmount: 50,
          expiryDays: 30
        },
        targetingCriteria: {
          userType: 'new_users'
        },
        fraudPreventionConfig: {
          maxUsagePerUser: 1,
          cooldownPeriod: 24,
          requiresManualApproval: false
        }
      };

      const promotion = await promotionService.createPromotion(promotionData, adminUser._id);

      expect(promotion).toBeDefined();
      expect(promotion.name).toBe(promotionData.name);
      expect(promotion.type).toBe(promotionData.type);
      expect(promotion.status).toBe('draft');
    });

    test('should activate a promotion', async () => {
      const activatedPromotion = await promotionService.activatePromotion(testPromotion._id);

      expect(activatedPromotion.status).toBe('active');
    });

    test('should assign promotion to user', async () => {
      await promotionService.activatePromotion(testPromotion._id);
      
      const userPromotion = await promotionService.assignPromotionToUser(
        testPromotion._id,
        testUser._id,
        'admin'
      );

      expect(userPromotion).toBeDefined();
      expect(userPromotion.userId.toString()).toBe(testUser._id.toString());
      expect(userPromotion.promotionId.toString()).toBe(testPromotion._id.toString());
      expect(userPromotion.status).toBe('active');
    });

    test('should get user promotions', async () => {
      await promotionService.activatePromotion(testPromotion._id);
      await promotionService.assignPromotionToUser(testPromotion._id, testUser._id, 'admin');

      const userPromotions = await promotionService.getUserPromotions(testUser._id);

      expect(userPromotions).toHaveLength(1);
      expect(userPromotions[0].promotionId.name).toBe(testPromotion.name);
    });

    test('should get best promotion for user', async () => {
      await promotionService.activatePromotion(testPromotion._id);
      await promotionService.assignPromotionToUser(testPromotion._id, testUser._id, 'admin');

      const bestPromotion = await promotionService.getBestPromotionForUser(
        testUser._id,
        'fee_calculation',
        { originalFee: 100, feeType: 'raffle_fee' }
      );

      expect(bestPromotion).toBeDefined();
      expect(bestPromotion.savings).toBe(20); // 20% of 100
    });
  });

  describe('Fee Calculation Engine', () => {
    test('should calculate fee with promotion discount', async () => {
      await promotionService.activatePromotion(testPromotion._id);
      await promotionService.assignPromotionToUser(testPromotion._id, testUser._id, 'admin');

      const feeCalculation = await feeCalculationEngine.calculateFeeWithPromotions(
        testUser._id,
        {
          originalFee: 100,
          feeType: 'raffle_fee',
          transactionId: new mongoose.Types.ObjectId()
        }
      );

      expect(feeCalculation.originalFee).toBe(100);
      expect(feeCalculation.discountAmount).toBe(20);
      expect(feeCalculation.finalFee).toBe(80);
      expect(feeCalculation.discountPercentage).toBe(20);
      expect(feeCalculation.appliedPromotion).toBeDefined();
    });

    test('should not apply discount for non-applicable fee types', async () => {
      await promotionService.activatePromotion(testPromotion._id);
      await promotionService.assignPromotionToUser(testPromotion._id, testUser._id, 'admin');

      const feeCalculation = await feeCalculationEngine.calculateFeeWithPromotions(
        testUser._id,
        {
          originalFee: 100,
          feeType: 'withdrawal_fee', // Not in applicableFeeTypes
          transactionId: new mongoose.Types.ObjectId()
        }
      );

      expect(feeCalculation.originalFee).toBe(100);
      expect(feeCalculation.discountAmount).toBe(0);
      expect(feeCalculation.finalFee).toBe(100);
      expect(feeCalculation.appliedPromotion).toBeNull();
    });

    test('should validate fee discount correctly', async () => {
      await promotionService.activatePromotion(testPromotion._id);
      await promotionService.assignPromotionToUser(testPromotion._id, testUser._id, 'admin');

      const validation = await feeCalculationEngine.validateFeeDiscount(
        testUser._id,
        testPromotion._id,
        {
          originalFee: 100,
          feeType: 'raffle_fee'
        }
      );

      expect(validation.valid).toBe(true);
      expect(validation.discountAmount).toBe(20);
      expect(validation.finalFee).toBe(80);
    });
  });

  describe('Bonus Credits Engine', () => {
    test('should award deposit bonus', async () => {
      // Create deposit bonus promotion
      const bonusPromotion = await promotionService.createPromotion({
        name: 'Deposit Bonus Test',
        description: 'Test deposit bonus',
        type: 'deposit_bonus',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        depositBonusConfig: {
          bonusPercentage: 10,
          maxBonusAmount: 100,
          minDepositAmount: 50,
          expiryDays: 30
        },
        targetingCriteria: {
          userType: 'all_users'
        },
        fraudPreventionConfig: {
          maxUsagePerUser: 1,
          cooldownPeriod: 24,
          requiresManualApproval: false
        }
      }, adminUser._id);

      await promotionService.activatePromotion(bonusPromotion._id);
      await promotionService.assignPromotionToUser(bonusPromotion._id, testUser._id, 'admin');

      const bonusResult = await bonusCreditsEngine.awardDepositBonus(
        testUser._id,
        {
          depositAmount: 200,
          tokenInfo: {
            tokenContract: '0xA0b86a33E6441e6e80D0c4C34F4f5c0e2b2c2c2c',
            tokenSymbol: 'USDC',
            blockchain: 'ethereum'
          },
          transactionId: new mongoose.Types.ObjectId()
        }
      );

      expect(bonusResult.bonusAwarded).toBe(true);
      expect(bonusResult.bonusAmount).toBe(20); // 10% of 200
    });

    test('should use bonus credits for gambling', async () => {
      // First award some bonus credits
      const bonusBalance = new BonusCreditsBalance({ userId: testUser._id });
      await bonusBalance.addCredits(
        {
          tokenContract: '0xA0b86a33E6441e6e80D0c4C34F4f5c0e2b2c2c2c',
          tokenSymbol: 'USDC',
          blockchain: 'ethereum'
        },
        50,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        testPromotion._id
      );

      const usageResult = await bonusCreditsEngine.useBonusCreditsForGambling(
        testUser._id,
        {
          tokenContract: '0xA0b86a33E6441e6e80D0c4C34F4f5c0e2b2c2c2c',
          blockchain: 'ethereum',
          amount: 25,
          transactionId: new mongoose.Types.ObjectId(),
          gameType: 'blackjack',
          description: 'Blackjack game bet'
        }
      );

      expect(usageResult.success).toBe(true);
      expect(usageResult.amountUsed).toBe(25);
      expect(usageResult.remainingBalance).toBe(25);
    });

    test('should get user bonus credits balance', async () => {
      const bonusBalance = new BonusCreditsBalance({ userId: testUser._id });
      await bonusBalance.addCredits(
        {
          tokenContract: '0xA0b86a33E6441e6e80D0c4C34F4f5c0e2b2c2c2c',
          tokenSymbol: 'USDC',
          blockchain: 'ethereum'
        },
        100,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        testPromotion._id
      );

      const balance = await bonusCreditsEngine.getUserBonusCreditsBalance(testUser._id);

      expect(balance.totalBalance).toBe(100);
      expect(balance.hasCredits).toBe(true);
      expect(balance.balances).toHaveLength(1);
      expect(balance.balances[0].tokenSymbol).toBe('USDC');
    });
  });

  describe('Fraud Prevention Service', () => {
    test('should analyze user for fraud', async () => {
      await promotionService.activatePromotion(testPromotion._id);
      await promotionService.assignPromotionToUser(testPromotion._id, testUser._id, 'admin');

      const analysis = await fraudPreventionService.analyzePromotionUsage(testUser._id);

      expect(analysis).toBeDefined();
      expect(analysis.userId).toBe(testUser._id.toString());
      expect(analysis.riskScore).toBeGreaterThanOrEqual(0);
      expect(analysis.riskLevel).toMatch(/^(low|medium|high)$/);
      expect(Array.isArray(analysis.flags)).toBe(true);
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });

    test('should flag user promotion for fraud', async () => {
      await promotionService.activatePromotion(testPromotion._id);
      const userPromotion = await promotionService.assignPromotionToUser(testPromotion._id, testUser._id, 'admin');

      const flagResult = await fraudPreventionService.flagUserPromotionForFraud(
        userPromotion._id,
        {
          flagType: 'suspicious_usage',
          description: 'Test fraud flag',
          flaggedBy: 'test_system',
          severity: 'medium'
        }
      );

      expect(flagResult.success).toBe(true);
      expect(flagResult.flagType).toBe('suspicious_usage');
    });

    test('should get fraud statistics', async () => {
      const stats = await fraudPreventionService.getFraudStatistics();

      expect(stats).toBeDefined();
      expect(stats.fraudFlags).toBeDefined();
      expect(stats.activityFraud).toBeDefined();
      expect(stats.calculatedAt).toBeDefined();
    });
  });

  describe('Integration Service', () => {
    test('should get enhanced user balance', async () => {
      // Create token balance for user
      const TokenBalance = require('../models/user/tokenBalance');
      await TokenBalance.create({
        userId: testUser._id,
        tokenContract: '0xA0b86a33E6441e6e80D0c4C34F4f5c0e2b2c2c2c',
        tokenSymbol: 'USDC',
        blockchain: 'ethereum',
        balance: 1000
      });

      // Add bonus credits
      const bonusBalance = new BonusCreditsBalance({ userId: testUser._id });
      await bonusBalance.addCredits(
        {
          tokenContract: '0xA0b86a33E6441e6e80D0c4C34F4f5c0e2b2c2c2c',
          tokenSymbol: 'USDC',
          blockchain: 'ethereum'
        },
        100,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        testPromotion._id
      );

      const enhancedBalance = await integrationService.getEnhancedUserBalance(testUser._id);

      expect(enhancedBalance).toBeDefined();
      expect(enhancedBalance.balances).toHaveLength(1);
      expect(enhancedBalance.balances[0].regularBalance).toBe(1000);
      expect(enhancedBalance.balances[0].bonusCredits).toBe(100);
      expect(enhancedBalance.balances[0].totalAvailable).toBe(1100);
      expect(enhancedBalance.balances[0].hasBonusCredits).toBe(true);
    });

    test('should process transaction with promotions', async () => {
      await promotionService.activatePromotion(testPromotion._id);
      await promotionService.assignPromotionToUser(testPromotion._id, testUser._id, 'admin');

      const transactionResult = await integrationService.processTransactionWithPromotions(
        testUser._id,
        {
          transactionType: 'fee_payment',
          amount: 100,
          tokenInfo: {
            tokenContract: '0xA0b86a33E6441e6e80D0c4C34F4f5c0e2b2c2c2c',
            tokenSymbol: 'USDC',
            blockchain: 'ethereum'
          },
          feeType: 'raffle_fee',
          originalFee: 50,
          transactionId: new mongoose.Types.ObjectId()
        }
      );

      expect(transactionResult).toBeDefined();
      expect(transactionResult.finalFee).toBe(40); // 50 - 20% discount
      expect(transactionResult.totalSavings).toBe(10);
      expect(transactionResult.promotionsApplied).toHaveLength(1);
    });

    test('should perform maintenance cleanup', async () => {
      // Create expired promotion
      const expiredPromotion = await promotionService.createPromotion({
        name: 'Expired Promotion',
        description: 'This promotion is expired',
        type: 'fee_discount',
        startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        feeDiscountConfig: {
          discountPercentage: 10,
          applicableFeeTypes: ['raffle_fee']
        },
        targetingCriteria: {
          userType: 'all_users'
        },
        fraudPreventionConfig: {
          maxUsagePerUser: 1,
          cooldownPeriod: 24,
          requiresManualApproval: false
        }
      }, adminUser._id);

      await promotionService.activatePromotion(expiredPromotion._id);

      const cleanupResult = await integrationService.performMaintenanceCleanup();

      expect(cleanupResult).toBeDefined();
      expect(cleanupResult.expiredPromotions).toBeGreaterThanOrEqual(1);
      expect(cleanupResult.cleanupDate).toBeDefined();
    });
  });

  describe('API Endpoints', () => {
    test('should create promotion via API', async () => {
      const promotionData = {
        name: 'API Test Promotion',
        description: 'Test promotion created via API',
        type: 'fee_discount',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        feeDiscountConfig: {
          discountPercentage: 15,
          applicableFeeTypes: ['raffle_fee'],
          maxUsageCount: 3,
          usageResetPeriod: 'monthly'
        },
        targetingCriteria: {
          userType: 'all_users'
        },
        fraudPreventionConfig: {
          maxUsagePerUser: 3,
          cooldownPeriod: 1,
          requiresManualApproval: false
        }
      };

      const response = await request(app)
        .post('/api/admin/promotions/promotions')
        .set('Authorization', `Bearer ${testEnv.generateJWT(adminUser)}`)
        .send(promotionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(promotionData.name);
    });

    test('should get promotions dashboard', async () => {
      const response = await request(app)
        .get('/api/admin/promotions/dashboard')
        .set('Authorization', `Bearer ${testEnv.generateJWT(adminUser)}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.summary).toBeDefined();
      expect(response.body.data.analytics).toBeDefined();
    });

    test('should list promotions', async () => {
      const response = await request(app)
        .get('/api/admin/promotions/promotions')
        .set('Authorization', `Bearer ${testEnv.generateJWT(adminUser)}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.promotions).toBeDefined();
      expect(response.body.data.pagination).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    test('should handle multiple concurrent promotion assignments', async () => {
      await promotionService.activatePromotion(testPromotion._id);

      // Create multiple test users
      const users = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          testEnv.createTestUser({
            username: `perftest${i}`,
            email: `perftest${i}@example.com`
          })
        )
      );

      // Assign promotion to all users concurrently
      const startTime = Date.now();
      const assignments = await Promise.all(
        users.map(user =>
          promotionService.assignPromotionToUser(testPromotion._id, user._id, 'admin')
        )
      );
      const endTime = Date.now();

      expect(assignments).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle multiple concurrent fee calculations', async () => {
      await promotionService.activatePromotion(testPromotion._id);
      await promotionService.assignPromotionToUser(testPromotion._id, testUser._id, 'admin');

      const calculations = Array.from({ length: 100 }, () => ({
        originalFee: Math.random() * 100 + 10,
        feeType: 'raffle_fee'
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        calculations.map(calc =>
          feeCalculationEngine.calculateFeeWithPromotions(testUser._id, {
            ...calc,
            transactionId: new mongoose.Types.ObjectId()
          })
        )
      );
      const endTime = Date.now();

      expect(results).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
      
      // Verify all calculations applied discount
      results.forEach(result => {
        expect(result.discountAmount).toBeGreaterThan(0);
        expect(result.appliedPromotion).toBeDefined();
      });
    });
  });

  describe('Security Tests', () => {
    test('should prevent unauthorized promotion creation', async () => {
      const promotionData = {
        name: 'Unauthorized Promotion',
        description: 'This should not be created',
        type: 'fee_discount',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };

      await request(app)
        .post('/api/admin/promotions/promotions')
        .set('Authorization', `Bearer ${testEnv.generateJWT(testUser)}`) // Regular user, not admin
        .send(promotionData)
        .expect(403);
    });

    test('should validate promotion configuration', async () => {
      const invalidPromotionData = {
        name: 'Invalid Promotion',
        description: 'This has invalid config',
        type: 'fee_discount',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        feeDiscountConfig: {
          discountPercentage: 150, // Invalid: > 100%
          applicableFeeTypes: []   // Invalid: empty array
        }
      };

      await expect(
        promotionService.createPromotion(invalidPromotionData, adminUser._id)
      ).rejects.toThrow();
    });

    test('should prevent bonus credits manipulation', async () => {
      const bonusBalance = new BonusCreditsBalance({ userId: testUser._id });
      await bonusBalance.addCredits(
        {
          tokenContract: '0xA0b86a33E6441e6e80D0c4C34F4f5c0e2b2c2c2c',
          tokenSymbol: 'USDC',
          blockchain: 'ethereum'
        },
        50,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        testPromotion._id
      );

      // Try to use more credits than available
      await expect(
        bonusCreditsEngine.useBonusCreditsForGambling(testUser._id, {
          tokenContract: '0xA0b86a33E6441e6e80D0c4C34F4f5c0e2b2c2c2c',
          blockchain: 'ethereum',
          amount: 100, // More than available (50)
          transactionId: new mongoose.Types.ObjectId(),
          gameType: 'blackjack'
        })
      ).rejects.toThrow('Insufficient bonus credits');
    });
  });
});

module.exports = {
  testSuite: 'Promotional Deals System',
  description: 'Comprehensive test suite for the promotional deals system including unit tests, integration tests, performance tests, and security tests'
};