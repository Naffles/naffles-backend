export type Environment = 'development' | 'staging' | 'production' | 'localhost';
export interface DatabaseConfig {
    url: string;
    options: {
        maxPoolSize: number;
        serverSelectionTimeoutMS: number;
        socketTimeoutMS: number;
        bufferCommands: boolean;
        bufferMaxEntries: number;
        autoIndex: boolean;
    };
}
export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
    retryDelayOnFailover: number;
    maxRetriesPerRequest: number;
    lazyConnect: boolean;
}
export interface ServerConfig {
    port: number;
    host: string;
    cors: {
        origins: string[];
        credentials: boolean;
    };
    session: {
        secret: string;
        secure: boolean;
        httpOnly: boolean;
        maxAge: number;
    };
}
export interface BlockchainConfig {
    ethereum: {
        rpcUrl: string;
        treasuryWallet: string;
        treasuryPrivateKey: string;
    };
    solana: {
        rpcUrl: string;
        treasuryWallet: string;
        treasuryPrivateKey: string;
    };
    polygon: {
        rpcUrl: string;
        treasuryWallet: string;
        treasuryPrivateKey: string;
    };
    base: {
        rpcUrl: string;
        treasuryWallet: string;
        treasuryPrivateKey: string;
    };
}
export interface ExternalServicesConfig {
    alchemy: {
        apiKey: string;
        networks: string[];
    };
    coingecko: {
        apiKey?: string;
    };
    chainlink: {
        ethereum: {
            coordinator: string;
            keyHash: string;
            subscriptionId: string;
        };
        polygon: {
            coordinator: string;
            keyHash: string;
            subscriptionId: string;
        };
    };
}
export interface AppConfig {
    environment: Environment;
    database: DatabaseConfig;
    redis: RedisConfig;
    server: ServerConfig;
    blockchain: BlockchainConfig;
    externalServices: ExternalServicesConfig;
    logging: {
        level: string;
        enableConsole: boolean;
        enableFile: boolean;
    };
    security: {
        rateLimiting: {
            windowMs: number;
            maxRequests: number;
        };
        encryption: {
            algorithm: string;
            secretKey: string;
        };
    };
}
declare class EnvironmentManager {
    private static instance;
    private config;
    private environment;
    private constructor();
    static getInstance(): EnvironmentManager;
    private detectEnvironment;
    private loadEnvironmentFile;
    getEnvironment(): Environment;
    isDevelopment(): boolean;
    isProduction(): boolean;
    isStaging(): boolean;
    private getRequiredEnv;
    private getOptionalEnv;
    getConfig(): AppConfig;
    private getCorsOrigins;
    validateConfig(): {
        isValid: boolean;
        errors: string[];
    };
    getDatabaseConfig(): DatabaseConfig;
    getRedisConfig(): RedisConfig;
    getServerConfig(): ServerConfig;
    getBlockchainConfig(): BlockchainConfig;
}
export declare const environmentManager: EnvironmentManager;
export default environmentManager;
//# sourceMappingURL=environment.d.ts.map