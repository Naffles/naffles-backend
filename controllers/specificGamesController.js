const specificGamesService = require('../services/games/specificGamesService');
const sendResponse = require('../utils/responseHandler');
const { authenticate } = require('../middleware/authenticate');
const { isUserHasEnoughBalance } = require('../services/socket/helpers');
const { getAllValidTickers } = require('../utils/helpers');
const { validateBetAmount } = require('./admin/betLimitsController');

/**
 * Specific Games Controller
 * Handles HTTP requests for specific game implementations
 */
class SpecificGamesController {
  /**
   * Initialize a new specific game
   */
  async initializeGame(req, res) {
    try {
      const { gameType, tokenType, betAmount, gameConfig = {} } = req.body;
      const playerId = req.user._id;

      // Validate game type
      if (!specificGamesService.isGameTypeSupported(gameType)) {
        return sendResponse(res, 400, `Unsupported game type: ${gameType}`);
      }

      // Validate token type
      const validTokenTypes = await getAllValidTickers();
      if (!validTokenTypes.includes(tokenType.toLowerCase())) {
        return sendResponse(res, 400, 'Invalid token type');
      }

      // Validate bet amount against limits
      const betValidation = await validateBetAmount(gameType, tokenType.toLowerCase(), betAmount);
      if (!betValidation.isValid) {
        return sendResponse(res, 400, betValidation.error);
      }

      // Check user balance
      const hasBalance = await isUserHasEnoughBalance(playerId, tokenType.toLowerCase(), betAmount);
      if (!hasBalance) {
        return sendResponse(res, 400, 'Insufficient balance');
      }

      // Initialize the game
      const gameSession = await specificGamesService.initializeSpecificGame(
        gameType,
        playerId,
        betAmount,
        { ...gameConfig, tokenType: tokenType.toLowerCase() }
      );

      return sendResponse(res, 201, 'Game initialized successfully', gameSession);
    } catch (error) {
      console.error('Error initializing specific game:', error);
      return sendResponse(res, 500, 'Error initializing game', {
        error: error.message
      });
    }
  }

  /**
   * Process a game action
   */
  async processAction(req, res) {
    try {
      const { sessionId } = req.params;
      const { action, actionData = {} } = req.body;

      if (!sessionId) {
        return sendResponse(res, 400, 'Session ID is required');
      }

      if (!action) {
        return sendResponse(res, 400, 'Action is required');
      }

      const result = await specificGamesService.processGameAction(sessionId, action, actionData);

      return sendResponse(res, 200, 'Action processed successfully', result);
    } catch (error) {
      console.error('Error processing game action:', error);
      return sendResponse(res, 500, 'Error processing action', {
        error: error.message
      });
    }
  }

