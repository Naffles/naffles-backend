const adminSessionConfigService = require('../../services/adminSessionConfigService');
const HouseSlot = require('../../models/game/houseSlot');
const mongoose = require('mongoose');

// Mock the queue service
jest.mock('../../services/houseSlotQueueService', () => ({
  getQueueManagementInfo: jest.fn().mockResolvedValue({
    capacity: { total: 3, active: 1, available: 2 },
    queuePrediction: { slotsNearLimit: 0, currentlyQueued: 0 }
  }),
  calculateAverageSessionDuration: jest.fn().mockResolvedValue(25)
}));

// Mock the connection monitor service
jest.mock('../../services/connectionMonitorService', () => ({
  getAllActiveConnections: jest.fn().mockReturnValue([
    { sessionId: 'session-1', isActive: true },
    { sessionId: 'session-2', isActive: true }
  ])
}));

describe('Admin Session Config Service', () => {
  let testHouseSlot1;
  let testHouseSlot2;

  beforeEach(async () => {
    // Create test house slots
    testHouseSlot1 = new HouseSlot({
      ownerId: new mongoose.Types.ObjectId(),
      gameType: 'coinToss',
      fundAmount: '1000000000000000000', // 1 ETH
      tokenType: 'ETH',
      roundsPerSession: 20,
      safetyMultiplier: 10
    });
    await testHouseSlot1.save();

    testHouseSlot2 = new HouseSlot({
      ownerId: new mongoose.Types.ObjectId(),
      gameType: 'coinToss',
      fundAmount: '2000000000000000000', // 2 ETH
      tokenType: 'ETH',
      roundsPerSession: 25,
      safetyMultiplier: 12
    });
    await testHouseSlot2.save();
  });

  afterEach(async () => {
    // Clean up test data
    await HouseSlot.deleteMany({});
  });

  describe('getSessionConfiguration', () => {
    test('should return current session configuration', async () => {
      const result = await adminSessionConfigService.getSessionConfiguration('coinToss', 'ETH');

      expect(result.gameType).toBe('coinToss');
      expect(result.tokenType).toBe('ETH');
      expect(result.configuration).toHaveProperty('roundsPerSession');
      expect(result.configuration).toHaveProperty('safetyMultiplier');
      expect(result).toHaveProperty('queueStatus');
      expect(result).toHaveProperty('lastUpdated');
    });

    test('should return default configuration when no house slots exist', async () => {
      await HouseSlot.deleteMany({});

      const result = await adminSessionConfigService.getSessionConfiguration('coinToss', 'ETH');

      expect(result.configuration.roundsPerSession).toBe(20);
      expect(result.configuration.safetyMultiplier).toBe(10);
    });
  });

  describe('updateSessionConfiguration', () => {
    test('should update session configuration successfully', async () => {
      const newConfig = {
        roundsPerSession: 30,
        safetyMultiplier: 15
      };

      const result = await adminSessionConfigService.updateSessionConfiguration(
        'coinToss',
        'ETH',
        newConfig
      );

      expect(result.success).toBe(true);
      expect(result.updatedConfiguration).toEqual(newConfig);
      expect(result.houseSlotsUpdated).toBe(2);

      // Verify house slots were actually updated
      const updatedSlots = await HouseSlot.find({ gameType: 'coinToss', tokenType: 'ETH' });
      expect(updatedSlots[0].roundsPerSession).toBe(30);
      expect(updatedSlots[0].safetyMultiplier).toBe(15);
    });

    test('should validate configuration parameters', async () => {
      const invalidConfig = {
        roundsPerSession: 1001, // Too high
        safetyMultiplier: 101   // Too high
      };

      await expect(
        adminSessionConfigService.updateSessionConfiguration('coinToss', 'ETH', invalidConfig)
      ).rejects.toThrow('Rounds per session must be between 1 and 1000');
    });

    test('should update partial configuration', async () => {
      const partialConfig = {
        roundsPerSession: 35
      };

      const result = await adminSessionConfigService.updateSessionConfiguration(
        'coinToss',
        'ETH',
        partialConfig
      );

      expect(result.success).toBe(true);
      expect(result.houseSlotsUpdated).toBe(2);

      // Verify only roundsPerSession was updated
      const updatedSlot = await HouseSlot.findById(testHouseSlot1._id);
      expect(updatedSlot.roundsPerSession).toBe(35);
      expect(updatedSlot.safetyMultiplier).toBe(10); // Should remain unchanged
    });
  });

  describe('calculateMinimumFunding', () => {
    test('should calculate minimum funding correctly', () => {
      const config = {
        roundsPerSession: 20,
        safetyMultiplier: 10
      };
      const maxPayout = '100000000000000000'; // 0.1 ETH

      const result = adminSessionConfigService.calculateMinimumFunding(
        'coinToss',
        'ETH',
        maxPayout,
        config
      );

      // 10 × 20 × 0.1 ETH = 20 ETH
      const expected = (BigInt(10) * BigInt(20) * BigInt(maxPayout)).toString();
      expect(result.minimumFunding).toBe(expected);
      expect(result.formula).toContain('10 × 20 × 100000000000000000');
    });

    test('should use default values when config is empty', () => {
      const maxPayout = '100000000000000000'; // 0.1 ETH

      const result = adminSessionConfigService.calculateMinimumFunding(
        'coinToss',
        'ETH',
        maxPayout,
        {}
      );

      // Default: 10 × 20 × 0.1 ETH = 20 ETH
      const expected = (BigInt(10) * BigInt(20) * BigInt(maxPayout)).toString();
      expect(result.minimumFunding).toBe(expected);
    });
  });

  describe('getSessionMonitoringDashboard', () => {
    test('should return comprehensive dashboard data', async () => {
      // Set up active session
      testHouseSlot1.reserveForSession('active-session-1', 30);
      testHouseSlot1.sessionRoundsUsed = 5;
      await testHouseSlot1.save();

      const result = await adminSessionConfigService.getSessionMonitoringDashboard('coinToss', 'ETH');

      expect(result.filter.gameType).toBe('coinToss');
      expect(result.filter.tokenType).toBe('ETH');
      expect(result.statistics).toHaveProperty('totalActiveSessions');
      expect(result.statistics).toHaveProperty('totalQueuedSessions');
      expect(result.statistics).toHaveProperty('totalActiveConnections');
      expect(result.activeSessions).toHaveLength(1);
      expect(result.activeSessions[0]).toHaveProperty('sessionId', 'active-session-1');
      expect(result.activeSessions[0]).toHaveProperty('roundsUsed', 5);
      expect(result.activeSessions[0]).toHaveProperty('utilizationRate');
    });

    test('should filter by game type and token type', async () => {
      const result = await adminSessionConfigService.getSessionMonitoringDashboard('coinToss', 'ETH');

      expect(result.filter.gameType).toBe('coinToss');
      expect(result.filter.tokenType).toBe('ETH');
    });

    test('should work without filters', async () => {
      const result = await adminSessionConfigService.getSessionMonitoringDashboard();

      expect(result.filter.gameType).toBeNull();
      expect(result.filter.tokenType).toBeNull();
    });
  });

  describe('getSessionPerformanceAnalytics', () => {
    test('should return performance analytics', async () => {
      // Set up some game history
      testHouseSlot1.gamesPlayed = 10;
      testHouseSlot1.totalWinnings = '500000000000000000'; // 0.5 ETH
      testHouseSlot1.totalLosses = '300000000000000000';   // 0.3 ETH
      await testHouseSlot1.save();

      const result = await adminSessionConfigService.getSessionPerformanceAnalytics('coinToss', 'ETH', 7);

      expect(result.gameType).toBe('coinToss');
      expect(result.tokenType).toBe('ETH');
      expect(result.period).toBe('7 days');
      expect(result.analytics).toHaveProperty('totalSessions');
      expect(result.analytics).toHaveProperty('averageSessionDuration');
      expect(result.analytics).toHaveProperty('houseWinRate');
      expect(result.analytics).toHaveProperty('totalVolume');
      expect(result.houseSlotBreakdown).toHaveLength(2);
    });

    test('should handle no data gracefully', async () => {
      await HouseSlot.deleteMany({});

      const result = await adminSessionConfigService.getSessionPerformanceAnalytics('coinToss', 'ETH', 7);

      expect(result.analytics.totalSessions).toBe(0);
      expect(result.analytics.averageSessionDuration).toBe(0);
      expect(result.analytics.totalVolume).toBe('0');
    });
  });

  describe('getAvailableGameTypesAndTokens', () => {
    test('should return distinct game types and tokens', async () => {
      const result = await adminSessionConfigService.getAvailableGameTypesAndTokens();

      expect(result.gameTypes).toContain('coinToss');
      expect(result.tokenTypes).toContain('ETH');
      expect(result).toHaveProperty('combinations');
    });
  });

  describe('bulkUpdateSessionConfigurations', () => {
    test('should perform bulk updates successfully', async () => {
      const updates = [
        {
          gameType: 'coinToss',
          tokenType: 'ETH',
          configuration: { roundsPerSession: 25 }
        }
      ];

      const result = await adminSessionConfigService.bulkUpdateSessionConfigurations(updates);

      expect(result.totalUpdates).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
      expect(result.results[0].success).toBe(true);
    });

    test('should handle mixed success and failure', async () => {
      const updates = [
        {
          gameType: 'coinToss',
          tokenType: 'ETH',
          configuration: { roundsPerSession: 25 }
        },
        {
          gameType: 'coinToss',
          tokenType: 'ETH',
          configuration: { roundsPerSession: 1001 } // Invalid
        }
      ];

      const result = await adminSessionConfigService.bulkUpdateSessionConfigurations(updates);

      expect(result.totalUpdates).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
    });
  });
});