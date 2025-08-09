const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index'); // Assuming main app file
const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const Raffle = require('../models/raffle/raffle');
const HouseSlot = require('../models/game/houseSlot');
const GameSession = require('../models/game/gameSession');
const communityGamblingService = require('../services/communityGamblingService');

describe('Community Gambling Integration System', () => {
  let testUser, testAdmin, testCommunity, authToken, adminToken;

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
    await Raffle.deleteMany({});
    await HouseSlot.deleteMany({});
    await GameSession.deleteMany({});

    // Create test users
    testUser = {
      id: new mongoose.Types.ObjectId(),
      username: 'testuser',
      email: 'test@example.com'
    };

    testAdmin = {
      id: new mongoose.Types.ObjectId(),
      username: 'testadmin',
      email: 'admin@example.com'
    };

    // Create test community with gambling features enabled
    testCommunity = new Community({
      name: 'Gambling Test Community',
      slug: 'gambling-test-community',
      creatorId: testAdmin.id,
      pointsConfiguration: {
        pointsName: 'Gambling Points',
        pointsSymbol: 'GP'
      },
      features: {
        enableGaming: true,
        enableRaffles: true,
        enableMarketplace: false
      }
    });
    await testCommunity.save();

    // Create memberships
    const adminMembership = new CommunityMember({
      userId: testAdmin.id,
      communityId: testCommunity._id,
      role: 'creator',
      permissions: {
        canManagePoints: true,
        canManageAchievements: true,
        canManageMembers: true,
        canModerateContent: true,
        canViewAnalytics: true
      }
    });
    await adminMembership.save();

    const userMembership = new CommunityMember({
      userId: testUser.id,
      communityId: testCommunity._id,
      role: 'member'
    });
    await userMembership.save();

    // Mock auth tokens
    authToken = 'mock-auth-token';
    adminToken = 'mock-admin-token';
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Community-Specific Raffles', () => {
    test('should create community NFT raffle', async () => {
      const raffleData = {
        title: 'Community NFT Raffle',
        description: 'Win an exclusive community NFT',
        type: 'nft',
        prizeDescription: 'Rare Community Badge NFT',
        ticketPrice: 10, // Community points
        maxTickets: 100,
        duration: 7 * 24 * 60 * 60 * 1000, // 7 days
        allowCommunityPoints: true
      };

      const raffle = await communityGamblingService.createCommunityRaffle(
        testCommunity._id,
        testAdmin.id,
        raffleData
      );

      expect(raffle).toBeDefined();
      expect(raffle.title).toBe('Community NFT Raffle');
      expect(raffle.type).toBe('nft');
      expect(raffle.communityId.toString()).toBe(testCommunity._id.toString());
      expect(raffle.isCommunityRaffle).toBe(true);
      expect(raffle.allowCommunityPoints).toBe(true);
      expect(raffle.communityPointsName).toBe('Gambling Points');
    });

    test('should create community allowlist raffle with VRF', async () => {
      const allowlistData = {
        title: 'Exclusive Project Allowlist',
        description: 'Get on the allowlist for our upcoming NFT drop',
        prizeDescription: '50 allowlist spots available',
        ticketPrice: 25,
        maxTickets: 200,
        duration: 3 * 24 * 60 * 60 * 1000, // 3 days
        allowlistSpots: 50
      };

      const raffle = await communityGamblingService.createCommunityAllowlistRaffle(
        testCommunity._id,
        testAdmin.id,
        allowlistData
      );

      expect(raffle.type).toBe('allowlist');
      expect(raffle.useVRF).toBe(true);
      expect(raffle.vrfConfiguration).toBeDefined();
      expect(raffle.vrfConfiguration.network).toBe('polygon');
      expect(raffle.communityMemberPriority).toBe(true);
    });

    test('should prevent non-admin from creating community raffles', async () => {
      const raffleData = {
        title: 'Unauthorized Raffle',
        type: 'nft',
        ticketPrice: 10,
        maxTickets: 50
      };

      await expect(
        communityGamblingService.createCommunityRaffle(
          testCommunity._id,
          testUser.id,
          raffleData
        )
      ).rejects.toThrow('Insufficient permissions to create community raffles');
    });

    test('should prevent raffle creation when feature is disabled', async () => {
      // Disable raffles for the community
      testCommunity.features.enableRaffles = false;
      await testCommunity.save();

      const raffleData = {
        title: 'Disabled Feature Raffle',
        type: 'nft',
        ticketPrice: 10,
        maxTickets: 50
      };

      await expect(
        communityGamblingService.createCommunityRaffle(
          testCommunity._id,
          testAdmin.id,
          raffleData
        )
      ).rejects.toThrow('Raffles are not enabled for this community');
    });
  });

  describe('Community Gaming Sessions', () => {
    test('should create community gaming session', async () => {
      const gameConfig = {
        gameType: 'blackjack',
        name: 'Community Blackjack Night',
        description: 'Weekly blackjack tournament for community members',
        maxPlayers: 10,
        minBetCommunityPoints: 5,
        maxBetCommunityPoints: 500,
        houseEdge: 0.01,
        duration: 2 * 60 * 60 * 1000 // 2 hours
      };

      const gameSession = await communityGamblingService.createCommunityGamingSession(
        testCommunity._id,
        testAdmin.id,
        gameConfig
      );

      expect(gameSession).toBeDefined();
      expect(gameSession.gameType).toBe('blackjack');
      expect(gameSession.communityId.toString()).toBe(testCommunity._id.toString());
      expect(gameSession.isCommunityGame).toBe(true);
      expect(gameSession.allowedCurrencies).toContainEqual(
        expect.objectContaining({
          type: 'community_points',
          name: 'Gambling Points'
        })
      );
      expect(gameSession.communitySettings.maxBetCommunityPoints).toBe(500);
    });

    test('should create coin toss gaming session', async () => {
      const gameConfig = {
        gameType: 'coin_toss',
        name: 'Quick Coin Toss',
        description: 'Fast-paced coin toss betting',
        minBetCommunityPoints: 1,
        maxBetCommunityPoints: 100,
        houseEdge: 0.02
      };

      const gameSession = await communityGamblingService.createCommunityGamingSession(
        testCommunity._id,
        testAdmin.id,
        gameConfig
      );

      expect(gameSession.gameType).toBe('coin_toss');
      expect(gameSession.communitySettings.houseEdge).toBe(0.02);
    });

    test('should prevent gaming session creation when feature is disabled', async () => {
      // Disable gaming for the community
      testCommunity.features.enableGaming = false;
      await testCommunity.save();

      const gameConfig = {
        gameType: 'blackjack',
        name: 'Disabled Gaming Session'
      };

      await expect(
        communityGamblingService.createCommunityGamingSession(
          testCommunity._id,
          testAdmin.id,
          gameConfig
        )
      ).rejects.toThrow('Gaming is not enabled for this community');
    });
  });

  describe('Community House Slot Management', () => {
    test('should fund community house slot', async () => {
      const houseSlotData = {
        name: 'Community House Slot #1',
        gameTypes: ['blackjack', 'coin_toss'],
        initialFunding: {
          communityPoints: 10000
        },
        communityPointsBalance: 10000,
        profitSharingEnabled: true,
        communityProfitShare: 0.15, // 15% to community
        memberOnlyAccess: true
      };

      const houseSlot = await communityGamblingService.fundCommunityHouseSlot(
        testCommunity._id,
        testAdmin.id,
        houseSlotData
      );

      expect(houseSlot).toBeDefined();
      expect(houseSlot.name).toBe('Community House Slot #1');
      expect(houseSlot.communityId.toString()).toBe(testCommunity._id.toString());
      expect(houseSlot.isCommunityHouseSlot).toBe(true);
      expect(houseSlot.acceptedCurrencies).toContainEqual(
        expect.objectContaining({
          type: 'community_points',
          name: 'Gambling Points'
        })
      );
      expect(houseSlot.communitySettings.profitSharingEnabled).toBe(true);
      expect(houseSlot.communitySettings.communityProfitShare).toBe(0.15);
    });

    test('should create multiple house slots for different games', async () => {
      const blackjackSlot = await communityGamblingService.fundCommunityHouseSlot(
        testCommunity._id,
        testAdmin.id,
        {
          name: 'Blackjack House Slot',
          gameTypes: ['blackjack'],
          communityPointsBalance: 5000
        }
      );

      const coinTossSlot = await communityGamblingService.fundCommunityHouseSlot(
        testCommunity._id,
        testAdmin.id,
        {
          name: 'Coin Toss House Slot',
          gameTypes: ['coin_toss'],
          communityPointsBalance: 3000
        }
      );

      expect(blackjackSlot.gameTypes).toContain('blackjack');
      expect(coinTossSlot.gameTypes).toContain('coin_toss');
    });
  });

  describe('Community Points Betting', () => {
    beforeEach(async () => {
      // Mock community points service
      const communityPointsService = require('../services/communityPointsService');
      jest.spyOn(communityPointsService, 'getUserCommunityPointsInfo').mockResolvedValue({
        balance: 1000,
        tier: 'silver'
      });
      jest.spyOn(communityPointsService, 'awardCommunityPoints').mockResolvedValue({
        success: true,
        newBalance: 1100
      });
      jest.spyOn(communityPointsService, 'deductCommunityPoints').mockResolvedValue({
        success: true,
        newBalance: 900
      });
    });

    test('should process winning community points bet', async () => {
      // Mock winning game result
      jest.spyOn(communityGamblingService, 'processGameBet').mockResolvedValue({
        gameId: new mongoose.Types.ObjectId(),
        won: true,
        winnings: 100,
        gameType: 'coin_toss',
        betAmount: 50
      });

      const result = await communityGamblingService.processCommunityPointsBet(
        testCommunity._id,
        testUser.id,
        'coin_toss',
        50,
        { choice: 'heads' }
      );

      expect(result.won).toBe(true);
      expect(result.winnings).toBe(100);
      expect(result.pointsBalance).toBe(1100); // 1000 + 100 winnings
    });

    test('should process losing community points bet', async () => {
      // Mock losing game result
      jest.spyOn(communityGamblingService, 'processGameBet').mockResolvedValue({
        gameId: new mongoose.Types.ObjectId(),
        won: false,
        winnings: 0,
        gameType: 'blackjack',
        betAmount: 75
      });

      const result = await communityGamblingService.processCommunityPointsBet(
        testCommunity._id,
        testUser.id,
        'blackjack',
        75,
        { action: 'hit' }
      );

      expect(result.won).toBe(false);
      expect(result.winnings).toBe(0);
      expect(result.pointsBalance).toBe(925); // 1000 - 75 bet
    });

    test('should prevent betting with insufficient points', async () => {
      // Mock insufficient balance
      const communityPointsService = require('../services/communityPointsService');
      jest.spyOn(communityPointsService, 'getUserCommunityPointsInfo').mockResolvedValue({
        balance: 25,
        tier: 'bronze'
      });

      await expect(
        communityGamblingService.processCommunityPointsBet(
          testCommunity._id,
          testUser.id,
          'blackjack',
          50,
          { action: 'hit' }
        )
      ).rejects.toThrow('Insufficient community points balance');
    });

    test('should prevent non-members from betting', async () => {
      const nonMemberId = new mongoose.Types.ObjectId();

      await expect(
        communityGamblingService.processCommunityPointsBet(
          testCommunity._id,
          nonMemberId,
          'coin_toss',
          25,
          { choice: 'tails' }
        )
      ).rejects.toThrow('User is not a member of this community');
    });
  });

  describe('VRF Integration for Community Raffles', () => {
    let testRaffle;

    beforeEach(async () => {
      testRaffle = await communityGamblingService.createCommunityAllowlistRaffle(
        testCommunity._id,
        testAdmin.id,
        {
          title: 'VRF Test Raffle',
          prizeDescription: 'Test allowlist spots',
          ticketPrice: 10,
          maxTickets: 100,
          allowlistSpots: 10
        }
      );
    });

    test('should request VRF random number for raffle', async () => {
      // Mock VRF service
      const vrfService = require('../services/vrfService');
      jest.spyOn(vrfService, 'requestRandomNumber').mockResolvedValue({
        requestId: 'vrf_request_123',
        transactionHash: '0xabc123'
      });

      const result = await communityGamblingService.manageCommunityRaffleVRF(
        testRaffle._id,
        'request_random'
      );

      expect(result.success).toBe(true);
      expect(result.vrfRequestId).toBe('vrf_request_123');

      // Verify raffle status updated
      const updatedRaffle = await Raffle.findById(testRaffle._id);
      expect(updatedRaffle.status).toBe('drawing');
      expect(updatedRaffle.vrfRequestId).toBe('vrf_request_123');
    });

    test('should fulfill VRF random number and select winner', async () => {
      // Set up raffle with VRF request
      testRaffle.vrfRequestId = 'vrf_request_123';
      testRaffle.status = 'drawing';
      await testRaffle.save();

      // Mock winner selection
      jest.spyOn(communityGamblingService, 'selectRaffleWinner').mockResolvedValue({
        userId: testUser.id,
        ticketNumber: 42,
        username: 'testuser'
      });

      const result = await communityGamblingService.manageCommunityRaffleVRF(
        testRaffle._id,
        'fulfill_random',
        { randomNumber: '12345678901234567890' }
      );

      expect(result.success).toBe(true);
      expect(result.winner.userId).toBe(testUser.id);
      expect(result.winner.ticketNumber).toBe(42);

      // Verify raffle completion
      const completedRaffle = await Raffle.findById(testRaffle._id);
      expect(completedRaffle.status).toBe('completed');
      expect(completedRaffle.winnerId.toString()).toBe(testUser.id.toString());
    });
  });

  describe('Community Gambling Analytics', () => {
    beforeEach(async () => {
      // Create some test data for analytics
      await communityGamblingService.createCommunityRaffle(
        testCommunity._id,
        testAdmin.id,
        {
          title: 'Analytics Test Raffle 1',
          type: 'nft',
          ticketPrice: 20,
          maxTickets: 50
        }
      );

      await communityGamblingService.createCommunityGamingSession(
        testCommunity._id,
        testAdmin.id,
        {
          gameType: 'blackjack',
          name: 'Analytics Test Game'
        }
      );
    });

    test('should get community gambling analytics', async () => {
      const analytics = await communityGamblingService.getCommunityGamblingAnalytics(
        testCommunity._id,
        testAdmin.id,
        '30d'
      );

      expect(analytics).toHaveProperty('timeframe', '30d');
      expect(analytics).toHaveProperty('raffles');
      expect(analytics).toHaveProperty('gaming');
      expect(analytics).toHaveProperty('houseSlots');
      expect(Array.isArray(analytics.raffles)).toBe(true);
      expect(Array.isArray(analytics.gaming)).toBe(true);
    });

    test('should prevent non-admin from accessing analytics', async () => {
      await expect(
        communityGamblingService.getCommunityGamblingAnalytics(
          testCommunity._id,
          testUser.id,
          '30d'
        )
      ).rejects.toThrow('Insufficient permissions to view gambling analytics');
    });
  });

  describe('Community Gambling Content Retrieval', () => {
    beforeEach(async () => {
      // Create test content
      await communityGamblingService.createCommunityRaffle(
        testCommunity._id,
        testAdmin.id,
        {
          title: 'Retrieval Test Raffle',
          type: 'token',
          ticketPrice: 15,
          maxTickets: 75,
          status: 'active'
        }
      );

      await communityGamblingService.createCommunityGamingSession(
        testCommunity._id,
        testAdmin.id,
        {
          gameType: 'coin_toss',
          name: 'Retrieval Test Game',
          status: 'active'
        }
      );

      await communityGamblingService.fundCommunityHouseSlot(
        testCommunity._id,
        testAdmin.id,
        {
          name: 'Retrieval Test House Slot',
          gameTypes: ['blackjack'],
          communityPointsBalance: 2000
        }
      );
    });

    test('should get community raffles', async () => {
      const raffles = await communityGamblingService.getCommunityRaffles(
        testCommunity._id,
        { status: 'active' }
      );

      expect(Array.isArray(raffles)).toBe(true);
      expect(raffles.length).toBeGreaterThan(0);
      expect(raffles[0]).toHaveProperty('title');
      expect(raffles[0]).toHaveProperty('type');
      expect(raffles[0].isCommunityRaffle).toBe(true);
    });

    test('should get community gaming sessions', async () => {
      const sessions = await communityGamblingService.getCommunityGamingSessions(
        testCommunity._id,
        { gameType: 'coin_toss' }
      );

      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].gameType).toBe('coin_toss');
      expect(sessions[0].isCommunityGame).toBe(true);
    });

    test('should get community house slots', async () => {
      const houseSlots = await communityGamblingService.getCommunityHouseSlots(
        testCommunity._id
      );

      expect(Array.isArray(houseSlots)).toBe(true);
      expect(houseSlots.length).toBeGreaterThan(0);
      expect(houseSlots[0]).toHaveProperty('name');
      expect(houseSlots[0].isCommunityHouseSlot).toBe(true);
    });
  });
});