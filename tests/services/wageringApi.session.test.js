const wageringApiService = require('../../services/wageringApiService');
const HouseSlot = require('../../models/game/houseSlot');
const User = require('../../models/user/user');
const mongoose = require('mongoose');

// Mock VRF service
jest.mock('../../services/vrfService', () => ({
  generateBatchRandomness: jest.fn().mockResolvedValue({
    randomness: [0.1, 0.2, 0.3, 0.4, 0.5],
    proof: 'mock_proof',
    seed: 'mock_seed',
    rounds: 5,
    requestId: 'mock_request_id',
    source: 'mock_source',
    timestamp: new Date()
  })
}));

describe('Wagering API Session Enhancement', () => {
  let testUser;
  let testHouseSlot;

  beforeEach(async () => {
    // Create test user
    testUser = new User({
      username: 'testuser',
      email: 'test@example.com',
      walletAddresses: [{
        address: '0x1234567890123456789012345678901234567890',
        blockchain: 'ethereum',
        isPrimary: true
      }]
    });

    // Create test house slot
    testHouseSlot = new HouseSlot({
      ownerId: new mongoose.Types.ObjectId(),
      gameType: 'coinToss',
      fundAmount: '1000000000000000000', // 1 ETH
      tokenType: 'ETH',
      roundsPerSession: 20,
      safetyMultiplier: 10
    });
    await testHouseSlot.save();
  });

  afterEach(async () => {
    // Clean up test data
    await HouseSlot.deleteMany({});
    await User.deleteMany({});
  });

  describe('initializeSlotSession', () => {
    test('should initialize session with available house slot', async () => {
      const result = await wageringApiService.initializeSlotSession(
        testUser._id.toString(),
        'coinToss',
        'eth',
        15
      );

      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('houseSlotId');
      expect(result.gameType).toBe('coinToss');
      expect(result.tokenType).toBe('eth');
      expect(result.roundsAllocated).toBe(15);
      expect(result).toHaveProperty('vrfData');
      expect(result).toHaveProperty('balanceReserved');
      expect(result).toHaveProperty('sessionExpiresAt');
    });

    test('should throw error when no house slots available', async () => {
      // Remove all house slots
      await HouseSlot.deleteMany({});

      await expect(
        wageringApiService.initializeSlotSession(
          testUser._id.toString(),
          'coinToss',
          'eth',
          15
        )
      ).rejects.toThrow('No available house slots for this game type and token');
    });

    test('should throw error for invalid player', async () => {
      const invalidPlayerId = new mongoose.Types.ObjectId().toString();

      await expect(
        wageringApiService.initializeSlotSession(
          invalidPlayerId,
          'coinToss',
          'eth',
          15
        )
      ).rejects.toThrow('Player not found');
    });
  });

  describe('syncSlotSession', () => {
    test('should sync session state successfully', async () => {
      // First initialize a session
      const sessionResult = await wageringApiService.initializeSlotSession(
        testUser._id.toString(),
        'coinToss',
        'eth',
        20
      );

      const syncResult = await wageringApiService.syncSlotSession(
        sessionResult.sessionId,
        5,
        '900000000000000000' // 0.9 ETH
      );

      expect(syncResult.sessionId).toBe(sessionResult.sessionId);
      expect(syncResult.roundsUsed).toBe(5);
      expect(syncResult.roundsRemaining).toBe(15);
      expect(syncResult).toHaveProperty('sessionExpiresAt');
      expect(syncResult).toHaveProperty('nextHouseSlotQueued');
      expect(syncResult).toHaveProperty('isNearLimit');
    });

    test('should throw error for non-existent session', async () => {
      const fakeSessionId = 'fake-session-id';

      await expect(
        wageringApiService.syncSlotSession(fakeSessionId, 5, '900000000000000000')
      ).rejects.toThrow('House slot session not found');
    });
  });

  describe('completeSlotSession', () => {
    test('should complete session successfully', async () => {
      // First initialize a session
      const sessionResult = await wageringApiService.initializeSlotSession(
        testUser._id.toString(),
        'coinToss',
        'eth',
        10
      );

      const finalResult = {
        winner: 'player',
        houseLosses: '100000000000000000' // 0.1 ETH
      };

      const completionResult = await wageringApiService.completeSlotSession(
        sessionResult.sessionId,
        finalResult,
        8,
        '800000000000000000' // 0.8 ETH
      );

      expect(completionResult.sessionId).toBe(sessionResult.sessionId);
      expect(completionResult.houseSlotId).toBe(sessionResult.houseSlotId);
      expect(completionResult.totalRoundsPlayed).toBe(8);
      expect(completionResult.finalResult).toEqual(finalResult);
      expect(completionResult).toHaveProperty('completedAt');
      expect(completionResult.houseSlotReleased).toBe(true);
    });

    test('should handle house win correctly', async () => {
      // First initialize a session
      const sessionResult = await wageringApiService.initializeSlotSession(
        testUser._id.toString(),
        'coinToss',
        'eth',
        10
      );

      const finalResult = {
        winner: 'house',
        houseWinnings: '50000000000000000' // 0.05 ETH
      };

      const completionResult = await wageringApiService.completeSlotSession(
        sessionResult.sessionId,
        finalResult,
        10,
        '950000000000000000' // 0.95 ETH
      );

      expect(completionResult.finalResult.winner).toBe('house');
      expect(completionResult.houseSlotReleased).toBe(true);
    });
  });

  describe('queueNextHouseSlot', () => {
    test('should queue next house slot when available', async () => {
      // Create additional house slot
      const secondHouseSlot = new HouseSlot({
        ownerId: new mongoose.Types.ObjectId(),
        gameType: 'coinToss',
        fundAmount: '2000000000000000000', // 2 ETH
        tokenType: 'ETH',
        roundsPerSession: 25,
        safetyMultiplier: 12
      });
      await secondHouseSlot.save();

      const result = await wageringApiService.queueNextHouseSlot(
        'current-session-id',
        'coinToss',
        'ETH'
      );

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('houseSlotId');
      expect(result).toHaveProperty('sessionId');
      expect(result.sessionId).toBe('current-session-id_next');
      expect(result.roundsAllocated).toBe(25);
    });

    test('should return null when no house slots available', async () => {
      // Use the only house slot for current session
      testHouseSlot.currentSessionId = 'current-session';
      await testHouseSlot.save();

      const result = await wageringApiService.queueNextHouseSlot(
        'current-session',
        'coinToss',
        'ETH'
      );

      expect(result).toBeNull();
    });
  });
});