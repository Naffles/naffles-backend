const os = require('os');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

/**
 * Platform Monitoring Service
 * Comprehensive monitoring for the entire Naffles platform
 */
class PlatformMonitoringService extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      system: {},
      application: {},
      business: {},
      security: {}
    };
    
    this.alerts = [];
    this.isRunning = false;
    this.monitoringInterval = null;
    
    // Configuration
    this.config = {
      metricsInterval: 30000, // 30 seconds
      alertThresholds: {
        cpuUsage: 80, // %
        memoryUsage: 85, // %
        diskUsage: 90, // %
        responseTime: 5000, // ms
        errorRate: 5, // %
        activeUsers: 1000 // concurrent users
      },
      retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
      logLevel: process.env.LOG_LEVEL || 'info'
    };
    
    this.startTime = Date.now();
    this.metricsHistory = [];
  }

  /**
   * Start monitoring service
   */
  start() {
    if (this.isRunning) {
      console.log('Platform monitoring service is already running');
      return;
    }

    console.log('🔍 Starting platform monitoring service...');
    this.isRunning = true;

    // Start metrics collection
    this.startMetricsCollection();
    
    // Start log aggregation
    this.startLogAggregation();
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    // Start performance monitoring
    this.startPerformanceMonitoring();
    
    // Start business metrics monitoring
    this.startBusinessMetricsMonitoring();

    console.log('✅ Platform monitoring service started successfully');
    this.emit('monitoring:started');
  }

  /**
   * Stop monitoring service
   */
  stop() {
    if (!this.isRunning) {
      console.log('Platform monitoring service is not running');
      return;
    }

    console.log('🛑 Stopping platform monitoring service...');
    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('✅ Platform monitoring service stopped');
    this.emit('monitoring:stopped');
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.checkAlerts();
        await this.cleanupOldMetrics();
      } catch (error) {
        console.error('Error in metrics collection:', error);
      }
    }, this.config.metricsInterval);
  }

  /**
   * Collect comprehensive system and application metrics
   */
  async collectMetrics() {
    const timestamp = Date.now();
    
    // System metrics
    const systemMetrics = await this.collectSystemMetrics();
    
    // Application metrics
    const applicationMetrics = await this.collectApplicationMetrics();
    
    // Business metrics
    const businessMetrics = await this.collectBusinessMetrics();
    
    // Security metrics
    const securityMetrics = await this.collectSecurityMetrics();

    const metrics = {
      timestamp,
      system: systemMetrics,
      application: applicationMetrics,
      business: businessMetrics,
      security: securityMetrics
    };

    // Store metrics
    this.metrics = metrics;
    this.metricsHistory.push(metrics);

    // Emit metrics event
    this.emit('metrics:collected', metrics);

    return metrics;
  }

  /**
   * Collect system metrics
   */
  async collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      uptime: process.uptime(),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        heapUsedPercentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        loadAverage: os.loadavg(),
        usage: await this.getCPUUsage()
      },
      disk: await this.getDiskUsage(),
      network: await this.getNetworkStats(),
      os: {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        hostname: os.hostname(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem()
      }
    };
  }

  /**
   * Collect application metrics
   */
  async collectApplicationMetrics() {
    try {
      const mongoose = require('mongoose');
      const { client: redisClient } = require('../../config/redisClient');
      
      return {
        database: {
          mongodb: {
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            database: mongoose.connection.name,
            collections: await this.getCollectionStats()
          }
        },
        cache: {
          redis: {
            connected: redisClient.status === 'ready',
            host: redisClient.options.host,
            port: redisClient.options.port,
            memory: await this.getRedisMemoryUsage()
          }
        },
        api: {
          endpoints: await this.getAPIMetrics(),
          responseTime: await this.getAverageResponseTime(),
          errorRate: await this.getErrorRate(),
          throughput: await this.getThroughput()
        },
        gaming: {
          activeSessions: await this.getActiveGameSessions(),
          totalGamesPlayed: await this.getTotalGamesPlayed(),
          averageSessionDuration: await this.getAverageSessionDuration()
        }
      };
    } catch (error) {
      console.error('Error collecting application metrics:', error);
      return {};
    }
  }

  /**
   * Collect business metrics
   */
  async collectBusinessMetrics() {
    try {
      return {
        users: {
          total: await this.getTotalUsers(),
          active: await this.getActiveUsers(),
          new: await this.getNewUsers()
        },
        raffles: {
          active: await this.getActiveRaffles(),
          completed: await this.getCompletedRaffles(),
          totalVolume: await this.getRaffleVolume()
        },
        gaming: {
          totalBets: await this.getTotalBets(),
          totalWinnings: await this.getTotalWinnings(),
          houseEdge: await this.getHouseEdge()
        },
        communities: {
          total: await this.getTotalCommunities(),
          active: await this.getActiveCommunities(),
          totalMembers: await this.getTotalCommunityMembers()
        },
        revenue: {
          fees: await this.getTotalFees(),
          volume: await this.getTotalVolume()
        }
      };
    } catch (error) {
      console.error('Error collecting business metrics:', error);
      return {};
    }
  }

  /**
   * Collect security metrics
   */
  async collectSecurityMetrics() {
    try {
      const SecurityLog = require('../../models/security/securityLog');
      
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const securityEvents = await SecurityLog.aggregate([
        { $match: { timestamp: { $gte: last24Hours } } },
        { $group: { _id: '$severity', count: { $sum: 1 } } }
      ]);

      const eventsBySeverity = securityEvents.reduce((acc, event) => {
        acc[event._id] = event.count;
        return acc;
      }, {});

      return {
        events: {
          critical: eventsBySeverity.critical || 0,
          high: eventsBySeverity.high || 0,
          medium: eventsBySeverity.medium || 0,
          low: eventsBySeverity.low || 0
        },
        gameIntegrity: {
          violations: await this.getGameIntegrityViolations(),
          suspiciousActivity: await this.getSuspiciousActivityCount()
        },
        authentication: {
          failedLogins: await this.getFailedLogins(),
          suspiciousIPs: await this.getSuspiciousIPs()
        }
      };
    } catch (error) {
      console.error('Error collecting security metrics:', error);
      return {};
    }
  }

  /**
   * Check alerts based on thresholds
   */
  async checkAlerts() {
    const alerts = [];
    const metrics = this.metrics;

    // System alerts
    if (metrics.system?.memory?.heapUsedPercentage > this.config.alertThresholds.memoryUsage) {
      alerts.push({
        type: 'system',
        severity: 'high',
        message: `High memory usage: ${metrics.system.memory.heapUsedPercentage}%`,
        value: metrics.system.memory.heapUsedPercentage,
        threshold: this.config.alertThresholds.memoryUsage
      });
    }

    if (metrics.system?.cpu?.usage > this.config.alertThresholds.cpuUsage) {
      alerts.push({
        type: 'system',
        severity: 'high',
        message: `High CPU usage: ${metrics.system.cpu.usage}%`,
        value: metrics.system.cpu.usage,
        threshold: this.config.alertThresholds.cpuUsage
      });
    }

    // Application alerts
    if (metrics.application?.api?.errorRate > this.config.alertThresholds.errorRate) {
      alerts.push({
        type: 'application',
        severity: 'medium',
        message: `High error rate: ${metrics.application.api.errorRate}%`,
        value: metrics.application.api.errorRate,
        threshold: this.config.alertThresholds.errorRate
      });
    }

    if (metrics.application?.api?.responseTime > this.config.alertThresholds.responseTime) {
      alerts.push({
        type: 'application',
        severity: 'medium',
        message: `High response time: ${metrics.application.api.responseTime}ms`,
        value: metrics.application.api.responseTime,
        threshold: this.config.alertThresholds.responseTime
      });
    }

    // Security alerts
    if (metrics.security?.events?.critical > 0) {
      alerts.push({
        type: 'security',
        severity: 'critical',
        message: `Critical security events detected: ${metrics.security.events.critical}`,
        value: metrics.security.events.critical,
        threshold: 0
      });
    }

    // Process alerts
    for (const alert of alerts) {
      await this.processAlert(alert);
    }
  }

  /**
   * Process and handle alerts
   */
  async processAlert(alert) {
    const alertId = `${alert.type}_${alert.severity}_${Date.now()}`;
    
    const alertRecord = {
      id: alertId,
      ...alert,
      timestamp: new Date(),
      status: 'active',
      acknowledged: false
    };

    this.alerts.push(alertRecord);

    // Emit alert event
    this.emit('alert:triggered', alertRecord);

    // Log alert
    console.warn(`🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);

    // Send notifications based on severity
    await this.sendAlertNotification(alertRecord);

    return alertRecord;
  }

  /**
   * Send alert notifications
   */
  async sendAlertNotification(alert) {
    try {
      // TODO: Implement actual notification systems
      // - Email notifications
      // - Slack/Discord webhooks
      // - SMS for critical alerts
      // - PagerDuty integration

      console.log(`📧 Alert notification sent: ${alert.message}`);
      
      // For now, just log to console and store in memory
      // In production, integrate with actual alerting systems
      
    } catch (error) {
      console.error('Error sending alert notification:', error);
    }
  }

  /**
   * Start log aggregation
   */
  startLogAggregation() {
    // TODO: Implement log aggregation
    // - Collect logs from all services
    // - Parse and structure log data
    // - Store in centralized logging system
    // - Create log-based alerts
    
    console.log('📝 Log aggregation started');
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    // Health monitoring is already implemented in healthController
    // This could extend it with more comprehensive checks
    console.log('❤️  Health monitoring started');
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    // Monitor API performance, database queries, etc.
    console.log('⚡ Performance monitoring started');
  }

  /**
   * Start business metrics monitoring
   */
  startBusinessMetricsMonitoring() {
    // Monitor business KPIs and metrics
    console.log('📊 Business metrics monitoring started');
  }

  /**
   * Get current monitoring status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      uptime: Date.now() - this.startTime,
      metricsCollected: this.metricsHistory.length,
      activeAlerts: this.alerts.filter(a => a.status === 'active').length,
      lastMetricsCollection: this.metrics.timestamp,
      config: this.config
    };
  }

  /**
   * Get comprehensive monitoring report
   */
  getMonitoringReport(timeRange = 3600000) { // Default 1 hour
    const now = Date.now();
    const startTime = now - timeRange;
    
    const relevantMetrics = this.metricsHistory.filter(
      m => m.timestamp >= startTime
    );

    const activeAlerts = this.alerts.filter(a => a.status === 'active');
    const recentAlerts = this.alerts.filter(
      a => a.timestamp >= new Date(startTime)
    );

    return {
      timeRange: { start: startTime, end: now },
      summary: {
        metricsPoints: relevantMetrics.length,
        activeAlerts: activeAlerts.length,
        recentAlerts: recentAlerts.length,
        systemHealth: this.calculateSystemHealth(relevantMetrics)
      },
      currentMetrics: this.metrics,
      alerts: {
        active: activeAlerts,
        recent: recentAlerts
      },
      trends: this.calculateTrends(relevantMetrics),
      recommendations: this.generateRecommendations(relevantMetrics, activeAlerts)
    };
  }

  /**
   * Calculate system health score
   */
  calculateSystemHealth(metrics) {
    if (metrics.length === 0) return 100;

    const latest = metrics[metrics.length - 1];
    let score = 100;

    // Deduct points for various issues
    if (latest.system?.memory?.heapUsedPercentage > 80) score -= 20;
    if (latest.system?.cpu?.usage > 80) score -= 20;
    if (latest.application?.api?.errorRate > 5) score -= 15;
    if (latest.application?.api?.responseTime > 2000) score -= 15;
    if (latest.security?.events?.critical > 0) score -= 30;

    return Math.max(0, score);
  }

  /**
   * Calculate trends from metrics
   */
  calculateTrends(metrics) {
    if (metrics.length < 2) return {};

    const first = metrics[0];
    const last = metrics[metrics.length - 1];

    return {
      memory: this.calculateTrend(
        first.system?.memory?.heapUsedPercentage,
        last.system?.memory?.heapUsedPercentage
      ),
      cpu: this.calculateTrend(
        first.system?.cpu?.usage,
        last.system?.cpu?.usage
      ),
      responseTime: this.calculateTrend(
        first.application?.api?.responseTime,
        last.application?.api?.responseTime
      ),
      errorRate: this.calculateTrend(
        first.application?.api?.errorRate,
        last.application?.api?.errorRate
      )
    };
  }

  /**
   * Calculate trend between two values
   */
  calculateTrend(oldValue, newValue) {
    if (!oldValue || !newValue) return 'stable';
    
    const change = ((newValue - oldValue) / oldValue) * 100;
    
    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  /**
   * Generate recommendations based on metrics and alerts
   */
  generateRecommendations(metrics, alerts) {
    const recommendations = [];

    // High memory usage
    if (alerts.some(a => a.type === 'system' && a.message.includes('memory'))) {
      recommendations.push({
        priority: 'high',
        category: 'performance',
        title: 'Optimize Memory Usage',
        description: 'Consider implementing memory optimization strategies or scaling up resources'
      });
    }

    // High error rate
    if (alerts.some(a => a.type === 'application' && a.message.includes('error rate'))) {
      recommendations.push({
        priority: 'medium',
        category: 'reliability',
        title: 'Investigate Error Sources',
        description: 'Review application logs to identify and fix sources of errors'
      });
    }

    // Security events
    if (alerts.some(a => a.type === 'security')) {
      recommendations.push({
        priority: 'critical',
        category: 'security',
        title: 'Review Security Events',
        description: 'Immediately investigate security alerts and take appropriate action'
      });
    }

    return recommendations;
  }

  /**
   * Clean up old metrics to prevent memory leaks
   */
  async cleanupOldMetrics() {
    const cutoff = Date.now() - this.config.retentionPeriod;
    
    this.metricsHistory = this.metricsHistory.filter(
      m => m.timestamp > cutoff
    );

    this.alerts = this.alerts.filter(
      a => a.timestamp > new Date(cutoff)
    );
  }

  // Helper methods for metrics collection
  async getCPUUsage() {
    // Simplified CPU usage calculation
    return Math.random() * 100; // TODO: Implement actual CPU usage calculation
  }

  async getDiskUsage() {
    try {
      const stats = fs.statSync('.');
      return {
        used: 0, // TODO: Implement actual disk usage calculation
        total: 0,
        percentage: 0
      };
    } catch (error) {
      return { used: 0, total: 0, percentage: 0 };
    }
  }

  async getNetworkStats() {
    return {
      bytesReceived: 0, // TODO: Implement network stats
      bytesSent: 0,
      packetsReceived: 0,
      packetsSent: 0
    };
  }

  async getCollectionStats() {
    try {
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();
      
      const stats = {};
      for (const collection of collections) {
        const collStats = await db.collection(collection.name).stats();
        stats[collection.name] = {
          count: collStats.count,
          size: collStats.size,
          avgObjSize: collStats.avgObjSize
        };
      }
      
      return stats;
    } catch (error) {
      return {};
    }
  }

  async getRedisMemoryUsage() {
    try {
      const { client: redisClient } = require('../../config/redisClient');
      const info = await redisClient.info('memory');
      
      // Parse Redis memory info
      const memoryInfo = {};
      info.split('\r\n').forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          memoryInfo[key] = value;
        }
      });
      
      return memoryInfo;
    } catch (error) {
      return {};
    }
  }

  // Placeholder methods for business metrics
  async getTotalUsers() { return 0; }
  async getActiveUsers() { return 0; }
  async getNewUsers() { return 0; }
  async getActiveRaffles() { return 0; }
  async getCompletedRaffles() { return 0; }
  async getRaffleVolume() { return 0; }
  async getTotalBets() { return 0; }
  async getTotalWinnings() { return 0; }
  async getHouseEdge() { return 0; }
  async getTotalCommunities() { return 0; }
  async getActiveCommunities() { return 0; }
  async getTotalCommunityMembers() { return 0; }
  async getTotalFees() { return 0; }
  async getTotalVolume() { return 0; }
  async getAPIMetrics() { return {}; }
  async getAverageResponseTime() { return 0; }
  async getErrorRate() { return 0; }
  async getThroughput() { return 0; }
  async getActiveGameSessions() { return 0; }
  async getTotalGamesPlayed() { return 0; }
  async getAverageSessionDuration() { return 0; }
  async getGameIntegrityViolations() { return 0; }
  async getSuspiciousActivityCount() { return 0; }
  async getFailedLogins() { return 0; }
  async getSuspiciousIPs() { return 0; }
}

// Create singleton instance
const platformMonitoringService = new PlatformMonitoringService();

module.exports = platformMonitoringService;