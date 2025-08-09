const mongoose = require('mongoose');
const runMigrations = require("../resources/scripts/runMigrations");
const { initializeFee } = require("../models/analytics/fee");

/**
 * Connects to MongoDB with retry logic and optional migration execution.
 * 
 * This function establishes a connection to MongoDB using Mongoose ODM with the following features:
 * - Automatic retry logic with 5-second intervals on connection failure
 * - Optional database migration execution after successful connection
 * - Environment-specific connection options (autoIndex disabled in production)
 * - Connection pooling and timeout configuration
 * - Comprehensive error handling and logging
 * 
 * Connection Options:
 * - useFindAndModify: false (deprecated MongoDB driver option)
 * - autoIndex: Disabled in production for performance, enabled in development
 * - maxPoolSize: Configured via environment variables
 * - serverSelectionTimeoutMS: Timeout for server selection
 * - socketTimeoutMS: Socket timeout for operations
 * 
 * @param {boolean} runMigrationsFlag - Whether to run migrations after connecting.
 *                                     Set to true in production deployments to ensure
 *                                     database schema is up to date.
 * 
 * @example
 * // Connect without migrations (development)
 * connectWithRetry();
 * 
 * // Connect with migrations (production deployment)
 * connectWithRetry(true);
 */
const connectWithRetry = (runMigrationsFlag = false) => {
  console.log("Attempting to connect to MongoDB...");

  mongoose
    .connect(process.env.MONGO_URL, {
      useFindAndModify: false,
      autoIndex: process.env.NODE_ENV !== 'production',
    })
    .then(async () => {
      console.log("Successfully connected to DB");

      if (runMigrationsFlag) {
        console.log("Running migrations...");
        try {
          await initializeFee();
          const result = await runMigrations();
          console.log('Migrations completed successfully');
          console.log('stdout:', result.stdout);
          console.log('stderr:', result.stderr);
        } catch (error) {
          console.error('Migrations failed');
          console.error('Exit code:', error.code);
          console.error('stdout:', error.stdout);
          console.error('stderr:', error.stderr);
        }
      } else {
        console.log("Skipping migrations.");
      }
    })
    .catch((e) => {
      console.error(e);
      setTimeout(() => connectWithRetry(runMigrationsFlag), 5000); // Retry connection every 5 seconds
    });
};

module.exports = connectWithRetry;
