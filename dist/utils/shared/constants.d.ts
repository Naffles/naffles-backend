export declare const HTTP_STATUS_CODES: {
    readonly OK: 200;
    readonly CREATED: 201;
    readonly NO_CONTENT: 204;
    readonly BAD_REQUEST: 400;
    readonly UNAUTHORIZED: 401;
    readonly FORBIDDEN: 403;
    readonly NOT_FOUND: 404;
    readonly CONFLICT: 409;
    readonly UNPROCESSABLE_ENTITY: 422;
    readonly TOO_MANY_REQUESTS: 429;
    readonly INTERNAL_SERVER_ERROR: 500;
    readonly BAD_GATEWAY: 502;
    readonly SERVICE_UNAVAILABLE: 503;
    readonly GATEWAY_TIMEOUT: 504;
};
export declare const ERROR_MESSAGES: {
    readonly INVALID_INPUT: "Invalid input provided";
    readonly UNAUTHORIZED_ACCESS: "Unauthorized access";
    readonly RESOURCE_NOT_FOUND: "Resource not found";
    readonly INTERNAL_ERROR: "Internal server error";
    readonly RATE_LIMIT_EXCEEDED: "Rate limit exceeded";
    readonly VALIDATION_FAILED: "Validation failed";
    readonly DATABASE_ERROR: "Database operation failed";
    readonly NETWORK_ERROR: "Network error occurred";
    readonly TIMEOUT_ERROR: "Operation timed out";
    readonly INSUFFICIENT_PERMISSIONS: "Insufficient permissions";
};
export declare const SUCCESS_MESSAGES: {
    readonly CREATED: "Resource created successfully";
    readonly UPDATED: "Resource updated successfully";
    readonly DELETED: "Resource deleted successfully";
    readonly OPERATION_COMPLETED: "Operation completed successfully";
};
export declare const CACHE_KEYS: {
    readonly USER_SESSION: "user:session:";
    readonly USER_PROFILE: "user:profile:";
    readonly RAFFLE_DATA: "raffle:data:";
    readonly GAME_SESSION: "game:session:";
    readonly TRANSACTION_LOCK: "transaction:lock:";
    readonly RATE_LIMIT: "rate:limit:";
    readonly CRYPTO_PRICES: "crypto:prices";
    readonly LEADERBOARD: "leaderboard:";
    readonly POINTS_BALANCE: "points:balance:";
};
export declare const CACHE_TTL: {
    readonly SHORT: 300;
    readonly MEDIUM: 1800;
    readonly LONG: 3600;
    readonly VERY_LONG: 86400;
    readonly SESSION: 604800;
};
export declare const PAGINATION: {
    readonly DEFAULT_PAGE: 1;
    readonly DEFAULT_LIMIT: 20;
    readonly MAX_LIMIT: 100;
};
export declare const FILE_UPLOAD: {
    readonly MAX_SIZE: number;
    readonly ALLOWED_IMAGE_TYPES: readonly ["image/jpeg", "image/png", "image/gif", "image/webp"];
    readonly ALLOWED_DOCUMENT_TYPES: readonly ["application/pdf", "text/csv", "application/json"];
};
export declare const REGEX_PATTERNS: {
    readonly EMAIL: RegExp;
    readonly USERNAME: RegExp;
    readonly PHONE: RegExp;
    readonly URL: RegExp;
    readonly HEX_COLOR: RegExp;
    readonly MONGODB_OBJECTID: RegExp;
    readonly ETH_ADDRESS: RegExp;
    readonly ETH_TX_HASH: RegExp;
    readonly SOLANA_ADDRESS: RegExp;
    readonly SOLANA_TX_HASH: RegExp;
};
export declare const TIME_CONSTANTS: {
    readonly SECOND: 1000;
    readonly MINUTE: number;
    readonly HOUR: number;
    readonly DAY: number;
    readonly WEEK: number;
    readonly MONTH: number;
    readonly YEAR: number;
};
export declare const RATE_LIMITS: {
    readonly GENERAL: {
        readonly windowMs: number;
        readonly maxRequests: 1000;
    };
    readonly AUTH: {
        readonly windowMs: number;
        readonly maxRequests: 5;
    };
    readonly API: {
        readonly windowMs: number;
        readonly maxRequests: 100;
    };
    readonly UPLOAD: {
        readonly windowMs: number;
        readonly maxRequests: 10;
    };
};
export declare const SECURITY: {
    readonly PASSWORD_MIN_LENGTH: 8;
    readonly PASSWORD_MAX_LENGTH: 128;
    readonly SESSION_TIMEOUT: number;
    readonly JWT_EXPIRY: "24h";
    readonly BCRYPT_ROUNDS: 12;
    readonly MAX_LOGIN_ATTEMPTS: 5;
    readonly LOCKOUT_DURATION: number;
};
export declare const BLOCKCHAIN_CONSTANTS: {
    readonly CONFIRMATION_BLOCKS: {
        readonly ETHEREUM: 12;
        readonly SOLANA: 32;
        readonly POLYGON: 20;
        readonly BASE: 10;
    };
    readonly GAS_LIMITS: {
        readonly ETH_TRANSFER: 21000;
        readonly ERC20_TRANSFER: 65000;
        readonly ERC721_TRANSFER: 85000;
        readonly CONTRACT_CALL: 200000;
    };
    readonly DECIMALS: {
        readonly ETH: 18;
        readonly SOL: 9;
        readonly MATIC: 18;
        readonly USDC: 6;
        readonly USDT: 6;
    };
};
export declare const GAMING_CONSTANTS: {
    readonly MAX_BET_AMOUNT: 1000;
    readonly MIN_BET_AMOUNT: 0.01;
    readonly HOUSE_EDGE: 0.02;
    readonly MAX_GAME_DURATION: number;
    readonly TIMEOUT_DURATION: number;
    readonly MAX_CONCURRENT_GAMES: 10;
};
export declare const RAFFLE_CONSTANTS: {
    readonly MIN_TICKET_PRICE: 0.001;
    readonly MAX_TICKET_PRICE: 1000;
    readonly MIN_DURATION: number;
    readonly MAX_DURATION: number;
    readonly MAX_TICKETS_PER_USER: 1000;
    readonly PLATFORM_FEE_PERCENTAGE: 0.05;
};
export declare const POINTS_CONSTANTS: {
    readonly RAFFLE_CREATION_POINTS: 100;
    readonly TICKET_PURCHASE_POINTS_PER_DOLLAR: 10;
    readonly GAME_PARTICIPATION_POINTS: 50;
    readonly DAILY_LOGIN_POINTS: 25;
    readonly REFERRAL_POINTS: 500;
    readonly JACKPOT_INCREMENT: 1000;
};
export declare const API_VERSIONS: {
    readonly V1: "v1";
    readonly V2: "v2";
};
export declare const ENVIRONMENTS: {
    readonly DEVELOPMENT: "development";
    readonly STAGING: "staging";
    readonly PRODUCTION: "production";
    readonly LOCALHOST: "localhost";
};
export declare const SERVICE_NAMES: {
    readonly BACKEND: "naffles-backend";
    readonly FUND_MANAGEMENT: "naffles-fund-management";
    readonly DEPOSIT_SERVICE: "deposit-service";
    readonly FRONTEND: "naffles-frontend";
    readonly ADMIN: "naffles-admin";
};
//# sourceMappingURL=constants.d.ts.map