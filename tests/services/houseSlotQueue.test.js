const houseSlotQueueService = require('../../services/houseSlotQueueService');
const HouseSlot = require('../../models/game/houseSlot');
const GameSession = require('../../models/game/gameSession');
const mongoose = require('mongoose');

describe('House Slot Queue Service', () => {
  let testHouseSlot1;
  let testHouseSlot2;
  let testHouseSlot3;

  beforeEach(async () => {
    // Create test house slots
    testHouseSlot1 = new HouseSlot({
      ownerId: new mongoose.Types.ObjectId(),
      gameType: 'coinToss',
      fundAmount: '1000000000000000000', // 1 ETH
      tokenType: 'ETH',
      roundsPerSession: 20,
      safetyMultiplier: 10,
      queuePosition: 1
    });
    await testHouseSlot1.save();

    testHouseSlot2 = new HouseSlot({
      ownerId: new mongoose.Types.ObjectId(),
      gameType: 'coinToss',
      fundAmount: '2000000000000000000', // 2 ETH
      tokenType: 'ETH',
      roundsPerSession: 25,
      safetyMultiplier: 12,
      queuePosition: 2
    });
    await testHouseSlot2.save();

    testHouseSlot3 = new HouseSlot({
      ownerId: new mongoose.Types.ObjectId(),
      gameType: 'coinToss',
      fundAmount: '1500000000000000000', // 1.5 ETH
      tokenType: 'ETH',
      roundsPerSession: 30,
      safetyMultiplier: 15,
      queuePosition: 3
    });
    await testHouseSlot3.save();
  });

  afterEach(async () => {
    // Clean up test data
    await HouseSlot.deleteMany({});
    await GameSession.deleteMany({});
  });

  describe('queueNextHouseSlot', () => {
    test('should queue next house slot successfully', async () => {
      // Reserve first house slot for current session
      testHouseSlot1.reserveForSession('current-session-123', 30);
      await testHouseSlot1.save();

      const result = await houseSlotQueueService.queueNextHouseSlot(
        'current-session-123',
        'coinToss',
        'ETH'
      );

      expect(result).not.toBeNull();
      expect(result.houseSlotId).toBe(testHouseSlot2._id.toString());
      expect(result.sessionId).toBe('current-session-123_next');
      expect(result.roundsAllocated).toBe(25);
      expect(result).toHaveProperty('queuedAt');

      // Verify the house slot was reserved
      const updatedSlot = await HouseSlot.findById(testHouseSlot2._id);
      expect(updatedSlot.currentSessionId).toBe('current-session-123_next');

      // Verify current slot is marked as having queued next
      const currentSlot = await HouseSlot.findById(testHouseSlot1._id);
      expect(currentSlot.nextHouseSlotQueued).toBe(true);
    });

    test('should return null when no house slots available', async () => {
      // Reserve all house slots
      testHouseSlot1.reserveForSession('session-1', 30);
      testHouseSlot2.reserveForSession('session-2', 30);
      testHouseSlot3.reserveForSession('session-3', 30);
      await Promise.all([
        testHouseSlot1.save(),
        testHouseSlot2.save(),
        testHouseSlot3.save()
      ]);

      const result = await houseSlotQueueService.queueNextHouseSlot(
        'session-1',
        'coinToss',
        'ETH'
      );

      expect(result).toBeNull();
    });

    test('should return null when already queued', async () => {
      // Reserve first house slot and mark as already queued
      testHouseSlot1.reserveForSession('current-session-123', 30);
      testHouseSlot1.nextHouseSlotQueued = true;
      await testHouseSlot1.save();

      const result = await houseSlotQueueService.queueNextHouseSlot(
        'current-session-123',
        'coinToss',
        'ETH'
      );

      expect(result).toBeNull();
    });
  });

  describe('transitionToNextHouseSlot', () => {
    test('should transition to next house slot seamlessly', async () => {
      // Set up current and next sessions
      testHouseSlot1.reserveForSession('current-session', 30);
      await testHouseSlot1.save();

      testHouseSlot2.reserveForSession('current-session_next', 35);
      await testHouseSlot2.save();

      const result = await houseSlotQueueService.transitionToNextHouseSlot(
        'current-session',
        'player-123'
      );

      expect(result).toHaveProperty('newSessionId');
      expect(result.houseSlotId).toBe(testHouseSlot2._id.toString());
      expect(result.roundsAllocated).toBe(25);
      expect(result.seamless).toBe(true);
      expect(result).toHaveProperty('transitionedAt');

      // Verify current slot was released
      const currentSlot = await HouseSlot.findById(testHouseSlot1._id);
      expect(currentSlot.currentSessionId).toBeNull();

      // Verify next slot has new session ID
      const nextSlot = await HouseSlot.findById(testHouseSlot2._id);
      expect(nextSlot.currentSessionId).toBe(result.newSessionId);
      expect(nextSlot.sessionRoundsUsed).toBe(0);
      expect(nextSlot.nextHouseSlotQueued).toBe(false);
    });

    test('should throw error when no queued house slot found', async () => {
      await expect(
        houseSlotQueueService.transitionToNextHouseSlot('non-existent-session', 'player-123')
      ).rejects.toThrow('No queued house slot found for transition');
    });
  });

  describe('migrateSessionForFailure', () => {
    test('should migrate session when house slot fails', async () => {
      // Set up failed session
      testHouseSlot1.reserveForSession('failed-session', 30);
      testHouseSlot1.sessionRoundsUsed = 5;
      await testHouseSlot1.save();

      const sessionState = { roundsUsed: 5 };

      const result = await houseSlotQueueService.migrateSessionForFailure(
        'failed-session',
        'player-123',
        sessionState
      );

      expect(result).toHaveProperty('newSessionId');
      expect(result.houseSlotId).toBe(testHouseSlot2._id.toString());
      expect(result.failedHouseSlotId).toBe(testHouseSlot1._id.toString());
      expect(result.roundsUsed).toBe(5);
      expect(result.reason).toBe('house_slot_failure');
      expect(result).toHaveProperty('migratedAt');

      // Verify failed slot was marked inactive
      const failedSlot = await HouseSlot.findById(testHouseSlot1._id);
      expect(failedSlot.isActive).toBe(false);
      expect(failedSlot.status).toBe('failed');
      expect(failedSlot.currentSessionId).toBeNull();

      // Verify replacement slot was reserved
      const replacementSlot = await HouseSlot.findById(testHouseSlot2._id);
      expect(replacementSlot.currentSessionId).toBe(result.newSessionId);
      expect(replacementSlot.sessionRoundsUsed).toBe(5);
    });

    test('should throw error when no replacement house slot available', async () => {
      // Set up failed session
      testHouseSlot1.reserveForSession('failed-session', 30);
      await testHouseSlot1.save();

      // Reserve all other slots
      testHouseSlot2.reserveForSession('other-session-1', 30);
      testHouseSlot3.reserveForSession('other-session-2', 30);
      await Promise.all([testHouseSlot2.save(), testHouseSlot3.save()]);

      const sessionState = { roundsUsed: 3 };

      await expect(
        houseSlotQueueService.migrateSessionForFailure('failed-session', 'player-123', sessionState)
      ).rejects.toThrow('No replacement house slot available');
    });
  });

  describe('getQueueManagementInfo', () => {
    test('should return comprehensive queue management information', async () => {
      // Set up various slot states
      testHouseSlot1.reserveForSession('active-session-1', 30);
      testHouseSlot1.sessionRoundsUsed = 16; // Near limit (80% of 20)
      await testHouseSlot1.save();

      testHouseSlot2.reserveForSession('active-session-1_next', 35);
      await testHouseSlot2.save();

      // testHouseSlot3 remains available

      const result = await houseSlotQueueService.getQueueManagementInfo('coinToss', 'ETH');

      expect(result.gameType).toBe('coinToss');
      expect(result.tokenType).toBe('ETH');
      expect(result.capacity.total).toBe(3);
      expect(result.capacity.active).toBe(1);
      expect(result.capacity.available).toBe(1);
      expect(result.capacity.queued).toBe(1);
      expect(result.capacity.utilizationRate).toBeGreaterThan(0);
      expect(result.queuePrediction.slotsNearLimit).toBe(1);
      expect(result.queuePrediction.currentlyQueued).toBe(1);
      expect(result).toHaveProperty('performance');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('autoQueueHouseSlots', () => {
    test('should auto-queue house slots when needed', async () => {
      // Set up session near limit without queued slot
      testHouseSlot1.reserveForSession('session-near-limit', 30);
      testHouseSlot1.sessionRoundsUsed = 16; // 80% of 20 rounds
      testHouseSlot1.nextHouseSlotQueued = false;
      await testHouseSlot1.save();

      const result = await houseSlotQueueService.autoQueueHouseSlots('coinToss', 'ETH');

      expect(result).toHaveLength(1);
      expect(result[0].houseSlotId).toBe(testHouseSlot2._id.toString());
      expect(result[0].sessionId).toBe('session-near-limit_next');

      // Verify slot was actually queued
      const updatedSlot = await HouseSlot.findById(testHouseSlot2._id);
      expect(updatedSlot.currentSessionId).toBe('session-near-limit_next');
    });

    test('should return empty array when no queuing needed', async () => {
      // All slots available, no active sessions
      const result = await houseSlotQueueService.autoQueueHouseSlots('coinToss', 'ETH');
      expect(result).toHaveLength(0);
    });
  });

  describe('cleanupExpiredQueueReservations', () => {
    test('should clean up expired queue reservations', async () => {
      // Set up expired queue reservation
      testHouseSlot1.reserveForSession('session_next', 30);
      testHouseSlot1.sessionExpiresAt = new Date(Date.now() - 60000); // 1 minute ago
      await testHouseSlot1.save();

      const result = await houseSlotQueueService.cleanupExpiredQueueReservations();

      expect(result).toBe(1);

      // Verify slot was released
      const updatedSlot = await HouseSlot.findById(testHouseSlot1._id);
      expect(updatedSlot.currentSessionId).toBeNull();
      expect(updatedSlot.sessionExpiresAt).toBeNull();
    });

    test('should return 0 when no expired reservations', async () => {
      const result = await houseSlotQueueService.cleanupExpiredQueueReservations();
      expect(result).toBe(0);
    });
  });
});