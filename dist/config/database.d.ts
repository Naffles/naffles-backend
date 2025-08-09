declare class DatabaseManager {
    private static instance;
    private isConnected;
    private connectionRetries;
    private maxRetries;
    private retryDelay;
    private constructor();
    static getInstance(): DatabaseManager;
    private getDatabaseConfig;
    connect(runMigrationsFlag?: boolean): Promise<void>;
    private setupEventListeners;
    private runMigrations;
    disconnect(): Promise<void>;
    isDbConnected(): boolean;
    getConnectionStatus(): string;
}
declare const connectWithRetry: (runMigrationsFlag?: boolean) => Promise<void>;
export { DatabaseManager, connectWithRetry };
export default connectWithRetry;
//# sourceMappingURL=database.d.ts.map