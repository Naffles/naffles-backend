const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const request = require('supertest');

// Models
const Raffle = require('../models/raffle/raffle');
const RafflePrize = require('../models/raffle/rafflePrize');
const RaffleTicket = require('../models/raffle/raffleTicket');
const RaffleWinner = require('../models/raffle/raffleWinner');
const User = require('../models/user/user');

// Services
const raffleService = require('../services/raffleService');
const raffleAnalyticsService = require('../services/raffleAnalyticsService');

// App
const app = require('../app'); // Adjust path as needed

// Config
const { JWT_SECRET } = require('../config/config');

// Test data
let mongoServer;
let testUser;
let testAdmin;
let testRaffle;
let testRafflePrize;
let userToken;
let adminToken;

/**
 * Setup test environment
 */
beforeAll(async () => {
  // Start in-memory MongoDB server
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Connect to in-memory database
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  
  // Create test users
  testUser = await User.create({
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
    roles: ['user']
  });
  
  testAdmin = await User.create({
    username: 'testadmin',
    email: 'admin@example.com',
    password: 'password123',
    roles: ['user', 'admin']
  });
  
  // Generate tokens
  userToken = jwt.sign({ _id: testUser._id, roles: testUser.roles }, JWT_SECRET, { expiresIn: '1h' });
  adminToken = jwt.sign({ _id: testAdmin._id, roles: testAdmin.roles }, JWT_SECRET, { expiresIn: '1h' });
});

/**
 * Clean up test environment
 */
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

/**
 * Clean up after each test
 */
afterEach(async () => {
  await Raffle.deleteMany({});
  await RafflePrize.deleteMany({});
  await RaffleTicket.deleteMany({});
  await RaffleWinner.deleteMany({});
});

/**
 * Test suite for raffle creation
 */
describe('Raffle Creation', () => {
  /**
   * Test NFT raffle creation
   */
  test('should create NFT raffle with valid parameters', async () => {
    const raffleData = {
      lotteryTypeEnum: 'NFT',
      raffleTypeEnum: 'STANDARD',
      perTicketPrice: '10',
      raffleDurationDays: 7,
      ticketsAvailable: 100,
      coinType: 'eth',
      rafflePrize: {
        contractAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        tokenId: '123',
        chainId: 'ethereum'
      }
    };
    
    const response = await request(app)
      .post('/api/raffles')
      .set('Authorization', `Bearer ${userToken}`)
      .send(raffleData)
      .expect(201);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('_id');
    expect(response.body.data.lotteryTypeEnum).toBe('NFT');
    expect(response.body.data.raffleTypeEnum).toBe('STANDARD');
    expect(response.body.data.ticketsAvailable).toBe(100);
    
    // Verify raffle prize was created
    const prize = await RafflePrize.findOne({ raffle: response.body.data._id });
    expect(prize).toBeTruthy();
    expect(prize.nftPrize.contractAddress).toBe('0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6');
    expect(prize.nftPrize.tokenId).toBe('123');
  });
  
  /**
   * Test validation errors
   */
  test('should return validation errors for invalid parameters', async () => {
    const invalidRaffleData = {
      lotteryTypeEnum: 'INVALID',
      raffleTypeEnum: 'STANDARD',
      perTicketPrice: '-10', // Invalid price
      raffleDurationDays: 0, // Invalid duration
      ticketsAvailable: 100,
      coinType: 'eth'
      // Missing rafflePrize
    };
    
    const response = await request(app)
      .post('/api/raffles')
      .set('Authorization', `Bearer ${userToken}`)
      .send(invalidRaffleData)
      .expect(400);
    
    expect(response.body.success).toBe(false);
    expect(response.body).toHaveProperty('error');
  });
});

/**
 * Test suite for raffle analytics
 */
