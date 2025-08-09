const express = require('express');
const { body, query, param } = require('express-validator');
const transactionController = require('../../controllers/admin/transactionController');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

// Apply authentication and admin middleware to all routes
router.use(requireAuth);
router.use(requireAdmin);

/**
 * @route GET /api/admin/transactions
 * @desc Get all transactions with pagination and filtering
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
    query('type')
        .optional()
        .isIn(['all', 'deposit', 'withdrawal'])
        .withMessage('Invalid transaction type'),
    query('status')
        .optional()
        .isIn(['all', 'pending', 'completed', 'failed', 'approved', 'rejected'])
        .withMessage('Invalid status filter'),
    query('sortBy')
        .optional()
        .isIn(['createdAt', 'amount', 'status'])
        .withMessage('Invalid sort field'),
    query('sortOrder')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Invalid sort order'),
    query('search')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Search term too long'),
    query('startDate')
        .optional()
        .isISO8601()
        .withMessage('Invalid start date format'),
    query('endDate')
        .optional()
        .isISO8601()
        .withMessage('Invalid end date format')
], transactionController.getTransactions);

/**
 * @route GET /api/admin/transactions/statistics
 * @desc Get transaction statistics
 * @access Admin
 */
router.get('/statistics', [
    query('timeRange')
        .optional()
        .isIn(['7d', '30d', '90d'])
        .withMessage('Invalid time range')
], transactionController.getTransactionStatistics);

/**
 * @route GET /api/admin/transactions/withdrawals/pending
 * @desc Get pending withdrawal requests
 * @access Admin
 */
router.get('/withdrawals/pending', [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
], transactionController.getPendingWithdrawals);

/**
 * @route POST /api/admin/transactions/withdrawals/:withdrawalId/approve
 * @desc Approve withdrawal request
 * @access Admin
 */
router.post('/withdrawals/:withdrawalId/approve', [
    param('withdrawalId')
        .isMongoId()
        .withMessage('Invalid withdrawal ID'),
    body('notes')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Notes too long')
], transactionController.approveWithdrawal);

/**
 * @route POST /api/admin/transactions/withdrawals/:withdrawalId/reject
 * @desc Reject withdrawal request
 * @access Admin
 */
router.post('/withdrawals/:withdrawalId/reject', [
    param('withdrawalId')
        .isMongoId()
        .withMessage('Invalid withdrawal ID'),
    body('reason')
        .notEmpty()
        .isLength({ max: 200 })
        .withMessage('Reason is required and must be under 200 characters'),
    body('notes')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Notes too long')
], transactionController.rejectWithdrawal);

/**
 * @route POST /api/admin/transactions/:transactionId/flag
 * @desc Flag suspicious transaction
 * @access Admin
 */
router.post('/:transactionId/flag', [
    param('transactionId')
        .isMongoId()
        .withMessage('Invalid transaction ID'),
    body('type')
        .isIn(['deposit', 'withdrawal'])
        .withMessage('Transaction type must be deposit or withdrawal'),
    body('reason')
        .notEmpty()
        .isLength({ max: 200 })
        .withMessage('Reason is required and must be under 200 characters'),
    body('severity')
        .optional()
        .isIn(['low', 'medium', 'high', 'critical'])
        .withMessage('Invalid severity level')
], transactionController.flagTransaction);

module.exports = router;