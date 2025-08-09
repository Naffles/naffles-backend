/**
 * Discord OAuth Integration Tests
 * Tests for Discord account linking and OAuth functionality
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const User = require('../models/user/user');
const DiscordAccount = require('../models/user/discordAccount');
const discordOAuthService = require('../services/discordOAuthService');
const { setupTestEnvironment, cleanupTestEnvironment } = require('./testEnvironment');

describe('Discord OAuth Integration', () => {
  let testUser;
  let authToken;
  let testEnvironment;

  beforeAll(async () => {
    testEnvironment = await setupTestEnvironment();
    
    // Create test user
    testUser = await User.create({
      username: 'testuser',
      email: 'test@example.com',
      walletAddress: '0x1234567890123456789012345678901234567890'
    });

    // Mock auth token
    authToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    await cleanupTestEnvironment(testEnvironment);
  });

  beforeEach(async () => {
    // Clean up Discord accounts before each test
    await DiscordAccount.deleteMany({});
  });

  describe('OAuth Configuration', () => {
    test('should validate OAuth configuration', () => {
      const config = discordOAuthService.validateConfiguration();
      
      expect(config).toHaveProperty('isValid');
      expect(config).toHaveProperty('missingConfig');
      expect(config).toHaveProperty('scopes');
      expect(config).toHaveProperty('redirectUri');
    });

    test('should have required OAuth scopes', () => {
      const config = discordOAuthService.validateConfiguration();
      expect(config.scopes).toContain('identify');
      expect(config.scopes).toContain('email');
      expect(config.scopes).toContain('guilds.members.read');
    });
  });

  describe('State Parameter Security', () => {
    test('should generate secure state parameter', () => {
      const userId = testUser._id.toString();
      const ipAddress = '127.0.0.1';
      
      const state = discordOAuthService.generateSecureState(userId, ipAddress);
      
      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
      expect(state.length).toBeGreaterThan(0);
    });

    test('should verify valid state parameter', () => {
      const userId = testUser._id.toString();
      const ipAddress = '127.0.0.1';
      
      const state = discordOAuthService.generateSecureState(userId, ipAddress);
      const verification = discordOAuthService.verifyState(state, ipAddress);
      
      expect(verification.isValid).toBe(true);
      expect(verification.userId).toBe(userId);
      expect(verification.originalIP).toBe(ipAddress);
    });

    test('should reject invalid state parameter', () => {
      const ipAddress = '127.0.0.1';
      const invalidState = 'invalid-state';
      
      expect(() => {
        discordOAuthService.verifyState(invalidState, ipAddress);
      }).toThrow('Invalid or expired state parameter');
    });

    test('should reject expired state parameter', () => {
      const userId = testUser._id.toString();
      const ipAddress = '127.0.0.1';
      
      // Mock expired timestamp
      const expiredTimestamp = Date.now() - (15 * 60 * 1000); // 15 minutes ago
      const nonce = 'test-nonce';
      const data = `${userId}:${ipAddress}:${expiredTimestamp}:${nonce}`;
      const crypto = require('crypto');
      const signature = crypto
        .createHmac('sha256', process.env.JWT_SECRET || 'fallback-secret')
        .update(data)
        .digest('hex');
      
      const expiredState = Buffer.from(`${data}:${signature}`).toString('base64');
      
      expect(() => {
        discordOAuthService.verifyState(expiredState, ipAddress);
      }).toThrow('State parameter expired');
    });
  });

  describe('Fraud Detection', () => {
    test('should track linking attempts', () => {
      const userId = testUser._id.toString();
      const ipAddress = '127.0.0.1';
      
      discordOAuthService.trackLinkingAttempt(userId, ipAddress, 'test_action');
      
      const stats = discordOAuthService.getSecurityStats();
      expect(stats.totalAttempts).toBeGreaterThan(0);
    });

    test('should detect suspicious activity after too many attempts', () => {
      const userId = testUser._id.toString();
      const ipAddress = '192.168.1.100';
      
      // Simulate multiple attempts
      for (let i = 0; i < 15; i++) {
        discordOAuthService.trackLinkingAttempt(userId, ipAddress, 'test_action');
      }
      
      const isSuspicious = discordOAuthService.isSuspiciousActivity(userId, ipAddress);
      expect(isSuspicious).toBe(true);
    });

    test('should clear user attempts after successful linking', () => {
      const userId = testUser._id.toString();
      const ipAddress = '127.0.0.1';
      
      // Track some attempts
      discordOAuthService.trackLinkingAttempt(userId, ipAddress, 'test_action');
      discordOAuthService.trackLinkingAttempt(userId, ipAddress, 'test_action');
      
      // Clear attempts
      discordOAuthService.clearUserAttempts(userId);
      
      const isSuspicious = discordOAuthService.isSuspiciousActivity(userId, ipAddress);
      expect(isSuspicious).toBe(false);
    });
  });

  describe('Account Linking Status', () => {
    test('should return not linked status for user without Discord account', async () => {
      const status = await discordOAuthService.getLinkingStatus(testUser._id.toString());
      
      expect(status.isLinked).toBe(false);
      expect(status.canLink).toBe(true);
      expect(status.message).toBe('Discord account not linked');
    });

    test('should return linked status for user with Discord account', async () => {
      // Create Discord account link
      const mockDiscordUser = {
        id: '123456789',
        username: 'testdiscorduser',
        discriminator: '1234',
        avatar: 'avatar_hash',
        email: 'discord@example.com',
        verified: true
      };

      const mockTokenData = {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expires_in: 3600,
        scope: 'identify email guilds.members.read'
      };

      await DiscordAccount.createOrUpdateLink(
        testUser._id,
        mockDiscordUser,
        mockTokenData
      );

      const status = await discordOAuthService.getLinkingStatus(testUser._id.toString());
      
      expect(status.isLinked).toBe(true);
      expect(status.isActive).toBe(true);
      expect(status.discordUser.id).toBe(mockDiscordUser.id);
      expect(status.discordUser.username).toBe(mockDiscordUser.username);
    });
  });

  describe('Account Unlinking', () => {
    test('should successfully unlink Discord account', async () => {
      // Create Discord account link
      const mockDiscordUser = {
        id: '123456789',
        username: 'testdiscorduser',
        discriminator: '1234',
        avatar: 'avatar_hash',
        email: 'discord@example.com',
        verified: true
      };

      const mockTokenData = {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expires_in: 3600,
        scope: 'identify email guilds.members.read'
      };

      await DiscordAccount.createOrUpdateLink(
        testUser._id,
        mockDiscordUser,
        mockTokenData
      );

      // Unlink the account
      const result = await discordOAuthService.unlinkDiscordAccount(
        testUser._id.toString(),
        'test_unlink'
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Discord account successfully unlinked');

      // Verify account is deactivated
      const discordAccount = await DiscordAccount.findByUserId(testUser._id);
      expect(discordAccount).toBeNull(); // Should not find active account
    });

    test('should handle unlinking non-existent Discord account', async () => {
      const result = await discordOAuthService.unlinkDiscordAccount(
        testUser._id.toString(),
        'test_unlink'
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Discord account was not linked');
    });
  });

  describe('Security Statistics', () => {
    test('should provide security statistics', () => {
      const stats = discordOAuthService.getSecurityStats();
      
      expect(stats).toHaveProperty('totalAttempts');
      expect(stats).toHaveProperty('recentAttempts');
      expect(stats).toHaveProperty('suspiciousIPs');
      expect(stats).toHaveProperty('attemptsByAction');
      expect(stats).toHaveProperty('windowSize');
      expect(stats).toHaveProperty('maxAttemptsPerIP');
      expect(stats).toHaveProperty('maxAttemptsPerUser');
    });
  });

  describe('API Endpoints', () => {
    // Mock authentication middleware for testing
    const mockAuth = (req, res, next) => {
      req.user = { id: testUser._id.toString(), isAdmin: true };
      next();
    };

    beforeEach(() => {
      // Mock the auth middleware
      jest.mock('../middleware/authMiddleware', () => mockAuth);
    });

    test('should generate authorization URL', async () => {
      const response = await request(app)
        .post('/api/discord/oauth/authorize')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.authUrl).toBeDefined();
      expect(response.body.state).toBeDefined();
      expect(response.body.expiresAt).toBeDefined();
    });

    test('should get linking status', async () => {
      const response = await request(app)
        .get('/api/discord/oauth/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.isLinked).toBe(false);
      expect(response.body.canLink).toBe(true);
    });

    test('should get management data', async () => {
      const response = await request(app)
        .get('/api/discord/oauth/management')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('discord');
      expect(response.body.data).toHaveProperty('actions');
    });

    test('should get security stats (admin only)', async () => {
      const response = await request(app)
        .get('/api/discord/oauth/security-stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats).toBeDefined();
    });

    test('should get config status (admin only)', async () => {
      const response = await request(app)
        .get('/api/discord/oauth/config-status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.configuration).toBeDefined();
    });
  });

  describe('Token Management', () => {
    test('should detect when token needs refresh', async () => {
      // Create Discord account with expired token
      const mockDiscordUser = {
        id: '123456789',
        username: 'testdiscorduser',
        discriminator: '1234',
        avatar: 'avatar_hash',
        email: 'discord@example.com',
        verified: true
      };

      const expiredTokenData = {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expires_in: -3600, // Expired 1 hour ago
        scope: 'identify email guilds.members.read'
      };

      const discordAccount = await DiscordAccount.createOrUpdateLink(
        testUser._id,
        mockDiscordUser,
        expiredTokenData
      );

      expect(discordAccount.needsTokenRefresh()).toBe(true);
    });

    test('should detect when token is still valid', async () => {
      // Create Discord account with valid token
      const mockDiscordUser = {
        id: '123456789',
        username: 'testdiscorduser',
        discriminator: '1234',
        avatar: 'avatar_hash',
        email: 'discord@example.com',
        verified: true
      };

      const validTokenData = {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expires_in: 3600, // Valid for 1 hour
        scope: 'identify email guilds.members.read'
      };

      const discordAccount = await DiscordAccount.createOrUpdateLink(
        testUser._id,
        mockDiscordUser,
        validTokenData
      );

      expect(discordAccount.needsTokenRefresh()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid user ID in linking status', async () => {
      const invalidUserId = new mongoose.Types.ObjectId().toString();
      
      const status = await discordOAuthService.getLinkingStatus(invalidUserId);
      expect(status.isLinked).toBe(false);
      expect(status.canLink).toBe(true);
    });

    test('should handle missing state parameter in callback', async () => {
      const response = await request(app)
        .post('/api/discord/oauth/callback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: 'test_code' }) // Missing state
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Missing authorization code or state parameter');
    });

    test('should handle missing code parameter in callback', async () => {
      const response = await request(app)
        .post('/api/discord/oauth/callback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ state: 'test_state' }) // Missing code
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Missing authorization code or state parameter');
    });
  });
});

describe('Discord Linking Middleware', () => {
  const { 
    requireDiscordLink, 
    requireDiscordRole, 
    refreshDiscordTokenIfNeeded,
    validateDiscordPermissions 
  } = require('../middleware/discordLinkingMiddleware');

  let testUser;
  let mockReq, mockRes, mockNext;

  beforeAll(async () => {
    // Create test user
    testUser = await User.create({
      username: 'middlewaretest',
      email: 'middleware@example.com',
      walletAddress: '0x9876543210987654321098765432109876543210'
    });
  });

  beforeEach(() => {
    mockReq = {
      user: { id: testUser._id.toString() }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requireDiscordLink middleware', () => {
    test('should pass when Discord account is linked and required=false', async () => {
      const middleware = requireDiscordLink(false);
      await middleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should fail when Discord account is not linked and required=true', async () => {
      const middleware = requireDiscordLink(true);
      await middleware(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Discord account linking required',
          requiresDiscordLink: true
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should fail when user is not authenticated', async () => {
      mockReq.user = null;
      const middleware = requireDiscordLink(true);
      await middleware(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Authentication required'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('refreshDiscordTokenIfNeeded middleware', () => {
    test('should pass through when no user is present', async () => {
      mockReq.user = null;
      const middleware = refreshDiscordTokenIfNeeded();
      await middleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    test('should pass through when user has no Discord account', async () => {
      const middleware = refreshDiscordTokenIfNeeded();
      await middleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateDiscordPermissions middleware', () => {
    test('should fail when Discord account is not linked', async () => {
      const middleware = validateDiscordPermissions(['identify', 'email']);
      await middleware(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Discord account linking required',
          requiresDiscordLink: true
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});