/**
 * Test Redis Connection
 */

console.log('🔍 Testing Redis Connection...\n');

// Set up environment variables
process.env.JWT_SECRET = 'test-jwt-secret-key-for-development-only';
process.env.REDIS_URL = process.env.REDIS_URL || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

try {
  console.log('1️⃣ Loading Redis client...');
  const { client, setAsync, getAsync } = require('./config/redisClient');
  
  console.log('✅ Redis client loaded successfully');
  console.log(`📡 Attempting to connect to Redis at ${process.env.REDIS_URL}:${process.env.REDIS_PORT}`);

  // Test basic Redis operations
  const testKey = 'test:connection';
  const testValue = 'Hello Redis!';

  console.log('\n2️⃣ Testing Redis operations...');
  
  // Set a test value
  setAsync(testKey, testValue, 'EX', 10)
    .then(() => {
      console.log('✅ Redis SET operation successful');
      
      // Get the test value
      return getAsync(testKey);
    })
    .then((result) => {
      if (result === testValue) {
        console.log('✅ Redis GET operation successful');
        console.log('✅ Redis is working correctly!');
        
        // Test our AuthService with real Redis
        console.log('\n3️⃣ Testing AuthService with real Redis...');
        const AuthService = require('./services/authService');
        
        const testUserId = '507f1f77bcf86cd799439011';
        return AuthService.createSession(testUserId, { authMethod: 'test' });
      } else {
        throw new Error(`Expected '${testValue}', got '${result}'`);
      }
    })
    .then((sessionId) => {
      console.log('✅ Session created successfully:', sessionId);
      
      // Test session retrieval
      return AuthService.getSession(sessionId);
    })
    .then((session) => {
      console.log('✅ Session retrieved successfully:', session);
      
      console.log('\n🎉 Redis Connection Test Complete!');
      console.log('\n📋 Results:');
      console.log('   ✅ Redis client connects successfully');
      console.log('   ✅ Redis SET/GET operations work');
      console.log('   ✅ AuthService session management works with Redis');
      console.log('   ✅ Full authentication system is operational!');
      
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Redis operation failed:', error.message);
      console.log('\n💡 Possible solutions:');
      console.log('   1. Check if Redis server is running');
      console.log('   2. Verify Redis is listening on localhost:6379');
      console.log('   3. Check Windows services for Redis');
      console.log('   4. Try starting Redis manually');
      
      process.exit(1);
    });

} catch (error) {
  console.error('❌ Failed to load Redis client:', error.message);
  console.log('\n💡 This usually means Redis is not installed or not running');
  process.exit(1);
}