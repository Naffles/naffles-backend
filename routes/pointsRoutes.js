const express = require('express');
const router = express.Router();
const pointsController = require('../controllers/pointsController');
const { authenticate } = require('../middleware/authenticate');
const { adminMiddleware } = require('../middleware/adminMiddleware');

// Public routes (no authentication required)
router.get('/jackpot', pointsController.getJackpot);
router.get('/achievements', pointsController.getAchievements);
router.get('/leaderboard/:category/:period', pointsController.getLeaderboard);
router.get('/leaderboard/options', pointsController.getLeaderboardOptions);

// User routes (authentication required)
router.use(authenticate); // Apply auth middleware to all routes below

router.get('/balance', pointsController.getUserPoints);
router.get('/transactions', pointsController.getTransactionHistory);
router.get('/achievements/user', pointsController.getUserAchievements);
router.get('/achievements/summary', pointsController.getAchievementSummary);
router.get('/leaderboard/:category/:period/position', pointsController.getUserPosition);

// Admin routes (admin authentication required)
router.use(adminMiddleware); // Apply admin middleware to all routes below

router.post('/award', pointsController.awardPoints);
router.post('/deduct', pointsController.deductPoints);
router.post('/bulk-award', pointsController.bulkAwardPoints);
router.get('/stats', pointsController.getPointsStats);

module.exports = router;