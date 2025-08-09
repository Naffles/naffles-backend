const mongoose = require('mongoose');
const unifiedCommunityManagementService = require('../services/unifiedCommunityManagementService');
const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const CommunityPointsBalance = require('../models/points/communityPointsBalance');
const CommunityPointsTransaction = require('../models/points/communityPointsTransaction');
const CommunityAchievement = require('../models/points/communityAchievement');

describe('Unified Community Management System', () => {
  let testNafflesCommunity, testUserCommunity, testAdmin, testUser;

  beforeAll(async () => {
    // Setup test database connection
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/naffles_test');
    }
  });

  beforeEach(async () => {
    // Clean up test data
    await Community.deleteMany({});
    await CommunityMember.deleteMany({});
    await CommunityPointsBalance.deleteMany({});
    await CommunityPointsTransaction.deleteMany({});
    await CommunityAchievement.deleteMany({});

    // Create test admin and user
    testAdmin = {
      id: new mongoose.Types.ObjectId(),
      username: 'testadmin',
      email: 'admin@example.com',
      role: 'naffles_admin'
    };

    testUser = {
      id: new mongoose.Types.ObjectId(),
      username: 'testuser',
      email: 'user@example.com'
    };

    // Initialize the unified system
    await unifiedCommunityManagementService.initialize();

    // Create Naffles community
    testNafflesCommunity = await Community.createNafflesCommunity();

    // Create user community
    testUserCommunity = new Community({
      name: 'Test User Community',
      slug: 'test-user-community',
      creatorId: testUser.id,
      pointsConfiguration: {
        pointsName: 'Creator Points',
        pointsSymbol: 'CP'
      },
      features: {
        enableMarketplace: true,
        enableGaming: true,
        enableRaffles: true,
        enableJackpot: false, // User communities don't have jackpot
        enableSystemWideEarning: false
      }
    });
    await testUserCommunity.save();

    // Create memberships
    await new CommunityMember({
      userId: testUser.id,
      communityId: testNafflesCommunity._id,
      role: 'member'
    }).save();

    await new CommunityMember({
      userId: testUser.id,
      communityId: testUserCommunity._id,
      role: 'creator',
      permissions: {
        canManagePoints: true,
        canManageAchievements: true,
        canManageMembers: true,
        canModerateContent: true,
        canViewAnalytics: true
      }
    }).save();

    // Create points balances
    await new CommunityPointsBalance({
      userId: testUser.id,
      communityId: testNafflesCommunity._id,
      balance: 500,
      totalEarned: 500,
      pointsName: 'Naffles Points',
      isNafflesCommunity: true
    }).save();

    await new CommunityPointsBalance({
      userId: testUser.id,
      communityId: testUserCommunity._id,
      balance: 300,
      totalEarned: 300,
      pointsName: 'Creator Points',
      isNafflesCommunity: false
    }).save();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('System Initialization and Setup', () => {
    test('should initialize unified management system', async () => {
      // System should already be initialized in beforeEach
      expect(unifiedCommunityManagementService.initialized).toBe(true);
      expect(unifiedCommunityManagementService.nafflesCommunityId).toBeDefined();
    });

    test('should create Naffles flagship community with special features', async () => {
      const nafflesCommunity = await Community.findOne({ isNafflesCommunity: true });
      
      expect(nafflesCommunity).toBeDefined();
      expect(nafflesCommunity.name).toBe('Naffles');
      expect(nafflesCommunity.features.enableJackpot).toBe(true);
      expect(nafflesCommunity.features.enableSystemWideEarning).toBe(true);
      expect(nafflesCommunity.pointsConfiguration.pointsName).toBe('Naffles Points');
    });
  });

  describe('Separate Points Systems Management', () => {
    test('should get all communities with their separate points systems', async () => {
      // Mock admin role
      jest.spyOn(unifiedCommunityManagementService, 'getUserRole').mockResolvedValue('naffles_admin');

      const result = await unifiedCommunityManagementService.getAllCommunitiesWithPointsSystems(
        testAdmin.id
      );

      expect(result.communities).toHaveLength(2);
      
      const nafflesCommunity = result.communities.find(c => c.isNafflesCommunity);
      const userCommunity = result.communities.find(c => !c.isNafflesCommunity);

      expect(nafflesCommunity.pointsSystemStats.pointsName).toBe('Naffles Points');
      expect(nafflesCommunity.pointsSystemStats.hasJackpot).toBe(true);
      
      expect(userCommunity.pointsSystemStats.pointsName).toBe('Creator Points');
      expect(userCommunity.pointsSystemStats.hasJackpot).toBe(false);
    });

    test('should award points through unified system with separate tracking', async () => {
      const result = await unifiedCommunityManagementService.awardPointsUnified(
        testUser.id,
        testUserCommunity._id,
        'gaming_blackjack',
        { gameResult: 'win' }
      );

      expect(result.pointsAwarded).toBeGreaterThan(0);
      expect(result.systemType).toBe('user_community');
      expect(result.hasSystemWideFeatures).toBe(false);
      expect(result.pointsName).toBe('Creator Points');

      // Verify points were added to correct community
      const updatedBalance = await CommunityPointsBalance.findOne({
        userId: testUser.id,
        communityId: testUserCommunity._id
      });
      expect(updatedBalance.balance).toBe(300 + result.pointsAwarded);
    });

    test('should handle Naffles system-wide features separately', async () => {
      const result = await unifiedCommunityManagementService.awardPointsUnified(
        testUser.id,
        testNafflesCommunity._id,
        'gaming_blackjack',
        { gameResult: 'win' }
      );

      expect(result.systemType).toBe('naffles_flagship');
      expect(result.hasSystemWideFeatures).toBe(true);
      expect(result.pointsName).toBe('Naffles Points');

      // Verify transaction was marked as system-wide
      const transaction = await CommunityPointsTransaction.findById(result.transaction);
      expect(transaction.isNafflesCommunity).toBe(true);
    });
  });

  describe('Cross-Community Analytics', () => {
    beforeEach(async () => {
      // Create some test transactions
      await new CommunityPointsTransaction({
        userId: testUser.id,
        communityId: testNafflesCommunity._id,
        type: 'earned',
        activity: 'gaming_blackjack',
        amount: 50,
        balanceBefore: 500,
        balanceAfter: 550,
        pointsName: 'Naffles Points',
        isNafflesCommunity: true
      }).save();

      await new CommunityPointsTransaction({
        userId: testUser.id,
        communityId: testUserCommunity._id,
        type: 'earned',
        activity: 'raffle_creation',
        amount: 100,
        balanceBefore: 300,
        balanceAfter: 400,
        pointsName: 'Creator Points',
        isNafflesCommunity: false
      }).save();
    });

    test('should get cross-community analytics showing separate points systems', async () => {
      // Mock admin role
      jest.spyOn(unifiedCommunityManagementService, 'getUserRole').mockResolvedValue('naffles_admin');

      const analytics = await unifiedCommunityManagementService.getCrossCommunityAnalytics(
        testAdmin.id,
        '30d'
      );

      expect(analytics.overview.totalCommunities).toBe(2);
      expect(analytics.overview.separatePointsSystems).toBeGreaterThan(0);
      
      expect(analytics.pointsSystemDistribution).toBeDefined();
      expect(analytics.recentActivity).toBeDefined();
      expect(analytics.topCommunities).toBeDefined();
      
      expect(analytics.systemFeatures.unifiedManagement).toBe(true);
      expect(analytics.systemFeatures.separatePointsSystems).toBe(true);
      expect(analytics.systemFeatures.nafflesExclusiveFeatures).toContain('jackpot');
    });

    test('should show Naffles exclusive features in analytics', async () => {
      // Mock admin role
      jest.spyOn(unifiedCommunityManagementService, 'getUserRole').mockResolvedValue('naffles_admin');

      const analytics = await unifiedCommunityManagementService.getCrossCommunityAnalytics(
        testAdmin.id
      );

      const nafflesSystem = analytics.pointsSystemDistribution.find(
        system => system.systemType === 'Naffles Flagship'
      );
      const userSystem = analytics.pointsSystemDistribution.find(
        system => system.systemType === 'User Community'
      );

      expect(nafflesSystem.hasJackpot).toBe(true);
      expect(userSystem.hasJackpot).toBe(false);
    });
  });

  describe('Community-Specific Achievement Management', () => {
    test('should manage community achievements with custom points naming', async () => {
      const achievementData = {
        name: 'Gaming Master',
        description: 'Win 10 blackjack games',
        category: 'gaming',
        type: 'count',
        requirements: {
          activity: 'gaming_blackjack',
          target: 10,
          condition: 'win'
        },
        rewards: {
          points: 500
        }
      };

      const achievement = await unifiedCommunityManagementService.manageCommunityAchievement(
        testUserCommunity._id,
        testUser.id,
        achievementData
      );

      expect(achievement.name).toBe('Gaming Master');
      expect(achievement.communityId.toString()).toBe(testUserCommunity._id.toString());
      expect(achievement.rewards.pointsName).toBe('Creator Points');
      expect(achievement.isNafflesCommunity).toBe(false);
    });

    test('should prevent unauthorized achievement management', async () => {
      const unauthorizedUser = new mongoose.Types.ObjectId();
      
      const achievementData = {
        name: 'Unauthorized Achievement',
        description: 'This should fail'
      };

      await expect(
        unifiedCommunityManagementService.manageCommunityAchievement(
          testUserCommunity._id,
          unauthorizedUser,
          achievementData
        )
      ).rejects.toThrow('Insufficient permissions');
    });
  });

  describe('Community Leaderboard with Custom Branding', () => {
    test('should get community leaderboard with custom points naming', async () => {
      const leaderboard = await unifiedCommunityManagementService.getCommunityLeaderboardWithBranding(
        testUserCommunity._id
      );

      expect(leaderboard.communityName).toBe('Test User Community');
      expect(leaderboard.pointsName).toBe('Creator Points');
      expect(leaderboard.pointsSymbol).toBe('CP');
      expect(leaderboard.isNafflesCommunity).toBe(false);
      expect(leaderboard.hasJackpot).toBe(false);
      expect(leaderboard.leaderboard).toBeDefined();
    });

    test('should show Naffles branding for Naffles community', async () => {
      const leaderboard = await unifiedCommunityManagementService.getCommunityLeaderboardWithBranding(
        testNafflesCommunity._id
      );

      expect(leaderboard.communityName).toBe('Naffles');
      expect(leaderboard.pointsName).toBe('Naffles Points');
      expect(leaderboard.pointsSymbol).toBe('NP');
      expect(leaderboard.isNafflesCommunity).toBe(true);
      expect(leaderboard.hasJackpot).toBe(true);
    });
  });

  describe('Unified Management Dashboard', () => {
    test('should get unified management dashboard', async () => {
      // Mock admin role
      jest.spyOn(unifiedCommunityManagementService, 'getUserRole').mockResolvedValue('naffles_admin');

      const dashboard = await unifiedCommunityManagementService.getUnifiedManagementDashboard(
        testAdmin.id
      );

      expect(dashboard.overview).toBeDefined();
      expect(dashboard.recentCommunities).toBeDefined();
      expect(dashboard.systemHealth).toBeDefined();
      expect(dashboard.features.unifiedManagement).toBe(true);
      expect(dashboard.features.separatePointsSystems).toBe(true);
      expect(dashboard.nafflesCommunityId).toBeDefined();
    });

    test('should prevent unauthorized access to dashboard', async () => {
      // Mock regular user role
      jest.spyOn(unifiedCommunityManagementService, 'getUserRole').mockResolvedValue('user');

      await expect(
        unifiedCommunityManagementService.getUnifiedManagementDashboard(testUser.id)
      ).rejects.toThrow('Insufficient permissions');
    });
  });

  describe('System Health and Monitoring', () => {
    test('should get system health metrics', async () => {
      const health = await unifiedCommunityManagementService.getSystemHealthMetrics();

      expect(health.totalCommunities).toBeGreaterThan(0);
      expect(health.totalUsers).toBeGreaterThan(0);
      expect(health.totalPointsBalances).toBeGreaterThan(0);
      expect(health.systemStatus).toBe('healthy');
      expect(health.lastUpdated).toBeDefined();
    });
  });

  describe('Migration Support', () => {
    test('should perform dry run migration', async () => {
      const result = await unifiedCommunityManagementService.migrateNafflesToUnified(true);

      expect(result.dryRun).toBe(true);
      expect(result.wouldMigrate).toBeDefined();
      expect(result.nafflesCommunityId).toBeDefined();
    });
  });

  describe('Permission System Integration', () => {
    test('should check community achievement management permissions', async () => {
      const canManage = await unifiedCommunityManagementService.canUserManageCommunityAchievements(
        testUser.id,
        testUserCommunity._id
      );

      expect(canManage).toBe(true); // User is creator of community
    });

    test('should deny achievement management for non-members', async () => {
      const nonMember = new mongoose.Types.ObjectId();
      
      const canManage = await unifiedCommunityManagementService.canUserManageCommunityAchievements(
        nonMember,
        testUserCommunity._id
      );

      expect(canManage).toBe(false);
    });
  });

  describe('Jackpot Integration (Naffles Only)', () => {
    test('should handle jackpot for Naffles community only', async () => {
      // Mock the pointsService methods
      const mockIncrementJackpot = jest.fn();
      const mockCheckJackpotWin = jest.fn();
      
      const pointsService = require('../services/pointsService');
      pointsService.incrementJackpot = mockIncrementJackpot;
      pointsService.checkJackpotWin = mockCheckJackpotWin;

      // Award points in Naffles community
      await unifiedCommunityManagementService.awardPointsUnified(
        testUser.id,
        testNafflesCommunity._id,
        'gaming_blackjack'
      );

      // Jackpot methods should be called for Naffles community
      expect(mockIncrementJackpot).toHaveBeenCalled();
      expect(mockCheckJackpotWin).toHaveBeenCalled();

      // Reset mocks
      mockIncrementJackpot.mockClear();
      mockCheckJackpotWin.mockClear();

      // Award points in user community
      await unifiedCommunityManagementService.awardPointsUnified(
        testUser.id,
        testUserCommunity._id,
        'gaming_blackjack'
      );

      // Jackpot methods should NOT be called for user community
      expect(mockIncrementJackpot).not.toHaveBeenCalled();
      expect(mockCheckJackpotWin).not.toHaveBeenCalled();
    });
  });
});