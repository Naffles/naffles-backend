const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Import models and services
const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const CommunityPointsBalance = require('../models/points/communityPointsBalance');
const CommunityPointsTransaction = require('../models/points/communityPointsTransaction');
const CommunityAchievement = require('../models/points/communityAchievement');

const communityManagementService = require('../services/communityManagementService');
const communityPointsService = require('../services/communityPointsService');

describe('Community Points System', () => {
  let mongoServer;
  let testUserId;
  let testCommunityId;
  let nafflesCommunityId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create test user ID
    testUserId = new mongoose.Types.ObjectId();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections
    await Community.deleteMany({});
    await CommunityMember.deleteMany({});
    await CommunityPointsBalance.deleteMany({});
    await CommunityPointsTransaction.deleteMany({});
    await CommunityAchievement.deleteMany({});
  });

  describe('Community Creation', () => {
    test('should create a new community with default settings', async () => {
      const communityData = {
        name: 'Test Community',
        description: 'A test community',
        pointsConfiguration: {
          pointsName: 'Test Points',
          pointsSymbol: 'TP'
        }
      };

      const community = await communityManagementService.createCommunity(testUserId, communityData);

      expect(community.name).toBe('Test Community');
      expect(community.slug).toBe('test-community');
      expect(community.creatorId.toString()).toBe(testUserId.toString());
      expect(community.isNafflesCommunity).toBe(false);
      expect(community.pointsConfiguration.pointsName).toBe('Test Points');
      expect(community.features.enableJackpot).toBe(false);
      expect(community.features.enableSystemWideEarning).toBe(false);

      testCommunityId = community._id;
    });

    test('should create Naffles flagship community', async () => {
      const nafflesCommunity = await Community.createNafflesCommunity();

      expect(nafflesCommunity.name).toBe('Naffles');
      expect(nafflesCommunity.slug).toBe('naffles');
      expect(nafflesCommunity.isNafflesCommunity).toBe(true);
      expect(nafflesCommunity.pointsConfiguration.pointsName).toBe('Naffles Points');
      expect(nafflesCommunity.features.enableJackpot).toBe(true);
      expect(nafflesCommunity.features.enableSystemWideEarning).toBe(true);

      nafflesCommunityId = nafflesCommunity._id;
    });

    test('should create default achievements for new community', async () => {
      const communityData = {
        name: 'Achievement Test Community',
        pointsConfiguration: {
          pointsName: 'Achievement Points'
        }
      };

      const community = await communityManagementService.createCommunity(testUserId, communityData);
      
      const achievements = await CommunityAchievement.find({ communityId: community._id });
      expect(achievements.length).toBeGreaterThan(0);
      
      const welcomeAchievement = achievements.find(a => a.name === 'Welcome!');
      expect(welcomeAchievement).toBeDefined();
      expect(welcomeAchievement.rewards.pointsName).toBe('Achievement Points');
    });
  });

  describe('Community Membership', () => {
    beforeEach(async () => {
      const communityData = {
        name: 'Membership Test Community',
        pointsConfiguration: {
          pointsName: 'Member Points'
        }
      };
      const community = await communityManagementService.createCommunity(testUserId, communityData);
      testCommunityId = community._id;
    });

    test('should allow user to join community', async () => {
      const newUserId = new mongoose.Types.ObjectId();
      
      const membership = await communityManagementService.joinCommunity(newUserId, testCommunityId);
      
      expect(membership.userId.toString()).toBe(newUserId.toString());
      expect(membership.communityId.toString()).toBe(testCommunityId.toString());
      expect(membership.role).toBe('member');
      expect(membership.isActive).toBe(true);

      // Check that points balance was initialized
      const pointsBalance = await CommunityPointsBalance.findOne({
        userId: newUserId,
        communityId: testCommunityId
      });
      expect(pointsBalance).toBeDefined();
      expect(pointsBalance.balance).toBe(0);
    });

    test('should prevent duplicate membership', async () => {
      const newUserId = new mongoose.Types.ObjectId();
      
      await communityManagementService.joinCommunity(newUserId, testCommunityId);
      
      await expect(
        communityManagementService.joinCommunity(newUserId, testCommunityId)
      ).rejects.toThrow('User is already a member of this community');
    });

    test('should allow user to leave community', async () => {
      const newUserId = new mongoose.Types.ObjectId();
      
      await communityManagementService.joinCommunity(newUserId, testCommunityId);
      await communityManagementService.leaveCommunity(newUserId, testCommunityId);
      
      const membership = await CommunityMember.findOne({
        userId: newUserId,
        communityId: testCommunityId
      });
      expect(membership.isActive).toBe(false);
    });
  });

  describe('Community Points System', () => {
    beforeEach(async () => {
      const communityData = {
        name: 'Points Test Community',
        pointsConfiguration: {
          pointsName: 'Test Points',
          pointsSymbol: 'TP',
          activityPointsMap: new Map([
            ['gaming_blackjack', 10],
            ['community_task', 20]
          ])
        }
      };
      const community = await communityManagementService.createCommunity(testUserId, communityData);
      testCommunityId = community._id;
      
      // Join community as member
      const memberUserId = new mongoose.Types.ObjectId();
      await communityManagementService.joinCommunity(memberUserId, testCommunityId);
      testUserId = memberUserId; // Use member for points tests
    });

    test('should award points for community activity', async () => {
      const result = await communityPointsService.awardCommunityPoints(
        testUserId,
        testCommunityId,
        'gaming_blackjack',
        { betAmount: 100 }
      );

      expect(result.pointsAwarded).toBe(10);
      expect(result.newBalance).toBe(10);
      expect(result.multiplier).toBe(1);
      expect(result.pointsName).toBe('Test Points');

      // Check balance was updated
      const balance = await CommunityPointsBalance.findOne({
        userId: testUserId,
        communityId: testCommunityId
      });
      expect(balance.balance).toBe(10);
      expect(balance.totalEarned).toBe(10);

      // Check transaction was created
      const transaction = await CommunityPointsTransaction.findOne({
        userId: testUserId,
        communityId: testCommunityId
      });
      expect(transaction.amount).toBe(10);
      expect(transaction.activity).toBe('gaming_blackjack');
      expect(transaction.pointsName).toBe('Test Points');
    });

    test('should deduct points from user balance', async () => {
      // First award some points
      await communityPointsService.awardCommunityPoints(
        testUserId,
        testCommunityId,
        'gaming_blackjack'
      );

      // Then deduct points
      const result = await communityPointsService.deductCommunityPoints(
        testUserId,
        testCommunityId,
        5,
        'Test deduction'
      );

      expect(result.pointsDeducted).toBe(5);
      expect(result.newBalance).toBe(5);

      const balance = await CommunityPointsBalance.findOne({
        userId: testUserId,
        communityId: testCommunityId
      });
      expect(balance.balance).toBe(5);
      expect(balance.totalSpent).toBe(5);
    });

    test('should prevent deducting more points than available', async () => {
      await expect(
        communityPointsService.deductCommunityPoints(
          testUserId,
          testCommunityId,
          100,
          'Too much'
        )
      ).rejects.toThrow('Insufficient points balance');
    });

    test('should get user points info for community', async () => {
      await communityPointsService.awardCommunityPoints(
        testUserId,
        testCommunityId,
        'community_task'
      );

      const pointsInfo = await communityPointsService.getUserCommunityPointsInfo(
        testUserId,
        testCommunityId
      );

      expect(pointsInfo.balance).toBe(20);
      expect(pointsInfo.pointsName).toBe('Test Points');
      expect(pointsInfo.communityName).toBe('Points Test Community');
      expect(pointsInfo.hasJackpot).toBe(false);
      expect(pointsInfo.recentTransactions).toBeDefined();
    });

    test('should calculate user rank in community', async () => {
      // Create another user with more points
      const user2Id = new mongoose.Types.ObjectId();
      await communityManagementService.joinCommunity(user2Id, testCommunityId);
      
      await communityPointsService.awardCommunityPoints(testUserId, testCommunityId, 'gaming_blackjack'); // 10 points
      await communityPointsService.awardCommunityPoints(user2Id, testCommunityId, 'community_task'); // 20 points

      const rank1 = await communityPointsService.getUserCommunityRank(testUserId, testCommunityId);
      const rank2 = await communityPointsService.getUserCommunityRank(user2Id, testCommunityId);

      expect(rank1).toBe(2); // Lower points, rank 2
      expect(rank2).toBe(1); // Higher points, rank 1
    });

    test('should get community leaderboard', async () => {
      // Create multiple users with different points
      const users = [];
      for (let i = 0; i < 3; i++) {
        const userId = new mongoose.Types.ObjectId();
        await communityManagementService.joinCommunity(userId, testCommunityId);
        await communityPointsService.awardCommunityPoints(
          userId, 
          testCommunityId, 
          'gaming_blackjack'
        );
        users.push(userId);
      }

      const leaderboard = await communityPointsService.getCommunityLeaderboard(testCommunityId);

      expect(leaderboard.length).toBe(3);
      expect(leaderboard[0]._rank).toBe(1);
      expect(leaderboard[1]._rank).toBe(2);
      expect(leaderboard[2]._rank).toBe(3);
    });
  });

  describe('Multi-Community Points', () => {
    let community1Id, community2Id;

    beforeEach(async () => {
      // Create two communities
      const community1 = await communityManagementService.createCommunity(testUserId, {
        name: 'Community 1',
        pointsConfiguration: { pointsName: 'Points 1', pointsSymbol: 'P1' }
      });
      community1Id = community1._id;

      const community2 = await communityManagementService.createCommunity(testUserId, {
        name: 'Community 2',
        pointsConfiguration: { pointsName: 'Points 2', pointsSymbol: 'P2' }
      });
      community2Id = community2._id;

      // Join both communities
      const memberUserId = new mongoose.Types.ObjectId();
      await communityManagementService.joinCommunity(memberUserId, community1Id);
      await communityManagementService.joinCommunity(memberUserId, community2Id);
      testUserId = memberUserId;
    });

    test('should maintain separate points balances per community', async () => {
      // Award points in both communities
      await communityPointsService.awardCommunityPoints(
        testUserId, 
        community1Id, 
        'gaming_blackjack'
      );
      await communityPointsService.awardCommunityPoints(
        testUserId, 
        community2Id, 
        'gaming_blackjack'
      );

      const points1 = await communityPointsService.getUserCommunityPointsInfo(
        testUserId, 
        community1Id
      );
      const points2 = await communityPointsService.getUserCommunityPointsInfo(
        testUserId, 
        community2Id
      );

      expect(points1.balance).toBe(5); // Default activity points
      expect(points2.balance).toBe(5);
      expect(points1.pointsName).toBe('Points 1');
      expect(points2.pointsName).toBe('Points 2');
    });

    test('should get user points summary across all communities', async () => {
      await communityPointsService.awardCommunityPoints(
        testUserId, 
        community1Id, 
        'gaming_blackjack'
      );
      await communityPointsService.awardCommunityPoints(
        testUserId, 
        community2Id, 
        'gaming_blackjack'
      );

      const summary = await communityPointsService.getUserAllCommunityPoints(testUserId);

      expect(summary.totalCommunities).toBe(2);
      expect(summary.communities).toHaveLength(2);
      
      const comm1Summary = summary.communities.find(c => c.pointsName === 'Points 1');
      const comm2Summary = summary.communities.find(c => c.pointsName === 'Points 2');
      
      expect(comm1Summary.balance).toBe(5);
      expect(comm2Summary.balance).toBe(5);
      expect(comm1Summary.hasJackpot).toBe(false);
      expect(comm2Summary.hasJackpot).toBe(false);
    });
  });

  describe('Naffles Community Special Features', () => {
    beforeEach(async () => {
      const nafflesCommunity = await Community.createNafflesCommunity();
      nafflesCommunityId = nafflesCommunity._id;
      
      await communityManagementService.joinCommunity(testUserId, nafflesCommunityId);
    });

    test('should identify Naffles community features', async () => {
      const pointsInfo = await communityPointsService.getUserCommunityPointsInfo(
        testUserId,
        nafflesCommunityId
      );

      expect(pointsInfo.hasJackpot).toBe(true);
      expect(pointsInfo.pointsName).toBe('Naffles Points');
      expect(pointsInfo.pointsSymbol).toBe('NP');
    });

    test('should prevent user communities from enabling Naffles-exclusive features', async () => {
      const communityData = {
        name: 'User Community',
        pointsConfiguration: { pointsName: 'User Points' },
        features: {
          enableJackpot: true, // This should be ignored
          enableSystemWideEarning: true // This should be ignored
        }
      };

      const community = await communityManagementService.createCommunity(testUserId, communityData);

      expect(community.features.enableJackpot).toBe(false);
      expect(community.features.enableSystemWideEarning).toBe(false);
    });
  });

  describe('Permission System', () => {
    beforeEach(async () => {
      const community = await communityManagementService.createCommunity(testUserId, {
        name: 'Permission Test Community',
        pointsConfiguration: { pointsName: 'Permission Points' }
      });
      testCommunityId = community._id;
    });

    test('should allow community creator to manage community', async () => {
      const canManage = await communityManagementService.canUserManageCommunity(
        testUserId, 
        testCommunityId
      );
      expect(canManage).toBe(true);
    });

    test('should prevent non-members from managing community', async () => {
      const randomUserId = new mongoose.Types.ObjectId();
      const canManage = await communityManagementService.canUserManageCommunity(
        randomUserId, 
        testCommunityId
      );
      expect(canManage).toBe(false);
    });

    test('should allow viewing public communities', async () => {
      const randomUserId = new mongoose.Types.ObjectId();
      const canView = await communityManagementService.canUserViewCommunity(
        randomUserId, 
        testCommunityId
      );
      expect(canView).toBe(true); // Default is public
    });
  });
});