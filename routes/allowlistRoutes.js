const express = require('express');
const router = express.Router();
const allowlistController = require('../controllers/allowlistController');
const { authenticate } = require('../middleware/authenticate');
const rateLimiter = require('../middleware/rateLimiter');

// Apply authentication middleware to all routes
router.use(authenticate);

// Apply rate limiting
router.use(rateLimiter({
  durationSec: 15 * 60, // 15 minutes
  allowedHits: 100 // limit each IP to 100 requests per windowMs
}));

/**
 * @route   POST /api/allowlists
 * @desc    Create a new allowlist
 * @access  Private
 */
router.post('/', allowlistController.createAllowlist);

/**
 * @route   GET /api/allowlists/:allowlistId
 * @desc    Get allowlist details
 * @access  Private
 */
router.get('/:allowlistId', allowlistController.getAllowlist);

/**
 * @route   GET /api/allowlists/community/:communityId
 * @desc    Get allowlists for a community
 * @access  Private
 */
router.get('/community/:communityId', allowlistController.getCommunityAllowlists);

/**
 * @route   POST /api/allowlists/:allowlistId/enter
 * @desc    Enter an allowlist
 * @access  Private
 */
router.post('/:allowlistId/enter', 
  rateLimiter({
    durationSec: 5 * 60, // 5 minutes
    allowedHits: 5 // limit each user to 5 entries per 5 minutes
  }),
  allowlistController.enterAllowlist
);

/**
 * @route   GET /api/allowlists/:allowlistId/participation
 * @desc    Get user's participation in an allowlist
 * @access  Private
 */
router.get('/:allowlistId/participation', allowlistController.getUserParticipation);

/**
 * @route   POST /api/allowlists/:allowlistId/execute-draw
 * @desc    Execute allowlist draw (creator only)
 * @access  Private
 */
router.post('/:allowlistId/execute-draw', 
  rateLimiter({
    durationSec: 60 * 60, // 1 hour
    allowedHits: 3 // limit each user to 3 draw executions per hour
  }),
  allowlistController.executeAllowlistDraw
);

/**
 * @route   GET /api/allowlists/:allowlistId/results
 * @desc    Get allowlist results
 * @access  Private
 */
router.get('/:allowlistId/results', allowlistController.getAllowlistResults);

/**
 * @route   GET /api/allowlists/:allowlistId/export
 * @desc    Export winner data (creator only)
 * @access  Private
 */
router.get('/:allowlistId/export', allowlistController.exportWinnerData);

/**
 * @route   GET /api/allowlists/community/:communityId/limits
 * @desc    Get community allowlist limits
 * @access  Private
 */
router.get('/community/:communityId/limits', allowlistController.getCommunityLimits);

/**
 * @route   POST /api/allowlists/:allowlistId/claim
 * @desc    Claim winner status
 * @access  Private
 */
router.post('/:allowlistId/claim', allowlistController.claimWinner);

/**
 * @route   GET /api/allowlists/user/history
 * @desc    Get user's allowlist history
 * @access  Private
 */
router.get('/user/history', allowlistController.getUserAllowlistHistory);

module.exports = router;