const testEnvironment = require('./testEnvironment');

describe('Test Environment', () => {
  test('should setup and teardown properly', async () => {
    expect(testEnvironment.isSetup).toBe(true);
    expect(testEnvironment.getDatabase()).toBeDefined();
    expect(testEnvironment.getRedis()).toBeDefined();
    expect(testEnvironment.getMocks()).toBeDefined();
  });

  test('should provide working database', async () => {
    const db = testEnvironment.getDatabase();
    expect(db.isRunning()).toBe(true);
    expect(db.getUri()).toContain('mongodb://');
  });

  test('should provide working Redis mock', async () => {
    const redis = testEnvironment.getRedis();
    
    await redis.set('test-key', 'test-value');
    const value = await redis.get('test-key');
    
    expect(value).toBe('test-value');
  });

  test('should provide blockchain mocks', () => {
    const mocks = testEnvironment.getMocks();
    
    expect(mocks.blockchain).toBeDefined();
    expect(mocks.blockchain.ethereum).toBeDefined();
    expect(mocks.blockchain.solana).toBeDefined();
    expect(mocks.blockchain.polygon).toBeDefined();
  });

  test('should provide VRF mocks', () => {
    const mocks = testEnvironment.getMocks();
    
    expect(mocks.vrf).toBeDefined();
    expect(mocks.vrf.requestRandomness).toBeDefined();
    expect(mocks.vrf.getRandomValue).toBeDefined();
  });

  test('should provide external API mocks', () => {
    const mocks = testEnvironment.getMocks();
    
    expect(mocks.externalAPIs).toBeDefined();
    expect(mocks.externalAPIs.alchemy).toBeDefined();
    expect(mocks.externalAPIs.coingecko).toBeDefined();
    expect(mocks.externalAPIs.twitter).toBeDefined();
  });

  test('should create test users', async () => {
    const user = await testEnvironment.createTestUser({
      username: 'testuser123',
      email: 'test123@example.com'
    });
    
    expect(user).toBeDefined();
    expect(user.username).toBe('testuser123');
    expect(user.email).toBe('test123@example.com');
    expect(user.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  test('should clear data between tests', async () => {
    // This test verifies that data is cleared between tests
    // If the previous test's user still exists, this would fail
    const User = require('../models/user');
    const userCount = await User.countDocuments();
    
    // Should be 0 because data is cleared before each test
    expect(userCount).toBe(0);
  });
});