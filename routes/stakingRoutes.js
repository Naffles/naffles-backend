const express = require('express');
const router = express.Router();
const stakingController = require('../controllers/stakingController');
const stakingAnalyticsController = require('../controllers/stakingAnalyticsController');
const { authenticateToken } = require('../middleware/auth');
const { 
  validateStakingRequest, 
  validateContractCreation, 
  validateContractUpdate 
} = require('../middleware/stakingValidation');

// User staking routes
router.get('/portfolio', authenticateToken, stakingController.getUserPortfolio);
router.get('/contracts', authenticateToken, stakingController.getStakingContracts);
router.get('/rewards/pending', authenticateToken, stakingController.getPendingRewards);
router.get('/nfts/eligible', authenticateToken, stakingController.getEligibleNFTs);
router.get('/history', authenticateToken, stakingController.getStakingHistory);
router.get('/positions/:positionId', authenticateToken, stakingController.getPositionDetails);
router.get('/rewards/calculate', authenticateToken, stakingController.calculateProjectedRewards);

router.post('/stake', 
  authenticateToken, 
  validateStakingRequest, 
  stakingController.stakeNFT
);

router.post('/unstake/:positionId', 
  authenticateToken, 
  stakingController.unstakeNFT
);

// Admin routes
router.post('/admin/contracts', 
  authenticateToken, 
  validateContractCreation,
  stakingController.createStakingContract
);

router.put('/admin/contracts/:contractId', 
  authenticateToken, 
  validateContractUpdate,
  stakingController.updateStakingContract
);

router.post('/admin/contracts/:contractId/validate', 
  authenticateToken, 
  stakingController.validateStakingContract
);

router.get('/admin/contracts', 
  authenticateToken, 
  stakingController.getAllStakingContracts
);

router.get('/admin/analytics', 
  authenticateToken, 
  stakingController.getStakingAnalytics
);

router.get('/admin/contracts/:contractId/performance', 
  authenticateToken, 
  stakingController.getContractPerformance
);

router.post('/admin/rewards/distribute', 
  authenticateToken, 
  stakingController.distributeRewards
);

// Reward-specific routes
router.get('/rewards/history', 
  authenticateToken, 
  stakingController.getRewardHistory
);

router.post('/rewards/claim', 
  authenticateToken, 
  stakingController.claimRewards
);

router.get('/admin/rewards/stats', 
  authenticateToken, 
  stakingController.getDistributionStats
);

router.post('/admin/rewards/manual', 
  authenticateToken, 
  stakingController.manualDistribution
);

router.post('/admin/rewards/check-missed', 
  authenticateToken, 
  stakingController.checkMissedDistributions
);

// Analytics routes
router.get('/admin/analytics/dashboard', 
  authenticateToken, 
  stakingAnalyticsController.getDashboardMetrics
);

router.get('/admin/analytics/contracts/performance', 
  authenticateToken, 
  stakingAnalyticsController.getContractPerformance
);

router.get('/admin/analytics/contracts/:contractId', 
  authenticateToken, 
  stakingAnalyticsController.getContractAnalytics
);

router.get('/admin/analytics/users/behavior', 
  authenticateToken, 
  stakingAnalyticsController.getUserBehaviorAnalysis
);

router.get('/admin/analytics/rewards/distribution', 
  authenticateToken, 
  stakingAnalyticsController.getRewardDistributionAnalytics
);

router.get('/admin/analytics/realtime', 
  authenticateToken, 
  stakingAnalyticsController.getRealTimeAnalytics
);

router.get('/admin/analytics/report', 
  authenticateToken, 
  stakingAnalyticsController.generateReport
);

router.post('/admin/analytics/cache/clear', 
  authenticateToken, 
  stakingAnalyticsController.clearCache
);

module.exports = router;