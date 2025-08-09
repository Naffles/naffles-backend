const mongoose = require('mongoose');
const pointsService = require('../services/pointsService');
const achievementService = require('../services/achievementService');
const leaderboardService = require('../services/leaderboardService');
const PointsBalance = require('../models/points/pointsBalance');
const PointsTransaction = require('../models/points/pointsTransaction');
const PointsJackpot = require('../models/points/pointsJackpot');
const Achievement = require('../models/points/achievement');
const UserAchievement = require('../models/points/userAchievement');
const PartnerToken = require('../models/points/partnerToken');
const LeaderboardEntry = require('../models/points/leaderboard');

describe('Points System', () => {
  let testUserId;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/naffles_test');
    }

    // Create a test user ID
    testUserId = new mongoose.Types.ObjectId();
  });

  beforeEach(async () => {
    // Clean up test data
    await Promise.all([
      PointsBalance.deleteMany({}),
      PointsTransaction.deleteMany({}),
      PointsJackpot.deleteMany({}),
      Achievement.deleteMany({}),
      UserAchievement.deleteMany({}),
      PartnerToken.deleteMany({}),
      LeaderboardEntry.deleteMany({})
    ]);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Points Service', () => {
    test('should initialize user points', async () => {
      const pointsBalance = await pointsService.initializeUserPoints(testUserId);
      
      expect(pointsBalance).toBeDefined();
      expect(pointsBalance.userId.toString()).toBe(testUserId.toString());
      expect(pointsBalance.balance).toBe(0);
      expect(pointsBalance.totalEarned).toBe(0);
      expect(pointsBalance.tier).toBe('bronze');
    });

    test('should award points for activity', async () => {
      const result = await pointsService.awardPoints(testUserId, 'gaming_blackjack');
      
      expect(result.pointsAwarded).toBe(5); // Base points for blackjack
      expect(result.newBalance).toBe(5);
      expect(result.multiplier).toBe(1.0);

      // Check transaction was created
      const transaction = await PointsTransaction.findById(result.transaction);
      expect(transaction).toBeDefined();
      expect(transaction.userId.toString()).toBe(testUserId.toString());
      expect(transaction.type).toBe('earned');
      expect(transaction.activity).toBe('gaming_blackjack');
    });

    test('should apply partner token multiplier', async () => {
      // Create a partner token
      const partnerToken = new PartnerToken({
        name: 'Test Token',
        symbol: 'TEST',
        contractAddress: '0x123',
        chainId: '1',
        multiplier: 2.0,
        partnerInfo: { name: 'Test Partner' },
        bonusActivities: { gaming: true }
      });
      await partnerToken.save();

      const result = await pointsService.awardPoints(testUserId, 'gaming_blackjack', {
        tokenContract: '0x123',
        chainId: '1'
      });

      expect(result.pointsAwarded).toBe(10); // 5 * 2.0 multiplier
      expect(result.multiplier).toBe(2.0);
    });

    test('should deduct points', async () => {
      // First award some points
      await pointsService.awardPoints(testUserId, 'gaming_blackjack');
      
      const result = await pointsService.deductPoints(testUserId, 3, 'Test deduction');
      
      expect(result.pointsDeducted).toBe(3);
      expect(result.newBalance).toBe(2);
    });

    test('should not deduct more points than available', async () => {
      await pointsService.awardPoints(testUserId, 'gaming_blackjack'); // 5 points
      
      await expect(
        pointsService.deductPoints(testUserId, 10, 'Test deduction')
      ).rejects.toThrow('Insufficient points balance');
    });

    test('should update user tier based on total earned', async () => {
      // Award enough points to reach silver tier (1000 points)
      for (let i = 0; i < 200; i++) {
        await pointsService.awardPoints(testUserId, 'gaming_blackjack'); // 5 points each
      }

      const pointsBalance = await PointsBalance.findOne({ userId: testUserId });
      expect(pointsBalance.tier).toBe('silver');
      expect(pointsBalance.totalEarned).toBe(1000);
    });
  });

  describe('Achievement Service', () => {
    test('should initialize default achievements', async () => {
      await achievementService.initializeDefaultAchievements();
      
      const achievements = await Achievement.find({ isActive: true });
      expect(achievements.length).toBeGreaterThan(0);
      
      // Check for specific achievements
      const firstGame = achievements.find(a => a.name === 'First Game');
      expect(firstGame).toBeDefined();
      expect(firstGame.category).toBe('gaming');
      expect(firstGame.requirements.threshold).toBe(1);
    });

    test('should track user achievement progress', async () => {
      await achievementService.initializeDefaultAchievements();
      
      // Award points for gaming activity
      await pointsService.awardPoints(testUserId, 'gaming_blackjack');
      
      // Check if achievement progress was updated
      const userAchievement = await UserAchievement.findOne({
        userId: testUserId
      }).populate('achievementId');
      
      expect(userAchievement).toBeDefined();
    });

    test('should get user achievement summary', async () => {
      await achievementService.initializeDefaultAchievements();
      
      const summary = await achievementService.getUserAchievementSummary(testUserId);
      
      expect(summary).toBeDefined();
      expect(summary.totalAchievements).toBeGreaterThan(0);
      expect(summary.completed).toBe(0);
      expect(summary.completionRate).toBe(0);
    });
  });

  describe('Leaderboard Service', () => {
    test('should update user leaderboard entry', async () => {
      // Mock user model for leaderboard
      const User = require('../models/user/user');
      const mockUser = {
        _id: testUserId,
        username: 'testuser',
        walletAddresses: ['0x123']
      };
      
      // Mock User.findById
      jest.spyOn(User, 'findById').mockResolvedValue(mockUser);
      
      await leaderboardService.updateUserEntry(testUserId, 'points', 'all_time', 100);
      
      const entry = await LeaderboardEntry.findOne({
        userId: testUserId,
        category: 'points',
        period: 'all_time'
      });
      
      expect(entry).toBeDefined();
      expect(entry.value).toBe(100);
      expect(entry.username).toBe('testuser');
      
      User.findById.mockRestore();
    });

    test('should get leaderboard', async () => {
      // Create test entries
      const User = require('../models/user/user');
      const mockUser = {
        _id: testUserId,
        username: 'testuser',
        walletAddresses: ['0x123']
      };
      
      jest.spyOn(User, 'findById').mockResolvedValue(mockUser);
      
      await leaderboardService.updateUserEntry(testUserId, 'points', 'all_time', 100);
      await leaderboardService.recalculateRanks('points', 'all_time');
      
      const leaderboard = await leaderboardService.getLeaderboard('points', 'all_time', 10);
      
      expect(leaderboard).toBeDefined();
      expect(leaderboard.entries).toHaveLength(1);
      expect(leaderboard.entries[0].rank).toBe(1);
      expect(leaderboard.entries[0].value).toBe(100);
      
      User.findById.mockRestore();
    });
  });

  describe('Jackpot System', () => {
    test('should initialize jackpot', async () => {
      const jackpotInfo = await pointsService.getJackpotInfo();
      
      expect(jackpotInfo).toBeDefined();
      expect(jackpotInfo.currentAmount).toBe(1000); // Default starting amount
      expect(jackpotInfo.isActive).toBe(true);
    });

    test('should increment jackpot on activity', async () => {
      const initialJackpot = await pointsService.getJackpotInfo();
      
      await pointsService.awardPoints(testUserId, 'gaming_blackjack');
      
      const updatedJackpot = await pointsService.getJackpotInfo();
      expect(updatedJackpot.currentAmount).toBeGreaterThan(initialJackpot.currentAmount);
    });
  });

  describe('Partner Token System', () => {
    test('should create partner token', async () => {
      const tokenData = {
        name: 'Test Token',
        symbol: 'TEST',
        contractAddress: '0x123',
        chainId: '1',
        multiplier: 1.5,
        partnerInfo: {
          name: 'Test Partner',
          description: 'A test partner token'
        },
        bonusActivities: {
          gaming: true,
          raffleTickets: true
        }
      };

      const partnerToken = new PartnerToken(tokenData);
      await partnerToken.save();

      expect(partnerToken).toBeDefined();
      expect(partnerToken.isCurrentlyValid()).toBe(true);
      expect(partnerToken.getMultiplierForActivity('gaming')).toBe(1.5);
    });

    test('should find partner token by contract', async () => {
      const tokenData = {
        name: 'Test Token',
        symbol: 'TEST',
        contractAddress: '0x123',
        chainId: '1',
        multiplier: 1.5,
        partnerInfo: { name: 'Test Partner' }
      };

      await new PartnerToken(tokenData).save();

      const found = await PartnerToken.findByContract('0x123', '1');
      expect(found).toBeDefined();
      expect(found.name).toBe('Test Token');
    });
  });

  describe('Integration Tests', () => {
    test('should complete full points flow with achievements and leaderboards', async () => {
      // Initialize system
      await achievementService.initializeDefaultAchievements();
      
      // Mock user for leaderboard
      const User = require('../models/user/user');
      const mockUser = {
        _id: testUserId,
        username: 'testuser',
        walletAddresses: ['0x123']
      };
      jest.spyOn(User, 'findById').mockResolvedValue(mockUser);

      // Award points for multiple activities
      await pointsService.awardPoints(testUserId, 'gaming_blackjack');
      await pointsService.awardPoints(testUserId, 'raffle_creation');
      await pointsService.awardPoints(testUserId, 'gaming_coin_toss');

      // Check final balance
      const pointsInfo = await pointsService.getUserPointsInfo(testUserId);
      expect(pointsInfo.balance).toBe(58); // 5 + 50 + 3
      expect(pointsInfo.totalEarned).toBe(58);

      // Check achievements
      const achievements = await achievementService.getUserAchievements(testUserId, true);
      expect(achievements.length).toBeGreaterThan(0);

      // Check leaderboard
      await leaderboardService.recalculateRanks('points', 'all_time');
      const position = await leaderboardService.getUserPosition(testUserId, 'points', 'all_time');
      expect(position).toBeDefined();
      expect(position.userEntry.rank).toBe(1);

      User.findById.mockRestore();
    });
  });
});

// Helper function to run tests
if (require.main === module) {
  console.log('Running points system tests...');
  // This would typically be run with Jest: npm test
}