const express = require('express');
const router = express.Router();
const smartContractAdminController = require('../../controllers/admin/smartContractAdminController');
const { authenticateToken, requireRole } = require('../../middleware/auth');

// Apply authentication and admin role requirement to all routes
router.use(authenticateToken);
router.use(requireRole(['admin', 'super_admin']));

// Emergency unlock functions
router.post('/unlock-nft', smartContractAdminController.adminUnlockNFT);
router.post('/emergency-withdraw', smartContractAdminController.emergencyWithdrawNFT);

// Contract control functions
router.post('/pause-contract', smartContractAdminController.pauseContract);
router.post('/unpause-contract', smartContractAdminController.unpauseContract);

// Verification and monitoring
router.get('/verify-position/:positionId', smartContractAdminController.verifyStakingPosition);
router.get('/verify-user/:userId', smartContractAdminController.verifyUserStaking);
router.get('/consistency-check', smartContractAdminController.performDataConsistencyCheck);
router.post('/batch-verify', smartContractAdminController.batchVerifyPositions);

// Smart contract status and health
router.get('/health', smartContractAdminController.getSmartContractHealth);
router.get('/stats/:blockchain', smartContractAdminController.getContractStats);
router.get('/analytics', smartContractAdminController.getSmartContractAnalytics);

// Collection management
router.post('/add-collection', smartContractAdminController.addCollectionToContract);

// Export and reporting
router.get('/export', smartContractAdminController.exportStakingData);

module.exports = router;