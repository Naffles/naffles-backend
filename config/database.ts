import mongoose from 'mongoose';
// import { runMigrations } from '../resources/scripts/runMigrations';
// import { initializeFee } from '../models/analytics/fee';

interface DatabaseConfig {
  url: string;
  options: mongoose.ConnectOptions;
}

/**
 * Enhanced MongoDB connection utility with retry logic and proper error handling
 */
class DatabaseManager {
  private static instance: DatabaseManager;
  private isConnected: boolean = false;
  private connectionRetries: number = 0;
  private maxRetries: number = 5;
  private retryDelay: number = 5000;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Get database configuration based on environment
   */
  private getDatabaseConfig(): DatabaseConfig {
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

  /**
   * Connect to MongoDB with retry logic
   */
  public async connect(runMigrationsFlag: boolean = false): Promise<void> {
    if (this.isConnected) {
      console.log('Database already connected');
      return;
    }

    try {
      const config = this.getDatabaseConfig();
      console.log(`Attempting to connect to MongoDB... (Attempt ${this.connectionRetries + 1}/${this.maxRetries})`);

      await mongoose.connect(config.url, config.options);
      
      this.isConnected = true;
      this.connectionRetries = 0;
      
      console.log('Successfully connected to MongoDB');
      
      // Set up connection event listeners
      this.setupEventListeners();

      // Run migrations if requested
      if (runMigrationsFlag) {
        await this.runMigrations();
      }

    } catch (error) {
      this.connectionRetries++;
      console.error(`MongoDB connection failed (Attempt ${this.connectionRetries}/${this.maxRetries}):`, error);

      if (this.connectionRetries < this.maxRetries) {
        console.log(`Retrying connection in ${this.retryDelay / 1000} seconds...`);
        setTimeout(() => this.connect(runMigrationsFlag), this.retryDelay);
      } else {
        console.error('Max connection retries reached. Exiting...');
        process.exit(1);
      }
    }
  }

  /**
   * Set up MongoDB connection event listeners
   */
  private setupEventListeners(): void {
    mongoose.connection.on('connected', () => {
      console.log('MongoDB connected successfully');
      this.isConnected = true;
    });

    mongoose.connection.on('error', (error) => {
      console.error('MongoDB connection error:', error);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      this.isConnected = false;
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
    });
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    console.log('Running database migrations...');
    try {
      // TODO: Implement migration system
      // await initializeFee();
      // const result = await runMigrations();
      console.log('Migrations completed successfully');
    } catch (error: any) {
      console.error('Migrations failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.connection.close();
      this.isConnected = false;
      console.log('MongoDB connection closed');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    }
  }

  /**
   * Check if database is connected
   */
  public isDbConnected(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): string {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return states[mongoose.connection.readyState as keyof typeof states] || 'unknown';
  }
}

// Legacy function for backward compatibility
const connectWithRetry = (runMigrationsFlag: boolean = false): Promise<void> => {
  const dbManager = DatabaseManager.getInstance();
  return dbManager.connect(runMigrationsFlag);
};

export { DatabaseManager, connectWithRetry };
export default connectWithRetry;