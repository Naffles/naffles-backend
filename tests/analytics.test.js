const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const raffleAnalyticsService = require('../services/raffleAnalyticsService');

// Models
const Raffle = require('../models/raffle/raffle');
const RaffleTicket = require('../models/raffle/raffleTicket');
const RaffleWinner = require('../models/raffle/raffleWinner');
const User = require('../models/user/user');

// Test data
let mongoServer;
let testUser;
let testRaffle;

/**
 * Setup test environment
 */
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  
  // Create test user
  testUser = await User.create({
    username: 'analyticsuser',
    email: 'analytics@example.com',
    password: 'password123',
    roles: ['user']
  });
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
  await RaffleTicket.deleteMany({});
  await RaffleWinner.deleteMany({});
});

/**
 * Test suite for raffle analytics service
 */
describe('Raffle Analytics Service', () => {
  beforeEach(async () => {
    // Create test raffle
    testRaffle = await Raffle.create({
      eventId: 'analytics-test-raffle',
      lotteryTypeEnum: 'NFT',
      raffleTypeEnum: 'STANDARD',
      perTicketPrice: '10',
      perTicketPriceNumber: 10,
      ticketsAvailable: 90,
      ticketsSold: 10,
      coinType: 'eth',
      createdBy: testUser._id,
      raffleStartDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      raffleEndDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), // 6 days from now
      status: {
        isActive: true,
        isCompleted: false,
        isCancelled: false
      }
    });
    
    // Create test tickets
    for (let i = 1; i <= 10; i++) {
      await RaffleTicket.create({
        raffle: testRaffle._id,
        purchasedBy: testUser._id,
        ticketNumber: i,
        ticketPrice: '10',
        isFree: false,
        createdAt: new Date(Date.now() - (24 - i) * 60 * 60 * 1000) // Spread over last day
      });
    }
  });
  
  /**
   * Test getting raffle analytics
   */
  test('should get comprehensive raffle analytics', async () => {
    const analytics = await raffleAnalyticsService.getRaffleAnalytics(testRaffle._id);
    
    expect(analytics).toHaveProperty('raffleId');
    expect(analytics).toHaveProperty('eventId');
    expect(analytics).toHaveProperty('type');
    expect(analytics).toHaveProperty('status');
    expect(analytics).toHaveProperty('timing');
    expect(analytics).toHaveProperty('tickets');
    expect(analytics).toHaveProperty('revenue');
    expect(analytics).toHaveProperty('participants');
    expect(analytics).toHaveProperty('timeline');
    
    // Verify basic data
    expect(analytics.raffleId).toBe(testRaffle._id.toString());
    expect(analytics.eventId).toBe('analytics-test-raffle');
    expect(analytics.type.lottery).toBe('NFT');
    expect(analytics.type.raffle).toBe('STANDARD');
    
    // Verify ticket data
    expect(analytics.tickets.sold).toBe(10);
    expect(analytics.tickets.available).toBe(90);
    expect(analytics.tickets.price).toBe('10');
    expect(analytics.tickets.currency).toBe('eth');
    
    // Verify revenue data
    expect(analytics.revenue.total).toBe(100); // 10 tickets * 10 each
    expect(analytics.revenue.currency).toBe('eth');
    
    // Verify participant data
    expect(analytics.participants.uniqueBuyers).toBe(1);
    expect(analytics.participants.averageTicketsPerBuyer).toBe('10.00');
    expect(analytics.participants.maxTicketsByUser).toBe(10);
    expect(analytics.participants.minTicketsByUser).toBe(10);
    
    // Verify timeline data
    expect(analytics.timeline).toBeInstanceOf(Array);
    expect(analytics.timeline.length).toBeGreaterThan(0);
    expect(analytics.timeline[0]).toHaveProperty('date');
    expect(analytics.timeline[0]).toHaveProperty('tickets');
    expect(analytics.timeline[0]).toHaveProperty('revenue');
  });
  
  /**
   * Test getting platform statistics
   */
  test('should get platform-wide statistics', async () => {
    const statistics = await raffleAnalyticsService.getPlatformStatistics();
    
    expect(statistics).toHaveProperty('raffles');
    expect(statistics).toHaveProperty('tickets');
    expect(statistics).toHaveProperty('users');
    expect(statistics).toHaveProperty('revenue');
    expect(statistics).toHaveProperty('timeline');
    
    // Verify raffle statistics
    expect(statistics.raffles.total).toBe(1);
    expect(statistics.raffles.active).toBe(1);
    expect(statistics.raffles.completed).toBe(0);
    expect(statistics.raffles.cancelled).toBe(0);
    
    // Verify ticket statistics
    expect(statistics.tickets.total).toBe(10);
    expect(statistics.tickets.free).toBe(0);
    expect(statistics.tickets.paid).toBe(10);
    
    // Verify user statistics
    expect(statistics.users.total).toBe(1);
    
    // Verify revenue
    expect(statistics.revenue.total).toBe(100);
  });
  
  /**
   * Test getting user participation analytics
   */
  test('should get user participation analytics', async () => {
    const analytics = await raffleAnalyticsService.getUserParticipationAnalytics(testUser._id);
    
    expect(analytics).toHaveProperty('userId');
    expect(analytics).toHaveProperty('participation');
    expect(analytics).toHaveProperty('wins');
    expect(analytics).toHaveProperty('recentActivity');
    
    // Verify user ID
    expect(analytics.userId).toBe(testUser._id.toString());
    
    // Verify participation data
    expect(analytics.participation.totalTickets).toBe(10);
    expect(analytics.participation.totalRaffles).toBe(1);
    expect(analytics.participation.totalSpent).toBe(100);
    expect(analytics.participation.byType.nft).toBe(1);
    expect(analytics.participation.byType.token).toBe(0);
    expect(analytics.participation.byType.nafflings).toBe(0);
    
    // Verify wins data
    expect(analytics.wins.total).toBe(0);
    expect(analytics.wins.claimed).toBe(0);
    expect(analytics.wins.unclaimed).toBe(0);
    expect(analytics.wins.winRate).toBe('0.00');
    
    // Verify recent activity
    expect(analytics.recentActivity).toBeInstanceOf(Array);
    expect(analytics.recentActivity.length).toBe(10);
    expect(analytics.recentActivity[0]).toHaveProperty('ticketId');
    expect(analytics.recentActivity[0]).toHaveProperty('raffleId');
    expect(analytics.recentActivity[0]).toHaveProperty('ticketNumber');
  });
  
  /**
   * Test getting leaderboard
   */
  test('should get leaderboard data', async () => {
    // Create additional users and tickets for more interesting leaderboard
    const user2 = await User.create({
      username: 'user2',
      email: 'user2@example.com',
      password: 'password123',
      roles: ['user']
    });
    
    // Create tickets for user2
    for (let i = 11; i <= 15; i++) {
      await RaffleTicket.create({
        raffle: testRaffle._id,
        purchasedBy: user2._id,
        ticketNumber: i,
        ticketPrice: '10',
        isFree: false
      });
    }
    
    const leaderboard = await raffleAnalyticsService.getLeaderboard({ limit: 10, sortBy: 'tickets' });
    
    expect(leaderboard).toBeInstanceOf(Array);
    expect(leaderboard.length).toBe(2);
    
    // Should be sorted by ticket count (descending)
    expect(leaderboard[0].ticketCount).toBeGreaterThanOrEqual(leaderboard[1].ticketCount);
    
    // Verify leaderboard entry structure
    expect(leaderboard[0]).toHaveProperty('userId');
    expect(leaderboard[0]).toHaveProperty('username');
    expect(leaderboard[0]).toHaveProperty('ticketCount');
    expect(leaderboard[0]).toHaveProperty('raffleCount');
    expect(leaderboard[0]).toHaveProperty('totalSpent');
    expect(leaderboard[0]).toHaveProperty('winCount');
  });
  
  /**
   * Test analytics with winner data
   */
  test('should include winner data in raffle analytics', async () => {
    // Create a winner
    const winningTicket = await RaffleTicket.findOne({ ticketNumber: 5 });
    await RaffleWinner.create({
      raffle: testRaffle._id,
      user: testUser._id,
      winningTicket: winningTicket._id,
      isClaimed: false
    });
    
    const analytics = await raffleAnalyticsService.getRaffleAnalytics(testRaffle._id);
    
    expect(analytics.winner).toBeTruthy();
    expect(analytics.winner.userId).toBe(testUser._id.toString());
    expect(analytics.winner.ticketNumber).toBe(5);
    expect(analytics.winner.claimed).toBe(false);
  });
  
  /**
   * Test analytics with filters
   */
  test('should filter platform statistics by date range', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    const statistics = await raffleAnalyticsService.getPlatformStatistics({
      startDate: yesterday.toISOString(),
      endDate: tomorrow.toISOString()
    });
    
    expect(statistics.raffles.total).toBe(1);
    
    // Test with date range that excludes our raffle
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    
    const emptyStatistics = await raffleAnalyticsService.getPlatformStatistics({
      startDate: twoDaysAgo.toISOString(),
      endDate: oneDayAgo.toISOString()
    });
    
    expect(emptyStatistics.raffles.total).toBe(0);
  });
  
  /**
   * Test error handling
   */
  test('should handle invalid raffle ID gracefully', async () => {
    await expect(raffleAnalyticsService.getRaffleAnalytics('invalid-id'))
      .rejects.toThrow();
  });
  
  test('should handle non-existent raffle ID', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await expect(raffleAnalyticsService.getRaffleAnalytics(fakeId))
      .rejects.toThrow('Raffle not found');
  });
  
  test('should handle invalid user ID in user analytics', async () => {
    await expect(raffleAnalyticsService.getUserParticipationAnalytics('invalid-id'))
      .rejects.toThrow();
  });
});