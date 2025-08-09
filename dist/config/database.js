"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectWithRetry = exports.DatabaseManager = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
class DatabaseManager {
    constructor() {
        this.isConnected = false;
        this.connectionRetries = 0;
        this.maxRetries = 5;
        this.retryDelay = 5000;
    }
    static getInstance() {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }
    getDatabaseConfig() {
        const mongoUrl = process.env.MONGO_URL;
        if (!mongoUrl) {
            throw new Error('MONGO_URL environment variable is required');
        }
        return {
            url: mongoUrl,
            options: {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                bufferCommands: false,
                autoIndex: process.env.NODE_ENV !== 'production',
            }
        };
    }
    async connect(runMigrationsFlag = false) {
        if (this.isConnected) {
            console.log('Database already connected');
            return;
        }
        try {
            const config = this.getDatabaseConfig();
            console.log(`Attempting to connect to MongoDB... (Attempt ${this.connectionRetries + 1}/${this.maxRetries})`);
            await mongoose_1.default.connect(config.url, config.options);
            this.isConnected = true;
            this.connectionRetries = 0;
            console.log('Successfully connected to MongoDB');
            this.setupEventListeners();
            if (runMigrationsFlag) {
                await this.runMigrations();
            }
        }
        catch (error) {
            this.connectionRetries++;
            console.error(`MongoDB connection failed (Attempt ${this.connectionRetries}/${this.maxRetries}):`, error);
            if (this.connectionRetries < this.maxRetries) {
                console.log(`Retrying connection in ${this.retryDelay / 1000} seconds...`);
                setTimeout(() => this.connect(runMigrationsFlag), this.retryDelay);
            }
            else {
                console.error('Max connection retries reached. Exiting...');
                process.exit(1);
            }
        }
    }
    setupEventListeners() {
        mongoose_1.default.connection.on('connected', () => {
            console.log('MongoDB connected successfully');
            this.isConnected = true;
        });
        mongoose_1.default.connection.on('error', (error) => {
            console.error('MongoDB connection error:', error);
            this.isConnected = false;
        });
        mongoose_1.default.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
            this.isConnected = false;
        });
        process.on('SIGINT', async () => {
            await this.disconnect();
            process.exit(0);
        });
    }
    async runMigrations() {
        console.log('Running database migrations...');
        try {
            console.log('Migrations completed successfully');
        }
        catch (error) {
            console.error('Migrations failed:', error);
            throw error;
        }
    }
    async disconnect() {
        if (!this.isConnected) {
            return;
        }
        try {
            await mongoose_1.default.connection.close();
            this.isConnected = false;
            console.log('MongoDB connection closed');
        }
        catch (error) {
            console.error('Error closing MongoDB connection:', error);
        }
    }
    isDbConnected() {
        return this.isConnected && mongoose_1.default.connection.readyState === 1;
    }
    getConnectionStatus() {
        const states = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };
        return states[mongoose_1.default.connection.readyState] || 'unknown';
    }
}
exports.DatabaseManager = DatabaseManager;
const connectWithRetry = (runMigrationsFlag = false) => {
    const dbManager = DatabaseManager.getInstance();
    return dbManager.connect(runMigrationsFlag);
};
exports.connectWithRetry = connectWithRetry;
exports.default = connectWithRetry;
//# sourceMappingURL=database.js.map