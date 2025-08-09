/**
 * Monitoring Services Integration
 * Centralized initialization and management of all monitoring services
 */

const platformMonitoringService = require('./platformMonitoringService');
const loggingService = require('./loggingService');
const InfrastructureDashboard = require('./infrastructureDashboard');
const vrfMonitoringService = require('../vrfMonitoringService');
const securityMonitoringService = require('../security/securityMonitoringService');

class MonitoringManager {
  constructor() {
    this.services = {
      platform: platformMonitoringService,
      logging: loggingService,
      vrf: vrfMonitoringService,
      security: securityMonitoringService
    };
    
    this.dashboard = null;
    this.isInitialized = false;
  }

  /**
   * Initialize all monitoring services
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('Monitoring services already initialized');
      return;
    }

    try {
      console.log('🔍 Initializing monitoring services...');

      // Start platform monitoring
      this.services.platform.start();
      console.log('✅ Platform monitoring service started');

      // Start VRF monitoring
      this.services.vrf.start();
      console.log('✅ VRF monitoring service started');

      // Initialize dashboard
      this.dashboard = new InfrastructureDashboard();
      this.dashboard.start();
      console.log('✅ Infrastructure dashboard started');

      // Setup monitoring event handlers
      this.setupEventHandlers();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      this.isInitialized = true;
      console.log('🎉 All monitoring services initialized successfully');

      // Log initialization
      loggingService.logApp('info', 'Monitoring services initialized', {
        services: Object.keys(this.services),
        dashboardPort: this.dashboard.port
      });

    } catch (error) {
      console.error('❌ Failed to initialize monitoring services:', error);
      loggingService.logError(error, { context: 'monitoring-initialization' });
      throw error;
    }
  }

  /**
   * Setup event handlers for monitoring services
   */
  setupEventHandlers() {
    // Platform monitoring events
    this.services.platform.on('monitoring:started', () => {
      loggingService.logApp('info', 'Platform monitoring started');
    });

    this.services.platform.on('monitoring:stopped', () => {
      loggingService.logApp('info', 'Platform monitoring stopped');
    });

    this.services.platform.on('metrics:collected', (metrics) => {
      // Log high-level metrics periodically
      if (metrics.timestamp % (5 * 60 * 1000) < 30000) { // Every 5 minutes
        loggingService.logPerformance('info', 'Metrics collected', {
          systemHealth: this.calculateSystemHealth(metrics),
          memoryUsage: metrics.system?.memory?.heapUsedPercentage,
          cpuUsage: metrics.system?.cpu?.usage,
          activeUsers: metrics.business?.users?.active
        });
      }
    });

    this.services.platform.on('alert:triggered', (alert) => {
      loggingService.logApp(
        this.mapSeverityToLogLevel(alert.severity),
        `Alert triggered: ${alert.message}`,
        alert
      );

      // Send critical alerts to security monitoring
      if (alert.severity === 'critical') {
        this.services.security.alertSecurityTeam(alert.type, alert);
      }
    });

    // Security monitoring events
    // (Security monitoring service already has its own event handling)

    // VRF monitoring events
    // (VRF monitoring service already has its own event handling)
  }

  /**
   * Setup graceful shutdown for all monitoring services
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}, shutting down monitoring services gracefully...`);
      
      try {
        // Stop platform monitoring
        this.services.platform.stop();
        
        // Stop VRF monitoring
        this.services.vrf.stop();
        
        // Stop dashboard
        if (this.dashboard) {
          this.dashboard.stop();
        }
        
        // Final log
        loggingService.logApp('info', 'Monitoring services shutdown completed', { signal });
        
        console.log('✅ Monitoring services shutdown completed');
        
        // Give time for final logs to be written
        setTimeout(() => {
          process.exit(0);
        }, 1000);
        
      } catch (error) {
        console.error('❌ Error during monitoring services shutdown:', error);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // Nodemon restart
  }

  /**
   * Get status of all monitoring services
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      services: {
        platform: this.services.platform.getStatus(),
        vrf: this.services.vrf.getStatus(),
        logging: this.services.logging.getStatus()
      },
      dashboard: this.dashboard ? {
        port: this.dashboard.port,
        url: `http://localhost:${this.dashboard.port}`
      } : null
    };
  }

  /**
   * Get comprehensive monitoring report
   */
  async getMonitoringReport(timeRange = 3600000) {
    const platformReport = this.services.platform.getMonitoringReport(timeRange);
    const logStats = await loggingService.getLogStatistics(timeRange);
    
    return {
      timestamp: new Date().toISOString(),
      timeRange,
      platform: platformReport,
      logging: logStats,
      services: this.getStatus()
    };
  }

  /**
   * Calculate system health score
   */
  calculateSystemHealth(metrics) {
    let score = 100;
    
    // Deduct points for various issues
    if (metrics.system?.memory?.heapUsedPercentage > 80) score -= 20;
    if (metrics.system?.cpu?.usage > 80) score -= 20;
    if (metrics.application?.api?.errorRate > 5) score -= 15;
    if (metrics.application?.api?.responseTime > 2000) score -= 15;
    if (metrics.security?.events?.critical > 0) score -= 30;
    
    return Math.max(0, score);
  }

  /**
   * Map alert severity to log level
   */
  mapSeverityToLogLevel(severity) {
    const mapping = {
      critical: 'error',
      high: 'warn',
      medium: 'info',
      low: 'debug'
    };
    return mapping[severity] || 'info';
  }

  /**
   * Health check for monitoring services
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {}
    };

    try {
      // Check platform monitoring
      health.services.platform = {
        status: this.services.platform.isRunning ? 'healthy' : 'unhealthy',
        uptime: this.services.platform.isRunning ? Date.now() - this.services.platform.startTime : 0
      };

      // Check VRF monitoring
      health.services.vrf = {
        status: this.services.vrf.isRunning ? 'healthy' : 'unhealthy'
      };

      // Check dashboard
      health.services.dashboard = {
        status: this.dashboard ? 'healthy' : 'unhealthy',
        port: this.dashboard?.port
      };

      // Overall status
      const unhealthyServices = Object.values(health.services)
        .filter(service => service.status !== 'healthy');
      
      if (unhealthyServices.length > 0) {
        health.status = 'degraded';
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }

    return health;
  }

  /**
   * Export monitoring data
   */
  async exportData(format = 'json', timeRange = 86400000) {
    const report = await this.getMonitoringReport(timeRange);
    
    const exportData = {
      format,
      timestamp: new Date().toISOString(),
      timeRange,
      data: report
    };

    // TODO: Implement actual file export
    const filename = `monitoring-export-${Date.now()}.${format}`;
    
    return {
      filename,
      data: exportData,
      size: JSON.stringify(exportData).length
    };
  }
}

// Create singleton instance
const monitoringManager = new MonitoringManager();

module.exports = monitoringManager;