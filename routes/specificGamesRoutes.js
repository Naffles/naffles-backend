const express = require('express');
const router = express.Router();
const specificGamesController = require('../controllers/specificGamesController');
const { authenticate } = require('../middleware/authenticate');

// General specific games routes
router.get('/supported', specificGamesController.getSupportedGames);
router.get('/config/:gameType', specificGamesController.getGameConfig);

// Authenticated routes
router.use(authenticate);

// General game management
router.post('/initialize', specificGamesController.initializeGame);
router.get('/history', specificGamesController.getGameHistory);
router.get('/:sessionId/state', specificGamesController.getGameState);
router.post('/:sessionId/action', specificGamesController.processAction);
router.post('/:sessionId/timeout', specificGamesController.handleTimeout);

// Blackjack specific routes
router.post('/blackjack/initialize', specificGamesController.initializeBlackjack);
router.post('/blackjack/:sessionId/action', specificGamesController.processBlackjackAction);

// Coin Toss specific routes
router.post('/cointoss/initialize', specificGamesController.initializeCoinToss);
router.post('/cointoss/:sessionId/choice', specificGamesController.processCoinTossChoice);

// Rock Paper Scissors specific routes
router.post('/rockpaperscissors/initialize', specificGamesController.initializeRockPaperScissors);
router.post('/rockpaperscissors/:sessionId/move', specificGamesController.processRockPaperScissorsMove);

module.exports = router;