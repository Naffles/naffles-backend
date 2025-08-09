const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { body } = require('express-validator');
const systemSettingsController = require('../../controllers/admin/systemSettingsController');
const { requireAdmin } = require('../../middleware/auth');

// Configure multer for CSV uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/csv/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'text/csv' || path.extname(file.originalname) === '.csv') {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Apply admin authentication to all routes
router.use(requireAdmin);

/**
 * @route GET /api/admin/system-settings
 * @desc Get all system settings
 * @access Admin
 */
router.get('/', systemSettingsController.getSystemSettings);

/**
 * @route PUT /api/admin/system-settings
 * @desc Update system settings
 * @access Admin
 */
router.put('/', [
    body('canCreateRaffle').optional().isIn(['everyone', 'foundersKeyHoldersOnly', 'foundersKeyHoldersAndTokenStakers']),
    body('raffleTokenCountRequired').optional().isInt({ min: 0 }),
    body('raffleFeePercentage').optional().isFloat({ min: 0, max: 100 }),
    body('wageringFeePercentage').optional().isFloat({ min: 0, max: 100 }),
    body('allowSellersReserveRaffles').optional().isBoolean(),
    body('salesRoyalties').optional().isBoolean(),
    body('openEntryExchangeRate').optional().isInt({ min: 1 }),
    body('jackpotPointsPerTenSeconds').optional().isInt({ min: 0 }),
    body('maximumDailyPoints').optional().isInt({ min: 0 }),
    body('pointsEarningActivities').optional().isArray(),
    body('jackpotAccumulation').optional().isArray(),
    body('machineCreatedGamesBetValue').optional().isArray()
], systemSettingsController.updateSystemSettings);

/**
 * @route POST /api/admin/system-settings/upload-csv
 * @desc Upload CSV file for bulk operations
 * @access Admin
 */
router.post('/upload-csv', upload.single('csvFile'), systemSettingsController.uploadCSV);

/**
 * @route GET /api/admin/system-settings/geo-blocking
 * @desc Get geo-blocking settings
 * @access Admin
 */
router.get('/geo-blocking', systemSettingsController.getGeoBlockingSettings);

/**
 * @route PUT /api/admin/system-settings/geo-blocking
 * @desc Update geo-blocking settings
 * @access Admin
 */
router.put('/geo-blocking', [
    body('blockedCountries').optional().isArray(),
    body('geoBlockingEnabled').optional().isBoolean()
], systemSettingsController.updateGeoBlockingSettings);

/**
 * @route GET /api/admin/system-settings/kyc
 * @desc Get KYC settings
 * @access Admin
 */
router.get('/kyc', systemSettingsController.getKYCSettings);

/**
 * @route PUT /api/admin/system-settings/kyc
 * @desc Update KYC settings
 * @access Admin
 */
router.put('/kyc', [
    body('kycRequired').optional().isBoolean(),
    body('kycProvider').optional().isIn(['none', 'blockpass', 'jumio', 'onfido']),
    body('kycThreshold').optional().isFloat({ min: 0 })
], systemSettingsController.updateKYCSettings);

/**
 * @route GET /api/admin/system-settings/metrics
 * @desc Get platform metrics for admin dashboard
 * @access Admin
 */
router.get('/metrics', systemSettingsController.getPlatformMetrics);

module.exports = router;