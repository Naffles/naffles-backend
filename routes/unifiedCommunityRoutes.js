const express = require('express');
const router = express.Router();
const unifiedCommunityController = require('../controllers/unifiedCommunityController');
const authMiddleware = require('../middleware/auth'); // Assuming auth middleware exists

// All routes require authentication and admin privileges
router.use(authMiddleware);

// System management
router.post('/initialize', unifiedCommunityController.initializeSystem);
router.get('/dashboard', unifiedCommunityController.getDashboard);
router.get('/health', unifiedCommunityController.getSystemHealth);

// Cross-community management
router.get('/communities/all', unifiedCommunityController.getAllCommunitiesWithPointsSystems);
router.get('/analytics/cross-community', unifiedCommunityController.getCrossCommunityAnalytics);

// Community-specific unified management
router.post('/:communityId/achievements', unifiedCommunityController.manageCommunityAchievement);
router.put('/:communityId/achievements/:achievementId', unifiedCommunityController.manageCommunityAchievement);
router.get('/:communityId/leaderboard/branded', unifiedCommunityController.getCommunityLeaderboardWithBranding);
router.post('/:communityId/points/award-unified', unifiedCommunityController.awardPointsUnified);

// Migration and system operations
router.post('/migrate/naffles-to-unified', unifiedCommunityController.migrateNafflesToUnified);

module.exports = router;