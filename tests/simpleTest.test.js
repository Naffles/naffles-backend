// Simple test to verify our testing environment works
describe('Simple Test Environment Verification', () => {
  test('should have test environment available', () => {
    expect(global.testEnvironment).toBeDefined();
  });

  test('should have mock services available', () => {
    const mocks = global.testEnvironment.getMocks();
    expect(mocks).toBeDefined();
    expect(mocks.blockchain).toBeDefined();
    expect(mocks.vrf).toBeDefined();
    expect(mocks.externalAPIs).toBeDefined();
  });

  test('should have Redis mock working', async () => {
    const redis = global.testEnvironment.getRedis();
    await redis.set('test-key', 'test-value');
    const value = await redis.get('test-key');
    expect(value).toBe('test-value');
  });

  test('should have database available', () => {
    const db = global.testEnvironment.getDatabase();
    expect(db).toBeDefined();
    expect(db.isRunning()).toBe(true);
  });

  test('blockchain mocks should work', async () => {
    const mocks = global.testEnvironment.getMocks();
    
    // Test Ethereum mock
    const ethBalance = await mocks.blockchain.ethereum.getBalance();
    expect(ethBalance).toBe('1000000000000000000');
    
    // Test Solana mock
    const solBalance = await mocks.blockchain.solana.getBalance();
    expect(solBalance).toBe(1000000000);
  });

  test('VRF mocks should work', async () => {
    const mocks = global.testEnvironment.getMocks();
    
    const vrfResult = await mocks.vrf.requestRandomness({ test: true });
    expect(vrfResult).toBeDefined();
    expect(vrfResult.requestId).toBeDefined();
    expect(vrfResult.randomValue).toBeDefined();
    
    const randomValue = await mocks.vrf.getRandomValue(vrfResult.requestId);
    expect(typeof randomValue).toBe('number');
  });

  test('external API mocks should work', async () => {
    const mocks = global.testEnvironment.getMocks();
    
    // Test Alchemy mock
    const nfts = await mocks.externalAPIs.alchemy.getNFTs();
    expect(nfts.ownedNfts).toBeDefined();
    expect(nfts.ownedNfts.length).toBeGreaterThan(0);
    
    // Test CoinGecko mock
    const prices = await mocks.externalAPIs.coingecko.getPrice();
    expect(prices.ethereum).toBeDefined();
    expect(prices.ethereum.usd).toBe(2000);
  });
});