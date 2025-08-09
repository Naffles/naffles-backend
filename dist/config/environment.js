"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.environmentManager = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
class EnvironmentManager {
    constructor() {
        this.config = null;
        this.environment = this.detectEnvironment();
        this.loadEnvironmentFile();
    }
    static getInstance() {
        if (!EnvironmentManager.instance) {
            EnvironmentManager.instance = new EnvironmentManager();
        }
        return EnvironmentManager.instance;
    }
    detectEnvironment() {
        const nodeEnv = process.env.NODE_ENV?.toLowerCase();
        switch (nodeEnv) {
            case 'development':
                return 'development';
            case 'staging':
                return 'staging';
            case 'production':
                return 'production';
            case 'localhost':
                return 'localhost';
            default:
                return 'development';
        }
    }
    loadEnvironmentFile() {
        const envFile = `.env.${this.environment}`;
        const envPath = path_1.default.resolve(process.cwd(), envFile);
        try {
            dotenv_1.default.config({ path: envPath });
            console.log(`Loaded environment configuration from ${envFile}`);
        }
        catch (error) {
            console.warn(`Could not load ${envFile}, falling back to default .env`);
            dotenv_1.default.config();
        }
    }
    getEnvironment() {
        return this.environment;
    }
    isDevelopment() {
        return this.environment === 'development' || this.environment === 'localhost';
    }
    isProduction() {
        return this.environment === 'production';
    }
    isStaging() {
        return this.environment === 'staging';
    }
    getRequiredEnv(key) {
        const value = process.env[key];
        if (!value) {
            throw new Error(`Required environment variable ${key} is not set`);
        }
        return value;
    }
    getOptionalEnv(key, defaultValue) {
        return process.env[key] || defaultValue;
    }
    getConfig() {
        if (this.config) {
            return this.config;
        }
        this.config = {
            environment: this.environment,
            database: {
                url: this.getRequiredEnv('MONGO_URL'),
                options: {
                    maxPoolSize: parseInt(this.getOptionalEnv('MONGO_MAX_POOL_SIZE', '10')),
                    serverSelectionTimeoutMS: parseInt(this.getOptionalEnv('MONGO_SERVER_SELECTION_TIMEOUT', '5000')),
                    socketTimeoutMS: parseInt(this.getOptionalEnv('MONGO_SOCKET_TIMEOUT', '45000')),
                    bufferCommands: false,
                    bufferMaxEntries: 0,
                    autoIndex: !this.isProduction(),
                }
            },
            redis: {
                host: this.getOptionalEnv('REDIS_URL', 'redis'),
                port: parseInt(this.getOptionalEnv('REDIS_PORT', '6379')),
                password: process.env.REDIS_PASSWORD,
                db: parseInt(this.getOptionalEnv('REDIS_DB', '0')),
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3,
                lazyConnect: true,
            },
            server: {
                port: parseInt(this.getOptionalEnv('PORT', '3000')),
                host: this.getOptionalEnv('HOST', '0.0.0.0'),
                cors: {
                    origins: this.getCorsOrigins(),
                    credentials: true,
                },
                session: {
                    secret: this.getRequiredEnv('SESSION_SECRET'),
                    secure: !this.isDevelopment(),
                    httpOnly: !this.isDevelopment(),
                    maxAge: 7 * 24 * 60 * 60 * 1000,
                }
            },
            blockchain: {
                ethereum: {
                    rpcUrl: this.getOptionalEnv('ETHEREUM_RPC_URL', 'https://eth-mainnet.alchemyapi.io/v2/'),
                    treasuryWallet: this.getOptionalEnv('ETH_TREASURY_WALLET', ''),
                    treasuryPrivateKey: this.getOptionalEnv('ETH_TREASURY_PRIVATE_KEY', ''),
                },
                solana: {
                    rpcUrl: this.getOptionalEnv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),
                    treasuryWallet: this.getOptionalEnv('SOL_TREASURY_WALLET', ''),
                    treasuryPrivateKey: this.getOptionalEnv('SOL_TREASURY_PRIVATE_KEY', ''),
                },
                polygon: {
                    rpcUrl: this.getOptionalEnv('POLYGON_RPC_URL', 'https://polygon-rpc.com'),
                    treasuryWallet: this.getOptionalEnv('POLYGON_TREASURY_WALLET', ''),
                    treasuryPrivateKey: this.getOptionalEnv('POLYGON_TREASURY_PRIVATE_KEY', ''),
                },
                base: {
                    rpcUrl: this.getOptionalEnv('BASE_RPC_URL', 'https://mainnet.base.org'),
                    treasuryWallet: this.getOptionalEnv('BASE_TREASURY_WALLET', ''),
                    treasuryPrivateKey: this.getOptionalEnv('BASE_TREASURY_PRIVATE_KEY', ''),
                },
            },
            externalServices: {
                alchemy: {
                    apiKey: this.getOptionalEnv('ALCHEMY_API_KEY', ''),
                    networks: this.getOptionalEnv('EVM_NETWORKS', 'sepolia').split(','),
                },
                coingecko: {
                    apiKey: process.env.COINGECKO_API_KEY,
                },
                chainlink: {
                    ethereum: {
                        coordinator: this.getOptionalEnv('ETH_VRF_COORDINATOR', ''),
                        keyHash: this.getOptionalEnv('ETH_VRF_KEY_HASH', ''),
                        subscriptionId: this.getOptionalEnv('ETH_VRF_SUBSCRIPTION_ID', ''),
                    },
                    polygon: {
                        coordinator: this.getOptionalEnv('POLYGON_VRF_COORDINATOR', ''),
                        keyHash: this.getOptionalEnv('POLYGON_VRF_KEY_HASH', ''),
                        subscriptionId: this.getOptionalEnv('POLYGON_VRF_SUBSCRIPTION_ID', ''),
                    },
                },
            },
            logging: {
                level: this.getOptionalEnv('LOG_LEVEL', this.isDevelopment() ? 'debug' : 'info'),
                enableConsole: true,
                enableFile: this.isProduction(),
            },
            security: {
                rateLimiting: {
                    windowMs: parseInt(this.getOptionalEnv('RATE_LIMIT_WINDOW_MS', '60000')),
                    maxRequests: parseInt(this.getOptionalEnv('RATE_LIMIT_MAX_REQUESTS', '1000')),
                },
                encryption: {
                    algorithm: 'aes-256-gcm',
                    secretKey: this.getRequiredEnv('ENCRYPTION_SECRET_KEY'),
                },
            },
        };
        return this.config;
    }
    getCorsOrigins() {
        const baseOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
        ];
        switch (this.environment) {
            case 'development':
                return [
                    ...baseOrigins,
                    'https://dev.naffles.com',
                    'https://dev.admin.naffles.com',
                ];
            case 'staging':
                return [
                    ...baseOrigins,
                    'https://staging.naffles.com',
                    'https://staging.admin.naffles.com',
                ];
            case 'production':
                return [
                    'https://www.naffles.com',
                    'https://naffles.com',
                    'https://admin.naffles.com',
                ];
            default:
                return baseOrigins;
        }
    }
    validateConfig() {
        const errors = [];
        const config = this.getConfig();
        if (!config.database.url) {
            errors.push('Database URL is required');
        }
        if (!config.server.session.secret) {
            errors.push('Session secret is required');
        }
        if (!config.security.encryption.secretKey) {
            errors.push('Encryption secret key is required');
        }
        if (this.isProduction()) {
            if (!config.blockchain.ethereum.treasuryPrivateKey) {
                errors.push('Ethereum treasury private key is required in production');
            }
            if (!config.blockchain.solana.treasuryPrivateKey) {
                errors.push('Solana treasury private key is required in production');
            }
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    getDatabaseConfig() {
        return this.getConfig().database;
    }
    getRedisConfig() {
        return this.getConfig().redis;
    }
    getServerConfig() {
        return this.getConfig().server;
    }
    getBlockchainConfig() {
        return this.getConfig().blockchain;
    }
}
exports.environmentManager = EnvironmentManager.getInstance();
exports.default = exports.environmentManager;
//# sourceMappingURL=environment.js.map