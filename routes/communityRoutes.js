const express = require('express');
const router = express.Router();
const communityController = require('../controllers/communityController');
const authMiddleware = require('../middleware/auth'); // Assuming auth middleware exists

// Public routes
router.get('/browse', communityController.browseCommunities);
router.get('/:communityId', communityController.getCommunity);
router.get('/:communityId/access-requirements', communityController.getCommunityAccessRequirements);

// Protected routes (require authentication)
router.use(authMiddleware);

// Community management
router.post('/', communityController.createCommunity);
router.put('/:communityId', communityController.updateCommunity);
router.put('/:communityId/access-requirements', communityController.updateCommunityAccessRequirements);
router.post('/:communityId/join', communityController.joinCommunity);
router.post('/:communityId/leave', communityController.leaveCommunity);

// Member management
router.get('/:communityId/members', communityController.getCommunityMembers);
router.put('/:communityId/members/:userId/role', communityController.updateMemberRole);

// Points management
router.post('/:communityId/points/award', communityController.awardCommunityPoints);
router.post('/:communityId/points/deduct', communityController.deductCommunityPoints);
router.get('/:communityId/points/balance/:userId', communityController.getUserCommunityPoints);
router.get('/:communityId/leaderboard', communityController.getCommunityLeaderboard);

// User-specific routes
router.get('/user/communities', communityController.getUserCommunities);
router.get('/user/points/all', communityController.getUserAllCommunityPoints);

// Analytics (admin only)
router.get('/:communityId/analytics', communityController.getCommunityAnalytics);

// Naffles Admin routes (enhanced community management)
router.get('/admin/all-communities', communityController.adminGetAllCommunities);
router.get('/admin/cross-community-analytics', communityController.adminGetCrossCommunityAnalytics);
router.post('/admin/:communityId/manage', communityController.adminManageCommunity);

// Social tasks routes (nested under communities)
const socialTasksRoutes = require('./socialTasksRoutes');
router.use('/', socialTasksRoutes);

// Community gambling routes
const communityGamblingRoutes = require('./communityGamblingRoutes');
router.use('/gambling', communityGamblingRoutes);

// Manual points crediting routes
const communityManualPointsRoutes = require('./communityManualPointsRoutes');
router.use('/manual-points', communityManualPointsRoutes);

module.exports = router;