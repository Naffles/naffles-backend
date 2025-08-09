"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.delAsync = exports.ttlAsync = exports.expireAsync = exports.incrAsync = exports.setAsync = exports.getAsync = exports.redisManager = exports.RedisManager = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const redlock_1 = __importDefault(require("redlock"));
class RedisManager {
    constructor() {
        this.client = null;
        this.pubClient = null;
        this.subClient = null;
        this.redlock = null;
        this.isConnected = false;
    }
    static getInstance() {
        if (!RedisManager.instance) {
            RedisManager.instance = new RedisManager();
        }
        return RedisManager.instance;
    }
    getRedisConfig() {
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
    async initialize() {
        if (this.isConnected) {
            console.log('Redis already connected');
            return;
        }
        try {
            const config = this.getRedisConfig();
            this.client = new ioredis_1.default(config);
            this.pubClient = new ioredis_1.default(config);
            this.subClient = this.pubClient.duplicate();
            this.setupEventListeners();
            this.redlock = new redlock_1.default([this.client], {
                driftFactor: 0.01,
                retryCount: 10,
                retryDelay: 200,
                retryJitter: 200,
            });
            await this.client.ping();
            await this.pubClient.ping();
            await this.subClient.ping();
            this.isConnected = true;
            console.log('Redis connections established successfully');
        }
        catch (error) {
            console.error('Failed to initialize Redis connections:', error);
            throw error;
        }
    }
    setupEventListeners() {
        if (!this.client || !this.pubClient || !this.subClient)
            return;
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
        this.pubClient.on('connect', () => {
            console.log('Redis pub client connected');
        });
        this.pubClient.on('error', (error) => {
            console.error('Redis pub client error:', error);
        });
        this.subClient.on('connect', () => {
            console.log('Redis sub client connected');
        });
        this.subClient.on('error', (error) => {
            console.error('Redis sub client error:', error);
        });
        process.on('SIGINT', async () => {
            await this.disconnect();
        });
    }
    getClient() {
        if (!this.client) {
            throw new Error('Redis client not initialized. Call initialize() first.');
        }
        return this.client;
    }
    getPubSubClients() {
        if (!this.pubClient || !this.subClient) {
            throw new Error('Redis pub/sub clients not initialized. Call initialize() first.');
        }
        return { pubClient: this.pubClient, subClient: this.subClient };
    }
    getRedlock() {
        if (!this.redlock) {
            throw new Error('Redlock not initialized. Call initialize() first.');
        }
        return this.redlock;
    }
    async set(key, value, ttlSeconds) {
        const client = this.getClient();
        if (ttlSeconds) {
            await client.setex(key, ttlSeconds, value);
        }
        else {
            await client.set(key, value);
        }
    }
    async get(key) {
        const client = this.getClient();
        return await client.get(key);
    }
    async del(key) {
        const client = this.getClient();
        return await client.del(key);
    }
    async exists(key) {
        const client = this.getClient();
        return await client.exists(key);
    }
    async incr(key) {
        const client = this.getClient();
        return await client.incr(key);
    }
    async expire(key, seconds) {
        const client = this.getClient();
        return await client.expire(key, seconds);
    }
    async ttl(key) {
        const client = this.getClient();
        return await client.ttl(key);
    }
    async hset(key, field, value) {
        const client = this.getClient();
        return await client.hset(key, field, value);
    }
    async hget(key, field) {
        const client = this.getClient();
        return await client.hget(key, field);
    }
    async hgetall(key) {
        const client = this.getClient();
        return await client.hgetall(key);
    }
    async hdel(key, field) {
        const client = this.getClient();
        return await client.hdel(key, field);
    }
    async lpush(key, value) {
        const client = this.getClient();
        return await client.lpush(key, value);
    }
    async rpush(key, value) {
        const client = this.getClient();
        return await client.rpush(key, value);
    }
    async lpop(key) {
        const client = this.getClient();
        return await client.lpop(key);
    }
    async rpop(key) {
        const client = this.getClient();
        return await client.rpop(key);
    }
    async lrange(key, start, stop) {
        const client = this.getClient();
        return await client.lrange(key, start, stop);
    }
    async sadd(key, member) {
        const client = this.getClient();
        return await client.sadd(key, member);
    }
    async srem(key, member) {
        const client = this.getClient();
        return await client.srem(key, member);
    }
    async smembers(key) {
        const client = this.getClient();
        return await client.smembers(key);
    }
    async sismember(key, member) {
        const client = this.getClient();
        return await client.sismember(key, member);
    }
    async disconnect() {
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
        }
        catch (error) {
            console.error('Error closing Redis connections:', error);
        }
    }
    isRedisConnected() {
        return this.isConnected && this.client?.status === 'ready';
    }
    getConnectionStatus() {
        if (!this.client)
            return 'not_initialized';
        return this.client.status;
    }
}
exports.RedisManager = RedisManager;
const redisManager = RedisManager.getInstance();
exports.redisManager = redisManager;
const getAsync = async (key) => {
    return await redisManager.get(key);
};
exports.getAsync = getAsync;
const setAsync = async (key, value) => {
    return await redisManager.set(key, value);
};
exports.setAsync = setAsync;
const incrAsync = async (key) => {
    return await redisManager.incr(key);
};
exports.incrAsync = incrAsync;
const expireAsync = async (key, seconds) => {
    return await redisManager.expire(key, seconds);
};
exports.expireAsync = expireAsync;
const ttlAsync = async (key) => {
    return await redisManager.ttl(key);
};
exports.ttlAsync = ttlAsync;
const delAsync = async (key) => {
    return await redisManager.del(key);
};
exports.delAsync = delAsync;
exports.default = redisManager;
//# sourceMappingURL=redis.js.map