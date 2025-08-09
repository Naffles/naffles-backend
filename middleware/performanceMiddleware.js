const performanceMonitorService = require('../services/performanceMonitorService');

/**
 * Middleware to track request performance metrics
 */
const performanceMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Override res.end to capture response metrics
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    const method = req.method;
    const path = req.route ? req.route.path : req.path;
    const statusCode = res.statusCode;
    
    // Record request metrics
    performanceMonitorService.recordRequest(method, path, duration, statusCode);
    
    // Call original end method
    originalEnd.apply(this, args);
  };
  
  next();
};

/**
 * Middleware to track database query performance
 * This should be used as a mongoose middleware
 */
const databasePerformanceMiddleware = function(next) {
  const startTime = Date.now();
  const operation = this.op || this.getQuery ? 'find' : 'unknown';
  const collection = this.model ? this.model.collection.name : 'unknown';
  
  this.then = function(resolve, reject) {
    return Promise.prototype.then.call(this, 
      (result) => {
        const duration = Date.now() - startTime;
        performanceMonitorService.recordDatabaseQuery(operation, collection, duration, true);
        return resolve ? resolve(result) : result;
      },
      (error) => {
        const duration = Date.now() - startTime;
        performanceMonitorService.recordDatabaseQuery(operation, collection, duration, false);
        return reject ? reject(error) : Promise.reject(error);
      }
    );
  };
  
  next();
};

/**
 * Create Redis performance wrapper
 * @param {Object} redisClient - Redis client instance
 * @returns {Object} Wrapped Redis client
 */
const createRedisPerformanceWrapper = (redisClient) => {
  const wrapper = {};
  
  // List of Redis commands to wrap
  const commandsToWrap = [
    'get', 'set', 'del', 'exists', 'expire', 'ttl',
    'hget', 'hset', 'hdel', 'hgetall', 'hmget', 'hmset',
    'lpush', 'rpush', 'lpop', 'rpop', 'llen', 'lrange',
    'sadd', 'srem', 'smembers', 'sismember',
    'zadd', 'zrem', 'zrange', 'zrank', 'zscore'
  ];
  
  commandsToWrap.forEach(command => {
    if (typeof redisClient[command] === 'function') {\n      wrapper[command] = async function(...args) {\n        const startTime = Date.now();\n        \n        try {\n          const result = await redisClient[command].apply(redisClient, args);\n          const duration = Date.now() - startTime;\n          performanceMonitorService.recordRedisOperation(command, duration, true);\n          return result;\n        } catch (error) {\n          const duration = Date.now() - startTime;\n          performanceMonitorService.recordRedisOperation(command, duration, false);\n          throw error;\n        }\n      };\n    }\n  });\n  \n  // Copy other methods and properties\n  Object.getOwnPropertyNames(redisClient).forEach(prop => {\n    if (!wrapper[prop] && typeof redisClient[prop] !== 'function') {\n      wrapper[prop] = redisClient[prop];\n    } else if (!wrapper[prop]) {\n      wrapper[prop] = redisClient[prop].bind(redisClient);\n    }\n  });\n  \n  return wrapper;\n};\n\n/**\n * Error tracking middleware\n */\nconst errorTrackingMiddleware = (err, req, res, next) => {\n  // Log error details\n  console.error('Error occurred:', {\n    message: err.message,\n    stack: err.stack,\n    url: req.url,\n    method: req.method,\n    timestamp: new Date().toISOString(),\n    userAgent: req.get('User-Agent'),\n    ip: req.ip\n  });\n  \n  // Record error in performance metrics\n  const method = req.method;\n  const path = req.route ? req.route.path : req.path;\n  performanceMonitorService.recordRequest(method, path, 0, 500);\n  \n  next(err);\n};\n\n/**\n * Health check middleware\n */\nconst healthCheckMiddleware = (req, res, next) => {\n  if (req.path === '/health' || req.path === '/api/health') {\n    const summary = performanceMonitorService.getPerformanceSummary();\n    const alerts = performanceMonitorService.getPerformanceAlerts();\n    \n    const health = {\n      status: alerts.some(a => a.severity === 'high') ? 'unhealthy' : 'healthy',\n      timestamp: new Date().toISOString(),\n      uptime: summary.uptime,\n      performance: summary,\n      alerts: alerts.length > 0 ? alerts : undefined\n    };\n    \n    const statusCode = health.status === 'healthy' ? 200 : 503;\n    return res.status(statusCode).json(health);\n  }\n  \n  next();\n};\n\n/**\n * Performance metrics endpoint middleware\n */\nconst metricsEndpointMiddleware = (req, res, next) => {\n  if (req.path === '/metrics' || req.path === '/api/metrics') {\n    // Check if user has admin role\n    if (!req.user || !req.user.roles.includes('admin')) {\n      return res.status(403).json({\n        success: false,\n        error: 'Access denied. Admin role required.'\n      });\n    }\n    \n    const category = req.query.category;\n    const key = req.query.key;\n    \n    if (category) {\n      const metrics = performanceMonitorService.getDetailedMetrics(category, key);\n      return res.json({\n        success: true,\n        data: metrics,\n        category,\n        key\n      });\n    }\n    \n    const summary = performanceMonitorService.getPerformanceSummary();\n    const alerts = performanceMonitorService.getPerformanceAlerts();\n    \n    return res.json({\n      success: true,\n      data: {\n        summary,\n        alerts\n      }\n    });\n  }\n  \n  next();\n};\n\nmodule.exports = {\n  performanceMiddleware,\n  databasePerformanceMiddleware,\n  createRedisPerformanceWrapper,\n  errorTrackingMiddleware,\n  healthCheckMiddleware,\n  metricsEndpointMiddleware\n};