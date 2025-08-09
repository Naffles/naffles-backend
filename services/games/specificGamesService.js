const blackjackService = require('./blackjackService');
const coinTossService = require('./coinTossService');
const rockPaperScissorsService = require('./rockPaperScissorsService');
const gameHistoryService = require('./gameHistoryService');
const GameSession = require('../../models/game/gameSession');
const gameSessionService = require('../gameSessionService');

/**
 * Specific Games Service
 * Unified service for managing specific game implementations
 */
class SpecificGamesService {
  constructor() {
    this.gameServices = {
      'blackjack': blackjackService,
      'coinToss': coinTossService,
      'rockPaperScissors': rockPaperScissorsService
    };
  }

  /**
   * Initialize a specific game
   * @param {string} gameType - Type of game
   * @param {string} playerId - Player ID
   * @param {string} betAmount - Bet amount
   * @param {Object} gameConfig - Game configuration
   * @returns {Object} Initialized game session
   */
  async initializeSpecificGame(gameType, playerId, betAmount, gameConfig = {}) {
    const gameService = this.gameServices[gameType];
    if (!gameService) {
      throw new Error(`Unsupported game type: ${gameType}`);
    }

    try {
      // Initialize the specific game logic
      const gameState = await gameService.initializeGame(playerId, betAmount, gameConfig);

      // Create game session through existing infrastructure
      const gameSession = await gameSessionService.createGameSession(
        playerId,
        gameType,
        gameConfig.tokenType || 'points',
        betAmount,
        false, // Not third-party
        null
      );

      // Update session with specific game state
      gameSession.gameState = {
        ...gameState,
        gameType,
        initialized: true,
        createdAt: new Date()
      };

      await gameSession.save();

      return {
        sessionId: gameSession._id,
        gameType,
        gameState: gameSession.gameState,
        status: gameSession.status,
        displayInfo: gameService.getDisplayInfo ? gameService.getDisplayInfo(gameState) : gameState
      };
    } catch (error) {
      console.error(`Error initializing ${gameType}:`, error);
      throw error;
    }
  }

  /**
   * Process a game action/move
   * @param {string} sessionId - Game session ID
   * @param {string} action - Action type
   * @param {Object} actionData - Action data
   * @returns {Object} Updated game state
   */
  async processGameAction(sessionId, action, actionData = {}) {
    try {
      const session = await GameSession.findById(sessionId);
      if (!session) {
        throw new Error('Game session not found');
      }

      if (session.status !== 'in_progress') {
        throw new Error('Game session is not in progress');
      }

      const gameService = this.gameServices[session.gameType];
      if (!gameService) {
        throw new Error(`Unsupported game type: ${session.gameType}`);
      }

      let updatedGameState;
      const gameStateBefore = { ...session.gameState };

      // Process action based on game type
      switch (session.gameType) {
        case 'blackjack':
          updatedGameState = await gameService.processPlayerAction(session.gameState, action);
          
          // Check if dealer turn is needed
          if (updatedGameState.gamePhase === 'dealer_turn') {
            updatedGameState = await gameService.playDealerHand(updatedGameState);
          }
          break;

        case 'coinToss':
          if (action === 'choose') {
            updatedGameState = await gameService.processChoice(session.gameState, actionData.choice);
          } else {
            throw new Error(`Invalid action for coin toss: ${action}`);
          }
          break;

        case 'rockPaperScissors':
          if (action === 'move') {
            updatedGameState = await gameService.processPlayerMove(session.gameState, actionData.move);
          } else {
            throw new Error(`Invalid action for rock paper scissors: ${action}`);
          }
          break;

        default:
          throw new Error(`Action processing not implemented for ${session.gameType}`);
      }

      // Record action in audit trail
      await gameHistoryService.recordGameAction(
        sessionId,
        action,
        actionData,
        gameStateBefore,
        updatedGameState
      );

      // Update session
      session.gameState = updatedGameState;
      
      // Check if game is completed
      if (this.isGameCompleted(updatedGameState)) {
        const result = gameService.determineOutcome(updatedGameState, session.betAmount);
        session.result = result;
        session.status = 'completed';
        session.completedAt = new Date();

        // Process payouts through existing infrastructure
        await gameSessionService.processGamePayout(session);
      }

      await session.save();

      return {
        sessionId: session._id,
        gameType: session.gameType,
        gameState: session.gameState,
        result: session.result,
        status: session.status,
        displayInfo: gameService.getDisplayInfo ? gameService.getDisplayInfo(updatedGameState) : updatedGameState
      };
    } catch (error) {
      console.error('Error processing game action:', error);
      throw error;
    }
  }

  /**
   * Get current game state
   * @param {string} sessionId - Game session ID
   * @returns {Object} Current game state
   */
  async getGameState(sessionId) {
    try {
      const session = await GameSession.findById(sessionId);
      if (!session) {
        throw new Error('Game session not found');
      }

      const gameService = this.gameServices[session.gameType];
      if (!gameService) {
        throw new Error(`Unsupported game type: ${session.gameType}`);
      }

      return {
        sessionId: session._id,
        gameType: session.gameType,
        gameState: session.gameState,
        result: session.result,
        status: session.status,
        displayInfo: gameService.getDisplayInfo ? gameService.getDisplayInfo(session.gameState) : session.gameState
      };
    } catch (error) {
      console.error('Error getting game state:', error);
      throw error;
    }
  }

