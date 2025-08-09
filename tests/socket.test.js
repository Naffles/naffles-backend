const http = require('http');
const socketIo = require('socket.io');
const Client = require('socket.io-client');
const jwt = require('jsonwebtoken');
const socketService = require('../services/socketService');
const { JWT_SECRET } = require('../config/config');

// Test data
let server;
let io;
let clientSocket;
let serverSocket;
let testUser;
let testToken;

/**
 * Setup test environment
 */
beforeAll((done) => {
  // Create test user data
  testUser = {
    _id: '507f1f77bcf86cd799439011',
    username: 'testuser',
    roles: ['user']
  };
  
  testToken = jwt.sign(testUser, JWT_SECRET, { expiresIn: '1h' });
  
  // Create HTTP server
  server = http.createServer();
  
  // Initialize Socket.IO service
  io = socketService.initialize(server);
  
  server.listen(() => {
    const port = server.address().port;
    
    // Create client socket
    clientSocket = new Client(`http://localhost:${port}`, {
      auth: {
        token: testToken
      }
    });
    
    // Wait for connection
    io.on('connection', (socket) => {
      serverSocket = socket;
    });
    
    clientSocket.on('connect', done);
  });
});

/**
 * Clean up test environment
 */
afterAll(() => {
  io.close();
  server.close();
  clientSocket.close();
});

/**
 * Test suite for Socket.IO service
 */
