/**
 * Redis Client Configuration
 * 
 * This module provides Redis client setup with the following features:
 * - Connection management with automatic reconnection
 * - Distributed locking using Redlock
 * - Promisified Redis methods for async/await usage
 * - Error handling and connection monitoring
 * - Session storage integration
 * 
 * Features:
 * - IORedis client with connection pooling
 * - Redlock for distributed locking across multiple Redis instances
 * - Promisified methods for common Redis operations
 * - Connection event handling and logging
 * - Configurable retry logic and timeouts
 * 
 * Usage:
 * ```javascript
 * const { client, getAsync, setAsync, redlock } = require('./config/redisClient');
 * 
 * // Basic operations
 * await setAsync('key', 'value');
 * const value = await getAsync('key');
 * 
 * // Distributed locking
 * const lock = await redlock.lock('resource:123', 1000);
 * // ... perform operations
 * await lock.unlock();
 * ```
 * 
 * Configuration:
 * - REDIS_URL: Redis server hostname
 * - REDIS_PORT: Redis server port
 * - REDIS_PASSWORD: Optional authentication password
 * - REDIS_DB: Database number (default: 0)
 * 
 * @deprecated Legacy Redis client - maintained for backward compatibility
 * @note New code should use the enhanced RedisManager from redis.ts
 */

const redis = require("ioredis");
const { promisify } = require("util");
const { REDIS_URL, REDIS_PORT } = require("./config");
const { default: Redlock } = require("redlock");

// Enhanced Redis client with connection pooling and optimization
const client = new redis({
  host: REDIS_URL,
  port: REDIS_PORT,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxLoadingTimeout: 0,
  // Connection pool settings
  family: 4,
  db: 0,
  // Reconnection settings
  reconnectOnError: (err) => {
    const targetError = "READONLY";
    return err.message.includes(targetError);
  },
  // Performance optimizations
  enableOfflineQueue: false,
  // Logging
  showFriendlyErrorStack: process.env.NODE_ENV === 'development'
});

// Enhanced Redlock configuration
const redlock = new Redlock(
  [client],
  {
    driftFactor: 0.01, // multiplied by lock ttl to determine drift time
    retryCount: 10,
    retryDelay: 200, // time in ms
    retryJitter: 200, // time in ms
    automaticExtensionThreshold: 500, // extend locks automatically
  }
);

// Enhanced error handling and logging
client.on("error", (error) => {
  console.error(`Redis Error: ${error.message}`);
  // Log to structured logger if available
  if (global.logger) {
    global.logger.error('Redis connection error', { error: error.message, stack: error.stack });
  }
});

client.on("connect", () => {
  console.log("Enhanced Redis client connected with connection pooling");
  if (global.logger) {
    global.logger.info('Redis client connected', { host: REDIS_URL, port: REDIS_PORT });
  }
});

client.on("ready", () => {
  console.log("Redis client ready for operations");
});

client.on("close", () => {
  console.log("Redis connection closed");
});

client.on("reconnecting", () => {
  console.log("Redis client reconnecting...");
});

// Promisify the methods you need
const getAsync = promisify(client.get).bind(client);
const setAsync = promisify(client.set).bind(client);
const incrAsync = promisify(client.incr).bind(client);
const expireAsync = promisify(client.expire).bind(client);
const ttlAsync = promisify(client.ttl).bind(client);
const delAsync = promisify(client.del).bind(client);

// Export the client and the promisified methods
module.exports = {
  redlock,
  client,
  getAsync,
  setAsync,
  incrAsync,
  expireAsync,
  ttlAsync,
  delAsync,
};