describe('Raffle Analytics', () => {
  beforeEach(async () => {
    // Create test raffle
    testRaffle = await Raffle.create({
      eventId: 'test-raffle-123',
      lotteryTypeEnum: 'NFT',
      raffleTypeEnum: 'STANDARD',
      perTicketPrice: '10',
      perTicketPriceNumber: 10,
      ticketsAvailable: 95,
      ticketsSold: 5,
      coinType: 'eth',
      createdBy: testUser._id,
      raffleStartDate: new Date(),
      raffleEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      status: {
        isActive: true,
        isCompleted: false,
        isCancelled: false
      }
    });
    
    // Create test tickets
    for (let i = 1; i <= 5; i++) {
      await RaffleTicket.create({
        raffle: testRaffle._id,
        purchasedBy: testUser._id,
        ticketNumber: i,
        ticketPrice: '10',
        isFree: false
      });
    }
  });
  
  /**
   * Test raffle analytics service
   */
  test('should get comprehensive raffle analytics', async () => {
    const analytics = await raffleAnalyticsService.getRaffleAnalytics(testRaffle._id);
    
    expect(analytics).toHaveProperty('raffleId');
    expect(analytics).toHaveProperty('tickets');
    expect(analytics).toHaveProperty('revenue');
    expect(analytics).toHaveProperty('participants');
    expect(analytics).toHaveProperty('timeline');
    
    expect(analytics.tickets.sold).toBe(5);
    expect(analytics.tickets.available).toBe(95);
    expect(analytics.participants.uniqueBuyers).toBe(1);
    expect(analytics.revenue.total).toBe(50); // 5 tickets * 10 each
  });
  
  /**
   * Test platform statistics
   */
  test('should get platform-wide statistics', async () => {
    const statistics = await raffleAnalyticsService.getPlatformStatistics();
    
    expect(statistics).toHaveProperty('raffles');
    expect(statistics).toHaveProperty('tickets');
    expect(statistics).toHaveProperty('users');
    expect(statistics).toHaveProperty('revenue');
    
    expect(statistics.raffles.total).toBeGreaterThan(0);
    expect(statistics.tickets.total).toBeGreaterThan(0);
  });
  
  /**
   * Test user participation analytics
   */
  test('should get user participation analytics', async () => {
    const userAnalytics = await raffleAnalyticsService.getUserParticipationAnalytics(testUser._id);
    
    expect(userAnalytics).toHaveProperty('userId');
    expect(userAnalytics).toHaveProperty('participation');
    expect(userAnalytics).toHaveProperty('wins');
    expect(userAnalytics).toHaveProperty('recentActivity');
    
    expect(userAnalytics.participation.totalTickets).toBe(5);
    expect(userAnalytics.participation.totalRaffles).toBe(1);
    expect(userAnalytics.participation.totalSpent).toBe(50);
  });
  
  /**
   * Test leaderboard
   */
  test('should get leaderboard data', async () => {
    const leaderboard = await raffleAnalyticsService.getLeaderboard({ limit: 5, sortBy: 'tickets' });
    
    expect(leaderboard).toBeInstanceOf(Array);
    expect(leaderboard.length).toBeGreaterThan(0);
    expect(leaderboard[0]).toHaveProperty('userId');
    expect(leaderboard[0]).toHaveProperty('username');
    expect(leaderboard[0]).toHaveProperty('ticketCount');
    expect(leaderboard[0]).toHaveProperty('raffleCount');
  });
});

/**
 * Test suite for performance and edge cases
 */
