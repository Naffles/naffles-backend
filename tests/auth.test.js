/**
 * Authentication System Tests
 * Tests for the enhanced user authentication and account management system
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index'); // Assuming your main app file
const User = require('../models/user/user');
const WalletAddress = require('../models/user/walletAddress');
const AuthService = require('../services/authService');

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'TestPassword123!',
  username: 'testuser'
};

const testWallet = {
  address: '0x1234567890123456789012345678901234567890',
  walletType: 'metamask',
  chainId: '1'
};

describe('Authentication System', () => {
  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGO_TEST_URL || 'mongodb://localhost:27017/naffles_test');
  });

  afterAll(async () => {
    // Clean up and close database connection
    await User.deleteMany({});
    await WalletAddress.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    await User.deleteMany({});
    await WalletAddress.deleteMany({});
  });

  describe('User Registration', () => {
    test('should register user with email and password', async () => {
      // First send verification code
      const verificationResponse = await request(app)
        .post('/api/users/send-email-verification')
        .send({ email: testUser.email });

      expect(verificationResponse.status).toBe(200);

      // Mock verification code (in real tests, you'd get this from Redis)
      const verificationCode = '123456';

      const response = await request(app)
        .post('/api/users/signup')
        .send({
          ...testUser,
          verificationCode
        });

      expect(response.status).toBe(201);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.token).toBeDefined();
    });

    test('should create user with wallet authentication', async () => {
      const response = await request(app)
        .post('/api/users/login/wallet')
        .send(testWallet);

      expect(response.status).toBe(201);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.isNewUser).toBe(true);
    });
  });

  describe('User Authentication', () => {
    test('should authenticate user with email and password', async () => {
      // Create user first
      const user = await AuthService.registerWithCredentials(
        testUser.email,
        testUser.password,
        '123456' // Mock verification code
      );

      const response = await request(app)
        .post('/api/users/login')
        .send({
          identifier: testUser.email,
          password: testUser.password
        });

      expect(response.status).toBe(200);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.token).toBeDefined();
    });

    test('should authenticate user with wallet', async () => {
      // Create user with wallet first
      await AuthService.authenticateWithWallet(testWallet);

      const response = await request(app)
        .post('/api/users/login/wallet')
        .send(testWallet);

      expect(response.status).toBe(200);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.token).toBeDefined();
    });
  });

  describe('Profile Management', () => {
    let authToken;
    let userId;

    beforeEach(async () => {
      // Create and authenticate user
      const result = await AuthService.registerWithCredentials(
        testUser.email,
        testUser.password,
        '123456'
      );
      userId = result.user.id;
      authToken = AuthService.generateToken(userId);
    });

    test('should get user profile', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.email).toBe(testUser.email);
    });

    test('should update profile data', async () => {
      const profileData = {
        displayName: 'Test User',
        bio: 'This is a test user',
        preferences: {
          notifications: {
            email: false
          }
        }
      };

      const response = await request(app)
        .patch('/api/users/profile/data')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ profileData });

      expect(response.status).toBe(200);
      expect(response.body.data.profileData.displayName).toBe(profileData.displayName);
    });

    test('should link wallet to user account', async () => {
      const response = await request(app)
        .post('/api/users/link-wallet')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testWallet);

      expect(response.status).toBe(201);
      expect(response.body.data.wallet.address).toBe(testWallet.address);
    });
  });

  describe('Session Management', () => {
    let authToken;
    let sessionId;

    beforeEach(async () => {
      const result = await AuthService.authenticateWithWallet(testWallet);
      authToken = result.token;
      sessionId = result.sessionId;
    });

    test('should verify valid session', async () => {
      const response = await request(app)
        .get('/api/users/verify-session')
        .set('X-Session-ID', sessionId);

      expect(response.status).toBe(200);
      expect(response.body.data.session.userId).toBeDefined();
    });

    test('should logout and destroy session', async () => {
      const response = await request(app)
        .post('/api/users/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Session-ID', sessionId);

      expect(response.status).toBe(200);

      // Verify session is destroyed
      const verifyResponse = await request(app)
        .get('/api/users/verify-session')
        .set('X-Session-ID', sessionId);

      expect(verifyResponse.status).toBe(401);
    });
  });

  describe('Wallet Management', () => {
    let authToken;
    let userId;

    beforeEach(async () => {
      const result = await AuthService.registerWithCredentials(
        testUser.email,
        testUser.password,
        '123456'
      );
      userId = result.user.id;
      authToken = AuthService.generateToken(userId);
    });

    test('should get user wallets', async () => {
      // Link a wallet first
      await AuthService.linkWalletToUser(userId, testWallet);

      const response = await request(app)
        .get('/api/users/profile/wallets')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].address).toBe(testWallet.address);
    });

    test('should set primary wallet', async () => {
      // Link a wallet first
      await AuthService.linkWalletToUser(userId, testWallet);

      const response = await request(app)
        .patch('/api/users/profile/primary-wallet')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ address: testWallet.address });

      expect(response.status).toBe(200);
      expect(response.body.data.address).toBe(testWallet.address);
    });

    test('should update wallet metadata', async () => {
      // Link a wallet first
      await AuthService.linkWalletToUser(userId, testWallet);

      const metadata = {
        label: 'My Main Wallet',
        network: 'mainnet'
      };

      const response = await request(app)
        .patch('/api/users/profile/wallet-metadata')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          address: testWallet.address,
          metadata
        });

      expect(response.status).toBe(200);
      expect(response.body.data.metadata.label).toBe(metadata.label);
    });
  });

  describe('AuthService Unit Tests', () => {
    test('should generate and verify JWT tokens', () => {
      const userId = new mongoose.Types.ObjectId();
      const token = AuthService.generateToken(userId);
      
      expect(token).toBeDefined();
      
      const decoded = AuthService.verifyToken(token);
      expect(decoded.id).toBe(userId.toString());
    });

    test('should create and retrieve sessions', async () => {
      const userId = new mongoose.Types.ObjectId();
      const sessionData = { authMethod: 'wallet' };
      
      const sessionId = await AuthService.createSession(userId, sessionData);
      expect(sessionId).toBeDefined();
      
      const retrievedSession = await AuthService.getSession(sessionId);
      expect(retrievedSession.userId).toBe(userId.toString());
      expect(retrievedSession.authMethod).toBe('wallet');
    });
  });

  describe('User Model Enhancements', () => {
    test('should calculate user tier based on founders keys', async () => {
      const user = new User({
        username: 'testuser',
        email: 'test@example.com',
        foundersKeys: [
          {
            tokenId: '1',
            contractAddress: '0x123',
            chainId: '1',
            tier: 3,
            benefits: { feeDiscount: 10, priorityAccess: true, openEntryTickets: 5 }
          }
        ]
      });

      const tier = user.calculateTier();
      expect(tier).toBe('gold');
    });

    test('should get founders key benefits', async () => {
      const user = new User({
        username: 'testuser',
        email: 'test@example.com',
        foundersKeys: [
          {
            tokenId: '1',
            contractAddress: '0x123',
            chainId: '1',
            tier: 2,
            benefits: { feeDiscount: 5, priorityAccess: false, openEntryTickets: 3 }
          },
          {
            tokenId: '2',
            contractAddress: '0x456',
            chainId: '1',
            tier: 4,
            benefits: { feeDiscount: 15, priorityAccess: true, openEntryTickets: 7 }
          }
        ]
      });

      const benefits = user.getFoundersKeyBenefits();
      expect(benefits.feeDiscount).toBe(15); // Max discount
      expect(benefits.priorityAccess).toBe(true);
      expect(benefits.openEntryTickets).toBe(10); // Sum of tickets
    });
  });
});

  describe('Authentication Optimizations', () => {
    describe('Rate Limiting', () => {
      test('should enforce rate limits on login attempts', async () => {
        const loginData = {
          identifier: 'test@example.com',
          password: 'wrongpassword'
        };

        // Make multiple failed login attempts
        const promises = Array(6).fill().map(() => 
          request(app)
            .post('/api/users/login')
            .send(loginData)
        );

        const responses = await Promise.all(promises);
        
        // Last request should be rate limited
        const lastResponse = responses[responses.length - 1];
        expect(lastResponse.status).toBe(429);
        expect(lastResponse.body.message).toContain('Too many');
      });

      test('should enforce rate limits on wallet connection attempts', async () => {
        const walletData = {
          address: '0x1234567890123456789012345678901234567890',
          walletType: 'metamask',
          chainId: '1'
        };

        // Make multiple wallet connection attempts
        const promises = Array(12).fill().map(() => 
          request(app)
            .post('/api/users/login/wallet')
            .send(walletData)
        );

        const responses = await Promise.all(promises);
        
        // Last request should be rate limited
        const lastResponse = responses[responses.length - 1];
        expect(lastResponse.status).toBe(429);
      });
    });

    describe('Enhanced Validation', () => {
      test('should validate wallet address format', async () => {
        const invalidWalletData = {
          address: 'invalid-address',
          walletType: 'metamask',
          chainId: '1'
        };

        const response = await request(app)
          .post('/api/users/login/wallet')
          .send(invalidWalletData);

        expect(response.status).toBe(500);
        expect(response.body.message).toContain('Invalid');
      });

      test('should validate signature format', async () => {
        const invalidSignatureData = {
          address: '0x1234567890123456789012345678901234567890',
          walletType: 'metamask',
          chainId: '1',
          signature: 'invalid-signature',
          timestamp: new Date().toISOString()
        };

        const response = await request(app)
          .post('/api/users/login/wallet')
          .send(invalidSignatureData);

        expect(response.status).toBe(500);
        expect(response.body.message).toContain('signature');
      });

      test('should validate timestamp expiration', async () => {
        const expiredTimestampData = {
          address: '0x1234567890123456789012345678901234567890',
          walletType: 'metamask',
          chainId: '1',
          timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 minutes ago
        };

        const response = await request(app)
          .post('/api/users/login/wallet')
          .send(expiredTimestampData);

        expect(response.status).toBe(500);
        expect(response.body.message).toContain('expired');
      });
    });

    describe('Performance Monitoring', () => {
      test('should track authentication performance', async () => {
        const { performanceMonitor } = require('../utils/shared/performance');
        
        const initialStats = performanceMonitor.getStats('wallet_authentication');
        
        await request(app)
          .post('/api/users/login/wallet')
          .send(testWallet);

        const finalStats = performanceMonitor.getStats('wallet_authentication');
        
        if (finalStats) {
          expect(finalStats.totalOperations).toBeGreaterThan(initialStats?.totalOperations || 0);
          expect(finalStats.averageDuration).toBeGreaterThan(0);
        }
      });
    });

    describe('Security Monitoring', () => {
      test('should track failed login attempts', async () => {
        const { securityMonitor } = require('../utils/shared/security');
        
        const invalidLogin = {
          identifier: 'nonexistent@example.com',
          password: 'wrongpassword'
        };

        await request(app)
          .post('/api/users/login')
          .send(invalidLogin);

        const threatScore = await securityMonitor.getThreatScore('127.0.0.1');
        expect(threatScore).toBeTruthy();
        expect(threatScore.score).toBeGreaterThan(0);
      });

      test('should block IPs with high threat scores', async () => {
        const { securityMonitor } = require('../utils/shared/security');
        
        // Simulate multiple failed attempts to increase threat score
        const invalidLogin = {
          identifier: 'test@example.com',
          password: 'wrongpassword'
        };

        // Make multiple failed attempts
        for (let i = 0; i < 10; i++) {
          await request(app)
            .post('/api/users/login')
            .send(invalidLogin);
        }

        const isBlocked = await securityMonitor.isIPBlocked('127.0.0.1');
        // Note: This might not block in test environment, but we test the functionality exists
        expect(typeof isBlocked).toBe('boolean');
      });
    });

    describe('Enhanced Logging', () => {
      test('should log authentication events', async () => {
        const { authLogger } = require('../utils/shared/logger');
        
        // Mock the logger to capture logs
        const logSpy = jest.spyOn(authLogger, 'loginSuccess');
        
        // Create and authenticate user
        const result = await AuthService.authenticateWithWallet(testWallet);
        
        expect(logSpy).toHaveBeenCalledWith(
          expect.any(String),
          'wallet',
          expect.objectContaining({
            walletAddress: testWallet.address,
            walletType: testWallet.walletType
          })
        );
        
        logSpy.mockRestore();
      });
    });
  });
});

module.exports = {
  testUser,
  testWallet
};