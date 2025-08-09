/**
 * Configuration Validation Utility
 * 
 * This utility validates the application configuration to ensure all required
 * environment variables are set and have valid values before the application starts.
 * 
 * @author Naffles Development Team
 */

const { environmentManager } = require('../config/environment');

/**
 * Validate required environment variables
 */
function validateRequiredEnvVars() {
  const required = [
    'NODE_ENV',
    'MONGO_URL',
    'SESSION_SECRET',
    'ENCRYPTION_SECRET_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Validate database configuration
 */
function validateDatabaseConfig() {
  const mongoUrl = process.env.MONGO_URL;
  
  if (!mongoUrl) {
    throw new Error('MONGO_URL is required');
  }

  // Basic MongoDB URL validation
  if (!mongoUrl.startsWith('mongodb://') && !mongoUrl.startsWith('mongodb+srv://')) {
    throw new Error('MONGO_URL must be a valid MongoDB connection string');
  }

  // Validate connection pool settings
  const maxPoolSize = parseInt(process.env.MONGO_MAX_POOL_SIZE || '10');
  if (isNaN(maxPoolSize) || maxPoolSize < 1 || maxPoolSize > 100) {
    throw new Error('MONGO_MAX_POOL_SIZE must be a number between 1 and 100');
  }
}

/**
 * Validate Redis configuration
 */
function validateRedisConfig() {
  const redisPort = parseInt(process.env.REDIS_PORT || '6379');
  if (isNaN(redisPort) || redisPort < 1 || redisPort > 65535) {
    throw new Error('REDIS_PORT must be a valid port number');
  }

  const redisDb = parseInt(process.env.REDIS_DB || '0');
  if (isNaN(redisDb) || redisDb < 0 || redisDb > 15) {
    throw new Error('REDIS_DB must be a number between 0 and 15');
  }
}

/**
 * Validate security configuration
 */
function validateSecurityConfig() {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long');
  }

  const encryptionKey = process.env.ENCRYPTION_SECRET_KEY;
  if (!encryptionKey || encryptionKey.length !== 32) {
    throw new Error('ENCRYPTION_SECRET_KEY must be exactly 32 characters long');
  }
}

/**
 * Validate blockchain configuration for production
 */
function validateBlockchainConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    const requiredKeys = [
      'ETH_TREASURY_PRIVATE_KEY',
      'SOL_TREASURY_PRIVATE_KEY'
    ];

    const missing = requiredKeys.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Production environment requires: ${missing.join(', ')}`);
    }

    // Validate Ethereum private key format
    const ethKey = process.env.ETH_TREASURY_PRIVATE_KEY;
    if (ethKey && !ethKey.match(/^0x[a-fA-F0-9]{64}$/)) {
      throw new Error('ETH_TREASURY_PRIVATE_KEY must be a valid Ethereum private key');
    }
  }
}

/**
 * Validate rate limiting configuration
 */
function validateRateLimitConfig() {
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');
  if (isNaN(windowMs) || windowMs < 1000) {
    throw new Error('RATE_LIMIT_WINDOW_MS must be at least 1000ms');
  }

  const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000');
  if (isNaN(maxRequests) || maxRequests < 1) {
    throw new Error('RATE_LIMIT_MAX_REQUESTS must be a positive number');
  }
}

/**
 * Validate server configuration
 */
function validateServerConfig() {
  const port = parseInt(process.env.PORT || '3000');
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid port number');
  }

  const logLevel = process.env.LOG_LEVEL || 'info';
  const validLogLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLogLevels.includes(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
  }
}

/**
 * Validate all configuration
 */
function validateConfiguration() {
  console.log('Validating application configuration...');

  try {
    validateRequiredEnvVars();
    validateDatabaseConfig();
    validateRedisConfig();
    validateSecurityConfig();
    validateBlockchainConfig();
    validateRateLimitConfig();
    validateServerConfig();

    // Use environment manager validation if available
    if (environmentManager && typeof environmentManager.validateConfig === 'function') {
      const { isValid, errors } = environmentManager.validateConfig();
      if (!isValid) {
        throw new Error(`Environment manager validation failed: ${errors.join(', ')}`);
      }
    }

    console.log('✅ Configuration validation passed');
    return { isValid: true, errors: [] };

  } catch (error) {
    console.error('❌ Configuration validation failed:', error.message);
    return { isValid: false, errors: [error.message] };
  }
}

/**
 * Validate configuration and exit if invalid
 */
function validateConfigurationOrExit() {
  const { isValid, errors } = validateConfiguration();
  
  if (!isValid) {
    console.error('Configuration validation failed. Please fix the following issues:');
    errors.forEach((error, index) => {
      console.error(`${index + 1}. ${error}`);
    });
    console.error('\nApplication cannot start with invalid configuration.');
    process.exit(1);
  }
}

module.exports = {
  validateConfiguration,
  validateConfigurationOrExit,
  validateRequiredEnvVars,
  validateDatabaseConfig,
  validateRedisConfig,
  validateSecurityConfig,
  validateBlockchainConfig,
  validateRateLimitConfig,
  validateServerConfig
};