const express = require('express');
const router = express.Router();
const communityGamblingController = require('../controllers/communityGamblingController');
const authMiddleware = require('../middleware/auth'); // Assuming auth middleware exists

// Public routes
router.get('/game-types', communityGamblingController.getSupportedGameTypes);
router.get('/raffle-types', communityGamblingController.getSupportedRaffleTypes);

// Community gambling content viewing (may be public depending on community settings)
router.get('/communities/:communityId/raffles', communityGamblingController.getCommunityRaffles);
router.get('/communities/:communityId/gaming-sessions', communityGamblingController.getCommunityGamingSessions);
router.get('/communities/:communityId/house-slots', communityGamblingController.getCommunityHouseSlots);

// Protected routes (require authentication)
router.use(authMiddleware);

// Community raffle management
router.post('/communities/:communityId/raffles', communityGamblingController.createCommunityRaffle);
router.post('/communities/:communityId/raffles/allowlist', communityGamblingController.createCommunityAllowlistRaffle);
router.post('/raffles/:raffleId/vrf', communityGamblingController.manageCommunityRaffleVRF);

// Community gaming management
router.post('/communities/:communityId/gaming-sessions', communityGamblingController.createCommunityGamingSession);
router.post('/communities/:communityId/bet', communityGamblingController.processCommunityPointsBet);

// Community house slot management
router.post('/communities/:communityId/house-slots', communityGamblingController.fundCommunityHouseSlot);

// Analytics (admin only)
router.get('/communities/:communityId/gambling/analytics', communityGamblingController.getCommunityGamblingAnalytics);

module.exports = router;