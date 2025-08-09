const mongoose = require('mongoose');
const HouseSlot = require('../../models/game/houseSlot');

describe('HouseSlot Session Enhancements', () => {
  let houseSlot;
  
  beforeEach(() => {
    houseSlot = new HouseSlot({
      ownerId: new mongoose.Types.ObjectId(),
      gameType: 'blackjack',
      fundAmount: '1000000000000000000', // 1 ETH in wei
      tokenType: 'ETH',
      roundsPerSession: 25,
      safetyMultiplier: 15
    });
  });

  describe('Session Fields', () => {
    test('should have default session values', () => {
      const defaultSlot = new HouseSlot({
        ownerId: new mongoose.Types.ObjectId(),
        gameType: 'blackjack',
        fundAmount: '1000000000000000000',
        tokenType: 'ETH'
      });
      
      expect(defaultSlot.roundsPerSession).toBe(20);
      expect(defaultSlot.safetyMultiplier).toBe(10);
      expect(defaultSlot.currentSessionId).toBeNull();
      expect(defaultSlot.sessionRoundsUsed).toBe(0);
      expect(defaultSlot.sessionExpiresAt).toBeNull();
    });

    test('should accept custom session values', () => {
      expect(houseSlot.roundsPerSession).toBe(25);
      expect(houseSlot.safetyMultiplier).toBe(15);
    });

    test('should validate session field ranges', () => {
      // Test valid ranges first
      const validSlot = new HouseSlot({
        ownerId: new mongoose.Types.ObjectId(),
        gameType: 'blackjack',
        fundAmount: '1000000000000000000',
        tokenType: 'ETH',
        roundsPerSession: 50,
        safetyMultiplier: 15
      });
      
      expect(() => validSlot.validateSync()).not.toThrow();
      
      // Test boundary values that should be valid
      const boundarySlot1 = new HouseSlot({
        ownerId: new mongoose.Types.ObjectId(),
        gameType: 'blackjack',
        fundAmount: '1000000000000000000',
        tokenType: 'ETH',
        roundsPerSession: 1,
        safetyMultiplier: 1
      });
      
      expect(() => boundarySlot1.validateSync()).not.toThrow();
      
      const boundarySlot2 = new HouseSlot({
        ownerId: new mongoose.Types.ObjectId(),
        gameType: 'blackjack',
        fundAmount: '1000000000000000000',
        tokenType: 'ETH',
        roundsPerSession: 1000,
        safetyMultiplier: 100
      });
      
      expect(() => boundarySlot2.validateSync()).not.toThrow();
    });
  });

  describe('Minimum Funding Calculation', () => {
    test('should calculate minimum funding using session parameters', () => {
      const maxPayout = '100000000000000000'; // 0.1 ETH
      const minFunding = houseSlot.calculateMinimumFunding(maxPayout);
      
      // 15 (safety) × 25 (rounds) × 0.1 ETH = 37.5 ETH
      const expected = (BigInt(15) * BigInt(25) * BigInt(maxPayout)).toString();
      expect(minFunding).toBe(expected);
    });

    test('should use default values for minimum funding calculation', () => {
      const defaultSlot = new HouseSlot({
        ownerId: new mongoose.Types.ObjectId(),
        gameType: 'blackjack',
        fundAmount: '1000000000000000000',
        tokenType: 'ETH'
      });
      
      const maxPayout = '100000000000000000'; // 0.1 ETH
      const minFunding = defaultSlot.calculateMinimumFunding(maxPayout);
      
      // 10 (safety) × 20 (rounds) × 0.1 ETH = 20 ETH
      const expected = (BigInt(10) * BigInt(20) * BigInt(maxPayout)).toString();
      expect(minFunding).toBe(expected);
    });
  });

  describe('Session Reservation', () => {
    test('should reserve house slot for session', () => {
      const sessionId = 'session_123';
      houseSlot.reserveForSession(sessionId, 45);
      
      expect(houseSlot.currentSessionId).toBe(sessionId);
      expect(houseSlot.sessionRoundsUsed).toBe(0);
      expect(houseSlot.sessionExpiresAt).toBeInstanceOf(Date);
      expect(houseSlot.sessionExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    test('should throw error when already reserved', () => {
      houseSlot.reserveForSession('session_1');
      
      expect(() => {
        houseSlot.reserveForSession('session_2');
      }).toThrow('House slot is already reserved for another session');
    });

    test('should release house slot from session', () => {
      houseSlot.reserveForSession('session_123');
      houseSlot.releaseFromSession();
      
      expect(houseSlot.currentSessionId).toBeNull();
      expect(houseSlot.sessionRoundsUsed).toBe(0);
      expect(houseSlot.sessionExpiresAt).toBeNull();
    });
  });

  describe('Session Expiration', () => {
    test('should detect expired session', () => {
      houseSlot.currentSessionId = 'session_123';
      houseSlot.sessionExpiresAt = new Date(Date.now() - 1000); // 1 second ago
      
      expect(houseSlot.isSessionExpired()).toBe(true);
    });

    test('should detect non-expired session', () => {
      houseSlot.currentSessionId = 'session_123';
      houseSlot.sessionExpiresAt = new Date(Date.now() + 60000); // 1 minute from now
      
      expect(houseSlot.isSessionExpired()).toBe(false);
    });

    test('should return false for no session', () => {
      expect(houseSlot.isSessionExpired()).toBe(false);
    });
  });

  describe('Session Limits', () => {
    test('should detect session near limit', () => {
      houseSlot.currentSessionId = 'session_123';
      houseSlot.sessionRoundsUsed = 20; // 80% of 25 rounds
      
      expect(houseSlot.isSessionNearLimit(0.8)).toBe(true);
    });

    test('should detect session not near limit', () => {
      houseSlot.currentSessionId = 'session_123';
      houseSlot.sessionRoundsUsed = 10; // 40% of 25 rounds
      
      expect(houseSlot.isSessionNearLimit(0.8)).toBe(false);
    });

    test('should return false for no session', () => {
      expect(houseSlot.isSessionNearLimit()).toBe(false);
    });

    test('should increment session rounds', () => {
      houseSlot.currentSessionId = 'session_123';
      houseSlot.incrementSessionRounds();
      
      expect(houseSlot.sessionRoundsUsed).toBe(1);
    });

    test('should not increment rounds without session', () => {
      houseSlot.incrementSessionRounds();
      expect(houseSlot.sessionRoundsUsed).toBe(0);
    });

    test('should check remaining rounds', () => {
      houseSlot.currentSessionId = 'session_123';
      houseSlot.sessionRoundsUsed = 24; // 1 round remaining
      
      expect(houseSlot.hasRemainingRounds()).toBe(true);
      
      houseSlot.sessionRoundsUsed = 25; // No rounds remaining
      expect(houseSlot.hasRemainingRounds()).toBe(false);
    });

    test('should return true for remaining rounds without session', () => {
      expect(houseSlot.hasRemainingRounds()).toBe(true);
    });
  });
});