# Deployment and Monitoring Infrastructure

This document describes the comprehensive deployment and monitoring infrastructure for the Naffles platform.

## Overview

The Naffles platform includes a complete deployment and monitoring infrastructure that provides:

- **Automated Deployment**: Scripts and CI/CD pipelines for deploying to different environments
- **Comprehensive Monitoring**: Real-time monitoring of system health, performance, and business metrics
- **Centralized Logging**: Structured logging with aggregation and analysis
- **Security Monitoring**: Real-time security event detection and alerting
- **Infrastructure Dashboard**: Web-based monitoring interface
- **Health Checks**: Automated health validation for all system components

## Architecture

### Monitoring Services

```
┌─────────────────────────────────────────────────────────────┐
│                    Monitoring Architecture                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ Platform        │  │ Security        │  │ VRF          │ │
│  │ Monitoring      │  │ Monitoring      │  │ Monitoring   │ │
│  │ Service         │  │ Service         │  │ Service      │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
│           │                     │                   │       │
│           └─────────────────────┼───────────────────┘       │
│                                 │                           │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Centralized Logging Service               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                 │                           │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │            Infrastructure Dashboard                     │ │
│  │                (Port 3002)                             │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Source    │    │   Build     │    │   Deploy    │    │   Monitor   │
│   Control   │───▶│   & Test    │───▶│   Services  │───▶│   Health    │
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                    │                    │                    │
      │                    │                    │                    │
   Git Push          Docker Build        Cloud Deploy         Health Check
   GitLab CI         Run Tests           Cloud Run            Monitoring
   Branch Rules      Security Scan       Load Balancer        Alerting
```

## Services

### 1. Platform Monitoring Service

**Location**: `services/monitoring/platformMonitoringService.js`

**Features**:
- Real-time system metrics collection (CPU, memory, disk)
- Application performance monitoring (response time, throughput, error rate)
- Business metrics tracking (users, raffles, gaming activity)
- Security event monitoring
- Automated alerting with configurable thresholds
- Metrics history and trend analysis

**Configuration**:
```javascript
config: {
  metricsInterval: 30000, // 30 seconds
  alertThresholds: {
    cpuUsage: 80, // %
    memoryUsage: 85, // %
    diskUsage: 90, // %
    responseTime: 5000, // ms
    errorRate: 5, // %
  }
}
```

### 2. Centralized Logging Service

**Location**: `services/monitoring/loggingService.js`

**Features**:
- Structured logging with Winston
- Multiple log categories (app, security, gaming, api, performance, audit)
- File rotation and retention management
- Log aggregation and search capabilities
- JSON format for machine processing

**Log Categories**:
- **Application**: General application events
- **Security**: Security-related events and alerts
- **Gaming**: Game-specific events and outcomes
- **API**: HTTP request/response logging
- **Performance**: Performance metrics and benchmarks
- **Audit**: Business and compliance events

### 3. Infrastructure Dashboard

**Location**: `services/monitoring/infrastructureDashboard.js`

**Features**:
- Web-based monitoring interface (Port 3002)
- Real-time metrics visualization
- Alert management and acknowledgment
- Log viewing and filtering
- Performance trend analysis
- Service health status

**Access**: `http://localhost:3002`

### 4. Security Monitoring Service

**Location**: `services/security/securityMonitoringService.js`

**Features**:
- Real-time security event detection
- Game integrity monitoring
- Suspicious activity pattern detection
- Automated security alerting
- Comprehensive security reporting

### 5. VRF Monitoring Service

**Location**: `services/vrfMonitoringService.js`

**Features**:
- VRF request monitoring and fulfillment tracking
- LINK balance monitoring with low balance alerts
- Stuck request detection and failsafe activation
- VRF system health checks
- Daily cleanup and reporting

## Deployment

### Environments

The platform supports three deployment environments:

1. **Development** (`development` branch)
   - Local Docker deployment
   - Full monitoring enabled
   - Debug logging

2. **Staging** (`staging` branch)
   - Google Cloud Run deployment
   - Production-like monitoring
   - Comprehensive testing

3. **Production** (`main` branch)
   - Google Cloud Run deployment
   - Full monitoring and alerting
   - Database backups before deployment

### Deployment Script

**Location**: `scripts/deploy.js`

**Usage**:
```bash
# Deploy to development
node scripts/deploy.js development

# Deploy to staging with specific services
node scripts/deploy.js staging --services backend,frontend

# Production deployment (requires approval)
node scripts/deploy.js production

# Dry run (show what would be deployed)
node scripts/deploy.js production --dry-run
```

**Features**:
- Environment validation
- Pre-deployment testing
- Database backups (production)
- Health checks after deployment
- Rollback capability
- Deployment notifications

### Cloud Build Configuration

Each service has a `cloudbuild.yaml` file for Google Cloud Build:

- **Backend**: `naffles-backend/cloudbuild.yaml`
- **Frontend**: `naffles-frontend/cloudbuild.yaml`
- **Admin**: `naffles-admin/cloudbuild.yaml`

