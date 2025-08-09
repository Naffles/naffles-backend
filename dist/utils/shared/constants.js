"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVICE_NAMES = exports.ENVIRONMENTS = exports.API_VERSIONS = exports.POINTS_CONSTANTS = exports.RAFFLE_CONSTANTS = exports.GAMING_CONSTANTS = exports.BLOCKCHAIN_CONSTANTS = exports.SECURITY = exports.RATE_LIMITS = exports.TIME_CONSTANTS = exports.REGEX_PATTERNS = exports.FILE_UPLOAD = exports.PAGINATION = exports.CACHE_TTL = exports.CACHE_KEYS = exports.SUCCESS_MESSAGES = exports.ERROR_MESSAGES = exports.HTTP_STATUS_CODES = void 0;
exports.HTTP_STATUS_CODES = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504
};
exports.ERROR_MESSAGES = {
    INVALID_INPUT: 'Invalid input provided',
    UNAUTHORIZED_ACCESS: 'Unauthorized access',
    RESOURCE_NOT_FOUND: 'Resource not found',
    INTERNAL_ERROR: 'Internal server error',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
    VALIDATION_FAILED: 'Validation failed',
    DATABASE_ERROR: 'Database operation failed',
    NETWORK_ERROR: 'Network error occurred',
    TIMEOUT_ERROR: 'Operation timed out',
    INSUFFICIENT_PERMISSIONS: 'Insufficient permissions'
};
exports.SUCCESS_MESSAGES = {
    CREATED: 'Resource created successfully',
    UPDATED: 'Resource updated successfully',
    DELETED: 'Resource deleted successfully',
    OPERATION_COMPLETED: 'Operation completed successfully'
};
exports.CACHE_KEYS = {
    USER_SESSION: 'user:session:',
    USER_PROFILE: 'user:profile:',
    RAFFLE_DATA: 'raffle:data:',
    GAME_SESSION: 'game:session:',
    TRANSACTION_LOCK: 'transaction:lock:',
    RATE_LIMIT: 'rate:limit:',
    CRYPTO_PRICES: 'crypto:prices',
    LEADERBOARD: 'leaderboard:',
    POINTS_BALANCE: 'points:balance:'
};
exports.CACHE_TTL = {
    SHORT: 300,
    MEDIUM: 1800,
    LONG: 3600,
    VERY_LONG: 86400,
    SESSION: 604800
};
exports.PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
};
exports.FILE_UPLOAD = {
    MAX_SIZE: 10 * 1024 * 1024,
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'text/csv', 'application/json']
};
exports.REGEX_PATTERNS = {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    USERNAME: /^[a-zA-Z0-9_-]{3,20}$/,
    PHONE: /^\+?[\d\s\-\(\)]{10,}$/,
    URL: /^https?:\/\/.+/,
    HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
    MONGODB_OBJECTID: /^[0-9a-fA-F]{24}$/,
    ETH_ADDRESS: /^0x[a-fA-F0-9]{40}$/,
    ETH_TX_HASH: /^0x[a-fA-F0-9]{64}$/,
    SOLANA_ADDRESS: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    SOLANA_TX_HASH: /^[1-9A-HJ-NP-Za-km-z]{87,88}$/
};
exports.TIME_CONSTANTS = {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
    MONTH: 30 * 24 * 60 * 60 * 1000,
    YEAR: 365 * 24 * 60 * 60 * 1000
};
exports.RATE_LIMITS = {
    GENERAL: {
        windowMs: 60 * 1000,
        maxRequests: 1000
    },
    AUTH: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 5
    },
    API: {
        windowMs: 60 * 1000,
        maxRequests: 100
    },
    UPLOAD: {
        windowMs: 60 * 1000,
        maxRequests: 10
    }
};
exports.SECURITY = {
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_MAX_LENGTH: 128,
    SESSION_TIMEOUT: 7 * 24 * 60 * 60 * 1000,
    JWT_EXPIRY: '24h',
    BCRYPT_ROUNDS: 12,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 30 * 60 * 1000
};
exports.BLOCKCHAIN_CONSTANTS = {
    CONFIRMATION_BLOCKS: {
        ETHEREUM: 12,
        SOLANA: 32,
        POLYGON: 20,
        BASE: 10
    },
    GAS_LIMITS: {
        ETH_TRANSFER: 21000,
        ERC20_TRANSFER: 65000,
        ERC721_TRANSFER: 85000,
        CONTRACT_CALL: 200000
    },
    DECIMALS: {
        ETH: 18,
        SOL: 9,
        MATIC: 18,
        USDC: 6,
        USDT: 6
    }
};
exports.GAMING_CONSTANTS = {
    MAX_BET_AMOUNT: 1000,
    MIN_BET_AMOUNT: 0.01,
    HOUSE_EDGE: 0.02,
    MAX_GAME_DURATION: 30 * 60 * 1000,
    TIMEOUT_DURATION: 30 * 1000,
    MAX_CONCURRENT_GAMES: 10
};
exports.RAFFLE_CONSTANTS = {
    MIN_TICKET_PRICE: 0.001,
    MAX_TICKET_PRICE: 1000,
    MIN_DURATION: 60 * 60 * 1000,
    MAX_DURATION: 30 * 24 * 60 * 60 * 1000,
    MAX_TICKETS_PER_USER: 1000,
    PLATFORM_FEE_PERCENTAGE: 0.05
};
exports.POINTS_CONSTANTS = {
    RAFFLE_CREATION_POINTS: 100,
    TICKET_PURCHASE_POINTS_PER_DOLLAR: 10,
    GAME_PARTICIPATION_POINTS: 50,
    DAILY_LOGIN_POINTS: 25,
    REFERRAL_POINTS: 500,
    JACKPOT_INCREMENT: 1000
};
exports.API_VERSIONS = {
    V1: 'v1',
    V2: 'v2'
};
exports.ENVIRONMENTS = {
    DEVELOPMENT: 'development',
    STAGING: 'staging',
    PRODUCTION: 'production',
    LOCALHOST: 'localhost'
};
exports.SERVICE_NAMES = {
    BACKEND: 'naffles-backend',
    FUND_MANAGEMENT: 'naffles-fund-management',
    DEPOSIT_SERVICE: 'deposit-service',
    FRONTEND: 'naffles-frontend',
    ADMIN: 'naffles-admin'
};
//# sourceMappingURL=constants.js.map