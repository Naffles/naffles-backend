const mongoose = require('mongoose');
const { client: redisClient } = require('../config/redisClient');
const sendResponse = require('../utils/responseHandler');
const packageJson = require('../package.json');

/**
 * Health check controller for monitoring service status
 */

// Service start time for uptime calculation
const startTime = Date.now();

/**
 * Basic health check - lightweight endpoint for load balancers
 */
exports.basicHealthCheck = (req, res) => {
  return sendResponse(res, 200, 'Service is healthy', {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'naffles-backend',
    version: packageJson.version
  });
};

/**
 * Detailed health check - comprehensive status of all dependencies
 */
exports.detailedHealthCheck = async (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'naffles-backend',
    version: packageJson.version,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    environment: process.env.NODE_ENV || 'development',
    checks: {}
  };

  let overallStatus = 'healthy';
  const checks = {};

  try {
    // Check MongoDB connection
    try {
      const mongoState = mongoose.connection.readyState;
      const mongoStatus = {
        1: 'connected',
        2: 'connecting', 
        3: 'disconnecting',
        0: 'disconnected'
      };

      checks.mongodb = {
        status: mongoState === 1 ? 'healthy' : 'unhealthy',
        state: mongoStatus[mongoState] || 'unknown',
        host: mongoose.connection.host,
        database: mongoose.connection.name,
        responseTime: null
      };

      if (mongoState === 1) {
        const start = Date.now();
        await mongoose.connection.db.admin().ping();
        checks.mongodb.responseTime = Date.now() - start;
      } else {
        overallStatus = 'unhealthy';
      }
    } catch (error) {
      checks.mongodb = {
        status: 'unhealthy',
        error: error.message
      };
      overallStatus = 'unhealthy';
    }

    // Check Redis connection
    try {
      const start = Date.now();
      await redisClient.ping();
      const responseTime = Date.now() - start;
      
      checks.redis = {
        status: 'healthy',
        responseTime,
        host: redisClient.options.host,
        port: redisClient.options.port
      };
    } catch (error) {
      checks.redis = {
        status: 'unhealthy',
        error: error.message
      };
      overallStatus = 'unhealthy';
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    checks.memory = {
      status: 'healthy',
      usage: {
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024) // MB
      }
    };

    // Check disk space (if available)
    try {
      const fs = require('fs');
      const stats = fs.statSync('.');
      checks.disk = {
        status: 'healthy',
        available: true
      };
    } catch (error) {
      checks.disk = {
        status: 'unknown',
        error: 'Unable to check disk space'
      };
    }

    // Check external services (optional)
    if (process.env.HEALTH_CHECK_EXTERNAL === 'true') {
      // Add external service checks here if needed
      checks.externalServices = {
        status: 'skipped',
        reason: 'External service checks disabled'
      };
    }

    healthStatus.status = overallStatus;
    healthStatus.checks = checks;

    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    return sendResponse(res, statusCode, `Service is ${overallStatus}`, healthStatus);

  } catch (error) {
    console.error('Health check error:', error);
    return sendResponse(res, 503, 'Health check failed', {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Readiness check - indicates if service is ready to accept traffic
 */
exports.readinessCheck = async (req, res) => {
  try {
    // Check critical dependencies
    const mongoReady = mongoose.connection.readyState === 1;
    let redisReady = false;

    try {
      await redisClient.ping();
      redisReady = true;
    } catch (error) {
      console.error('Redis readiness check failed:', error);
    }

    const isReady = mongoReady && redisReady;

    const readinessStatus = {
      ready: isReady,
      timestamp: new Date().toISOString(),
      checks: {
        mongodb: mongoReady ? 'ready' : 'not ready',
        redis: redisReady ? 'ready' : 'not ready'
      }
    };

    const statusCode = isReady ? 200 : 503;
    const message = isReady ? 'Service is ready' : 'Service is not ready';

    return sendResponse(res, statusCode, message, readinessStatus);

  } catch (error) {
    console.error('Readiness check error:', error);
    return sendResponse(res, 503, 'Readiness check failed', {
      ready: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Liveness check - indicates if service is alive (for Kubernetes)
 */
exports.livenessCheck = (req, res) => {
  // Simple check - if we can respond, we're alive
  const livenessStatus = {
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    pid: process.pid
  };

  return sendResponse(res, 200, 'Service is alive', livenessStatus);
};

/**
 * Metrics endpoint - returns basic performance metrics
 */
exports.metricsCheck = async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      service: 'naffles-backend',
      version: packageJson.version,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      environment: process.env.NODE_ENV || 'development',
      
      // Process metrics
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: Math.floor(process.uptime())
      },

      // Memory metrics
      memory: (() => {
        const memUsage = process.memoryUsage();
        return {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          heapUsedPercentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
        };
      })(),

      // CPU metrics (basic)
      cpu: {
        usage: process.cpuUsage(),
        loadAverage: require('os').loadavg()
      },

      // Database metrics
      database: {
        mongodb: {
          readyState: mongoose.connection.readyState,
          host: mongoose.connection.host,
          database: mongoose.connection.name
        }
      },

      // Redis metrics
      redis: {
        connected: redisClient.status === 'ready',
        host: redisClient.options.host,
        port: redisClient.options.port
      }
    };

    // Add custom application metrics if available
    if (global.appMetrics) {
      metrics.application = global.appMetrics;
    }

    return sendResponse(res, 200, 'Metrics retrieved successfully', metrics);

  } catch (error) {
    console.error('Metrics check error:', error);
    return sendResponse(res, 500, 'Failed to retrieve metrics', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};