const express = require('express');
const router = express.Router();
const allowlistAdminController = require('../../controllers/admin/allowlistAdminController');
const { authenticate, requireRole } = require('../../middleware/authenticate');
const rateLimiter = require('../../middleware/rateLimiter');

// Apply authentication and admin middleware to all routes
router.use(authenticate);
router.use(requireRole(['admin', 'super']));

// Apply rate limiting for admin operations
router.use(rateLimiter({
  durationSec: 15 * 60, // 15 minutes
  allowedHits: 200 // higher limit for admin operations
}));

/**
 * @route   GET /api/admin/allowlists/configuration
 * @desc    Get allowlist configuration
 * @access  Private (Admin only)
 */
router.get('/configuration', allowlistAdminController.getConfiguration);

/**
 * @route   PUT /api/admin/allowlists/platform-fee
 * @desc    Update platform fee percentage
 * @access  Private (Admin only)
 */
router.put('/platform-fee', allowlistAdminController.updatePlatformFee);

/**
 * @route   PUT /api/admin/allowlists/global-settings
 * @desc    Update global allowlist settings
 * @access  Private (Admin only)
 */
router.put('/global-settings', allowlistAdminController.updateGlobalSettings);

/**
 * @route   POST /api/admin/allowlists/communities/:communityId/disable-restrictions
 * @desc    Disable allowlist restrictions for a community
 * @access  Private (Admin only)
 */
router.post('/communities/:communityId/disable-restrictions', 
  allowlistAdminController.disableRestrictionsForCommunity
);

/**
 * @route   POST /api/admin/allowlists/communities/:communityId/enable-restrictions
 * @desc    Enable allowlist restrictions for a community
 * @access  Private (Admin only)
 */
router.post('/communities/:communityId/enable-restrictions', 
  allowlistAdminController.enableRestrictionsForCommunity
);

/**
 * @route   GET /api/admin/allowlists/communities/stats
 * @desc    Get community allowlist statistics
 * @access  Private (Admin only)
 */
router.get('/communities/stats', allowlistAdminController.getCommunityAllowlistStats);

/**
 * @route   GET /api/admin/allowlists/analytics
 * @desc    Get platform allowlist analytics
 * @access  Private (Admin only)
 */
router.get('/analytics', allowlistAdminController.getPlatformAnalytics);

/**
 * @route   POST /api/admin/allowlists/communities/:communityId/restrict
 * @desc    Restrict community from creating allowlists
 * @access  Private (Admin only)
 */
router.post('/communities/:communityId/restrict', 
  rateLimiter({
    durationSec: 60 * 60, // 1 hour
    allowedHits: 10 // limit restriction actions
  }),
  allowlistAdminController.restrictCommunity
);

/**
 * @route   DELETE /api/admin/allowlists/communities/:communityId/restrict
 * @desc    Remove restriction from community
 * @access  Private (Admin only)
 */
router.delete('/communities/:communityId/restrict', 
  rateLimiter({
    durationSec: 60 * 60, // 1 hour
    allowedHits: 10 // limit unrestriction actions
  }),
  allowlistAdminController.unrestrictCommunity
);

module.exports = router;