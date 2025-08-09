const express = require('express');
const router = express.Router();
const AffiliateController = require('../controllers/affiliateController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.get('/verify/:code', AffiliateController.getAffiliateByCode);
router.get('/leaderboard', AffiliateController.getLeaderboard);
router.post('/apply', AffiliateController.applyAffiliate);

// Protected routes (require authentication)
router.use(authMiddleware);

// Process affiliate click (when user visits with ref parameter)
router.post('/click', AffiliateController.processClick);

// Get user's referral information
router.get('/user/referral', AffiliateController.getUserReferralInfo);

// Generate affiliate URL
router.post('/generate-url', AffiliateController.generateAffiliateUrl);

// Get affiliate analytics
router.get('/analytics/:affiliateId', AffiliateController.getAffiliateAnalytics);

module.exports = router;