/**
 * Discord OAuth Routes
 * Routes for Discord account linking and OAuth flow
 */

const express = require('express');
const router = express.Router();
const discordOAuthController = require('../controllers/discordOAuthController');
const authMiddleware = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Apply rate limiting to OAuth endpoints
const oauthRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: 'Too many OAuth requests, please try again later'
});

// Generate Discord OAuth authorization URL
router.post('/authorize', oauthRateLimit, discordOAuthController.generateAuthURL);

// Handle Discord OAuth callback
router.post('/callback', oauthRateLimit, discordOAuthController.handleCallback);

// Get Discord account linking status
router.get('/status', discordOAuthController.getLinkingStatus);

// Refresh Discord access token
router.post('/refresh', oauthRateLimit, discordOAuthController.refreshToken);

// Unlink Discord account
router.delete('/unlink', discordOAuthController.unlinkAccount);

// Verify and sync Discord account
router.post('/verify', discordOAuthController.verifyAccount);

// Get user's Discord roles in a specific server
router.get('/roles/:serverId', discordOAuthController.getUserRoles);

// Get account linking management interface data
router.get('/management', discordOAuthController.getManagementData);

// Admin-only routes
const adminRateLimit = rateLimitMiddleware({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 requests per window
  message: 'Too many admin requests, please try again later'
});

// Get OAuth security statistics (admin only)
router.get('/security-stats', adminRateLimit, discordOAuthController.getSecurityStats);

// Validate OAuth configuration (admin only)
router.get('/config-status', adminRateLimit, discordOAuthController.getConfigStatus);

module.exports = router;