**Features**:
- Multi-stage Docker builds
- Environment-specific deployments
- Automatic scaling configuration
- Health check integration

### Docker Compose

Local development uses Docker Compose with environment-specific files:

- `docker-compose.development.yml`
- `docker-compose.staging.yml`
- `docker-compose.production.yml`

## Health Checks

### Comprehensive Health Check Script

**Location**: `scripts/health-check.js`

**Usage**:
```bash
# Basic health check
node scripts/health-check.js

# Health check with custom URL
node scripts/health-check.js --url https://api.naffles.com

# JSON output for monitoring systems
node scripts/health-check.js --json

# Skip database checks
node scripts/health-check.js --no-database
```

**Checks**:
- Environment variables validation
- Memory and disk usage
- Database connectivity (MongoDB)
- Cache connectivity (Redis)
- HTTP endpoint availability
- Security configuration
- Monitoring services status
- External service connectivity (optional)

### Health Endpoints

The platform exposes several health check endpoints:

- `GET /health` - Basic health status
- `GET /health/detailed` - Comprehensive health information
- `GET /health/readiness` - Kubernetes readiness probe
- `GET /health/liveness` - Kubernetes liveness probe
- `GET /health/metrics` - Performance metrics

## Monitoring API

### Endpoints

The monitoring API provides comprehensive access to monitoring data:

**Base URL**: `/api/monitoring`

#### Status and Health
- `GET /status` - Overall monitoring status
- `GET /health` - Comprehensive health check

#### Metrics
- `GET /metrics` - Current platform metrics
- `GET /metrics/history` - Historical metrics
- `GET /metrics/system` - System-specific metrics
- `GET /metrics/application` - Application metrics
- `GET /metrics/business` - Business metrics
- `GET /metrics/security` - Security metrics

#### Alerts
- `GET /alerts` - All alerts
- `GET /alerts/active` - Active alerts only
- `POST /alerts/:id/acknowledge` - Acknowledge alert

#### Logs
- `GET /logs` - Search logs
- `GET /logs/statistics` - Log statistics

#### Performance
- `GET /performance` - Performance metrics
- `GET /performance/trends` - Performance trends

#### Services
- `GET /services` - Services status
- `GET /services/:service/health` - Specific service health

#### Reports
- `GET /reports` - Monitoring reports
- `POST /reports/export` - Export monitoring data

### Authentication

Monitoring endpoints require authentication except for basic health checks used by load balancers.

## Configuration

### Environment Variables

**Required**:
```bash
NODE_ENV=production
MONGODB_URI=mongodb://...
REDIS_URL=redis://...
JWT_SECRET=your-secret-key
API_KEY=your-api-key
```

**Monitoring Specific**:
```bash
MONITORING_ENABLED=true
MONITORING_DASHBOARD_PORT=3002
LOG_LEVEL=info
HEALTH_CHECK_EXTERNAL=false
```

### Monitoring Configuration

The monitoring services can be configured through environment variables or the monitoring API:

```javascript
// Alert thresholds
ALERT_CPU_THRESHOLD=80
ALERT_MEMORY_THRESHOLD=85
ALERT_DISK_THRESHOLD=90
ALERT_RESPONSE_TIME_THRESHOLD=5000
ALERT_ERROR_RATE_THRESHOLD=5

// Monitoring intervals
METRICS_COLLECTION_INTERVAL=30000
VRF_MONITORING_INTERVAL=30000
HEALTH_CHECK_INTERVAL=60000
```

## Alerting

### Alert Types

1. **System Alerts**
   - High CPU usage (>80%)
   - High memory usage (>85%)
   - High disk usage (>90%)
   - Service unavailability

2. **Application Alerts**
   - High error rate (>5%)
   - High response time (>5s)
   - Database connectivity issues
   - Cache connectivity issues

3. **Security Alerts**
   - Critical security events
   - Game integrity violations
   - Suspicious activity patterns
   - Authentication failures

4. **Business Alerts**
   - VRF system failures
   - Payment processing issues
   - High user activity spikes

### Alert Channels

Alerts can be sent through multiple channels:

- **Console Logging**: Immediate console output
- **File Logging**: Structured log files
- **Dashboard**: Web dashboard notifications
- **Email**: Email notifications (TODO)
- **Slack/Discord**: Webhook notifications (TODO)
- **SMS**: Critical alert SMS (TODO)
- **PagerDuty**: Incident management (TODO)

## Logging

### Log Structure