  /**
   * Handle game timeout
   * @param {string} sessionId - Game session ID
   * @returns {Object} Updated game state
   */
  async handleGameTimeout(sessionId) {
    try {
      const session = await GameSession.findById(sessionId);
      if (!session) {
        throw new Error('Game session not found');
      }

      const gameService = this.gameServices[session.gameType];
      if (!gameService && gameService.handleMoveTimeout) {
        // Only some games support timeout handling
        const updatedGameState = gameService.handleMoveTimeout(session.gameState);
        session.gameState = updatedGameState;
        
        if (this.isGameCompleted(updatedGameState)) {
          const result = gameService.determineOutcome(updatedGameState, session.betAmount);
          session.result = result;
          session.status = 'completed';
          session.completedAt = new Date();
          
          await gameSessionService.processGamePayout(session);
        }
        
        await session.save();
      } else {
        // Default timeout handling - cancel the game
        session.status = 'expired';
        session.completedAt = new Date();
        await session.save();
      }

      return {
        sessionId: session._id,
        status: session.status,
        gameState: session.gameState,
        result: session.result
      };
    } catch (error) {
      console.error('Error handling game timeout:', error);
      throw error;
    }
  }

  /**
   * Get game history with specific game details
   * @param {string} playerId - Player ID
   * @param {string} gameType - Optional game type filter
   * @param {number} limit - Number of games to return
   * @returns {Array} Game history
   */
  async getGameHistory(playerId, gameType = null, limit = 20) {
    try {
      const query = {
        playerId,
        status: 'completed'
      };

      if (gameType && this.gameServices[gameType]) {
        query.gameType = gameType;
      }

      const sessions = await GameSession.find(query)
        .sort({ completedAt: -1 })
        .limit(limit)
        .lean();

      return sessions.map(session => {
        const gameService = this.gameServices[session.gameType];
        
        return {
          sessionId: session._id,
          gameType: session.gameType,
          betAmount: session.betAmount,
          tokenType: session.tokenType,
          result: session.result,
          completedAt: session.completedAt,
          gameStats: gameService && gameService.getGameStats ? 
            gameService.getGameStats(session.gameState) : null
        };
      });
    } catch (error) {
      console.error('Error getting game history:', error);
      throw error;
    }
  }

  /**
   * Get supported game types
   * @returns {Array} Supported game types
   */
  getSupportedGameTypes() {
    return Object.keys(this.gameServices);
  }

  /**
   * Check if a game type is supported
   * @param {string} gameType - Game type to check
   * @returns {boolean} Is supported
   */
  isGameTypeSupported(gameType) {
    return this.gameServices.hasOwnProperty(gameType);
  }

  /**
   * Check if game is completed based on game state
   * @param {Object} gameState - Game state to check
   * @returns {boolean} Is completed
   */
  isGameCompleted(gameState) {
    if (!gameState) return false;

    // Common completion indicators
    const completionPhases = ['completed', 'game_over', 'timeout'];
    return completionPhases.includes(gameState.gamePhase);
  }

  /**
   * Get game configuration for a specific game type
   * @param {string} gameType - Game type
   * @returns {Object} Game configuration
   */
  getGameConfig(gameType) {
    const configs = {
      'blackjack': {
        name: 'Blackjack',
        description: 'Classic casino blackjack with 8-deck shoe',
        minBet: '1000000000000000000', // 1 token in wei
        maxBet: '1000000000000000000000', // 1000 tokens in wei
        houseEdge: 0.005, // 0.5%
        features: ['hit', 'stand', 'double', 'split'],
        payouts: {
          'blackjack': '3:2',
          'win': '1:1',
          'push': '1:1'
        }
      },
      'coinToss': {
        name: 'Coin Toss',
        description: 'Fair coin toss with animated outcomes',
        minBet: '1000000000000000000', // 1 token in wei
        maxBet: '1000000000000000000000', // 1000 tokens in wei
        houseEdge: 0.0, // 0% (fair game)
        features: ['heads', 'tails', 'animations'],
        payouts: {
          'win': '1:1'
        }
      },
      'rockPaperScissors': {
        name: 'Rock Paper Scissors',
        description: 'Classic game with 30-second move timer',
        minBet: '1000000000000000000', // 1 token in wei
        maxBet: '1000000000000000000000', // 1000 tokens in wei
        houseEdge: 0.0, // 0% (fair game)
        features: ['rock', 'paper', 'scissors', 'timer'],
        payouts: {
          'win': '1:1',
          'draw': '1:1'
        },
        moveTimeout: 30000 // 30 seconds
      }
    };

    return configs[gameType] || null;
  }

  /**
   * Validate game action
   * @param {string} gameType - Game type
   * @param {string} action - Action to validate
   * @param {Object} actionData - Action data
   * @returns {boolean} Is valid action
   */
  validateGameAction(gameType, action, actionData) {
    const gameService = this.gameServices[gameType];
    if (!gameService) return false;

    switch (gameType) {
      case 'blackjack':
        return ['hit', 'stand', 'double', 'split'].includes(action);
      
      case 'coinToss':
        return action === 'choose' && ['heads', 'tails'].includes(actionData.choice);
      
      case 'rockPaperScissors':
        return action === 'move' && ['rock', 'paper', 'scissors'].includes(actionData.move);
      
      default:
        return false;
    }
  }
}

module.exports = new SpecificGamesService();