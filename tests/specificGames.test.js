const request = require('supertest');
const app = require('../index');
const mongoose = require('mongoose');
const User = require('../models/user/user');
const GameSession = require('../models/game/gameSession');
const blackjackService = require('../services/games/blackjackService');
const coinTossService = require('../services/games/coinTossService');
const rockPaperScissorsService = require('../services/games/rockPaperScissorsService');
const specificGamesService = require('../services/games/specificGamesService');

describe('Specific Games', () => {
  let testUser;
  let authToken;

  beforeAll(async () => {
    // Create test user
    testUser = new User({
      username: 'testgamer',
      email: 'test@example.com',
      walletAddresses: [{ address: '0x123...', chainId: 'ethereum', isPrimary: true }],
      temporaryPoints: '1000000000000000000000' // 1000 tokens
    });
    await testUser.save();

    // Mock authentication
    authToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    await User.deleteMany({});
    await GameSession.deleteMany({});
  });

  describe('Blackjack Service', () => {
    test('should create and shuffle 8-deck shoe', async () => {
      const deck = await blackjackService.createAndShuffleDeck();
      
      expect(deck).toHaveLength(416); // 8 decks * 52 cards
      expect(deck[0]).toHaveProperty('suit');
      expect(deck[0]).toHaveProperty('rank');
      expect(deck[0]).toHaveProperty('value');
    });

    test('should calculate hand values correctly', () => {
      // Test basic hand
      const basicHand = [
        { rank: '10', value: 10 },
        { rank: '5', value: 5 }
      ];
      const basicValue = blackjackService.calculateHandValue(basicHand);
      expect(basicValue.value).toBe(15);
      expect(basicValue.isSoft).toBe(false);

      // Test soft ace
      const softHand = [
        { rank: 'A', value: 11 },
        { rank: '6', value: 6 }
      ];
      const softValue = blackjackService.calculateHandValue(softHand);
      expect(softValue.value).toBe(17);
      expect(softValue.isSoft).toBe(true);

      // Test blackjack
      const blackjackHand = [
        { rank: 'A', value: 11 },
        { rank: 'K', value: 10 }
      ];
      const blackjackValue = blackjackService.calculateHandValue(blackjackHand);
      expect(blackjackValue.value).toBe(21);
      expect(blackjackValue.isBlackjack).toBe(true);
    });

    test('should initialize blackjack game correctly', async () => {
      const gameState = await blackjackService.initializeGame('player1', '1000000000000000000');
      
      expect(gameState.playerHand).toHaveLength(2);
      expect(gameState.dealerHand).toHaveLength(2);
      expect(gameState.gamePhase).toBe('player_turn');
      expect(gameState.actions).toContain('hit');
      expect(gameState.actions).toContain('stand');
    });

    test('should process hit action correctly', async () => {
      const gameState = await blackjackService.initializeGame('player1', '1000000000000000000');
      const updatedState = await blackjackService.processPlayerAction(gameState, 'hit');
      
      expect(updatedState.playerHand).toHaveLength(3);
      expect(updatedState.canDouble).toBe(false);
    });
  });

  describe('Coin Toss Service', () => {
    test('should initialize coin toss game correctly', async () => {
      const gameState = await coinTossService.initializeGame('player1', '1000000000000000000');
      
      expect(gameState.gamePhase).toBe('waiting_for_choice');
      expect(gameState.actions).toContain('choose_heads');
      expect(gameState.actions).toContain('choose_tails');
      expect(gameState.playerChoice).toBeNull();
      expect(gameState.coinResult).toBeNull();
    });

    test('should process choice correctly', async () => {
      const gameState = await coinTossService.initializeGame('player1', '1000000000000000000');
      const updatedState = await coinTossService.processChoice(gameState, 'heads');
      
      expect(updatedState.playerChoice).toBe('heads');
      expect(updatedState.coinResult).toMatch(/^(heads|tails)$/);
      expect(updatedState.gamePhase).toBe('completed');
      expect(updatedState.animationType).toBeDefined();
    });

    test('should determine outcome correctly', () => {
      const gameState = {
        playerChoice: 'heads',
        coinResult: 'heads',
        animationType: 'heads_quick'
      };
      
      const outcome = coinTossService.determineOutcome(gameState, '1000000000000000000');
      
      expect(outcome.winner).toBe('player');
      expect(outcome.playerPayout).toBe('2000000000000000000'); // 2x payout
      expect(outcome.gameData.playerWon).toBe(true);
    });
  });

  describe('Rock Paper Scissors Service', () => {
    test('should initialize rock paper scissors game correctly', async () => {
      const gameState = await rockPaperScissorsService.initializeGame('player1', '1000000000000000000');
      
      expect(gameState.gamePhase).toBe('waiting_for_player_move');
      expect(gameState.actions).toContain('rock');
      expect(gameState.actions).toContain('paper');
      expect(gameState.actions).toContain('scissors');
      expect(gameState.round).toBe(1);
    });

    test('should process player move correctly', async () => {
      const gameState = await rockPaperScissorsService.initializeGame('player1', '1000000000000000000');
      const updatedState = await rockPaperScissorsService.processPlayerMove(gameState, 'rock');
      
      expect(updatedState.playerMove).toBe('rock');
      expect(updatedState.opponentMove).toMatch(/^(rock|paper|scissors)$/);
      expect(updatedState.gamePhase).toBe('completed');
    });

    test('should determine round winner correctly', () => {
      expect(rockPaperScissorsService.determineRoundWinner('rock', 'scissors')).toBe('player');
      expect(rockPaperScissorsService.determineRoundWinner('paper', 'rock')).toBe('player');
      expect(rockPaperScissorsService.determineRoundWinner('scissors', 'paper')).toBe('player');
      expect(rockPaperScissorsService.determineRoundWinner('rock', 'rock')).toBe('draw');
      expect(rockPaperScissorsService.determineRoundWinner('rock', 'paper')).toBe('opponent');
    });
  });

  describe('Specific Games Service Integration', () => {
    test('should initialize specific game correctly', async () => {
      const gameSession = await specificGamesService.initializeSpecificGame(
        'blackjack',
        testUser._id,
        '1000000000000000000',
        { tokenType: 'points' }
      );
      
      expect(gameSession.gameType).toBe('blackjack');
      expect(gameSession.gameState.initialized).toBe(true);
      expect(gameSession.displayInfo).toBeDefined();
    });

    test('should process game action correctly', async () => {
      const gameSession = await specificGamesService.initializeSpecificGame(
        'coinToss',
        testUser._id,
        '1000000000000000000',
        { tokenType: 'points' }
      );
      
      const result = await specificGamesService.processGameAction(
        gameSession.sessionId,
        'choose',
        { choice: 'heads' }
      );
      
      expect(result.gameState.playerChoice).toBe('heads');
      expect(result.status).toBe('completed');
    });

    test('should get supported game types', () => {
      const gameTypes = specificGamesService.getSupportedGameTypes();
      
      expect(gameTypes).toContain('blackjack');
      expect(gameTypes).toContain('coinToss');
      expect(gameTypes).toContain('rockPaperScissors');
    });

    test('should validate game actions correctly', () => {
      expect(specificGamesService.validateGameAction('blackjack', 'hit', {})).toBe(true);
      expect(specificGamesService.validateGameAction('blackjack', 'invalid', {})).toBe(false);
      expect(specificGamesService.validateGameAction('coinToss', 'choose', { choice: 'heads' })).toBe(true);
      expect(specificGamesService.validateGameAction('coinToss', 'choose', { choice: 'invalid' })).toBe(false);
    });
  });

  describe('API Endpoints', () => {
    test('should get supported games', async () => {
      const response = await request(app)
        .get('/specific-games/supported')
        .expect(200);
      
      expect(response.body.data.gameTypes).toContain('blackjack');
      expect(response.body.data.gameConfigs).toHaveProperty('blackjack');
    });

    test('should get game configuration', async () => {
      const response = await request(app)
        .get('/specific-games/config/blackjack')
        .expect(200);
      
      expect(response.body.data.name).toBe('Blackjack');
      expect(response.body.data.features).toContain('hit');
    });

    // Note: Authentication tests would require proper JWT setup
    // These are placeholder tests for the authenticated endpoints
    test.skip('should initialize blackjack game', async () => {
      const response = await request(app)
        .post('/specific-games/blackjack/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tokenType: 'points',
          betAmount: '1000000000000000000'
        })
        .expect(201);
      
      expect(response.body.data.gameType).toBe('blackjack');
    });
  });

  describe('VRF Integration', () => {
    test('should use VRF wrapper for randomness', async () => {
      const vrfWrapper = require('../services/vrfWrapper');
      
      // Test coin flip
      const coinResult = await vrfWrapper.coinFlip();
      expect(['heads', 'tails']).toContain(coinResult);
      
      // Test rock paper scissors choice
      const rpsChoice = await vrfWrapper.rockPaperScissorsChoice();
      expect(['rock', 'paper', 'scissors']).toContain(rpsChoice);
      
      // Test random int
      const randomInt = await vrfWrapper.getRandomInt(1, 10);
      expect(randomInt).toBeGreaterThanOrEqual(1);
      expect(randomInt).toBeLessThan(10);
    });
  });

  describe('Game History and Audit Trail', () => {
    test('should record game actions in audit trail', async () => {
      const gameHistoryService = require('../services/games/gameHistoryService');
      
      const auditRecord = await gameHistoryService.recordGameAction(
        'session123',
        'hit',
        {},
        { cards: 2 },
        { cards: 3 }
      );
      
      expect(auditRecord.action).toBe('hit');
      expect(auditRecord.timestamp).toBeDefined();
    });
  });
});

// Mock authentication middleware for testing
jest.mock('../middleware/authenticate', () => ({
  authenticate: (req, res, next) => {
    req.user = { _id: 'mock-user-id' };
    next();
  }
}));

// Mock balance checking
jest.mock('../services/socket/helpers', () => ({
  isUserHasEnoughBalance: jest.fn().mockResolvedValue(true)
}));

// Mock valid tickers
jest.mock('../utils/helpers', () => ({
  getAllValidTickers: jest.fn().mockResolvedValue(['points', 'eth', 'sol'])
}));