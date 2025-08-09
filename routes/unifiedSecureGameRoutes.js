const express = require('express');
const router = express.Router();
const unifiedSecureGameController = require('../controllers/unifiedSecureGameController');
const { authenticate } = require('../middleware/authenticate');

// All routes require authentication
router.use(authenticate);

// Game management routes
router.post('/initialize', unifiedSecureGameController.initializeGame);
router.post('/:sessionId/action', unifiedSecureGameController.processGameAction);

// Game information routes
router.get('/info/:gameType', unifiedSecureGameController.getGameInfo);

// Security and monitoring routes
router.get('/security-status', unifiedSecureGameController.getSecurityStatus);
router.get('/integrity-check', unifiedSecureGameController.verifyGameIntegrity);

module.exports = router;