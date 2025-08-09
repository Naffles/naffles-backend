const express = require('express');
const router = express.Router();
const AffiliateAdminController = require('../../controllers/admin/affiliateAdminController');
const authMiddleware = require('../../middleware/auth');
const adminMiddleware = require('../../middleware/admin');

// All routes require authentication and admin privileges
router.use(authMiddleware);
router.use(adminMiddleware);

// Get platform affiliate statistics
router.get('/stats', AffiliateAdminController.getPlatformStats);

// Get all affiliates with pagination and filtering
router.get('/', AffiliateAdminController.getAllAffiliates);

// Get affiliate details by ID
router.get('/:id', AffiliateAdminController.getAffiliateById);

// Update affiliate
router.put('/:id', AffiliateAdminController.updateAffiliate);

// Approve affiliate application
router.post('/:id/approve', AffiliateAdminController.approveAffiliate);

// Suspend affiliate
router.post('/:id/suspend', AffiliateAdminController.suspendAffiliate);

// Process commission payout
router.post('/:id/payout', AffiliateAdminController.processCommissionPayout);

// Get affiliate referrals
router.get('/:id/referrals', AffiliateAdminController.getAffiliateReferrals);

module.exports = router;