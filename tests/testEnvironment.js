const testDb = require('./testDatabase');
const Redis = require('ioredis-mock');

class TestEnvironment {
  constructor() {
    this.database = testDb;
    this.redis = null;
    this.mocks = {};
    this.isSetup = false;
  }

  async setup() {
    if (this.isSetup) {
      console.log('⚡ Test environment already set up');
      return;
    }

    console.log('🚀 Setting up comprehensive test environment...');

    try {
      // Setup in-memory MongoDB
      console.log('📊 Starting in-memory MongoDB...');
      await this.database.start();

      // Setup mock Redis
      console.log('🔴 Setting up mock Redis...');
      this.redis = new Redis();

      // Setup blockchain mocks
      console.log('⛓️  Setting up blockchain mocks...');
      this.setupBlockchainMocks();

      // Setup VRF mocks
      console.log('🎲 Setting up VRF mocks...');
      this.setupVRFMocks();

      // Setup external API mocks
      console.log('🌐 Setting up external API mocks...');
      this.setupExternalAPIMocks();

      this.isSetup = true;
      console.log('✅ Test environment setup complete!');

    } catch (error) {
      console.error('❌ Failed to setup test environment:', error.message);
      throw error;
    }
  }

  setupBlockchainMocks() {
    this.mocks.blockchain = {
      ethereum: {
        getBalance: jest.fn().mockResolvedValue('1000000000000000000'), // 1 ETH
        sendTransaction: jest.fn().mockResolvedValue({
          hash: '0x' + Math.random().toString(16).substr(2, 64),
          wait: jest.fn().mockResolvedValue({ status: 1 })
        }),
        getTransactionReceipt: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 12345,
          gasUsed: '21000'
        })
      },
      solana: {
        getBalance: jest.fn().mockResolvedValue(1000000000), // 1 SOL in lamports
        sendTransaction: jest.fn().mockResolvedValue('signature123'),
        confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } })
      },
      polygon: {
        getBalance: jest.fn().mockResolvedValue('1000000000000000000'), // 1 MATIC
        sendTransaction: jest.fn().mockResolvedValue({
          hash: '0x' + Math.random().toString(16).substr(2, 64),
          wait: jest.fn().mockResolvedValue({ status: 1 })
        })
      }
    };
  }

  setupVRFMocks() {
    this.mocks.vrf = {
      requestRandomness: jest.fn().mockImplementation((params) => {
        const requestId = Math.floor(Math.random() * 1000000);
        const randomValue = Math.floor(Math.random() * 1000000);
        
        return Promise.resolve({
          requestId,
          randomValue,
          fulfilled: true,
          timestamp: Date.now()
        });
      }),
      getRandomValue: jest.fn().mockImplementation((requestId) => {
        return Promise.resolve(Math.floor(Math.random() * 1000000));
      }),
      verifyRandomness: jest.fn().mockResolvedValue(true)
    };
  }

  setupExternalAPIMocks() {
    this.mocks.externalAPIs = {
      alchemy: {
        getNFTs: jest.fn().mockResolvedValue({
          ownedNfts: [
            {
              contract: { address: '0x123' },
              tokenId: '1',
              metadata: { name: 'Test NFT' }
            }
          ]
        }),
        getTokenBalances: jest.fn().mockResolvedValue({
          tokenBalances: []
        })
      },
      coingecko: {
        getPrice: jest.fn().mockResolvedValue({
          ethereum: { usd: 2000 },
          solana: { usd: 100 },
          matic: { usd: 1 }
        })
      },
      twitter: {
        getUserByUsername: jest.fn().mockResolvedValue({
          data: { id: '123', username: 'testuser' }
        }),
        follow: jest.fn().mockResolvedValue({ data: { following: true } })
      },
      discord: {
        getGuildMember: jest.fn().mockResolvedValue({
          user: { id: '123', username: 'testuser' }
        })
      }
    };
  }

  async teardown() {
    if (!this.isSetup) {
      return;
    }

    console.log('🧹 Tearing down test environment...');

    try {
      // Stop database
      if (this.database) {
        await this.database.stop();
      }

      // Clear Redis mock
      if (this.redis) {
        this.redis.disconnect();
      }

      // Clear all mocks
      if (typeof jest !== 'undefined') {
        jest.clearAllMocks();
      }

      this.isSetup = false;
      console.log('✅ Test environment teardown complete');

    } catch (error) {
      console.error('❌ Error during teardown:', error.message);
    }
  }

  async clearData() {
    if (this.database && this.database.isRunning()) {
      await this.database.clear();
    }

    if (this.redis) {
      await this.redis.flushall();
    }

    console.log('🧹 Test data cleared');
  }

  getDatabase() {
    return this.database;
  }

  getRedis() {
    return this.redis;
  }

  getMocks() {
    return this.mocks;
  }

  // Helper methods for common test scenarios
  async createTestUser(userData = {}) {
    const User = require('../models/user');
    const defaultUser = {
      username: 'testuser',
      email: 'test@example.com',
      walletAddress: '0x' + Math.random().toString(16).substr(2, 40),
      ...userData
    };

    const user = new User(defaultUser);
    await user.save();
    return user;
  }

  async createTestCommunity(communityData = {}) {
    const Community = require('../models/community/community');
    const defaultCommunity = {
      name: 'Test Community',
      description: 'A test community',
      pointsName: 'TestPoints',
      isPublic: true,
      ...communityData
    };

    const community = new Community(defaultCommunity);
    await community.save();
    return community;
  }

  async createTestGame(gameData = {}) {
    const GameSession = require('../models/game/gameSession');
    const defaultGame = {
      gameType: 'blackjack',
      playerId: 'test-player-id',
      betAmount: 100,
      status: 'active',
      ...gameData
    };

    const game = new GameSession(defaultGame);
    await game.save();
    return game;
  }

  // Mock environment variables for testing
  setTestEnvironmentVariables() {
    process.env.NODE_ENV = 'test';
    process.env.MONGO_URL = this.database.getUri();
    process.env.REDIS_URL = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.DISABLE_EXTERNAL_APIS = 'true';
    process.env.DISABLE_BLOCKCHAIN_CALLS = 'true';
    process.env.ENABLE_TESTING_MOCKS = 'true';
  }
}

// Singleton instance
const testEnvironment = new TestEnvironment();

module.exports = testEnvironment;