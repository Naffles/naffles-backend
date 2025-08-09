const express = require('express');
const { query } = require('express-validator');
const adminController = require('../../controllers/admin/adminController');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

// Import sub-route modules
const systemSettingsRoutes = require('./systemSettings');
const userManagementRoutes = require('./userManagement');
const raffleManagementRoutes = require('./raffleManagement');
const transactionRoutes = require('./transactions');

// Apply authentication and admin middleware to all routes
router.use(requireAuth);
router.use(requireAdmin);

/**
 * @route GET /api/admin/dashboard
 * @desc Get comprehensive platform dashboard
 * @access Admin
 */
router.get('/dashboard', [
    query('timeRange')
        .optional()
        .isIn(['7d', '30d', '90d'])
        .withMessage('Invalid time range')
], adminController.getPlatformDashboard);

/**
 * @route GET /api/admin/analytics/user
 * @desc Get user analytics
 * @access Admin
 */
router.get('/analytics/user', [
    query('timeRange')
        .optional()
        .isIn(['7d', '30d', '90d'])
        .withMessage('Invalid time range')
], adminController.getUserAnalytics);

/**
 * @route GET /api/admin/analytics/game
 * @desc Get game analytics
 * @access Admin
 */
router.get('/analytics/game', [
    query('timeRange')
        .optional()
        .isIn(['7d', '30d', '90d'])
        .withMessage('Invalid time range')
], adminController.getGameAnalytics);

/**
 * @route GET /api/admin/analytics/raffle
 * @desc Get raffle analytics
 * @access Admin
 */
router.get('/analytics/raffle', [
    query('timeRange')
        .optional()
        .isIn(['7d', '30d', '90d'])
        .withMessage('Invalid time range')
], adminController.getRaffleAnalytics);

/**
 * @route GET /api/admin/security/dashboard
 * @desc Get security monitoring dashboard
 * @access Admin
 */
router.get('/security/dashboard', [
    query('timeRange')
        .optional()
        .isIn(['1h', '24h', '7d'])
        .withMessage('Invalid time range')
], adminController.getSecurityDashboard);

/**
 * @route GET /api/admin/system/health
 * @desc Get system health status
 * @access Admin
 */
router.get('/system/health', adminController.getSystemHealth);

// Mount sub-routes
router.use('/system-settings', systemSettingsRoutes);
router.use('/users', userManagementRoutes);
router.use('/raffles', raffleManagementRoutes);
router.use('/transactions', transactionRoutes);

module.exports = router;