const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

/**
 * Health check routes for monitoring and load balancer health checks
 */

// Basic health check - returns 200 if service is running
router.get('/health', healthController.basicHealthCheck);

// Detailed health check - includes database, redis, and external service status
router.get('/health/detailed', healthController.detailedHealthCheck);

// Readiness check - returns 200 when service is ready to accept traffic
router.get('/ready', healthController.readinessCheck);

// Liveness check - returns 200 if service is alive (for Kubernetes)
router.get('/live', healthController.livenessCheck);

// Metrics endpoint - returns basic performance metrics
router.get('/metrics', healthController.metricsCheck);

module.exports = router;