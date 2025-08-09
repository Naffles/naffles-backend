const express = require('express');
const { body, query, param } = require('express-validator');
const raffleManagementController = require('../../controllers/admin/raffleManagementController');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

// Apply authentication and admin middleware to all routes
router.use(requireAuth);
router.use(requireAdmin);

/**
 * @route GET /api/admin/raffles
 * @desc Get all raffles with pagination and filtering
 * @access Admin
 */
router.get('/', [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    query('status')
        .optional()
        .isIn(['all', 'active', 'completed', 'cancelled', 'pending'])
        .withMessage('Invalid status filter'),
    query('prizeType')
        .optional()
        .isIn(['all', 'nft', 'token', 'allowlist'])
        .withMessage('Invalid prize type filter'),
    query('sortBy')
        .optional()
        .isIn(['createdAt', 'endTime', 'ticketsSold', 'ticketPrice'])
        .withMessage('Invalid sort field'),
    query('sortOrder')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Invalid sort order'),
    query('search')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Search term too long')
], raffleManagementController.getRaffles);

/**
 * @route GET /api/admin/raffles/statistics
 * @desc Get raffle statistics
 * @access Admin
 */
router.get('/statistics', [
    query('timeRange')
        .optional()
        .isIn(['7d', '30d', '90d'])
        .withMessage('Invalid time range')
], raffleManagementController.getRaffleStatistics);

/**
 * @route GET /api/admin/raffles/:raffleId
 * @desc Get raffle details by ID
 * @access Admin
 */
router.get('/:raffleId', [
    param('raffleId')
        .isMongoId()
        .withMessage('Invalid raffle ID')
], raffleManagementController.getRaffleById);

/**
 * @route PUT /api/admin/raffles/:raffleId
 * @desc Update raffle settings
 * @access Admin
 */
router.put('/:raffleId', [
    param('raffleId')
        .isMongoId()
        .withMessage('Invalid raffle ID'),
    body('endTime')
        .optional()
        .isISO8601()
        .withMessage('Invalid end time format'),
    body('maxTickets')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Max tickets must be a positive integer'),
    body('description')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Description too long')
], raffleManagementController.updateRaffleSettings);

/**
 * @route POST /api/admin/raffles/:raffleId/cancel
 * @desc Cancel raffle (admin action)
 * @access Admin
 */
router.post('/:raffleId/cancel', [
    param('raffleId')
        .isMongoId()
        .withMessage('Invalid raffle ID'),
    body('reason')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Reason too long')
], raffleManagementController.cancelRaffle);

/**
 * @route POST /api/admin/raffles/:raffleId/force-draw
 * @desc Force raffle draw (admin emergency action)
 * @access Admin
 */
router.post('/:raffleId/force-draw', [
    param('raffleId')
        .isMongoId()
        .withMessage('Invalid raffle ID'),
    body('reason')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Reason too long')
], raffleManagementController.forceRaffleDraw);

module.exports = router;