describe('Socket.IO Service', () => {
  /**
   * Test connection and authentication
   */
  test('should connect and authenticate user', (done) => {
    expect(serverSocket).toBeDefined();
    expect(serverSocket.user).toBeDefined();
    expect(serverSocket.user._id).toBe(testUser._id);
    done();
  });
  
  /**
   * Test joining raffle room
   */
  test('should join raffle room', (done) => {
    const raffleId = 'test-raffle-123';
    
    clientSocket.emit('joinRaffle', raffleId);
    
    setTimeout(() => {
      const rooms = Array.from(serverSocket.rooms);
      expect(rooms).toContain(`raffle:${raffleId}`);
      done();
    }, 100);
  });
  
  /**
   * Test leaving raffle room
   */
  test('should leave raffle room', (done) => {
    const raffleId = 'test-raffle-123';
    
    // First join the room
    clientSocket.emit('joinRaffle', raffleId);
    
    setTimeout(() => {
      // Then leave the room
      clientSocket.emit('leaveRaffle', raffleId);
      
      setTimeout(() => {
        const rooms = Array.from(serverSocket.rooms);
        expect(rooms).not.toContain(`raffle:${raffleId}`);
        done();
      }, 100);
    }, 100);
  });
  
  /**
   * Test ticket purchase emission
   */
  test('should emit ticket purchase event', (done) => {
    const raffleId = 'test-raffle-123';
    const ticketData = {
      ticketNumber: 1,\n      purchasedBy: testUser._id,\n      ticketPrice: '10'\n    };\n    \n    // Join raffle room first\n    clientSocket.emit('joinRaffle', raffleId);\n    \n    // Listen for ticket purchase event\n    clientSocket.on('ticketPurchased', (data) => {\n      expect(data.raffleId).toBe(raffleId);\n      expect(data.ticketNumber).toBe(ticketData.ticketNumber);\n      expect(data.purchasedBy).toBe(ticketData.purchasedBy);\n      expect(data.ticketPrice).toBe(ticketData.ticketPrice);\n      done();\n    });\n    \n    setTimeout(() => {\n      socketService.emitTicketPurchase(raffleId, ticketData);\n    }, 100);\n  });\n  \n  /**\n   * Test countdown update emission\n   */\n  test('should emit countdown update', (done) => {\n    const raffleId = 'test-raffle-123';\n    const countdownData = {\n      timeRemaining: 3600000, // 1 hour\n      endTime: new Date(Date.now() + 3600000)\n    };\n    \n    // Join raffle room first\n    clientSocket.emit('joinRaffle', raffleId);\n    \n    // Listen for countdown update\n    clientSocket.on('countdownUpdate', (data) => {\n      expect(data.raffleId).toBe(raffleId);\n      expect(data.timeRemaining).toBe(countdownData.timeRemaining);\n      done();\n    });\n    \n    setTimeout(() => {\n      socketService.emitCountdownUpdate(raffleId, countdownData);\n    }, 100);\n  });\n  \n  /**\n   * Test winner announcement emission\n   */\n  test('should emit winner announcement', (done) => {\n    const raffleId = 'test-raffle-123';\n    const winnerData = {\n      userId: testUser._id,\n      username: testUser.username,\n      ticketNumber: 5\n    };\n    \n    // Join raffle room first\n    clientSocket.emit('joinRaffle', raffleId);\n    \n    // Listen for winner announcement\n    clientSocket.on('winnerAnnounced', (data) => {\n      expect(data.raffleId).toBe(raffleId);\n      expect(data.userId).toBe(winnerData.userId);\n      expect(data.username).toBe(winnerData.username);\n      expect(data.ticketNumber).toBe(winnerData.ticketNumber);\n      done();\n    });\n    \n    setTimeout(() => {\n      socketService.emitWinnerAnnouncement(raffleId, winnerData);\n    }, 100);\n  });\n  \n  /**\n   * Test personal notification\n   */\n  test('should emit personal notification to user', (done) => {\n    const notificationData = {\n      message: 'Test notification',\n      type: 'info'\n    };\n    \n    // Listen for personal notification\n    clientSocket.on('notification', (data) => {\n      expect(data.type).toBe(notificationData.type);\n      expect(data.message).toBe(notificationData.message);\n      expect(data.timestamp).toBeDefined();\n      done();\n    });\n    \n    setTimeout(() => {\n      socketService.emitUserNotification(testUser._id, notificationData.type, {\n        message: notificationData.message\n      });\n    }, 100);\n  });\n  \n  /**\n   * Test global announcement\n   */\n  test('should emit global announcement', (done) => {\n    const message = 'Global test announcement';\n    const type = 'success';\n    \n    // Listen for global announcement\n    clientSocket.on('announcement', (data) => {\n      expect(data.message).toBe(message);\n      expect(data.type).toBe(type);\n      expect(data.timestamp).toBeDefined();\n      done();\n    });\n    \n    setTimeout(() => {\n      socketService.emitGlobalAnnouncement(message, type);\n    }, 100);\n  });\n  \n  /**\n   * Test connection statistics\n   */\n  test('should get connection statistics', async () => {\n    const stats = await socketService.getConnectionStats();\n    \n    expect(stats).toHaveProperty('total');\n    expect(stats).toHaveProperty('authenticated');\n    expect(stats).toHaveProperty('rooms');\n    \n    expect(stats.total).toBeGreaterThan(0);\n    expect(stats.authenticated).toBeGreaterThan(0);\n    expect(typeof stats.rooms).toBe('object');\n  });\n});\n\n/**\n * Test suite for unauthenticated connections\n */\ndescribe('Socket.IO Service - Unauthenticated', () => {\n  let unauthenticatedSocket;\n  \n  beforeAll((done) => {\n    const port = server.address().port;\n    \n    // Create client socket without authentication\n    unauthenticatedSocket = new Client(`http://localhost:${port}`);\n    \n    unauthenticatedSocket.on('connect', done);\n  });\n  \n  afterAll(() => {\n    unauthenticatedSocket.close();\n  });\n  \n  /**\n   * Test unauthenticated connection\n   */\n  test('should allow unauthenticated connection', (done) => {\n    expect(unauthenticatedSocket.connected).toBe(true);\n    done();\n  });\n  \n  /**\n   * Test joining raffle room without authentication\n   */\n  test('should allow joining raffle room without authentication', (done) => {\n    const raffleId = 'public-raffle-123';\n    \n    unauthenticatedSocket.emit('joinRaffle', raffleId);\n    \n    // Listen for raffle status update (should work for public rooms)\n    unauthenticatedSocket.on('raffleStatusUpdate', (data) => {\n      expect(data.raffleId).toBe(raffleId);\n      done();\n    });\n    \n    setTimeout(() => {\n      socketService.emitRaffleStatus(raffleId, {\n        status: { isActive: true },\n        ticketsSold: 10,\n        ticketsAvailable: 90\n      });\n    }, 100);\n  });\n});\n\n/**\n * Test suite for error handling\n */\ndescribe('Socket.IO Service - Error Handling', () => {\n  /**\n   * Test invalid token authentication\n   */\n  test('should handle invalid token gracefully', (done) => {\n    const port = server.address().port;\n    \n    const invalidTokenSocket = new Client(`http://localhost:${port}`, {\n      auth: {\n        token: 'invalid-token'\n      }\n    });\n    \n    invalidTokenSocket.on('connect_error', (error) => {\n      expect(error.message).toContain('Authentication error');\n      invalidTokenSocket.close();\n      done();\n    });\n  });\n  \n  /**\n   * Test emitting to non-existent room\n   */\n  test('should handle emitting to non-existent room gracefully', () => {\n    // This should not throw an error\n    expect(() => {\n      socketService.emitTicketPurchase('non-existent-raffle', {\n        ticketNumber: 1,\n        purchasedBy: 'user123'\n      });\n    }).not.toThrow();\n  });\n  \n  /**\n   * Test emitting without initialized service\n   */\n  test('should handle operations when service not initialized', () => {\n    // Create a new instance without initialization\n    const SocketService = require('../services/socketService').constructor;\n    const uninitializedService = new SocketService();\n    \n    // These should not throw errors\n    expect(() => {\n      uninitializedService.emitTicketPurchase('raffle-123', { ticketNumber: 1 });\n    }).not.toThrow();\n    \n    expect(() => {\n      uninitializedService.emitGlobalAnnouncement('Test message');\n    }).not.toThrow();\n  });\n});