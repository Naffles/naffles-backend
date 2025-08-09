const express = require('express');
const { body, query } = require('express-validator');
const vrfController = require('../../controllers/admin/vrfController');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

const router = express.Router();

// Apply authentication and admin middleware to all routes
router.use(requireAuth);
router.use(requireAdmin);

/**
 * @route GET /api/admin/vrf/configuration
 * @desc Get current VRF configuration
 * @access Admin
 */
router.get('/configuration', vrfController.getVRFConfiguration);

/**
 * @route PUT /api/admin/vrf/configuration
 * @desc Update VRF configuration
 * @access Admin
 */
router.put('/configuration', [
    body('coordinatorAddress')
        .optional()
        .isEthereumAddress()
        .withMessage('Invalid coordinator address'),
    body('subscriptionId')
        .optional()
        .isNumeric()
        .withMessage('Subscription ID must be numeric'),
    body('keyHash')
        .optional()
        .matches(/^0x[a-fA-F0-9]{64}$/)
        .withMessage('Invalid key hash format'),
    body('callbackGasLimit')
        .optional()
        .isInt({ min: 50000, max: 2500000 })
        .withMessage('Callback gas limit must be between 50,000 and 2,500,000'),
    body('requestConfirmations')
        .optional()
        .isInt({ min: 1, max: 200 })
        .withMessage('Request confirmations must be between 1 and 200')
], vrfController.updateVRFConfiguration);

/**
 * @route GET /api/admin/vrf/dashboard
 * @desc Get VRF status dashboard
 * @access Admin
 */
router.get('/dashboard', vrfController.getVRFStatusDashboard);

/**
 * @route GET /api/admin/vrf/link-balance
 * @desc Get LINK token balance
 * @access Admin
 */
router.get('/link-balance', vrfController.getLinkBalance);

/**
 * @route GET /api/admin/vrf/monitor-balance
 * @desc Monitor LINK balance with threshold
 * @access Admin
 */
router.get('/monitor-balance', [
    query('threshold')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Threshold must be a positive number')
], vrfController.monitorLinkBalance);

/**
 * @route GET /api/admin/vrf/health
 * @desc Validate VRF system health
 * @access Admin
 */
router.get('/health', vrfController.validateVRFHealth);

/**
 * @route GET /api/admin/vrf/requests
 * @desc Get VRF request history
 * @access Admin
 */
router.get('/requests', [
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
        .isIn(['Pending', 'In Progress', 'Fulfilled', 'Failed', 'Completed'])
        .withMessage('Invalid status value')
], vrfController.getVRFRequestHistory);

/**
 * @route POST /api/admin/vrf/manual-request
 * @desc Manually trigger VRF request (emergency function)
 * @access Admin
 */
router.post('/manual-request', [
    body('raffleId')
        .isMongoId()
        .withMessage('Invalid raffle ID'),
    body('sourceChain')
        .optional()
        .isIn(['ethereum', 'solana', 'polygon', 'base', 'bsc'])
        .withMessage('Invalid source chain')
], vrfController.manualVRFRequest);

/**
 * @route POST /api/admin/vrf/force-failsafe
 * @desc Force failsafe for stuck VRF request (emergency function)
 * @access Admin
 */
router.post('/force-failsafe', [
    body('raffleId')
        .isMongoId()
        .withMessage('Invalid raffle ID')
], vrfController.forceFailsafe);

module.exports = router;