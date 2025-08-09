const express = require('express');
const path = require('path');
const platformMonitoringService = require('./platformMonitoringService');
const loggingService = require('./loggingService');

/**
 * Infrastructure Monitoring Dashboard
 * Provides web-based monitoring interface for the entire platform
 */
class InfrastructureDashboard {
  constructor() {
    this.app = express();
    this.port = process.env.MONITORING_DASHBOARD_PORT || 3002;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
    
    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        loggingService.logRequest(req, res, duration);
      });
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Main dashboard
    this.app.get('/', (req, res) => {
      res.send(this.getDashboardHTML());
    });

    // Health endpoints
    this.app.get('/api/health', (req, res) => {
      const health = this.getSystemHealth();
      res.status(health.status === 'healthy' ? 200 : 503).json(health);
    });

    this.app.get('/api/health/detailed', (req, res) => {
      const detailedHealth = this.getDetailedHealth();
      res.json(detailedHealth);
    });

    // Metrics endpoints
    this.app.get('/api/metrics', (req, res) => {
      const metrics = platformMonitoringService.metrics;
      res.json(metrics);
    });

    this.app.get('/api/metrics/history', (req, res) => {
      const { timeRange = 3600000 } = req.query; // Default 1 hour
      const history = this.getMetricsHistory(parseInt(timeRange));
      res.json(history);
    });

    this.app.get('/api/metrics/system', (req, res) => {
      const systemMetrics = platformMonitoringService.metrics.system || {};
      res.json(systemMetrics);
    });

    this.app.get('/api/metrics/application', (req, res) => {
      const appMetrics = platformMonitoringService.metrics.application || {};
      res.json(appMetrics);
    });

    this.app.get('/api/metrics/business', (req, res) => {
      const businessMetrics = platformMonitoringService.metrics.business || {};
      res.json(businessMetrics);
    });

    this.app.get('/api/metrics/security', (req, res) => {
      const securityMetrics = platformMonitoringService.metrics.security || {};
      res.json(securityMetrics);
    });

    // Alerts endpoints
    this.app.get('/api/alerts', (req, res) => {
      const alerts = platformMonitoringService.alerts || [];
      res.json(alerts);
    });

    this.app.get('/api/alerts/active', (req, res) => {
      const activeAlerts = (platformMonitoringService.alerts || [])
        .filter(alert => alert.status === 'active');
      res.json(activeAlerts);
    });

    this.app.post('/api/alerts/:id/acknowledge', (req, res) => {
      const { id } = req.params;
      const result = this.acknowledgeAlert(id);
      res.json(result);
    });

    // Logs endpoints
    this.app.get('/api/logs', async (req, res) => {
      try {
        const { category, level, limit = 100 } = req.query;
        const logs = await loggingService.searchLogs('', {
          category,
          level,
          limit: parseInt(limit)
        });
        res.json(logs);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/logs/statistics', async (req, res) => {
      try {
        const { timeRange = 86400000 } = req.query; // Default 24 hours
        const stats = await loggingService.getLogStatistics(parseInt(timeRange));
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Services endpoints
    this.app.get('/api/services', (req, res) => {
      const services = this.getServicesStatus();
      res.json(services);
    });

    this.app.get('/api/services/:service/health', (req, res) => {
      const { service } = req.params;
      const health = this.getServiceHealth(service);
      res.json(health);
    });

    // Performance endpoints
    this.app.get('/api/performance', (req, res) => {
      const performance = this.getPerformanceMetrics();
      res.json(performance);
    });

    this.app.get('/api/performance/trends', (req, res) => {
      const { timeRange = 3600000 } = req.query;
      const trends = this.getPerformanceTrends(parseInt(timeRange));
      res.json(trends);
    });

    // Configuration endpoints
    this.app.get('/api/config', (req, res) => {
      const config = this.getConfiguration();
      res.json(config);
    });

    this.app.post('/api/config/monitoring', (req, res) => {
      try {
        const result = this.updateMonitoringConfig(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Reports endpoints
    this.app.get('/api/reports/monitoring', (req, res) => {
      const { timeRange = 86400000 } = req.query;
      const report = platformMonitoringService.getMonitoringReport(parseInt(timeRange));
      res.json(report);
    });

    this.app.get('/api/reports/export', async (req, res) => {
      try {
        const { format = 'json', timeRange = 86400000 } = req.query;
        const report = await this.exportReport(format, parseInt(timeRange));
        res.json(report);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Error handler
    this.app.use((error, req, res, next) => {
      loggingService.logError(error, { context: 'dashboard-api' });
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Setup WebSocket for real-time updates
   */
  setupWebSocket() {
    // TODO: Implement WebSocket for real-time dashboard updates
    // This would push live metrics, alerts, and log updates to the dashboard
  }

  /**
   * Get system health summary
   */
  getSystemHealth() {
    const metrics = platformMonitoringService.metrics;
    const alerts = platformMonitoringService.alerts || [];
    
    const activeAlerts = alerts.filter(a => a.status === 'active');
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
    
    let status = 'healthy';
    if (criticalAlerts.length > 0) {
      status = 'critical';
    } else if (activeAlerts.length > 0) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      alerts: {
        active: activeAlerts.length,
        critical: criticalAlerts.length
      },
      services: this.getServicesStatus(),
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  /**
   * Get detailed health information
   */
  getDetailedHealth() {
    const systemHealth = this.getSystemHealth();
    const metrics = platformMonitoringService.metrics;
    
    return {
      ...systemHealth,
      metrics: {
        system: metrics.system || {},
        application: metrics.application || {},
        business: metrics.business || {},
        security: metrics.security || {}
      },
      performance: this.getPerformanceMetrics(),
      recommendations: this.getHealthRecommendations()
    };
  }

  /**
   * Get services status
   */
  getServicesStatus() {
    return {
      backend: {
        status: 'healthy',
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      },
      database: {
        status: this.getDatabaseStatus(),
        type: 'MongoDB'
      },
      cache: {
        status: this.getCacheStatus(),
        type: 'Redis'
      },
      monitoring: {
        status: platformMonitoringService.isRunning ? 'healthy' : 'unhealthy',
        uptime: platformMonitoringService.isRunning ? Date.now() - platformMonitoringService.startTime : 0
      }
    };
  }

  /**
   * Get database status
   */
  getDatabaseStatus() {
    try {
      const mongoose = require('mongoose');
      return mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Get cache status
   */
  getCacheStatus() {
    try {
      const { client: redisClient } = require('../../config/redisClient');
      return redisClient.status === 'ready' ? 'healthy' : 'unhealthy';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Get service health
   */
  getServiceHealth(serviceName) {
    const services = this.getServicesStatus();
    return services[serviceName] || { status: 'unknown' };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const metrics = platformMonitoringService.metrics;
    
    return {
      responseTime: metrics.application?.api?.responseTime || 0,
      throughput: metrics.application?.api?.throughput || 0,
      errorRate: metrics.application?.api?.errorRate || 0,
      cpuUsage: metrics.system?.cpu?.usage || 0,
      memoryUsage: metrics.system?.memory?.heapUsedPercentage || 0,
      activeUsers: metrics.business?.users?.active || 0,
      activeSessions: metrics.application?.gaming?.activeSessions || 0
    };
  }

  /**
   * Get performance trends
   */
  getPerformanceTrends(timeRange) {
    const history = platformMonitoringService.metricsHistory || [];
    const cutoff = Date.now() - timeRange;
    
    const relevantMetrics = history.filter(m => m.timestamp > cutoff);
    
    if (relevantMetrics.length < 2) {
      return { trend: 'insufficient-data' };
    }

    const first = relevantMetrics[0];
    const last = relevantMetrics[relevantMetrics.length - 1];

    return {
      responseTime: this.calculateTrend(
        first.application?.api?.responseTime,
        last.application?.api?.responseTime
      ),
      errorRate: this.calculateTrend(
        first.application?.api?.errorRate,
        last.application?.api?.errorRate
      ),
      memoryUsage: this.calculateTrend(
        first.system?.memory?.heapUsedPercentage,
        last.system?.memory?.heapUsedPercentage
      ),
      cpuUsage: this.calculateTrend(
        first.system?.cpu?.usage,
        last.system?.cpu?.usage
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
   * Get metrics history
   */
  getMetricsHistory(timeRange) {
    const history = platformMonitoringService.metricsHistory || [];
    const cutoff = Date.now() - timeRange;
    
    return history.filter(m => m.timestamp > cutoff);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId) {
    const alerts = platformMonitoringService.alerts || [];
    const alert = alerts.find(a => a.id === alertId);
    
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date();
      return { success: true, alert };
    }
    
    return { success: false, error: 'Alert not found' };
  }

  /**
   * Get configuration
   */
  getConfiguration() {
    return {
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      monitoring: platformMonitoringService.getStatus(),
      logging: loggingService.getStatus(),
      dashboard: {
        port: this.port,
        uptime: process.uptime()
      }
    };
  }

  /**
   * Update monitoring configuration
   */
  updateMonitoringConfig(config) {
    // TODO: Implement configuration updates
    return { success: true, message: 'Configuration updated' };
  }

  /**
   * Get health recommendations
   */
  getHealthRecommendations() {
    const metrics = platformMonitoringService.metrics;
    const recommendations = [];

    // Memory usage recommendations
    if (metrics.system?.memory?.heapUsedPercentage > 80) {
      recommendations.push({
        priority: 'high',
        category: 'performance',
        title: 'High Memory Usage',
        description: 'Consider optimizing memory usage or scaling up resources'
      });
    }

    // Error rate recommendations
    if (metrics.application?.api?.errorRate > 5) {
      recommendations.push({
        priority: 'medium',
        category: 'reliability',
        title: 'High Error Rate',
        description: 'Investigate and fix sources of API errors'
      });
    }

    return recommendations;
  }

  /**
   * Export monitoring report
   */
  async exportReport(format, timeRange) {
    const report = platformMonitoringService.getMonitoringReport(timeRange);
    
    // TODO: Implement actual export functionality
    return {
      format,
      timeRange,
      exportPath: `/tmp/monitoring-report-${Date.now()}.${format}`,
      report
    };
  }

  /**
   * Generate dashboard HTML
   */
  getDashboardHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Naffles Infrastructure Monitoring</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; }
        .header h1 { font-size: 2rem; margin-bottom: 10px; }
        .header p { opacity: 0.9; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .card h3 { color: #2d3748; margin-bottom: 16px; font-size: 1.25rem; }
        .metric { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f7fafc; }
        .metric:last-child { border-bottom: none; }
        .metric-label { color: #4a5568; font-weight: 500; }
        .metric-value { font-weight: 600; }
        .status-healthy { color: #38a169; }
        .status-degraded { color: #d69e2e; }
        .status-critical { color: #e53e3e; }
        .status-unknown { color: #718096; }
        .alert { padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; }
        .alert-critical { background: #fed7d7; border-left: 4px solid #e53e3e; }
        .alert-high { background: #fef5e7; border-left: 4px solid #d69e2e; }
        .alert-medium { background: #e6fffa; border-left: 4px solid #38b2ac; }
        .btn { background: #4299e1; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
        .btn:hover { background: #3182ce; }
        .btn-secondary { background: #718096; }
        .btn-secondary:hover { background: #4a5568; }
        .chart-container { height: 200px; background: #f7fafc; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #718096; }
        .tabs { display: flex; border-bottom: 1px solid #e2e8f0; margin-bottom: 20px; }
        .tab { padding: 12px 24px; cursor: pointer; border-bottom: 2px solid transparent; }
        .tab.active { border-bottom-color: #4299e1; color: #4299e1; font-weight: 600; }
        .tab:hover { background: #f7fafc; }
        .loading { text-align: center; padding: 40px; color: #718096; }
        .refresh-indicator { display: inline-block; margin-left: 10px; opacity: 0; transition: opacity 0.3s; }
        .refresh-indicator.active { opacity: 1; }
    </style>
</head>
<body>
    <div class="header">
        <div class="container">
            <h1>🚀 Naffles Infrastructure Monitoring</h1>
            <p>Real-time monitoring and alerting for the Naffles platform</p>
            <button class="btn" onclick="refreshDashboard()">
                Refresh Dashboard
                <span class="refresh-indicator" id="refreshIndicator">🔄</span>
            </button>
        </div>
    </div>

    <div class="container">
        <div class="tabs">
            <div class="tab active" onclick="showTab('overview')">Overview</div>
            <div class="tab" onclick="showTab('metrics')">Metrics</div>
            <div class="tab" onclick="showTab('alerts')">Alerts</div>
            <div class="tab" onclick="showTab('logs')">Logs</div>
            <div class="tab" onclick="showTab('performance')">Performance</div>
        </div>

        <div id="overview-tab" class="tab-content">
            <div class="grid">
                <div class="card">
                    <h3>System Health</h3>
                    <div id="system-health" class="loading">Loading...</div>
                </div>
                
                <div class="card">
                    <h3>Services Status</h3>
                    <div id="services-status" class="loading">Loading...</div>
                </div>
                
                <div class="card">
                    <h3>Active Alerts</h3>
                    <div id="active-alerts" class="loading">Loading...</div>
                </div>
                
                <div class="card">
                    <h3>Performance Summary</h3>
                    <div id="performance-summary" class="loading">Loading...</div>
                </div>
            </div>
        </div>

        <div id="metrics-tab" class="tab-content" style="display: none;">
            <div class="grid">
                <div class="card">
                    <h3>System Metrics</h3>
                    <div id="system-metrics" class="loading">Loading...</div>
                </div>
                
                <div class="card">
                    <h3>Application Metrics</h3>
                    <div id="application-metrics" class="loading">Loading...</div>
                </div>
                
                <div class="card">
                    <h3>Business Metrics</h3>
                    <div id="business-metrics" class="loading">Loading...</div>
                </div>
                
                <div class="card">
                    <h3>Security Metrics</h3>
                    <div id="security-metrics" class="loading">Loading...</div>
                </div>
            </div>
        </div>

        <div id="alerts-tab" class="tab-content" style="display: none;">
            <div class="card">
                <h3>Alert Management</h3>
                <div id="alerts-list" class="loading">Loading...</div>
            </div>
        </div>

        <div id="logs-tab" class="tab-content" style="display: none;">
            <div class="card">
                <h3>Recent Logs</h3>
                <div id="logs-list" class="loading">Loading...</div>
            </div>
        </div>

        <div id="performance-tab" class="tab-content" style="display: none;">
            <div class="grid">
                <div class="card">
                    <h3>Response Time Trend</h3>
                    <div class="chart-container">Chart placeholder - Response Time</div>
                </div>
                
                <div class="card">
                    <h3>Error Rate Trend</h3>
                    <div class="chart-container">Chart placeholder - Error Rate</div>
                </div>
                
                <div class="card">
                    <h3>Resource Usage</h3>
                    <div class="chart-container">Chart placeholder - CPU/Memory</div>
                </div>
                
                <div class="card">
                    <h3>Throughput</h3>
                    <div class="chart-container">Chart placeholder - Requests/sec</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentTab = 'overview';
        let refreshInterval;

        // Tab management
        function showTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.style.display = 'none';
            });
            
            // Remove active class from all tab buttons
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Show selected tab
            document.getElementById(tabName + '-tab').style.display = 'block';
            
            // Add active class to selected tab button
            event.target.classList.add('active');
            
            currentTab = tabName;
            loadTabData(tabName);
        }

        // Load data for specific tab
        async function loadTabData(tabName) {
            switch(tabName) {
                case 'overview':
                    await loadOverviewData();
                    break;
                case 'metrics':
                    await loadMetricsData();
                    break;
                case 'alerts':
                    await loadAlertsData();
                    break;
                case 'logs':
                    await loadLogsData();
                    break;
                case 'performance':
                    await loadPerformanceData();
                    break;
            }
        }

        // Load overview data
        async function loadOverviewData() {
            try {
                // System health
                const health = await fetch('/api/health').then(r => r.json());
                document.getElementById('system-health').innerHTML = 
                    '<div class="metric"><span class="metric-label">Status:</span><span class="metric-value status-' + health.status + '">' + health.status.toUpperCase() + '</span></div>' +
                    '<div class="metric"><span class="metric-label">Uptime:</span><span class="metric-value">' + formatUptime(health.uptime) + '</span></div>' +
                    '<div class="metric"><span class="metric-label">Version:</span><span class="metric-value">' + health.version + '</span></div>';

                // Services status
                const services = await fetch('/api/services').then(r => r.json());
                let servicesHTML = '';
                Object.entries(services).forEach(([name, service]) => {
                    servicesHTML += '<div class="metric"><span class="metric-label">' + name + ':</span><span class="metric-value status-' + service.status + '">' + service.status.toUpperCase() + '</span></div>';
                });
                document.getElementById('services-status').innerHTML = servicesHTML;

                // Active alerts
                const alerts = await fetch('/api/alerts/active').then(r => r.json());
                if (alerts.length === 0) {
                    document.getElementById('active-alerts').innerHTML = '<div class="metric"><span class="metric-value status-healthy">No active alerts</span></div>';
                } else {
                    let alertsHTML = '';
                    alerts.slice(0, 5).forEach(alert => {
                        alertsHTML += '<div class="alert alert-' + alert.severity + '">' + alert.message + '</div>';
                    });
                    document.getElementById('active-alerts').innerHTML = alertsHTML;
                }

                // Performance summary
                const performance = await fetch('/api/performance').then(r => r.json());
                document.getElementById('performance-summary').innerHTML = 
                    '<div class="metric"><span class="metric-label">Response Time:</span><span class="metric-value">' + performance.responseTime + 'ms</span></div>' +
                    '<div class="metric"><span class="metric-label">Error Rate:</span><span class="metric-value">' + performance.errorRate + '%</span></div>' +
                    '<div class="metric"><span class="metric-label">CPU Usage:</span><span class="metric-value">' + performance.cpuUsage + '%</span></div>' +
                    '<div class="metric"><span class="metric-label">Memory Usage:</span><span class="metric-value">' + performance.memoryUsage + '%</span></div>';

            } catch (error) {
                console.error('Failed to load overview data:', error);
            }
        }

        // Load metrics data
        async function loadMetricsData() {
            try {
                const metrics = await fetch('/api/metrics').then(r => r.json());
                
                // System metrics
                if (metrics.system) {
                    let systemHTML = '';
                    if (metrics.system.memory) {
                        systemHTML += '<div class="metric"><span class="metric-label">Memory Usage:</span><span class="metric-value">' + metrics.system.memory.heapUsedPercentage + '%</span></div>';
                        systemHTML += '<div class="metric"><span class="metric-label">Heap Used:</span><span class="metric-value">' + Math.round(metrics.system.memory.heapUsed / 1024 / 1024) + ' MB</span></div>';
                    }
                    if (metrics.system.cpu) {
                        systemHTML += '<div class="metric"><span class="metric-label">CPU Usage:</span><span class="metric-value">' + (metrics.system.cpu.usage || 0) + '%</span></div>';
                    }
                    document.getElementById('system-metrics').innerHTML = systemHTML || 'No system metrics available';
                }

                // Application metrics
                if (metrics.application) {
                    let appHTML = '';
                    if (metrics.application.api) {
                        appHTML += '<div class="metric"><span class="metric-label">Response Time:</span><span class="metric-value">' + (metrics.application.api.responseTime || 0) + 'ms</span></div>';
                        appHTML += '<div class="metric"><span class="metric-label">Error Rate:</span><span class="metric-value">' + (metrics.application.api.errorRate || 0) + '%</span></div>';
                        appHTML += '<div class="metric"><span class="metric-label">Throughput:</span><span class="metric-value">' + (metrics.application.api.throughput || 0) + ' req/s</span></div>';
                    }
                    document.getElementById('application-metrics').innerHTML = appHTML || 'No application metrics available';
                }

                // Business metrics
                if (metrics.business) {
                    let businessHTML = '';
                    if (metrics.business.users) {
                        businessHTML += '<div class="metric"><span class="metric-label">Total Users:</span><span class="metric-value">' + (metrics.business.users.total || 0) + '</span></div>';
                        businessHTML += '<div class="metric"><span class="metric-label">Active Users:</span><span class="metric-value">' + (metrics.business.users.active || 0) + '</span></div>';
                    }
                    if (metrics.business.raffles) {
                        businessHTML += '<div class="metric"><span class="metric-label">Active Raffles:</span><span class="metric-value">' + (metrics.business.raffles.active || 0) + '</span></div>';
                    }
                    document.getElementById('business-metrics').innerHTML = businessHTML || 'No business metrics available';
                }

                // Security metrics
                if (metrics.security) {
                    let securityHTML = '';
                    if (metrics.security.events) {
                        securityHTML += '<div class="metric"><span class="metric-label">Critical Events:</span><span class="metric-value">' + (metrics.security.events.critical || 0) + '</span></div>';
                        securityHTML += '<div class="metric"><span class="metric-label">High Events:</span><span class="metric-value">' + (metrics.security.events.high || 0) + '</span></div>';
                        securityHTML += '<div class="metric"><span class="metric-label">Medium Events:</span><span class="metric-value">' + (metrics.security.events.medium || 0) + '</span></div>';
                    }
                    document.getElementById('security-metrics').innerHTML = securityHTML || 'No security metrics available';
                }

            } catch (error) {
                console.error('Failed to load metrics data:', error);
            }
        }

        // Load alerts data
        async function loadAlertsData() {
            try {
                const alerts = await fetch('/api/alerts').then(r => r.json());
                
                if (alerts.length === 0) {
                    document.getElementById('alerts-list').innerHTML = '<div class="metric"><span class="metric-value status-healthy">No alerts</span></div>';
                } else {
                    let alertsHTML = '';
                    alerts.forEach(alert => {
                        alertsHTML += '<div class="alert alert-' + alert.severity + '">';
                        alertsHTML += '<strong>' + alert.type.toUpperCase() + '</strong>: ' + alert.message;
                        alertsHTML += '<br><small>' + new Date(alert.timestamp).toLocaleString() + '</small>';
                        if (!alert.acknowledged) {
                            alertsHTML += '<button class="btn btn-secondary" onclick="acknowledgeAlert(\'' + alert.id + '\')">Acknowledge</button>';
                        }
                        alertsHTML += '</div>';
                    });
                    document.getElementById('alerts-list').innerHTML = alertsHTML;
                }
            } catch (error) {
                console.error('Failed to load alerts data:', error);
            }
        }

        // Load logs data
        async function loadLogsData() {
            try {
                const logs = await fetch('/api/logs?limit=50').then(r => r.json());
                
                if (logs.results && logs.results.length > 0) {
                    let logsHTML = '';
                    logs.results.forEach(log => {
                        logsHTML += '<div class="metric">';
                        logsHTML += '<span class="metric-label">' + new Date(log.timestamp).toLocaleTimeString() + '</span>';
                        logsHTML += '<span class="metric-value">' + log.message + '</span>';
                        logsHTML += '</div>';
                    });
                    document.getElementById('logs-list').innerHTML = logsHTML;
                } else {
                    document.getElementById('logs-list').innerHTML = '<div class="metric"><span class="metric-value">No recent logs available</span></div>';
                }
            } catch (error) {
                console.error('Failed to load logs data:', error);
                document.getElementById('logs-list').innerHTML = '<div class="metric"><span class="metric-value">Error loading logs</span></div>';
            }
        }

        // Load performance data
        async function loadPerformanceData() {
            // Performance charts would be implemented here
            // For now, just show placeholder text
            console.log('Performance data loaded (placeholder)');
        }

        // Acknowledge alert
        async function acknowledgeAlert(alertId) {
            try {
                await fetch('/api/alerts/' + alertId + '/acknowledge', { method: 'POST' });
                await loadAlertsData(); // Refresh alerts
            } catch (error) {
                console.error('Failed to acknowledge alert:', error);
            }
        }

        // Refresh dashboard
        async function refreshDashboard() {
            const indicator = document.getElementById('refreshIndicator');
            indicator.classList.add('active');
            
            try {
                await loadTabData(currentTab);
            } catch (error) {
                console.error('Failed to refresh dashboard:', error);
            } finally {
                setTimeout(() => {
                    indicator.classList.remove('active');
                }, 1000);
            }
        }

        // Format uptime
        function formatUptime(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return hours + 'h ' + minutes + 'm';
        }

        // Initialize dashboard
        document.addEventListener('DOMContentLoaded', function() {
            loadOverviewData();
            
            // Auto-refresh every 30 seconds
            refreshInterval = setInterval(refreshDashboard, 30000);
        });

        // Cleanup on page unload
        window.addEventListener('beforeunload', function() {
            if (refreshInterval) {
                clearInterval(refreshInterval);
            }
        });
    </script>
</body>
</html>`;
  }

  /**
   * Start the dashboard server
   */
  start() {
    this.app.listen(this.port, () => {
      console.log(`🖥️  Infrastructure monitoring dashboard started on port ${this.port}`);
      console.log(`📊 Dashboard URL: http://localhost:${this.port}`);
      
      loggingService.logApp('info', 'Infrastructure monitoring dashboard started', {
        port: this.port,
        environment: process.env.NODE_ENV
      });
    });
  }

  /**
   * Stop the dashboard server
   */
  stop() {
    // TODO: Implement graceful shutdown
    console.log('🛑 Infrastructure monitoring dashboard stopped');
  }
}

module.exports = InfrastructureDashboard;