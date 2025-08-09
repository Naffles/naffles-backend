// Enhanced Test setup file with comprehensive mocking
require('dotenv').config({ path: '.env.test' });

const testEnvironment = require('./testEnvironment');

// Global test setup
beforeAll(async () => {
  console.log('🚀 Setting up global test environment...');
  await testEnvironment.setup();
  testEnvironment.setTestEnvironmentVariables();
});

afterAll(async () => {
  console.log('🧹 Tearing down global test environment...');
  await testEnvironment.teardown();
});

beforeEach(async () => {
  // Clear test data before each test
  await testEnvironment.clearData();
});

// Mock Redis client with ioredis-mock
jest.mock('../config/redisClient', () => {
  const Redis = require('ioredis-mock');
  const mockRedis = new Redis();
  
  return {
    client: mockRedis,
    getAsync: mockRedis.get.bind(mockRedis),
    setAsync: mockRedis.set.bind(mockRedis),
    delAsync: mockRedis.del.bind(mockRedis),
    incrAsync: mockRedis.incr.bind(mockRedis),
    expireAsync: mockRedis.expire.bind(mockRedis),
    ttlAsync: mockRedis.ttl.bind(mockRedis),
    redlock: {
      lock: jest.fn().mockResolvedValue({
        unlock: jest.fn().mockResolvedValue(true)
      })
    }
  };
});

// Mock Google Cloud Storage
jest.mock('../services/gcs', () => ({
  uploadFile: jest.fn().mockResolvedValue('https://mock-url.com/file.jpg'),
  deleteFile: jest.fn().mockResolvedValue(true),
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-signed-url.com')
}));

// Mock external APIs with comprehensive responses
jest.mock('axios', () => ({
  get: jest.fn().mockImplementation((url) => {
    // Mock different responses based on URL
    if (url.includes('coingecko')) {
      return Promise.resolve({
        data: {
          ethereum: { usd: 2000 },
          solana: { usd: 100 },
          'matic-network': { usd: 1 }
        }
      });
    }
    if (url.includes('alchemy')) {
      return Promise.resolve({
        data: {
          ownedNfts: [
            {
              contract: { address: '0x123' },
              tokenId: '1',
              metadata: { name: 'Test NFT' }
            }
          ]
        }
      });
    }
    return Promise.resolve({ data: {} });
  }),
  post: jest.fn().mockResolvedValue({ data: { success: true } }),
  put: jest.fn().mockResolvedValue({ data: { success: true } }),
  delete: jest.fn().mockResolvedValue({ data: { success: true } })
}));

// Mock blockchain services
jest.mock('ethers', () => ({
  JsonRpcProvider: jest.fn().mockImplementation(() => ({
    getBalance: jest.fn().mockResolvedValue('1000000000000000000'),
    getTransactionReceipt: jest.fn().mockResolvedValue({ status: 1 }),
    sendTransaction: jest.fn().mockResolvedValue({
      hash: '0x123',
      wait: jest.fn().mockResolvedValue({ status: 1 })
    })
  })),
  Wallet: jest.fn().mockImplementation(() => ({
    address: '0x' + Math.random().toString(16).substr(2, 40),
    signTransaction: jest.fn().mockResolvedValue('0xsignature')
  })),
  Contract: jest.fn().mockImplementation(() => ({
    balanceOf: jest.fn().mockResolvedValue('1000000000000000000'),
    transfer: jest.fn().mockResolvedValue({
      hash: '0x123',
      wait: jest.fn().mockResolvedValue({ status: 1 })
    })
  }))
}));

// Mock Solana web3
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getBalance: jest.fn().mockResolvedValue(1000000000),
    sendTransaction: jest.fn().mockResolvedValue('signature123'),
    confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } })
  })),
  PublicKey: jest.fn().mockImplementation((key) => ({ toString: () => key })),
  Keypair: {
    generate: jest.fn().mockReturnValue({
      publicKey: { toString: () => 'mockPublicKey' },
      secretKey: new Uint8Array(64)
    })
  }
}));

// Mock VRF service
jest.mock('../services/vrfService', () => ({
  requestRandomness: jest.fn().mockImplementation(() => {
    const requestId = Math.floor(Math.random() * 1000000);
    const randomValue = Math.floor(Math.random() * 1000000);
    return Promise.resolve({ requestId, randomValue });
  }),
  getRandomValue: jest.fn().mockResolvedValue(Math.floor(Math.random() * 1000000)),
  verifyRandomness: jest.fn().mockResolvedValue(true)
}));

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn()
}));

// Mock email services
jest.mock('mailgun-js', () => () => ({
  messages: () => ({
    send: jest.fn().mockResolvedValue({ message: 'Queued. Thank you.' })
  })
}));

// Mock social media APIs
jest.mock('twitter-api-sdk', () => ({
  Client: jest.fn().mockImplementation(() => ({
    users: {
      findUserByUsername: jest.fn().mockResolvedValue({
        data: { id: '123', username: 'testuser' }
      })
    }
  }))
}));

// Set test timeout
jest.setTimeout(30000);

// Global test utilities
global.testEnvironment = testEnvironment;
global.createTestUser = testEnvironment.createTestUser.bind(testEnvironment);
global.createTestCommunity = testEnvironment.createTestCommunity.bind(testEnvironment);
global.createTestGame = testEnvironment.createTestGame.bind(testEnvironment);