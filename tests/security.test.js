const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const gameSecurityService = require('../services/security/gameSecurityService');
const cryptographicService = require('../services/security/cryptographicService');
const secureCommunicationService = require('../services/security/secureCommunicationService');
const securityMonitoringService = require('../services/security/securityMonitoringService');

describe('Security Services', () => {
  let testUser;
  let authToken;

  beforeAll(async () => {
    // Setup test database connection
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/naffles_test');
    }

    // Create test user and get auth token
    const userResponse = await request(app)
      .post('/user/register')
      .send({
        email: 'security.test@example.com',
        password: 'SecurePassword123!',
        walletAddress: '0x1234567890123456789012345678901234567890'
      });

    testUser = userResponse.body.data;
    authToken = userResponse.body.token;
  });

  afterAll(async () => {
    // Cleanup test data
    await mongoose.connection.db.dropDatabase();
    await mongoose.connection.close();
  });

  describe('Cryptographic Service', () => {
    test('should sign and verify game state', () => {
      const gameState = {
        gameType: 'blackjack',
        playerHand: [{ suit: 'hearts', value: 'A' }],
        dealerHand: [{ suit: 'spades', value: 'K' }],
        gamePhase: 'playing'
      };

      const signature = cryptographicService.signGameState(gameState);
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');

      const signedState = { data: gameState, signature };
      const isValid = cryptographicService.verifyGameStateSignature(signedState);
      expect(isValid).toBe(true);
    });

    test('should detect tampered game state', () => {
      const gameState = {
        gameType: 'blackjack',
        playerHand: [{ suit: 'hearts', value: 'A' }],
        dealerHand: [{ suit: 'spades', value: 'K' }],
        gamePhase: 'playing'
      };

      const signature = cryptographicService.signGameState(gameState);
      
      // Tamper with the game state
      const tamperedState = {
        ...gameState,
        playerHand: [{ suit: 'hearts', value: 'A' }, { suit: 'hearts', value: 'K' }] // Add winning card
      };

      const signedState = { data: tamperedState, signature };
      const isValid = cryptographicService.verifyGameStateSignature(signedState);
      expect(isValid).toBe(false);
    });

    test('should generate secure random numbers', async () => {
      const random1 = await cryptographicService.generateSecureRandom(1, 10);
      const random2 = await cryptographicService.generateSecureRandom(1, 10);
      
      expect(random1).toBeGreaterThanOrEqual(1);
      expect(random1).toBeLessThanOrEqual(10);
      expect(random2).toBeGreaterThanOrEqual(1);
      expect(random2).toBeLessThanOrEqual(10);
      
      // Should be different (very high probability)
      expect(random1).not.toBe(random2);
    });

    test('should create and verify signed game state', () => {
      const gameState = {
        gameType: 'coinToss',
        playerChoice: 'heads',
        result: 'tails',
        gamePhase: 'completed'
      };

      const signedState = cryptographicService.createSignedGameState(gameState);
      expect(signedState.data).toEqual(expect.objectContaining(gameState));
      expect(signedState.signature).toBeDefined();
      expect(signedState.timestamp).toBeDefined();
      expect(signedState.nonce).toBeDefined();

      const isValid = cryptographicService.verifySignedGameState(signedState);
      expect(isValid).toBe(true);
    });
  });

  describe('Secure Communication Service', () => {
    test('should validate allowed origins', () => {
      expect(secureCommunicationService.validateMessageOrigin('https://naffles.com')).toBe(true);
      expect(secureCommunicationService.validateMessageOrigin('https://app.naffles.com')).toBe(true);
      expect(secureCommunicationService.validateMessageOrigin('https://malicious.com')).toBe(false);
      expect(secureCommunicationService.validateMessageOrigin('http://localhost:3000')).toBe(true); // Dev mode
    });

    test('should create and verify secure messages', () => {
      const message = secureCommunicationService.createSecureMessage('GAME_ACTION', { action: 'hit' }, 'game');
      
      expect(message.type).toBe('GAME_ACTION');
      expect(message.payload).toEqual({ action: 'hit' });
      expect(message.source).toBe('game');
      expect(message.signature).toBeDefined();
      expect(message.timestamp).toBeDefined();
      expect(message.nonce).toBeDefined();

      const isValid = secureCommunicationService.verifySecureMessage(message);
      expect(isValid).toBe(true);
    });

    test('should reject old messages', () => {
      const oldMessage = {
        type: 'GAME_ACTION',
        payload: { action: 'hit' },
        source: 'game',
        timestamp: Date.now() - (10 * 60 * 1000), // 10 minutes ago
        nonce: 'test-nonce'
      };
      
      oldMessage.signature = secureCommunicationService.createMessageSignature(oldMessage);
      
      const isValid = secureCommunicationService.verifySecureMessage(oldMessage);
      expect(isValid).toBe(false);
    });

    test('should implement rate limiting', async () => {
      const clientId = 'test-client-123';
      const action = 'GAME_ACTION';

      // First request should be allowed
      const result1 = await secureCommunicationService.rateLimit(clientId, action);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(99);

      // Simulate many requests
      for (let i = 0; i < 99; i++) {
        await secureCommunicationService.rateLimit(clientId, action);
      }

      // 101st request should be blocked
      const result101 = await secureCommunicationService.rateLimit(clientId, action);
      expect(result101.allowed).toBe(false);
      expect(result101.remaining).toBe(0);
    });
  });

  describe('Game Security Service', () => {
    test('should create secure game session', async () => {
      // Mock user balance check
      jest.spyOn(require('../services/socket/helpers'), 'isUserHasEnoughBalance')
        .mockResolvedValue(true);

      const session = await gameSecurityService.createSecureGameSession(
        testUser._id,
        'blackjack',
        'eth',
        '0.01',
        {}
      );

      expect(session.sessionId).toBeDefined();
      expect(session.gameType).toBe('blackjack');
      expect(session.signedGameState).toBeDefined();
      expect(session.fundLockId).toBeDefined();
    });

    test('should reject insufficient balance', async () => {
      // Mock insufficient balance
      jest.spyOn(require('../services/socket/helpers'), 'isUserHasEnoughBalance')
        .mockResolvedValue(false);

      await expect(
        gameSecurityService.createSecureGameSession(
          testUser._id,
          'blackjack',
          'eth',
          '100', // Large amount
          {}
        )
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('Security Monitoring Service', () => {
    test('should log security events', async () => {
      const event = {
        eventType: 'test_event',
        playerId: testUser._id,
        details: { test: 'data' },
        severity: 'low',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      await securityMonitoringService.logSecurityEvent(event);

      const events = await securityMonitoringService.getPlayerSecurityEvents(
        testUser._id,
        60 * 1000 // Last minute
      );

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].eventType).toBe('test_event');
    });

    test('should detect suspicious activity', async () => {
      const rapidActions = Array(10).fill().map((_, i) => ({
        type: 'GAME_ACTION',
        timestamp: Date.now() + i * 100, // 100ms apart
        data: { action: 'hit' }
      }));

      const result = await securityMonitoringService.detectSuspiciousActivity(
        testUser._id,
        rapidActions
      );

      expect(result.isSuspicious).toBe(true);
      expect(result.reasons).toContain('rapid_fire_actions');
    });
  });

  describe('Secure Game API Endpoints', () => {
    test('should initialize secure game session', async () => {
      // Mock balance check
      jest.spyOn(require('../services/socket/helpers'), 'isUserHasEnoughBalance')
        .mockResolvedValue(true);

      const response = await request(app)
        .post('/secure-games/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameType: 'blackjack',
          tokenType: 'eth',
          betAmount: '0.01'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionId).toBeDefined();
      expect(response.body.data.signedGameState).toBeDefined();
    });

    test('should reject unauthorized requests', async () => {
      const response = await request(app)
        .post('/secure-games/initialize')
        .send({
          gameType: 'blackjack',
          tokenType: 'eth',
          betAmount: '0.01'
        });

      expect(response.status).toBe(401);
    });

    test('should establish secure communication channel', async () => {
      const response = await request(app)
        .post('/secure-games/channel')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.channelId).toBeDefined();
      expect(response.body.data.channelKey).toBeDefined();
    });

    test('should get security status', async () => {
      const response = await request(app)
        .get('/secure-games/security-status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.securityLevel).toBeDefined();
    });
  });

  describe('Security Integration Tests', () => {
    test('should prevent client-side game state manipulation', async () => {
      // Mock balance check
      jest.spyOn(require('../services/socket/helpers'), 'isUserHasEnoughBalance')
        .mockResolvedValue(true);

      // Initialize game
      const initResponse = await request(app)
        .post('/secure-games/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameType: 'blackjack',
          tokenType: 'eth',
          betAmount: '0.01'
        });

      const sessionId = initResponse.body.data.sessionId;
      const signedGameState = initResponse.body.data.signedGameState;

      // Attempt to tamper with game state
      const tamperedState = {
        ...signedGameState,
        data: {
          ...signedGameState.data,
          playerHand: [
            { suit: 'hearts', value: 'A' },
            { suit: 'spades', value: 'K' }
          ] // Fake blackjack
        }
      };

      // Try to submit action with tampered state
      const actionResponse = await request(app)
        .post(`/secure-games/${sessionId}/action`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          action: 'stand',
          signedGameState: tamperedState
        });

      // Should reject tampered state
      expect(actionResponse.status).toBe(500);
      expect(actionResponse.body.error).toContain('Invalid');
    });

    test('should handle secure iframe communication', async () => {
      const secureMessage = secureCommunicationService.createSecureMessage(
        'GAME_ACTION',
        { action: 'hit' },
        'game'
      );

      const response = await request(app)
        .post('/secure-games/message')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: secureMessage,
          origin: 'https://naffles.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should reject messages from unauthorized origins', async () => {
      const secureMessage = secureCommunicationService.createSecureMessage(
        'GAME_ACTION',
        { action: 'hit' },
        'game'
      );

      const response = await request(app)
        .post('/secure-games/message')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: secureMessage,
          origin: 'https://malicious.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid');
    });
  });
});

// Cleanup mocks after tests
afterEach(() => {
  jest.restoreAllMocks();
});