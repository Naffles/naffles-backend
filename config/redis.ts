import Redis from 'ioredis';
import { promisify } from 'util';
import Redlock from 'redlock';

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
}

/**
 * Enhanced Redis connection manager with connection pooling and error handling
 */
class RedisManager {
  private static instance: RedisManager;
  private client: Redis | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private redlock: Redlock | null = null;
  private isConnected: boolean = false;

  private constructor() {}

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  /**
   * Get Redis configuration from environment variables
   */
  private getRedisConfig(): RedisConfig {
    return {
      host: process.env.REDIS_URL || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };
  }

  /**
   * Initialize Redis connections
   */
  public async initialize(): Promise<void> {
    if (this.isConnected) {
      console.log('Redis already connected');
      return;
    }

    try {
      const config = this.getRedisConfig();
      
      // Main Redis client
      this.client = new Redis(config);
      
      // Pub/Sub clients for Socket.IO
      this.pubClient = new Redis(config);
      this.subClient = this.pubClient.duplicate();

      // Set up event listeners
      this.setupEventListeners();

      // Initialize Redlock for distributed locking
      this.redlock = new Redlock([this.client], {
        driftFactor: 0.01,
        retryCount: 10,
        retryDelay: 200,
        retryJitter: 200,
      });

      // Test connections
      await this.client.ping();
      await this.pubClient.ping();
      await this.subClient.ping();

      this.isConnected = true;
      console.log('Redis connections established successfully');

    } catch (error) {
      console.error('Failed to initialize Redis connections:', error);
      throw error;
    }
  }

  /**
   * Set up Redis event listeners
   */
  private setupEventListeners(): void {
    if (!this.client || !this.pubClient || !this.subClient) return;

    // Main client events
    this.client.on('connect', () => {
      console.log('Redis main client connected');
    });

    this.client.on('error', (error) => {
      console.error('Redis main client error:', error);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log('Redis main client connection closed');
      this.isConnected = false;
    });

    // Pub client events
    this.pubClient.on('connect', () => {
      console.log('Redis pub client connected');
    });

    this.pubClient.on('error', (error) => {
      console.error('Redis pub client error:', error);
    });

    // Sub client events
    this.subClient.on('connect', () => {
      console.log('Redis sub client connected');
    });

    this.subClient.on('error', (error) => {
      console.error('Redis sub client error:', error);
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      await this.disconnect();
    });
  }

  /**
   * Get the main Redis client
   */
  public getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call initialize() first.');
    }
    return this.client;
  }

  /**
   * Get pub/sub clients for Socket.IO
   */
  public getPubSubClients(): { pubClient: Redis; subClient: Redis } {
    if (!this.pubClient || !this.subClient) {
      throw new Error('Redis pub/sub clients not initialized. Call initialize() first.');
    }
    return { pubClient: this.pubClient, subClient: this.subClient };
  }

  /**
   * Get Redlock instance for distributed locking
   */
  public getRedlock(): Redlock {
    if (!this.redlock) {
      throw new Error('Redlock not initialized. Call initialize() first.');
    }
    return this.redlock;
  }

  /**
   * Cache operations with TTL support
   */
  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = this.getClient();
    if (ttlSeconds) {
      await client.setex(key, ttlSeconds, value);
    } else {
      await client.set(key, value);
    }
  }

  public async get(key: string): Promise<string | null> {
    const client = this.getClient();
    return await client.get(key);
  }

  public async del(key: string): Promise<number> {
    const client = this.getClient();
    return await client.del(key);
  }

  public async exists(key: string): Promise<number> {
    const client = this.getClient();
    return await client.exists(key);
  }

  public async incr(key: string): Promise<number> {
    const client = this.getClient();
    return await client.incr(key);
  }

  public async expire(key: string, seconds: number): Promise<number> {
    const client = this.getClient();
    return await client.expire(key, seconds);
  }

  public async ttl(key: string): Promise<number> {
    const client = this.getClient();
    return await client.ttl(key);
  }

  /**
   * Hash operations
   */
  public async hset(key: string, field: string, value: string): Promise<number> {
    const client = this.getClient();
    return await client.hset(key, field, value);
  }

  public async hget(key: string, field: string): Promise<string | null> {
    const client = this.getClient();
    return await client.hget(key, field);
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    const client = this.getClient();
    return await client.hgetall(key);
  }

  public async hdel(key: string, field: string): Promise<number> {
    const client = this.getClient();
    return await client.hdel(key, field);
  }

  /**
   * List operations
   */
  public async lpush(key: string, value: string): Promise<number> {
    const client = this.getClient();
    return await client.lpush(key, value);
  }

  public async rpush(key: string, value: string): Promise<number> {
    const client = this.getClient();
    return await client.rpush(key, value);
  }

  public async lpop(key: string): Promise<string | null> {
    const client = this.getClient();
    return await client.lpop(key);
  }

  public async rpop(key: string): Promise<string | null> {
    const client = this.getClient();
    return await client.rpop(key);
  }

  public async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const client = this.getClient();
    return await client.lrange(key, start, stop);
  }

  /**
   * Set operations
   */
  public async sadd(key: string, member: string): Promise<number> {
    const client = this.getClient();
    return await client.sadd(key, member);
  }

  public async srem(key: string, member: string): Promise<number> {
    const client = this.getClient();
    return await client.srem(key, member);
  }

  public async smembers(key: string): Promise<string[]> {
    const client = this.getClient();
    return await client.smembers(key);
  }

  public async sismember(key: string, member: string): Promise<number> {
    const client = this.getClient();
    return await client.sismember(key, member);
  }

  /**
   * Disconnect all Redis connections
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        this.client = null;
      }
      if (this.pubClient) {
        await this.pubClient.quit();
        this.pubClient = null;
      }
      if (this.subClient) {
        await this.subClient.quit();
        this.subClient = null;
      }
      this.redlock = null;
      this.isConnected = false;
      console.log('All Redis connections closed');
    } catch (error) {
      console.error('Error closing Redis connections:', error);
    }
  }

  /**
   * Check if Redis is connected
   */
  public isRedisConnected(): boolean {
    return this.isConnected && this.client?.status === 'ready';
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): string {
    if (!this.client) return 'not_initialized';
    return this.client.status;
  }
}

// Legacy exports for backward compatibility
const redisManager = RedisManager.getInstance();

// Promisified methods for backward compatibility
const getAsync = async (key: string): Promise<string | null> => {
  return await redisManager.get(key);
};

const setAsync = async (key: string, value: string): Promise<void> => {
  return await redisManager.set(key, value);
};

const incrAsync = async (key: string): Promise<number> => {
  return await redisManager.incr(key);
};

const expireAsync = async (key: string, seconds: number): Promise<number> => {
  return await redisManager.expire(key, seconds);
};

const ttlAsync = async (key: string): Promise<number> => {
  return await redisManager.ttl(key);
};

const delAsync = async (key: string): Promise<number> => {
  return await redisManager.del(key);
};

export {
  RedisManager,
  redisManager,
  getAsync,
  setAsync,
  incrAsync,
  expireAsync,
  ttlAsync,
  delAsync
};

export default redisManager;