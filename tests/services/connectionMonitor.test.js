const connectionMonitorService = require('../../services/connectionMonitorService');
const HouseSlot = require('../../models/game/houseSlot');
const GameSession = require('../../models/game/gameSession');
const mongoose = require('mongoose');

// Mock Redis client
jest.mock('../../config/redisClient', () => ({
  setex: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1)
}));

describe('Connection Monitor Service', () => {
  let testHouseSlot;
  let testGameSession;
  const testSessionId = 'test-session-123';
  const testPlayerId = 'player-456';

  beforeEach(async () => {
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

    // Reserve house slot for test session
    testHouseSlot.reserveForSession(testSessionId, 30);
    await testHouseSlot.save();

    // Create test game session
    testGameSession = new GameSession({
      _id: testSessionId,
      playerId: testPlayerId,
      gameType: 'coinToss',
      tokenType: 'ETH',
      betAmount: '100000000000000000', // 0.1 ETH
      status: 'in_progress'
    });
    await testGameSession.save();

    // Clear any existing connections
    connectionMonitorService.activeConnections.clear();
    connectionMonitorService.heartbeatTimers.clear();
  });

  afterEach(async () => {
    // Clean up test data
    await HouseSlot.deleteMany({});
    await GameSession.deleteMany({});
    
    // Clear service state
    connectionMonitorService.activeConnections.clear();
    connectionMonitorService.heartbeatTimers.clear();
  });

  describe('registerConnection', () => {
    test('should register a new connection successfully', () => {
      const socketInfo = { id: 'socket-123' };
      
      const result = connectionMonitorService.registerConnection(
        testSessionId,
        testPlayerId,
        socketInfo
      );

      expect(result).toHaveProperty('sessionId', testSessionId);
      expect(result).toHaveProperty('playerId', testPlayerId);
      expect(result).toHaveProperty('socketId', 'socket-123');
      expect(result).toHaveProperty('connectedAt');
      expect(result).toHaveProperty('lastHeartbeat');
      expect(result.isActive).toBe(true);
      expect(result.recoveryAttempts).toBe(0);

      // Verify connection is stored in memory
      const storedConnection = connectionMonitorService.activeConnections.get(testSessionId);
      expect(storedConnection).toBeDefined();
      expect(storedConnection.playerId).toBe(testPlayerId);
    });

    test('should start heartbeat monitoring for registered connection', () => {
      const socketInfo = { id: 'socket-123' };
      
      connectionMonitorService.registerConnection(testSessionId, testPlayerId, socketInfo);

      // Verify heartbeat timer is set
      expect(connectionMonitorService.heartbeatTimers.has(testSessionId)).toBe(true);
    });
  });

  describe('updateHeartbeat', () => {
    beforeEach(() => {
      const socketInfo = { id: 'socket-123' };
      connectionMonitorService.registerConnection(testSessionId, testPlayerId, socketInfo);
    });

    test('should update heartbeat successfully', () => {
      const heartbeatData = { roundsPlayed: 5, currentBalance: '950000000000000000' };
      
      const result = connectionMonitorService.updateHeartbeat(testSessionId, heartbeatData);

      expect(result).toBe(true);

      const connection = connectionMonitorService.activeConnections.get(testSessionId);
      expect(connection.heartbeatData).toEqual(heartbeatData);
      expect(connection.isActive).toBe(true);
    });

    test('should return false for non-existent session', () => {
      const result = connectionMonitorService.updateHeartbeat('non-existent-session');
      expect(result).toBe(false);
    });
  });

  describe('handleDisconnection', () => {
    beforeEach(() => {
      const socketInfo = { id: 'socket-123' };
      connectionMonitorService.registerConnection(testSessionId, testPlayerId, socketInfo);
    });

    test('should handle disconnection correctly', () => {
      const reason = 'client_disconnect';
      
      connectionMonitorService.handleDisconnection(testSessionId, reason);

      const connection = connectionMonitorService.activeConnections.get(testSessionId);
      expect(connection.isActive).toBe(false);
      expect(connection.disconnectedAt).toBeInstanceOf(Date);
      expect(connection.disconnectionReason).toBe(reason);
    });

    test('should handle disconnection for non-existent session gracefully', () => {
      // Should not throw error
      expect(() => {
        connectionMonitorService.handleDisconnection('non-existent-session');
      }).not.toThrow();
    });
  });

  describe('attemptSessionRecovery', () => {
    beforeEach(() => {
      const socketInfo = { id: 'socket-123' };
      connectionMonitorService.registerConnection(testSessionId, testPlayerId, socketInfo);
      connectionMonitorService.handleDisconnection(testSessionId, 'test_disconnect');
    });

    test('should recover session successfully within timeout window', async () => {
      const newSocketInfo = { id: 'socket-456' };
      
      const result = await connectionMonitorService.attemptSessionRecovery(
        testSessionId,
        testPlayerId,
        newSocketInfo
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(testSessionId);
      expect(result).toHaveProperty('recoveredAt');
      expect(result.recoveryAttempts).toBe(1);
      expect(result).toHaveProperty('sessionState');

      // Verify connection is active again
      const connection = connectionMonitorService.activeConnections.get(testSessionId);
      expect(connection.isActive).toBe(true);
      expect(connection.socketId).toBe('socket-456');
      expect(connection.recoveryAttempts).toBe(1);
    });

    test('should fail recovery for wrong player ID', async () => {
      const newSocketInfo = { id: 'socket-456' };
      
      const result = await connectionMonitorService.attemptSessionRecovery(
        testSessionId,
        'wrong-player-id',
        newSocketInfo
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Player ID mismatch');
    });

    test('should fail recovery for non-existent session', async () => {
      const newSocketInfo = { id: 'socket-456' };
      
      const result = await connectionMonitorService.attemptSessionRecovery(
        'non-existent-session',
        testPlayerId,
        newSocketInfo
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });
  });

  describe('getConnectionStatus', () => {
    test('should return connection status for existing session', () => {
      const socketInfo = { id: 'socket-123' };
      connectionMonitorService.registerConnection(testSessionId, testPlayerId, socketInfo);

      const status = connectionMonitorService.getConnectionStatus(testSessionId);

      expect(status).toHaveProperty('sessionId', testSessionId);
      expect(status).toHaveProperty('playerId', testPlayerId);
      expect(status).toHaveProperty('isActive', true);
      expect(status).toHaveProperty('connectedAt');
      expect(status).toHaveProperty('lastHeartbeat');
      expect(status).toHaveProperty('timeSinceLastHeartbeat');
    });

    test('should return null for non-existent session', () => {
      const status = connectionMonitorService.getConnectionStatus('non-existent-session');
      expect(status).toBeNull();
    });
  });

  describe('getAllActiveConnections', () => {
    test('should return all active connections', () => {
      const socketInfo1 = { id: 'socket-123' };
      const socketInfo2 = { id: 'socket-456' };
      
      connectionMonitorService.registerConnection('session-1', 'player-1', socketInfo1);
      connectionMonitorService.registerConnection('session-2', 'player-2', socketInfo2);
      
      // Disconnect one session
      connectionMonitorService.handleDisconnection('session-2', 'test');

      const activeConnections = connectionMonitorService.getAllActiveConnections();

      expect(activeConnections).toHaveLength(1);
      expect(activeConnections[0].sessionId).toBe('session-1');
      expect(activeConnections[0].isActive).toBe(true);
    });

    test('should return empty array when no active connections', () => {
      const activeConnections = connectionMonitorService.getAllActiveConnections();
      expect(activeConnections).toHaveLength(0);
    });
  });

  describe('cleanupConnection', () => {
    test('should clean up connection completely', () => {
      const socketInfo = { id: 'socket-123' };
      connectionMonitorService.registerConnection(testSessionId, testPlayerId, socketInfo);

      // Verify connection exists
      expect(connectionMonitorService.activeConnections.has(testSessionId)).toBe(true);
      expect(connectionMonitorService.heartbeatTimers.has(testSessionId)).toBe(true);

      connectionMonitorService.cleanupConnection(testSessionId);

      // Verify connection is cleaned up
      expect(connectionMonitorService.activeConnections.has(testSessionId)).toBe(false);
      expect(connectionMonitorService.heartbeatTimers.has(testSessionId)).toBe(false);
    });
  });

  describe('heartbeat monitoring', () => {
    test('should handle missed heartbeat', (done) => {
      const socketInfo = { id: 'socket-123' };
      connectionMonitorService.registerConnection(testSessionId, testPlayerId, socketInfo);

      // Override heartbeat interval for faster testing
      const originalInterval = connectionMonitorService.heartbeatInterval;
      connectionMonitorService.heartbeatInterval = 100; // 100ms

      // Start monitoring with short interval
      connectionMonitorService.startHeartbeatMonitoring(testSessionId);

      setTimeout(() => {
        const connection = connectionMonitorService.activeConnections.get(testSessionId);
        expect(connection.isActive).toBe(false);
        expect(connection.disconnectionReason).toBe('missed_heartbeat');
        
        // Restore original interval
        connectionMonitorService.heartbeatInterval = originalInterval;
        done();
      }, 250); // Wait longer than 2 * heartbeat interval
    });
  });
});