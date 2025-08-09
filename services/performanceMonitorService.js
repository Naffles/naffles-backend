const os = require('os');
const mongoose = require('mongoose');
const redisClient = require('../config/redisClient');

/**
 * Service for monitoring system and application performance
 */
class PerformanceMonitorService {
  constructor() {
    this.metrics = {
      requests: new Map(),
      database: new Map(),
      redis: new Map(),
      system: new Map()
    };
    
    this.startTime = Date.now();
    this.requestCount = 0;
    this.errorCount = 0;
    
    // Start periodic monitoring
    this.startPeriodicMonitoring();
  }
  
  /**
   * Start periodic system monitoring
   */
  startPeriodicMonitoring() {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);
    
    // Collect database metrics every 60 seconds
    setInterval(() => {
      this.collectDatabaseMetrics();
    }, 60000);
    
    // Collect Redis metrics every 60 seconds
    setInterval(() => {
      this.collectRedisMetrics();
    }, 60000);
    
    // Clean old metrics every 5 minutes
    setInterval(() => {
      this.cleanOldMetrics();
    }, 300000);
  }
  
  /**
   * Record request metrics
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @param {number} duration - Request duration in ms
   * @param {number} statusCode - HTTP status code
   */
  recordRequest(method, path, duration, statusCode) {
    this.requestCount++;
    
    if (statusCode >= 400) {
      this.errorCount++;
    }
    
    const key = `${method}:${path}`;
    const timestamp = Date.now();
    
    if (!this.metrics.requests.has(key)) {
      this.metrics.requests.set(key, []);
    }
    
    this.metrics.requests.get(key).push({
      timestamp,
      duration,
      statusCode
    });
    
    // Keep only last 1000 requests per endpoint
    const requests = this.metrics.requests.get(key);
    if (requests.length > 1000) {
      requests.splice(0, requests.length - 1000);
    }
  }
  
  /**
   * Record database query metrics
   * @param {string} operation - Database operation
   * @param {string} collection - Collection name
   * @param {number} duration - Query duration in ms
   * @param {boolean} success - Whether query was successful
   */
  recordDatabaseQuery(operation, collection, duration, success = true) {
    const key = `${operation}:${collection}`;
    const timestamp = Date.now();
    
    if (!this.metrics.database.has(key)) {
      this.metrics.database.set(key, []);
    }
    
    this.metrics.database.get(key).push({
      timestamp,
      duration,
      success
    });
    
    // Keep only last 500 queries per operation
    const queries = this.metrics.database.get(key);
    if (queries.length > 500) {
      queries.splice(0, queries.length - 500);
    }
  }
  
  /**
   * Record Redis operation metrics
   * @param {string} operation - Redis operation
   * @param {number} duration - Operation duration in ms
   * @param {boolean} success - Whether operation was successful
   */
  recordRedisOperation(operation, duration, success = true) {
    const timestamp = Date.now();
    
    if (!this.metrics.redis.has(operation)) {
      this.metrics.redis.set(operation, []);
    }
    
    this.metrics.redis.get(operation).push({
      timestamp,
      duration,
      success
    });
    
    // Keep only last 500 operations per type
    const operations = this.metrics.redis.get(operation);
    if (operations.length > 500) {
      operations.splice(0, operations.length - 500);
    }
  }
  
  /**
   * Collect system metrics
   */
  collectSystemMetrics() {
    const timestamp = Date.now();
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const systemMetrics = {
      timestamp,
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      system: {
        loadAverage: os.loadavg(),
        freeMemory: os.freemem(),
        totalMemory: os.totalmem(),
        uptime: os.uptime()
      },
      process: {
        uptime: process.uptime(),
        pid: process.pid
      }
    };
    
    if (!this.metrics.system.has('general')) {
      this.metrics.system.set('general', []);
    }
    
    this.metrics.system.get('general').push(systemMetrics);
    
    // Keep only last 100 system metrics (50 minutes of data)
    const metrics = this.metrics.system.get('general');
    if (metrics.length > 100) {
      metrics.splice(0, metrics.length - 100);
    }
  }
  
  /**
   * Collect database metrics
   */
  async collectDatabaseMetrics() {
    try {
      const timestamp = Date.now();
      const dbStats = await mongoose.connection.db.stats();
      
      const dbMetrics = {
        timestamp,
        collections: dbStats.collections,
        dataSize: dbStats.dataSize,
        storageSize: dbStats.storageSize,
        indexes: dbStats.indexes,
        indexSize: dbStats.indexSize,
        objects: dbStats.objects,
        avgObjSize: dbStats.avgObjSize
      };
      
      if (!this.metrics.database.has('stats')) {
        this.metrics.database.set('stats', []);
      }
      
      this.metrics.database.get('stats').push(dbMetrics);
      
      // Keep only last 60 database stats (1 hour of data)
      const stats = this.metrics.database.get('stats');
      if (stats.length > 60) {
        stats.splice(0, stats.length - 60);
      }
      
    } catch (error) {
      console.error('Error collecting database metrics:', error);
    }
  }
  
  /**
   * Collect Redis metrics
   */
  async collectRedisMetrics() {
    try {
      const timestamp = Date.now();
      const info = await redisClient.info('memory');
      const keyspace = await redisClient.info('keyspace');
      
      // Parse Redis info response
      const memoryInfo = this.parseRedisInfo(info);
      const keyspaceInfo = this.parseRedisInfo(keyspace);
      
      const redisMetrics = {
        timestamp,
        memory: {
          usedMemory: parseInt(memoryInfo.used_memory || 0),
          usedMemoryRss: parseInt(memoryInfo.used_memory_rss || 0),\n          usedMemoryPeak: parseInt(memoryInfo.used_memory_peak || 0),\n          totalSystemMemory: parseInt(memoryInfo.total_system_memory || 0)\n        },\n        keyspace: keyspaceInfo\n      };\n      \n      if (!this.metrics.redis.has('stats')) {\n        this.metrics.redis.set('stats', []);\n      }\n      \n      this.metrics.redis.get('stats').push(redisMetrics);\n      \n      // Keep only last 60 Redis stats (1 hour of data)\n      const stats = this.metrics.redis.get('stats');\n      if (stats.length > 60) {\n        stats.splice(0, stats.length - 60);\n      }\n      \n    } catch (error) {\n      console.error('Error collecting Redis metrics:', error);\n    }\n  }\n  \n  /**\n   * Parse Redis INFO command response\n   * @param {string} info - Redis INFO response\n   * @returns {Object} Parsed info object\n   */\n  parseRedisInfo(info) {\n    const result = {};\n    const lines = info.split('\\r\\n');\n    \n    for (const line of lines) {\n      if (line && !line.startsWith('#')) {\n        const [key, value] = line.split(':');\n        if (key && value) {\n          result[key] = value;\n        }\n      }\n    }\n    \n    return result;\n  }\n  \n  /**\n   * Clean old metrics to prevent memory leaks\n   */\n  cleanOldMetrics() {\n    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);\n    \n    // Clean request metrics\n    for (const [key, requests] of this.metrics.requests.entries()) {\n      const filtered = requests.filter(r => r.timestamp > fiveMinutesAgo);\n      this.metrics.requests.set(key, filtered);\n    }\n    \n    // Clean database metrics\n    for (const [key, queries] of this.metrics.database.entries()) {\n      if (key !== 'stats') { // Keep stats longer\n        const filtered = queries.filter(q => q.timestamp > fiveMinutesAgo);\n        this.metrics.database.set(key, filtered);\n      }\n    }\n    \n    // Clean Redis metrics\n    for (const [key, operations] of this.metrics.redis.entries()) {\n      if (key !== 'stats') { // Keep stats longer\n        const filtered = operations.filter(o => o.timestamp > fiveMinutesAgo);\n        this.metrics.redis.set(key, filtered);\n      }\n    }\n  }\n  \n  /**\n   * Get current performance summary\n   * @returns {Object} Performance summary\n   */\n  getPerformanceSummary() {\n    const uptime = Date.now() - this.startTime;\n    const requestsPerSecond = this.requestCount / (uptime / 1000);\n    const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;\n    \n    // Calculate average response times\n    const avgResponseTimes = {};\n    for (const [endpoint, requests] of this.metrics.requests.entries()) {\n      if (requests.length > 0) {\n        const totalDuration = requests.reduce((sum, r) => sum + r.duration, 0);\n        avgResponseTimes[endpoint] = totalDuration / requests.length;\n      }\n    }\n    \n    // Get latest system metrics\n    const systemMetrics = this.metrics.system.get('general');\n    const latestSystem = systemMetrics && systemMetrics.length > 0 \n      ? systemMetrics[systemMetrics.length - 1] \n      : null;\n    \n    return {\n      uptime,\n      requests: {\n        total: this.requestCount,\n        perSecond: requestsPerSecond.toFixed(2),\n        errorRate: errorRate.toFixed(2) + '%',\n        avgResponseTimes\n      },\n      system: latestSystem ? {\n        memory: {\n          heapUsed: (latestSystem.memory.heapUsed / 1024 / 1024).toFixed(2) + ' MB',\n          heapTotal: (latestSystem.memory.heapTotal / 1024 / 1024).toFixed(2) + ' MB',\n          rss: (latestSystem.memory.rss / 1024 / 1024).toFixed(2) + ' MB'\n        },\n        cpu: latestSystem.cpu,\n        loadAverage: latestSystem.system.loadAverage\n      } : null,\n      database: {\n        connectionState: mongoose.connection.readyState,\n        queriesTracked: Array.from(this.metrics.database.keys()).length\n      },\n      redis: {\n        operationsTracked: Array.from(this.metrics.redis.keys()).length\n      }\n    };\n  }\n  \n  /**\n   * Get detailed metrics for a specific category\n   * @param {string} category - Metrics category (requests, database, redis, system)\n   * @param {string} key - Specific key within category\n   * @returns {Array} Detailed metrics\n   */\n  getDetailedMetrics(category, key = null) {\n    if (!this.metrics[category]) {\n      return [];\n    }\n    \n    if (key) {\n      return this.metrics[category].get(key) || [];\n    }\n    \n    // Return all metrics for category\n    const result = {};\n    for (const [k, v] of this.metrics[category].entries()) {\n      result[k] = v;\n    }\n    return result;\n  }\n  \n  /**\n   * Get performance alerts\n   * @returns {Array} Array of performance alerts\n   */\n  getPerformanceAlerts() {\n    const alerts = [];\n    const now = Date.now();\n    \n    // Check response time alerts\n    for (const [endpoint, requests] of this.metrics.requests.entries()) {\n      const recentRequests = requests.filter(r => now - r.timestamp < 300000); // Last 5 minutes\n      if (recentRequests.length > 0) {\n        const avgResponseTime = recentRequests.reduce((sum, r) => sum + r.duration, 0) / recentRequests.length;\n        \n        if (avgResponseTime > 5000) { // 5 seconds\n          alerts.push({\n            type: 'slow_response',\n            severity: 'high',\n            message: `Slow response time for ${endpoint}: ${avgResponseTime.toFixed(0)}ms`,\n            value: avgResponseTime,\n            threshold: 5000\n          });\n        } else if (avgResponseTime > 2000) { // 2 seconds\n          alerts.push({\n            type: 'slow_response',\n            severity: 'medium',\n            message: `Elevated response time for ${endpoint}: ${avgResponseTime.toFixed(0)}ms`,\n            value: avgResponseTime,\n            threshold: 2000\n          });\n        }\n      }\n    }\n    \n    // Check error rate alerts\n    const recentErrorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;\n    if (recentErrorRate > 10) {\n      alerts.push({\n        type: 'high_error_rate',\n        severity: 'high',\n        message: `High error rate: ${recentErrorRate.toFixed(1)}%`,\n        value: recentErrorRate,\n        threshold: 10\n      });\n    } else if (recentErrorRate > 5) {\n      alerts.push({\n        type: 'elevated_error_rate',\n        severity: 'medium',\n        message: `Elevated error rate: ${recentErrorRate.toFixed(1)}%`,\n        value: recentErrorRate,\n        threshold: 5\n      });\n    }\n    \n    // Check memory usage alerts\n    const systemMetrics = this.metrics.system.get('general');\n    if (systemMetrics && systemMetrics.length > 0) {\n      const latest = systemMetrics[systemMetrics.length - 1];\n      const heapUsagePercent = (latest.memory.heapUsed / latest.memory.heapTotal) * 100;\n      \n      if (heapUsagePercent > 90) {\n        alerts.push({\n          type: 'high_memory_usage',\n          severity: 'high',\n          message: `High heap memory usage: ${heapUsagePercent.toFixed(1)}%`,\n          value: heapUsagePercent,\n          threshold: 90\n        });\n      } else if (heapUsagePercent > 80) {\n        alerts.push({\n          type: 'elevated_memory_usage',\n          severity: 'medium',\n          message: `Elevated heap memory usage: ${heapUsagePercent.toFixed(1)}%`,\n          value: heapUsagePercent,\n          threshold: 80\n        });\n      }\n    }\n    \n    return alerts;\n  }\n  \n  /**\n   * Reset all metrics\n   */\n  resetMetrics() {\n    this.metrics.requests.clear();\n    this.metrics.database.clear();\n    this.metrics.redis.clear();\n    this.metrics.system.clear();\n    this.requestCount = 0;\n    this.errorCount = 0;\n    this.startTime = Date.now();\n  }\n}\n\nmodule.exports = new PerformanceMonitorService();