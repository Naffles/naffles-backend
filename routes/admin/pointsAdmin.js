const express = require('express');
const router = express.Router();
const achievementsController = require('../../controllers/admin/achievementsController');
const partnerTokensController = require('../../controllers/admin/partnerTokensController');
const leaderboardService = require('../../services/leaderboardService');
const pointsService = require('../../services/pointsService');

// Achievement management routes
router.get('/achievements', achievementsController.getAllAchievements);
router.post('/achievements', achievementsController.createAchievement);
router.put('/achievements/:id', achievementsController.updateAchievement);
router.delete('/achievements/:id', achievementsController.deleteAchievement);
router.get('/achievements/:id/stats', achievementsController.getAchievementStats);
router.get('/achievements/leaderboard', achievementsController.getAchievementLeaderboard);
router.post('/achievements/initialize-defaults', achievementsController.initializeDefaults);
router.get('/achievements/options', achievementsController.getAchievementOptions);

// Partner token management routes
router.get('/partner-tokens', partnerTokensController.getAllPartnerTokens);
router.get('/partner-tokens/active', partnerTokensController.getActivePartnerTokens);
router.post('/partner-tokens', partnerTokensController.createPartnerToken);
router.put('/partner-tokens/:id', partnerTokensController.updatePartnerToken);
router.delete('/partner-tokens/:id', partnerTokensController.deletePartnerToken);
router.patch('/partner-tokens/:id/toggle', partnerTokensController.toggleActiveStatus);
router.get('/partner-tokens/:contractAddress/:chainId', partnerTokensController.getByContract);
router.post('/partner-tokens/bulk-upload', partnerTokensController.bulkUpload);
router.get('/partner-tokens/stats', partnerTokensController.getPartnerTokenStats);

// Leaderboard management routes
router.post('/leaderboards/recalculate/:category/:period', async (req, res) => {
  try {
    const { category, period } = req.params;
    await leaderboardService.recalculateRanks(category, period);
    
    res.json({
      success: true,
      message: `Leaderboard ranks recalculated for ${category} ${period}`
    });
  } catch (error) {
    console.error('Error recalculating leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate leaderboard',
      error: error.message
    });
  }
});

router.post('/leaderboards/rebuild', async (req, res) => {
  try {
    await leaderboardService.rebuildLeaderboards();
    
    res.json({
      success: true,
      message: 'All leaderboards rebuilt successfully'
    });
  } catch (error) {
    console.error('Error rebuilding leaderboards:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rebuild leaderboards',
      error: error.message
    });
  }
});

// Jackpot management routes
router.get('/jackpot', async (req, res) => {
  try {
    const jackpotInfo = await pointsService.getJackpotInfo();
    
    res.json({
      success: true,
      data: jackpotInfo
    });
  } catch (error) {
    console.error('Error getting jackpot info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get jackpot information',
      error: error.message
    });
  }
});

router.post('/jackpot/reset', async (req, res) => {
  try {
    const PointsJackpot = require('../../models/points/pointsJackpot');
    
    let jackpot = await PointsJackpot.findOne();
    if (!jackpot) {
      jackpot = new PointsJackpot();
    }
    
    jackpot.currentAmount = 1000; // Reset to base amount
    jackpot.lastWinnerId = null;
    jackpot.lastWinAmount = 0;
    jackpot.lastWinDate = null;
    
    await jackpot.save();
    
    res.json({
      success: true,
      message: 'Jackpot reset successfully',
      data: jackpot
    });
  } catch (error) {
    console.error('Error resetting jackpot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset jackpot',
      error: error.message
    });
  }
});

router.put('/jackpot/settings', async (req, res) => {
  try {
    const { incrementSettings, winConditions } = req.body;
    const PointsJackpot = require('../../models/points/pointsJackpot');
    
    let jackpot = await PointsJackpot.findOne();
    if (!jackpot) {
      jackpot = new PointsJackpot();
    }
    
    if (incrementSettings) {
      jackpot.incrementSettings = { ...jackpot.incrementSettings, ...incrementSettings };
    }
    
    if (winConditions) {
      jackpot.winConditions = { ...jackpot.winConditions, ...winConditions };
    }
    
    await jackpot.save();
    
    res.json({
      success: true,
      message: 'Jackpot settings updated successfully',
      data: jackpot
    });
  } catch (error) {
    console.error('Error updating jackpot settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update jackpot settings',
      error: error.message
    });
  }
});

// Points system statistics
router.get('/stats', async (req, res) => {
  try {
    const PointsBalance = require('../../models/points/pointsBalance');
    const PointsTransaction = require('../../models/points/pointsTransaction');
    const Achievement = require('../../models/points/achievement');
    const UserAchievement = require('../../models/points/userAchievement');
    
    const [
      totalUsers,
      totalPointsIssued,
      totalTransactions,
      totalAchievements,
      completedAchievements,
      jackpotInfo,
      leaderboardStats
    ] = await Promise.all([
      PointsBalance.countDocuments(),
      PointsBalance.aggregate([{ $group: { _id: null, total: { $sum: '$totalEarned' } } }]),
      PointsTransaction.countDocuments(),
      Achievement.countDocuments({ isActive: true }),
      UserAchievement.countDocuments({ isCompleted: true }),
      pointsService.getJackpotInfo(),
      leaderboardService.getLeaderboardStats()
    ]);

    // Get top point earners
    const topEarners = await PointsBalance.find()
      .populate('userId', 'username walletAddresses')
      .sort({ totalEarned: -1 })
      .limit(10);

    // Get recent transactions
    const recentTransactions = await PointsTransaction.find()
      .populate('userId', 'username walletAddresses')
      .sort({ createdAt: -1 })
      .limit(20);

    const stats = {
      overview: {
        totalUsers,
        totalPointsIssued: totalPointsIssued[0]?.total || 0,
        totalTransactions,
        totalAchievements,
        completedAchievements
      },
      jackpot: jackpotInfo,
      leaderboards: leaderboardStats,
      topEarners: topEarners.map(balance => ({
        user: balance.userId,
        totalEarned: balance.totalEarned,
        currentBalance: balance.balance,
        tier: balance.tier
      })),
      recentTransactions: recentTransactions.map(tx => ({
        id: tx._id,
        user: tx.userId,
        type: tx.type,
        activity: tx.activity,
        amount: tx.amount,
        description: tx.description,
        createdAt: tx.createdAt
      }))
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting points system stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get points system statistics',
      error: error.message
    });
  }
});

module.exports = router;