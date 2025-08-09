const express = require('express');
const router = express.Router();
const monitoringManager = require('../services/monitoring');
const platformMonitoringService = require('../services/monitoring/platformMonitoringService');
const loggingService = require('../services/monitoring/loggingService');
const vrfMonitoringService = require('../services/vrfMonitoringService');
const securityMonitoringService = require('../services/security/securityMonitoringService');

/**
 * Monitoring API Routes
 * Provides comprehensive monitoring endpoints for the platform
 */

// Middleware to check if monitoring is enabled
const checkMonitoringEnabled = (req, res, next) => {
  if (process.env.MONITORING_ENABLED === 'false') {
    return res.status(503).json({
      error: 'Monitoring is disabled',
      message: 'Set MONITORING_ENABLED=true to enable monitoring endpoints'
    });
  }
  next();
};

// Apply monitoring check to all routes
router.use(checkMonitoringEnabled);

/**
 * @route GET /monitoring/status
 * @desc Get overall monitoring status
 * @access Public (for load balancers)
 */
router.get('/status', async (req, res) => {
  try {
    const status = monitoringManager.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/health
 * @desc Get comprehensive health check
 * @access Public (for monitoring systems)
 */
router.get('/health', async (req, res) => {
  try {
    const health = await monitoringManager.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /monitoring/metrics
 * @desc Get current platform metrics
 * @access Private (requires authentication)
 */
router.get('/metrics', (req, res) => {
  try {
    const metrics = platformMonitoringService.metrics;
    res.json({
      timestamp: new Date().toISOString(),
      metrics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/metrics/history
 * @desc Get metrics history
 * @access Private
 */
router.get('/metrics/history', (req, res) => {
  try {
    const { timeRange = 3600000 } = req.query; // Default 1 hour
    const history = platformMonitoringService.metricsHistory.filter(
      m => m.timestamp > Date.now() - parseInt(timeRange)
    );
    
    res.json({
      timeRange: parseInt(timeRange),
      count: history.length,
      history
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/metrics/system
 * @desc Get system metrics
 * @access Private
 */
router.get('/metrics/system', (req, res) => {
  try {
    const systemMetrics = platformMonitoringService.metrics.system || {};
    res.json(systemMetrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/metrics/application
 * @desc Get application metrics
 * @access Private
 */
router.get('/metrics/application', (req, res) => {
  try {
    const appMetrics = platformMonitoringService.metrics.application || {};
    res.json(appMetrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/metrics/business
 * @desc Get business metrics
 * @access Private
 */
router.get('/metrics/business', (req, res) => {
  try {
    const businessMetrics = platformMonitoringService.metrics.business || {};
    res.json(businessMetrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/metrics/security
 * @desc Get security metrics
 * @access Private
 */
router.get('/metrics/security', (req, res) => {
  try {
    const securityMetrics = platformMonitoringService.metrics.security || {};
    res.json(securityMetrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/alerts
 * @desc Get all alerts
 * @access Private
 */
router.get('/alerts', (req, res) => {
  try {
    const { status, severity } = req.query;
    let alerts = platformMonitoringService.alerts || [];
    
    if (status) {
      alerts = alerts.filter(alert => alert.status === status);
    }
    
    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }
    
    res.json({
      count: alerts.length,
      alerts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/alerts/active
 * @desc Get active alerts
 * @access Private
 */
router.get('/alerts/active', (req, res) => {
  try {
    const activeAlerts = (platformMonitoringService.alerts || [])
      .filter(alert => alert.status === 'active');
    
    res.json({
      count: activeAlerts.length,
      alerts: activeAlerts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /monitoring/alerts/:id/acknowledge
 * @desc Acknowledge an alert
 * @access Private
 */
router.post('/alerts/:id/acknowledge', (req, res) => {
  try {
    const { id } = req.params;
    const alerts = platformMonitoringService.alerts || [];
    const alert = alerts.find(a => a.id === id);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = req.user?.id || 'system';
    
    res.json({
      success: true,
      alert
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/logs
 * @desc Search logs
 * @access Private
 */
router.get('/logs', async (req, res) => {
  try {
    const {
      category,
      level,
      startTime,
      endTime,
      limit = 100,
      query = ''
    } = req.query;
    
    const logs = await loggingService.searchLogs(query, {
      category,
      level,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      limit: parseInt(limit)
    });
    
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/logs/statistics
 * @desc Get log statistics
 * @access Private
 */
router.get('/logs/statistics', async (req, res) => {
  try {
    const { timeRange = 86400000 } = req.query; // Default 24 hours
    const stats = await loggingService.getLogStatistics(parseInt(timeRange));
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/performance
 * @desc Get performance metrics
 * @access Private
 */
router.get('/performance', (req, res) => {
  try {
    const metrics = platformMonitoringService.metrics;
    
    const performance = {
      responseTime: metrics.application?.api?.responseTime || 0,
      throughput: metrics.application?.api?.throughput || 0,
      errorRate: metrics.application?.api?.errorRate || 0,
      cpuUsage: metrics.system?.cpu?.usage || 0,
      memoryUsage: metrics.system?.memory?.heapUsedPercentage || 0,
      activeUsers: metrics.business?.users?.active || 0,
      activeSessions: metrics.application?.gaming?.activeSessions || 0,
      uptime: process.uptime()
    };
    
    res.json(performance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/performance/trends
 * @desc Get performance trends
 * @access Private
 */
router.get('/performance/trends', (req, res) => {
  try {
    const { timeRange = 3600000 } = req.query; // Default 1 hour
    const history = platformMonitoringService.metricsHistory || [];
    const cutoff = Date.now() - parseInt(timeRange);
    
    const relevantMetrics = history.filter(m => m.timestamp > cutoff);
    
    if (relevantMetrics.length < 2) {
      return res.json({ trend: 'insufficient-data' });
    }

    const first = relevantMetrics[0];
    const last = relevantMetrics[relevantMetrics.length - 1];

    const calculateTrend = (oldValue, newValue) => {
      if (!oldValue || !newValue) return 'stable';
      const change = ((newValue - oldValue) / oldValue) * 100;
      if (change > 10) return 'increasing';
      if (change < -10) return 'decreasing';
      return 'stable';
    };

    const trends = {
      responseTime: calculateTrend(
        first.application?.api?.responseTime,
        last.application?.api?.responseTime
      ),
      errorRate: calculateTrend(
        first.application?.api?.errorRate,
        last.application?.api?.errorRate
      ),
      memoryUsage: calculateTrend(
        first.system?.memory?.heapUsedPercentage,
        last.system?.memory?.heapUsedPercentage
      ),
      cpuUsage: calculateTrend(
        first.system?.cpu?.usage,
        last.system?.cpu?.usage
      )
    };
    
    res.json(trends);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/services
 * @desc Get services status
 * @access Private
 */
router.get('/services', (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { client: redisClient } = require('../config/redisClient');
    
    const services = {
      backend: {
        status: 'healthy',
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      },
      database: {
        status: mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy',
        type: 'MongoDB',
        host: mongoose.connection.host,
        database: mongoose.connection.name
      },
      cache: {
        status: redisClient.status === 'ready' ? 'healthy' : 'unhealthy',
        type: 'Redis',
        host: redisClient.options.host,
        port: redisClient.options.port
      },
      monitoring: {
        status: platformMonitoringService.isRunning ? 'healthy' : 'unhealthy',
        uptime: platformMonitoringService.isRunning ? Date.now() - platformMonitoringService.startTime : 0
      },
      vrf: {
        status: vrfMonitoringService.isRunning ? 'healthy' : 'unhealthy'
      }
    };
    
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/services/:service/health
 * @desc Get specific service health
 * @access Private
 */
router.get('/services/:service/health', (req, res) => {
  try {
    const { service } = req.params;
    
    // This would be expanded to check specific services
    const serviceHealth = {
      service,
      status: 'healthy',
      timestamp: new Date().toISOString()
    };
    
    res.json(serviceHealth);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/reports
 * @desc Get monitoring report
 * @access Private
 */
router.get('/reports', async (req, res) => {
  try {
    const { timeRange = 86400000 } = req.query; // Default 24 hours
    const report = await monitoringManager.getMonitoringReport(parseInt(timeRange));
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /monitoring/reports/export
 * @desc Export monitoring data
 * @access Private
 */
router.post('/reports/export', async (req, res) => {
  try {
    const { format = 'json', timeRange = 86400000 } = req.body;
    const exportData = await monitoringManager.exportData(format, timeRange);
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/config
 * @desc Get monitoring configuration
 * @access Private
 */
router.get('/config', (req, res) => {
  try {
    const config = {
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      monitoring: {
        enabled: process.env.MONITORING_ENABLED !== 'false',
        platformMonitoring: platformMonitoringService.getStatus(),
        vrfMonitoring: vrfMonitoringService.getStatus(),
        logging: loggingService.getStatus()
      },
      dashboard: {
        port: process.env.MONITORING_DASHBOARD_PORT || 3002,
        url: `http://localhost:${process.env.MONITORING_DASHBOARD_PORT || 3002}`
      }
    };
    
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /monitoring/config
 * @desc Update monitoring configuration
 * @access Private (admin only)
 */
router.post('/config', (req, res) => {
  try {
    // TODO: Implement configuration updates
    // This would allow updating monitoring thresholds, intervals, etc.
    
    res.json({
      success: true,
      message: 'Configuration update not yet implemented'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/security/events
 * @desc Get security events
 * @access Private
 */
router.get('/security/events', async (req, res) => {
  try {
    const { timeRange = 86400000, severity } = req.query;
    const startTime = new Date(Date.now() - parseInt(timeRange));
    
    // This would query the security monitoring service
    const events = await securityMonitoringService.generateSecurityReport({
      start: startTime,
      end: new Date()
    });
    
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /monitoring/vrf/status
 * @desc Get VRF monitoring status
 * @access Private
 */
router.get('/vrf/status', (req, res) => {
  try {
    const status = vrfMonitoringService.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handler for monitoring routes
router.use((error, req, res, next) => {
  loggingService.logError(error, { 
    context: 'monitoring-api',
    endpoint: req.path,
    method: req.method
  });
  
  res.status(500).json({
    error: 'Internal monitoring error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
  });
});

module.exports = router;