describe('Performance and Edge Cases', () => {
  /**
   * Test concurrent ticket purchases
   */
  test('should handle concurrent ticket purchases correctly', async () => {
    // Create test raffle with limited tickets
    testRaffle = await Raffle.create({
      eventId: 'concurrent-test',
      lotteryTypeEnum: 'NFT',
      raffleTypeEnum: 'STANDARD',
      perTicketPrice: '10',
      perTicketPriceNumber: 10,
      ticketsAvailable: 10,
      ticketsSold: 0,
      coinType: 'eth',
      createdBy: testUser._id,
      raffleStartDate: new Date(),
      raffleEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: {
        isActive: true,
        isCompleted: false,
        isCancelled: false
      }
    });
    
    // Mock balance check
    jest.spyOn(raffleService, 'checkUserBalances').mockImplementation(() => Promise.resolve(true));
    
    // Simulate concurrent purchases
    const purchasePromises = [];
    for (let i = 0; i < 5; i++) {
      purchasePromises.push(
        request(app)
          .post(`/api/raffles/${testRaffle._id}/ticket-purchase`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ quantity: 2, userId: testUser._id })
      );
    }
    
    const results = await Promise.allSettled(purchasePromises);
    
    // Some should succeed, some might fail due to insufficient tickets
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);
    const failed = results.filter(r => r.status === 'fulfilled' && r.value.status !== 200);
    
    expect(successful.length + failed.length).toBe(5);
    
    // Verify final ticket count doesn't exceed available
    const finalRaffle = await Raffle.findById(testRaffle._id);
    expect(finalRaffle.ticketsSold).toBeLessThanOrEqual(10);
  });
  
  /**
   * Test raffle expiration handling
   */
  test('should handle expired raffles correctly', async () => {
    // Create expired raffle
    testRaffle = await Raffle.create({
      eventId: 'expired-test',
      lotteryTypeEnum: 'NFT',
      raffleTypeEnum: 'STANDARD',
      perTicketPrice: '10',
      perTicketPriceNumber: 10,
      ticketsAvailable: 100,
      ticketsSold: 0,
      coinType: 'eth',
      createdBy: testUser._id,
      raffleStartDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
      raffleEndDate: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
      status: {
        isActive: true,
        isCompleted: false,
        isCancelled: false
      }
    });
    
    // Try to purchase ticket for expired raffle
    const response = await request(app)
      .post(`/api/raffles/${testRaffle._id}/ticket-purchase`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ quantity: 1, userId: testUser._id })
      .expect(400);
    
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('expired');
  });
  
  /**
   * Test large dataset analytics performance
   */
  test('should handle analytics for large datasets efficiently', async () => {
    // Create multiple raffles and tickets
    const raffles = [];
    for (let i = 0; i < 10; i++) {
      const raffle = await Raffle.create({
        eventId: `perf-test-${i}`,
        lotteryTypeEnum: 'NFT',
        raffleTypeEnum: 'STANDARD',
        perTicketPrice: '10',
        perTicketPriceNumber: 10,
        ticketsAvailable: 100,
        ticketsSold: 50,
        coinType: 'eth',
        createdBy: testUser._id,
        raffleStartDate: new Date(),
        raffleEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: {
          isActive: true,
          isCompleted: false,
          isCancelled: false
        }
      });
      raffles.push(raffle);
      
      // Create tickets for each raffle
      for (let j = 1; j <= 50; j++) {
        await RaffleTicket.create({
          raffle: raffle._id,
          purchasedBy: testUser._id,
          ticketNumber: j,
          ticketPrice: '10',
          isFree: false
        });
      }
    }
    
    // Test analytics performance
    const startTime = Date.now();
    const statistics = await raffleAnalyticsService.getPlatformStatistics();
    const endTime = Date.now();
    
    // Should complete within reasonable time (less than 5 seconds)
    expect(endTime - startTime).toBeLessThan(5000);
    expect(statistics.raffles.total).toBe(10);
    expect(statistics.tickets.total).toBe(500);
  });
});

/**
 * Test suite for error handling
 */
describe('Error Handling', () => {
  /**
   * Test invalid raffle ID handling
   */
  test('should handle invalid raffle IDs gracefully', async () => {
    const invalidId = 'invalid-id';
    
    const response = await request(app)
      .get(`/api/raffles/${invalidId}`)
      .expect(400);
    
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Invalid');
  });
  
  /**
   * Test database connection errors
   */
  test('should handle database errors gracefully', async () => {
    // Mock database error
    jest.spyOn(Raffle, 'find').mockImplementation(() => {
      throw new Error('Database connection failed');
    });
    
    const response = await request(app)
      .get('/api/raffles')
      .expect(500);
    
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Internal server error');
    
    // Restore mock
    Raffle.find.mockRestore();
  });
  
  /**
   * Test authentication errors
   */
  test('should handle authentication errors properly', async () => {
    const response = await request(app)
      .post('/api/raffles')
      .send({
        lotteryTypeEnum: 'NFT',
        raffleTypeEnum: 'STANDARD',
        perTicketPrice: '10'
      })
      .expect(401);
    
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Authentication');
  });
});