const express = require('express');
const router = express.Router();
const secureGameController = require('../controllers/secureGameController');
const { authenticate } = require('../middleware/authenticate');

// All routes require authentication
router.use(authenticate);

// Secure game session management
router.post('/initialize', secureGameController.initializeSecureGame);
router.get('/:sessionId/state', secureGameController.getSecureGameState);
router.post('/:sessionId/action', secureGameController.processSecureAction);
router.post('/:sessionId/terminate', secureGameController.emergencyTerminate);

// Secure communication
router.post('/message', secureGameController.handleSecureMessage);
router.post('/channel', secureGameController.establishSecureChannel);

// Security monitoring
router.get('/security-status', secureGameController.getSecurityStatus);

module.exports = router;