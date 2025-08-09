const express = require('express');
const router = express.Router();
const multer = require('multer');
const stakingAdminController = require('../../controllers/admin/stakingAdminController');
const { authenticateToken } = require('../../middleware/auth');
const { validateStakingContractData } = require('../../middleware/stakingValidation');

// Configure multer for CSV file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// CSV Management Routes
router.post('/contracts/upload-csv',
  authenticateToken,
  upload.single('csvFile'),
  stakingAdminController.uploadStakingContractsCSV
);

router.get('/contracts/export-csv',
  authenticateToken,
  stakingAdminController.exportStakingContractsCSV
);

// Dashboard and Analytics Routes
router.get('/dashboard',
  authenticateToken,
  stakingAdminController.getStakingContractsDashboard
);

router.get('/contracts/:contractId/analytics',
  authenticateToken,
  stakingAdminController.getContractAnalytics
);

// Contract Management Routes
router.get('/contracts/default-rewards/:blockchain',
  authenticateToken,
  stakingAdminController.getDefaultRewardStructure
);

router.post('/contracts/with-defaults',
  authenticateToken,
  validateStakingContractData,
  stakingAdminController.createStakingContractWithDefaults
);

router.put('/contracts/:contractId/rewards',
  authenticateToken,
  stakingAdminController.updateRewardStructure
);

router.put('/contracts/bulk-update',
  authenticateToken,
  stakingAdminController.bulkUpdateContracts
);

router.post('/contracts/validate-address',
  authenticateToken,
  stakingAdminController.validateContractAddress
);

router.delete('/contracts/:contractId',
  authenticateToken,
  stakingAdminController.deleteStakingContract
);

module.exports = router;