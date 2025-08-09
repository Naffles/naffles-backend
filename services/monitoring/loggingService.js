const winston = require('winston');
const path = require('path');
const fs = require('fs');

/**
 * Centralized Logging Service
 * Provides structured logging with multiple transports and log aggregation
 */
class LoggingService {
  constructor() {
    this.loggers = new Map();
    this.logDirectory = path.join(__dirname, '../../logs');
    this.ensureLogDirectory();
    
    // Create main application logger
    this.createLogger('app', {
      level: process.env.LOG_LEVEL || 'info',
      enableConsole: true,
      enableFile: true,
      enableJson: true
    });
    
    // Create specialized loggers
    this.createLogger('security', {
      level: 'info',
      enableConsole: true,
      enableFile: true,
      enableJson: true,
      filename: 'security.log'
    });
    
    this.createLogger('gaming', {
      level: 'info',
      enableConsole: false,
      enableFile: true,
      enableJson: true,
      filename: 'gaming.log'
    });
    
    this.createLogger('api', {
      level: 'info',
      enableConsole: false,
      enableFile: true,
      enableJson: true,
      filename: 'api.log'
    });
    
    this.createLogger('performance', {
      level: 'info',
      enableConsole: false,
      enableFile: true,
      enableJson: true,
      filename: 'performance.log'
    });
    
    this.createLogger('audit', {
      level: 'info',
      enableConsole: false,
      enableFile: true,
      enableJson: true,
      filename: 'audit.log'
    });
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  /**
   * Create a logger with specified configuration
   */
  createLogger(name, config = {}) {
    const {
      level = 'info',
      enableConsole = true,
      enableFile = true,
      enableJson = false,
      filename = `${name}.log`,
      maxSize = '20m',
      maxFiles = 5
    } = config;

    const transports = [];

    // Console transport
    if (enableConsole) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
              return `${timestamp} [${level}]: ${message} ${metaStr}`;
            })
          )
        })
      );
    }

    // File transport
    if (enableFile) {
      transports.push(
        new winston.transports.File({
          filename: path.join(this.logDirectory, filename),
          maxsize: maxSize,
          maxFiles: maxFiles,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        })
      );
    }

    // JSON transport for structured logging
    if (enableJson) {
      transports.push(
        new winston.transports.File({
          filename: path.join(this.logDirectory, `${name}.json`),
          maxsize: maxSize,
          maxFiles: maxFiles,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        })
      );
    }

    const logger = winston.createLogger({
      level,
      transports,
      defaultMeta: {
        service: name,
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0'
      },
      exitOnError: false
    });

    this.loggers.set(name, logger);
    return logger;
  }

  /**
   * Get logger by name
   */
  getLogger(name = 'app') {
    return this.loggers.get(name) || this.loggers.get('app');
  }

  /**
   * Log application events
   */
  logApp(level, message, meta = {}) {
    const logger = this.getLogger('app');
    logger.log(level, message, {
      ...meta,
      timestamp: new Date().toISOString(),
      category: 'application'
    });
  }

  /**
   * Log security events
   */
  logSecurity(level, message, meta = {}) {
    const logger = this.getLogger('security');
    logger.log(level, message, {
      ...meta,
      timestamp: new Date().toISOString(),
      category: 'security',
      severity: this.mapLevelToSeverity(level)
    });
  }

  /**
   * Log gaming events
   */
  logGaming(level, message, meta = {}) {
    const logger = this.getLogger('gaming');
    logger.log(level, message, {
      ...meta,
      timestamp: new Date().toISOString(),
      category: 'gaming'
    });
  }

  /**
   * Log API events
   */
  logAPI(level, message, meta = {}) {
    const logger = this.getLogger('api');
    logger.log(level, message, {
      ...meta,
      timestamp: new Date().toISOString(),
      category: 'api'
    });
  }

  /**
   * Log performance events
   */
  logPerformance(level, message, meta = {}) {
    const logger = this.getLogger('performance');
    logger.log(level, message, {
      ...meta,
      timestamp: new Date().toISOString(),
      category: 'performance'
    });
  }

  /**
   * Log audit events
   */
  logAudit(level, message, meta = {}) {
    const logger = this.getLogger('audit');
    logger.log(level, message, {
      ...meta,
      timestamp: new Date().toISOString(),
      category: 'audit'
    });
  }

  /**
   * Log HTTP requests
   */
  logRequest(req, res, responseTime) {
    const meta = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user?.id,
      sessionId: req.sessionID
    };

    const level = res.statusCode >= 400 ? 'warn' : 'info';
    const message = `${req.method} ${req.url} ${res.statusCode} - ${responseTime}ms`;

    this.logAPI(level, message, meta);
  }

  /**
   * Log database operations
   */
  logDatabase(operation, collection, meta = {}) {
    const message = `Database ${operation} on ${collection}`;
    this.logApp('info', message, {
      ...meta,
      operation,
      collection,
      category: 'database'
    });
  }

  /**
   * Log game events
   */
  logGameEvent(eventType, gameType, playerId, meta = {}) {
    const message = `Game event: ${eventType} for ${gameType}`;
    this.logGaming('info', message, {
      ...meta,
      eventType,
      gameType,
      playerId,
      category: 'game-event'
    });
  }

  /**
   * Log security events with structured data
   */
  logSecurityEvent(eventType, severity, playerId, details = {}) {
    const message = `Security event: ${eventType}`;
    this.logSecurity(this.mapSeverityToLevel(severity), message, {
      eventType,
      severity,
      playerId,
      details,
      category: 'security-event'
    });
  }

  /**
   * Log performance metrics
   */
  logPerformanceMetric(metric, value, unit = '', meta = {}) {
    const message = `Performance metric: ${metric} = ${value}${unit}`;
    this.logPerformance('info', message, {
      ...meta,
      metric,
      value,
      unit,
      category: 'performance-metric'
    });
  }

  /**
   * Log business events
   */
  logBusinessEvent(eventType, userId, meta = {}) {
    const message = `Business event: ${eventType}`;
    this.logAudit('info', message, {
      ...meta,
      eventType,
      userId,
      category: 'business-event'
    });
  }

  /**
   * Log errors with stack traces
   */
  logError(error, context = {}) {
    const message = error.message || 'Unknown error';
    const meta = {
      ...context,
      stack: error.stack,
      name: error.name,
      category: 'error'
    };

    this.logApp('error', message, meta);
  }

  /**
   * Create structured log entry
   */
  createLogEntry(level, category, message, meta = {}) {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      ...meta,
      environment: process.env.NODE_ENV || 'development',
      service: 'naffles-backend',
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  /**
   * Map log level to security severity
   */
  mapLevelToSeverity(level) {
    const mapping = {
      error: 'critical',
      warn: 'high',
      info: 'medium',
      debug: 'low'
    };
    return mapping[level] || 'medium';
  }

  /**
   * Map security severity to log level
   */
  mapSeverityToLevel(severity) {
    const mapping = {
      critical: 'error',
      high: 'warn',
      medium: 'info',
      low: 'debug'
    };
    return mapping[severity] || 'info';
  }

  /**
   * Get log statistics
   */
  async getLogStatistics(timeRange = 24 * 60 * 60 * 1000) {
    // This would typically query a log aggregation system
    // For now, return basic statistics
    return {
      timeRange,
      totalLogs: 0,
      logsByLevel: {
        error: 0,
        warn: 0,
        info: 0,
        debug: 0
      },
      logsByCategory: {
        application: 0,
        security: 0,
        gaming: 0,
        api: 0,
        performance: 0,
        audit: 0
      },
      topErrors: [],
      performanceMetrics: {
        averageResponseTime: 0,
        errorRate: 0
      }
    };
  }

  /**
   * Search logs
   */
  async searchLogs(query, options = {}) {
    const {
      category,
      level,
      startTime,
      endTime,
      limit = 100
    } = options;

    // This would typically query a log aggregation system
    // For now, return empty results
    return {
      query,
      options,
      results: [],
      totalCount: 0
    };
  }

  /**
   * Export logs for analysis
   */
  async exportLogs(format = 'json', options = {}) {
    const {
      category,
      startTime,
      endTime
    } = options;

    // This would export logs in the specified format
    // For now, return basic export info
    return {
      format,
      options,
      exportPath: path.join(this.logDirectory, `export_${Date.now()}.${format}`),
      recordCount: 0
    };
  }

  /**
   * Clean up old log files
   */
  async cleanupLogs(retentionDays = 30) {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    
    try {
      const files = fs.readdirSync(this.logDirectory);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.logDirectory, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }

      this.logApp('info', `Log cleanup completed: ${deletedCount} files deleted`);
      return { deletedCount };
    } catch (error) {
      this.logError(error, { context: 'log-cleanup' });
      throw error;
    }
  }

  /**
   * Get logging service status
   */
  getStatus() {
    return {
      loggers: Array.from(this.loggers.keys()),
      logDirectory: this.logDirectory,
      environment: process.env.NODE_ENV || 'development',
      logLevel: process.env.LOG_LEVEL || 'info'
    };
  }
}

// Create singleton instance
const loggingService = new LoggingService();

module.exports = loggingService;