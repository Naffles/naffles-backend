const express = require('express');
const { body, query, param } = require('express-validator');
const userManagementController = require('../../controllers/admin/userManagementController');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

// Apply authentication and admin middleware to all routes
router.use(requireAuth);
router.use(requireAdmin);

/**
 * @route GET /api/admin/users
 * @desc Get all users with pagination and filtering
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
    query('search')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Search term too long'),
    query('status')
        .optional()
        .isIn(['all', 'active', 'inactive', 'banned', 'verified'])
        .withMessage('Invalid status filter'),
    query('sortBy')
        .optional()
        .isIn(['createdAt', 'lastActive', 'username', 'email'])
        .withMessage('Invalid sort field'),
    query('sortOrder')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Invalid sort order')
], userManagementController.getUsers);

/**
 * @route GET /api/admin/users/:userId
 * @desc Get user details by ID
 * @access Admin
 */
router.get('/:userId', [
    param('userId')
        .isMongoId()
        .withMessage('Invalid user ID')
], userManagementController.getUserById);

/**
 * @route PUT /api/admin/users/:userId
 * @desc Update user profile
 * @access Admin
 */
router.put('/:userId', [
    param('userId')
        .isMongoId()
        .withMessage('Invalid user ID'),
    body('username')
        .optional()
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters'),
    body('email')
        .optional()
        .isEmail()
        .withMessage('Invalid email format'),
    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be boolean'),
    body('isVerified')
        .optional()
        .isBoolean()
        .withMessage('isVerified must be boolean'),
    body('profile.displayName')
        .optional()
        .isLength({ max: 50 })
        .withMessage('Display name too long'),
    body('profile.bio')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Bio too long')
], userManagementController.updateUser);

/**
 * @route POST /api/admin/users/:userId/ban
 * @desc Ban or unban user
 * @access Admin
 */
router.post('/:userId/ban', [
    param('userId')
        .isMongoId()
        .withMessage('Invalid user ID'),
    body('reason')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Reason too long')
], userManagementController.toggleUserBan);

/**
 * @route POST /api/admin/users/:userId/balance
 * @desc Update user balance
 * @access Admin
 */
router.post('/:userId/balance', [
    param('userId')
        .isMongoId()
        .withMessage('Invalid user ID'),
    body('tokenType')
        .notEmpty()
        .withMessage('Token type is required'),
    body('amount')
        .isFloat({ min: 0 })
        .withMessage('Amount must be a positive number'),
    body('operation')
        .isIn(['add', 'subtract', 'set'])
        .withMessage('Operation must be add, subtract, or set'),
    body('reason')
        .notEmpty()
        .isLength({ max: 200 })
        .withMessage('Reason is required and must be under 200 characters')
], userManagementController.updateUserBalance);

/**
 * @route GET /api/admin/users/:userId/activity
 * @desc Get user activity log
 * @access Admin
 */
router.get('/:userId/activity', [
    param('userId')
        .isMongoId()
        .withMessage('Invalid user ID'),
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
        .isIn(['all', 'games', 'points', 'security'])
        .withMessage('Invalid activity type')
], userManagementController.getUserActivityLog);

module.exports = router;