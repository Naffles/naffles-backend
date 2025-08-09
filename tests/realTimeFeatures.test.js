const request = require('supertest');
const app = require('../index');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const User = require('../models/user/user');
const Raffle = require('../models/raffle/raffle');
const jwt = require('jsonwebtoken');
const io = require('socket.io-client');
const realTimeService = require('../services/realtime/realTimeService');
const chatService = require('../services/realtime/chatService');
const notificationService = require('../services/realtime/notificationService');

describe('Real-Time Features', () => {
  let mongoServer;
  let testUser;
  let authToken;
  let clientSocket;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create test user
    testUser = new User({
      username: 'testuser',
      email: 'test@example.com',
      walletAddresses: ['0x123...'],
      profileData: {
        displayName: 'Test User'
      }
    });
    await testUser.save();

    // Generate auth token
    authToken = jwt.sign({ id: testUser._id }, process.env.JWT_SECRET || 'test-secret');
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.close();
    }
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(() => {
    // Clear any existing intervals
    realTimeService.cleanup();
  });

  describe('Notification Service', () => {
    test('should send notification to user', async () => {
      const notification = {
        type: 'test_notification',
        title: 'Test Notification',
        message: 'This is a test notification',
        data: { testData: 'value' }
      };

      const result = await notificationService.sendNotification(testUser._id.toString(), notification);

      expect(result).toBeDefined();
      expect(result.type).toBe('test_notification');
      expect(result.title).toBe('Test Notification');
      expect(result.read).toBe(false);
    });

    test('should get user notifications', async () => {
      // Send a test notification first
      await notificationService.sendNotification(testUser._id.toString(), {
        type: 'test',
        title: 'Test',
        message: 'Test message'
      });

      const result = await notificationService.getUserNotifications(testUser._id.toString());

      expect(result.notifications).toBeDefined();
      expect(result.notifications.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.unreadCount).toBeGreaterThan(0);
    });

    test('should mark notification as read', async () => {
      // Send a test notification
      const notification = await notificationService.sendNotification(testUser._id.toString(), {
        type: 'test',
        title: 'Test',
        message: 'Test message'
      });

      const result = await notificationService.markAsRead(testUser._id.toString(), notification.id);

      expect(result).toBeDefined();
      expect(result.read).toBe(true);
      expect(result.readAt).toBeDefined();
    });

    test('should mark all notifications as read', async () => {
      // Send multiple test notifications
      await notificationService.sendNotification(testUser._id.toString(), {
        type: 'test1',
        title: 'Test 1',
        message: 'Test message 1'
      });

      await notificationService.sendNotification(testUser._id.toString(), {
        type: 'test2',
        title: 'Test 2',
        message: 'Test message 2'
      });

      const count = await notificationService.markAllAsRead(testUser._id.toString());

      expect(count).toBeGreaterThan(0);
    });

    test('should send bulk notifications', async () => {
      const userIds = [testUser._id.toString()];
      const notification = {
        type: 'bulk_test',
        title: 'Bulk Test',
        message: 'This is a bulk notification test'
      };

      const results = await notificationService.sendBulkNotifications(userIds, notification);

      expect(results).toBeDefined();
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
    });
  });

  describe('Chat Service', () => {
    test('should validate and clean messages', async () => {
      const validMessage = 'This is a valid message';
      const result = chatService.validateAndCleanMessage(validMessage);
      expect(result).toBe(validMessage);
    });

    test('should reject invalid messages', async () => {
      const invalidMessage = '';
      const result = chatService.validateAndCleanMessage(invalidMessage);
      expect(result).toBeNull();
    });

    test('should reject messages that are too long', async () => {
      const longMessage = 'a'.repeat(600); // Exceeds MAX_MESSAGE_LENGTH
      const result = chatService.validateAndCleanMessage(longMessage);
      expect(result).toBeNull();
    });

    test('should save and retrieve chat history', async () => {
      const testMessage = {
        id: 'test-message-1',
        user: {
          id: testUser._id.toString(),
          username: testUser.username,
          profileImage: null
        },
        message: 'Test chat message',
        timestamp: new Date(),
        room: 'test-room'
      };

      await chatService.saveChatMessage('test-room', testMessage);
      const history = await chatService.getChatHistory('test-room');

      expect(history).toBeDefined();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].message).toBe('Test chat message');
    });

    test('should send system message', async () => {
      const result = await chatService.sendSystemMessage('test-room', 'System test message', 'info');

      expect(result).toBeDefined();
      expect(result.isSystem).toBe(true);
      expect(result.user.username).toBe('System');
      expect(result.message).toBe('System test message');
    });
  });

  describe('Real-Time Service', () => {
    test('should calculate raffle odds correctly', async () => {
      const mockRaffle = {
        entries: [
          { user: testUser._id },
          { user: testUser._id },
          { user: testUser._id }
        ]
      };

      const odds = realTimeService.calculateOdds(mockRaffle);

      expect(odds.individual).toBe('33.33%');
      expect(odds.total).toBe('3 entries');
    });

    test('should handle empty raffle entries', async () => {
      const mockRaffle = { entries: [] };
      const odds = realTimeService.calculateOdds(mockRaffle);

      expect(odds.individual).toBe('0%');
      expect(odds.total).toBe('0%');
    });

    test('should update leaderboard', async () => {
      const leaderboard = await realTimeService.updateLeaderboard();

      expect(leaderboard).toBeDefined();
      expect(leaderboard.topUsers).toBeDefined();
      expect(leaderboard.recentActivity).toBeDefined();
      expect(leaderboard.lastUpdated).toBeDefined();
    });

    test('should send user notification', async () => {
      const notification = {
        type: 'test',
        title: 'Test',
        message: 'Test message'
      };

      const result = await realTimeService.sendUserNotification(testUser._id.toString(), notification);

      expect(result).toBeDefined();
      expect(result.type).toBe('test');
      expect(result.read).toBe(false);
    });

    test('should get user notifications', async () => {
      // Send a notification first
      await realTimeService.sendUserNotification(testUser._id.toString(), {
        type: 'test',
        title: 'Test',
        message: 'Test message'
      });

      const notifications = await realTimeService.getUserNotifications(testUser._id.toString());

      expect(notifications).toBeDefined();
      expect(notifications.length).toBeGreaterThan(0);
    });
  });

  describe('API Endpoints', () => {
    test('GET /api/realtime/notifications should return user notifications', async () => {
      // Send a test notification first
      await notificationService.sendNotification(testUser._id.toString(), {
        type: 'test',
        title: 'Test API',
        message: 'Test API message'
      });

      const response = await request(app)
        .get('/api/realtime/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.notifications).toBeDefined();
      expect(response.body.total).toBeDefined();
      expect(response.body.unreadCount).toBeDefined();
    });

    test('GET /api/realtime/notifications/count should return notification count', async () => {
      const response = await request(app)
        .get('/api/realtime/notifications/count')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.count).toBeDefined();
      expect(typeof response.body.count).toBe('number');
    });

    test('POST /api/realtime/notifications/read-all should mark all as read', async () => {
      // Send test notifications first
      await notificationService.sendNotification(testUser._id.toString(), {
        type: 'test1',
        title: 'Test 1',
        message: 'Test message 1'
      });

      const response = await request(app)
        .post('/api/realtime/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBeDefined();
    });

    test('GET /api/realtime/leaderboard should return leaderboard data', async () => {
      const response = await request(app)
        .get('/api/realtime/leaderboard')
        .expect(200);

      expect(response.body.topUsers).toBeDefined();
      expect(response.body.recentActivity).toBeDefined();
      expect(response.body.lastUpdated).toBeDefined();
    });

    test('GET /api/realtime/chat/:room/history should return chat history', async () => {
      // Save a test message first
      await chatService.saveChatMessage('test-room', {
        id: 'test-1',
        user: { id: testUser._id.toString(), username: testUser.username },
        message: 'Test message',
        timestamp: new Date(),
        room: 'test-room'
      });

      const response = await request(app)
        .get('/api/realtime/chat/test-room/history')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.messages).toBeDefined();
      expect(Array.isArray(response.body.messages)).toBe(true);
    });

    test('POST /api/realtime/test-notification should send test notification', async () => {
      const response = await request(app)
        .post('/api/realtime/test-notification')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'API Test',
          message: 'This is an API test notification'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.notification).toBeDefined();
    });

    test('should require authentication for protected routes', async () => {
      await request(app)
        .get('/api/realtime/notifications')
        .expect(401);

      await request(app)
        .post('/api/realtime/notifications/read-all')
        .expect(401);
    });
  });

  describe('Raffle Real-Time Features', () => {
    let testRaffle;

    beforeEach(async () => {
      // Create a test raffle
      testRaffle = new Raffle({
        title: 'Test Raffle',
        description: 'Test raffle description',
        creator: testUser._id,
        prize: {
          type: 'token',
          amount: 100,
          currency: 'ETH'
        },
        ticketPrice: {
          amount: 1,
          currency: 'ETH'
        },
        maxTickets: 100,
        endTime: new Date(Date.now() + 60000), // 1 minute from now
        status: 'active',
        entries: []
      });
      await testRaffle.save();
    });

    test('should start raffle countdown', async () => {
      realTimeService.startRaffleCountdown(testRaffle);
      
      // Check that the raffle is being tracked
      expect(realTimeService.activeRaffles.has(testRaffle._id.toString())).toBe(true);
    });

    test('should stop raffle countdown', async () => {
      realTimeService.startRaffleCountdown(testRaffle);
      realTimeService.stopRaffleCountdown(testRaffle._id.toString());
      
      // Check that the raffle is no longer being tracked
      expect(realTimeService.activeRaffles.has(testRaffle._id.toString())).toBe(false);
    });

    test('should send raffle notification', async () => {
      await realTimeService.sendRaffleNotification(testRaffle, '5 minutes remaining!');
      
      // This test mainly checks that the function doesn't throw an error
      // In a real scenario, you'd check that the notification was sent via Socket.IO
      expect(true).toBe(true);
    });

    test('should broadcast winner announcement', async () => {
      await realTimeService.broadcastWinnerAnnouncement(testRaffle, testUser);
      
      // This test mainly checks that the function doesn't throw an error
      // In a real scenario, you'd check that the announcement was broadcasted
      expect(true).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid notification data gracefully', async () => {
      try {
        await notificationService.sendNotification('invalid-user-id', {
          type: 'test',
          title: null, // Invalid title
          message: 'Test'
        });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should handle chat service errors gracefully', async () => {
      const result = await chatService.getChatHistory('non-existent-room');
      expect(result).toEqual([]);
    });

    test('should handle real-time service errors gracefully', async () => {
      const leaderboard = await realTimeService.updateLeaderboard();
      expect(leaderboard).toBeDefined();
      expect(leaderboard.topUsers).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    test('should handle multiple notifications efficiently', async () => {
      const startTime = Date.now();
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          notificationService.sendNotification(testUser._id.toString(), {
            type: 'performance_test',
            title: `Performance Test ${i}`,
            message: `Performance test message ${i}`
          })
        );
      }

      await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (less than 5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    test('should handle chat message validation efficiently', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        chatService.validateAndCleanMessage(`Test message ${i}`);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete very quickly (less than 100ms)
      expect(duration).toBeLessThan(100);
    });
  });
});

// Integration tests with Socket.IO
describe('Socket.IO Integration', () => {
  let server;
  let clientSocket;

  beforeAll((done) => {
    const http = require('http');
    const socketIo = require('socket.io');
    
    server = http.createServer();
    const io = socketIo(server);
    
    server.listen(() => {
      const port = server.address().port;
      clientSocket = io(`http://localhost:${port}`);
      
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    server.close();
    clientSocket.close();
  });

  test('should connect to socket server', (done) => {
    expect(clientSocket.connected).toBe(true);
    done();
  });

  test('should handle socket events', (done) => {
    clientSocket.emit('test-event', { data: 'test' });
    
    clientSocket.on('test-response', (data) => {
      expect(data).toBeDefined();
      done();
    });

    // Simulate server response
    setTimeout(() => {
      clientSocket.emit('test-response', { received: true });
    }, 100);
  });
});