  /**
   * Get current game state
   */
  async getGameState(req, res) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return sendResponse(res, 400, 'Session ID is required');
      }

      const gameState = await specificGamesService.getGameState(sessionId);

      return sendResponse(res, 200, 'Game state retrieved successfully', gameState);
    } catch (error) {
      console.error('Error getting game state:', error);
      return sendResponse(res, 500, 'Error retrieving game state', {
        error: error.message
      });
    }
  }

  /**
   * Get game history for a player
   */
  async getGameHistory(req, res) {
    try {
      const playerId = req.user._id;
      const { gameType, limit = 20 } = req.query;

      const history = await specificGamesService.getGameHistory(
        playerId,
        gameType,
        parseInt(limit)
      );

      return sendResponse(res, 200, 'Game history retrieved successfully', {
        history,
        total: history.length
      });
    } catch (error) {
      console.error('Error getting game history:', error);
      return sendResponse(res, 500, 'Error retrieving game history', {
        error: error.message
      });
    }
  }

  /**
   * Get supported game types and their configurations
   */
  async getSupportedGames(req, res) {
    try {
      const gameTypes = specificGamesService.getSupportedGameTypes();
      const gameConfigs = {};

      for (const gameType of gameTypes) {
        gameConfigs[gameType] = specificGamesService.getGameConfig(gameType);
      }

      return sendResponse(res, 200, 'Supported games retrieved successfully', {
        gameTypes,
        gameConfigs
      });
    } catch (error) {
      console.error('Error getting supported games:', error);
      return sendResponse(res, 500, 'Error retrieving supported games', {
        error: error.message
      });
    }
  }

  /**
   * Initialize Blackjack game (specific endpoint)
   */
  async initializeBlackjack(req, res) {
    try {
      const { tokenType, betAmount } = req.body;
      const playerId = req.user._id;

      // Validate inputs
      if (!tokenType || !betAmount) {
        return sendResponse(res, 400, 'Token type and bet amount are required');
      }

      const gameSession = await specificGamesService.initializeSpecificGame(
        'blackjack',
        playerId,
        betAmount,
        { tokenType: tokenType.toLowerCase() }
      );

      return sendResponse(res, 201, 'Blackjack game initialized successfully', gameSession);
    } catch (error) {
      console.error('Error initializing blackjack:', error);
      return sendResponse(res, 500, 'Error initializing blackjack game', {
        error: error.message
      });
    }
  }

  /**
   * Process Blackjack action
   */
  async processBlackjackAction(req, res) {
    try {
      const { sessionId } = req.params;
      const { action } = req.body;

      if (!['hit', 'stand', 'double', 'split'].includes(action)) {
        return sendResponse(res, 400, 'Invalid blackjack action');
      }

      const result = await specificGamesService.processGameAction(sessionId, action);

      return sendResponse(res, 200, 'Blackjack action processed successfully', result);
    } catch (error) {
      console.error('Error processing blackjack action:', error);
      return sendResponse(res, 500, 'Error processing blackjack action', {
        error: error.message
      });
    }
  }

  /**
   * Initialize Coin Toss game (specific endpoint)
   */
  async initializeCoinToss(req, res) {
    try {
      const { tokenType, betAmount } = req.body;
      const playerId = req.user._id;

      if (!tokenType || !betAmount) {
        return sendResponse(res, 400, 'Token type and bet amount are required');
      }

      const gameSession = await specificGamesService.initializeSpecificGame(
        'coinToss',
        playerId,
        betAmount,
        { tokenType: tokenType.toLowerCase() }
      );

      return sendResponse(res, 201, 'Coin toss game initialized successfully', gameSession);
    } catch (error) {
      console.error('Error initializing coin toss:', error);
      return sendResponse(res, 500, 'Error initializing coin toss game', {
        error: error.message
      });
    }
  }

  /**
   * Process Coin Toss choice
   */
  async processCoinTossChoice(req, res) {
    try {
      const { sessionId } = req.params;
      const { choice } = req.body;

      if (!['heads', 'tails'].includes(choice)) {
        return sendResponse(res, 400, 'Invalid coin toss choice');
      }

      const result = await specificGamesService.processGameAction(sessionId, 'choose', { choice });

      return sendResponse(res, 200, 'Coin toss choice processed successfully', result);
    } catch (error) {
      console.error('Error processing coin toss choice:', error);
      return sendResponse(res, 500, 'Error processing coin toss choice', {
        error: error.message
      });
    }
  }

  /**
   * Initialize Rock Paper Scissors game (specific endpoint)
   */
  async initializeRockPaperScissors(req, res) {
    try {
      const { tokenType, betAmount, gameMode = 'house' } = req.body;
      const playerId = req.user._id;

      if (!tokenType || !betAmount) {
        return sendResponse(res, 400, 'Token type and bet amount are required');
      }

      const gameSession = await specificGamesService.initializeSpecificGame(
        'rockPaperScissors',
        playerId,
        betAmount,
        { tokenType: tokenType.toLowerCase(), gameMode }
      );

      return sendResponse(res, 201, 'Rock Paper Scissors game initialized successfully', gameSession);
    } catch (error) {
      console.error('Error initializing rock paper scissors:', error);
      return sendResponse(res, 500, 'Error initializing rock paper scissors game', {
        error: error.message
      });
    }
  }

  /**
   * Process Rock Paper Scissors move
   */
  async processRockPaperScissorsMove(req, res) {
    try {
      const { sessionId } = req.params;
      const { move } = req.body;

      if (!['rock', 'paper', 'scissors'].includes(move)) {
        return sendResponse(res, 400, 'Invalid rock paper scissors move');
      }

      const result = await specificGamesService.processGameAction(sessionId, 'move', { move });

      return sendResponse(res, 200, 'Rock Paper Scissors move processed successfully', result);
    } catch (error) {
      console.error('Error processing rock paper scissors move:', error);
      return sendResponse(res, 500, 'Error processing rock paper scissors move', {
        error: error.message
      });
    }
  }

  /**
   * Handle game timeout
   */
  async handleTimeout(req, res) {
    try {
      const { sessionId } = req.params;

      const result = await specificGamesService.handleGameTimeout(sessionId);

      return sendResponse(res, 200, 'Game timeout handled successfully', result);
    } catch (error) {
      console.error('Error handling game timeout:', error);
      return sendResponse(res, 500, 'Error handling game timeout', {
        error: error.message
      });
    }
  }

  /**
   * Get game configuration for a specific game type
   */
  async getGameConfig(req, res) {
    try {
      const { gameType } = req.params;

      if (!specificGamesService.isGameTypeSupported(gameType)) {
        return sendResponse(res, 400, `Unsupported game type: ${gameType}`);
      }

      const config = specificGamesService.getGameConfig(gameType);

      return sendResponse(res, 200, 'Game configuration retrieved successfully', config);
    } catch (error) {
      console.error('Error getting game config:', error);
      return sendResponse(res, 500, 'Error retrieving game configuration', {
        error: error.message
      });
    }
  }
}

module.exports = new SpecificGamesController();