All logs follow a structured format:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "category": "application",
  "message": "User logged in",
  "service": "naffles-backend",
  "environment": "production",
  "version": "1.0.0",
  "userId": "user123",
  "sessionId": "session456",
  "metadata": {
    "ip": "192.168.1.1",
    "userAgent": "Mozilla/5.0..."
  }
}
```

### Log Retention

- **Development**: 7 days
- **Staging**: 30 days
- **Production**: 90 days

### Log Analysis

Logs can be analyzed through:

- **Dashboard**: Web-based log viewer
- **API**: Programmatic log search
- **File System**: Direct file access
- **External Tools**: ELK Stack, Splunk, etc. (TODO)

## Performance Monitoring

### Metrics Collected

1. **System Metrics**
   - CPU usage and load average
   - Memory usage (heap, RSS, external)
   - Disk usage and I/O
   - Network statistics

2. **Application Metrics**
   - HTTP request/response times
   - Database query performance
   - Cache hit/miss rates
   - Error rates and types

3. **Business Metrics**
   - Active users and sessions
   - Raffle participation rates
   - Gaming activity levels
   - Revenue and transaction volumes

4. **Security Metrics**
   - Security event counts by severity
   - Failed authentication attempts
   - Suspicious activity patterns
   - Game integrity violations

### Performance Trends

The system tracks performance trends over time:

- **Response Time Trends**: API response time changes
- **Error Rate Trends**: Error rate fluctuations
- **Resource Usage Trends**: CPU and memory usage patterns
- **Business Trends**: User activity and engagement patterns

## Security Monitoring

### Security Events

The security monitoring system tracks:

1. **Authentication Events**
   - Failed login attempts
   - Suspicious IP addresses
   - Account lockouts

2. **Game Integrity Events**
   - Result mismatches
   - Rapid action patterns
   - Unusual win rates
   - Betting pattern anomalies

3. **System Security Events**
   - Unauthorized access attempts
   - Configuration changes
   - Service disruptions

### Threat Detection

Automated threat detection includes:

- **Pattern Analysis**: Detecting unusual user behavior
- **Rate Limiting**: Preventing abuse and DoS attacks
- **Integrity Checking**: Validating game outcomes
- **Anomaly Detection**: Identifying statistical outliers

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Check for memory leaks in application code
   - Review metrics history for usage patterns
   - Consider scaling up resources

2. **High Error Rates**
   - Check application logs for error details
   - Review database and cache connectivity
   - Validate external service availability

3. **Slow Response Times**
   - Analyze database query performance
   - Check cache hit rates
   - Review network connectivity

4. **Monitoring Service Issues**
   - Check monitoring service logs
   - Verify database and cache connectivity
   - Restart monitoring services if needed

### Debugging Commands

```bash
# Check monitoring service status
curl http://localhost:4000/api/monitoring/status

# Get current metrics
curl http://localhost:4000/api/monitoring/metrics

# Check active alerts
curl http://localhost:4000/api/monitoring/alerts/active

# Run health check
node scripts/health-check.js

# View monitoring dashboard
open http://localhost:3002
```

### Log Analysis

```bash
# Search application logs
curl "http://localhost:4000/api/monitoring/logs?category=application&level=error"

# Get log statistics
curl "http://localhost:4000/api/monitoring/logs/statistics?timeRange=3600000"

# Export monitoring data
curl -X POST http://localhost:4000/api/monitoring/reports/export \
  -H "Content-Type: application/json" \
  -d '{"format": "json", "timeRange": 86400000}'
```

## Best Practices

### Deployment

1. **Always run tests** before deployment
2. **Use staging environment** for validation
3. **Create database backups** before production deployments
4. **Monitor health checks** after deployment
5. **Have rollback plan** ready

### Monitoring

1. **Set appropriate alert thresholds** to avoid noise
2. **Regularly review metrics** and trends
3. **Acknowledge alerts** promptly
4. **Keep monitoring services updated**
5. **Test alerting channels** regularly

### Security

1. **Monitor security events** continuously
2. **Investigate alerts** immediately
3. **Keep security configurations** up to date
4. **Regular security audits** of monitoring data
5. **Secure monitoring endpoints** appropriately

### Performance

1. **Monitor key performance indicators** regularly
2. **Set up performance baselines** for comparison
3. **Optimize based on metrics** not assumptions
4. **Scale proactively** based on trends
5. **Regular performance reviews** and optimization

## Future Enhancements

### Planned Features

1. **Advanced Analytics**
   - Machine learning-based anomaly detection
   - Predictive scaling recommendations
   - Advanced trend analysis

2. **Enhanced Alerting**
   - Email and SMS notifications
   - Slack/Discord integrations
   - PagerDuty integration
   - Custom alert rules

3. **External Integrations**
   - Prometheus/Grafana integration
   - ELK Stack integration
   - DataDog/New Relic integration
   - Custom webhook support

4. **Advanced Dashboards**
   - Custom dashboard creation
   - Real-time charts and graphs
   - Mobile-responsive interface
   - Role-based access control

5. **Automated Remediation**
   - Auto-scaling based on metrics
   - Automatic service restart on failures
   - Self-healing infrastructure
   - Automated rollback triggers

This comprehensive deployment and monitoring infrastructure ensures the Naffles platform operates reliably, securely, and efficiently across all environments.