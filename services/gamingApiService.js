const GameSession = require("../models/game/gameSession");
const User = require("../models/user/user");
const gameSessionService = require("./gameSessionService");
const { isUserHasEnoughBalance } = require("./socket/helpers");
const { convertToBigInt, convertToNum } = require("../utils/convert");
const vrfWrapper = require("./vrfWrapper");
const { validateBetAmount } = require("../controllers/admin/betLimitsController");

class GamingApiService {
  /**
   * Initialize a game session for third-party games (Naffles platform games)
   * This provides complete queue abstraction for third-party integrations
   * @param {string} playerId - Player user ID
   * @param {string} gameType - Type of game
   * @param {string} tokenType - Token type
   * @param {string} betAmount - Bet amount as string
   * @param {Object} gameConfig - Game-specific configuration
   * @returns {Object} Game session with queue status
   */
  async initializeGame(playerId, gameType, tokenType, betAmount, gameConfig = {}) {
    try {
      // Validate player exists
      const player = await User.findById(playerId);
      if (!player) {
        throw new Error("Player not found");
      }

      // Validate bet amount against limits
      const betValidation = await validateBetAmount(gameType, tokenType, betAmount);
      if (!betValidation.isValid) {
        throw new Error(betValidation.error);
      }

      // Check balance
      const hasBalance = await isUserHasEnoughBalance(playerId, tokenType, betAmount);
      if (!hasBalance) {
        throw new Error("Insufficient balance");
      }

      // Create game session (this handles queue logic internally)
      const gameSession = await gameSessionService.createGameSession(
        playerId,
        gameType,
        tokenType,
        betAmount,
        false, // Not third-party, this is for Naffles platform games
        null
      );

      // Initialize game state based on game type
      const gameState = await this.initializeGameState(gameType, gameConfig);
      gameSession.gameState = gameState;
      await gameSession.save();

      // If session is waiting for house, get queue position
      let queueInfo = null;
      if (gameSession.status === "waiting_for_house") {
        queueInfo = await gameSessionService.getPlayerQueuePosition(playerId, gameType, tokenType);
      }

      return {
        sessionId: gameSession._id,
        status: gameSession.status,
        gameState: gameSession.gameState,
        queuePosition: queueInfo ? queueInfo.queuePosition : null,
        estimatedWaitTime: queueInfo ? this.calculateEstimatedWaitTime(queueInfo.queuePosition) : null
      };
    } catch (error) {
      console.error("Error initializing game:", error);
      throw error;
    }
  }

  /**
   * Submit a game move/action
   * @param {string} sessionId - Game session ID
   * @param {Object} moveData - Move/action data
   * @returns {Object} Updated game state
   */
  async submitMove(sessionId, moveData) {
    try {
      const session = await GameSession.findById(sessionId);
      if (!session) {
        throw new Error("Game session not found");
      }

      if (session.status !== "in_progress") {
        throw new Error("Game session is not in progress");
      }

      if (session.isExpired()) {
        throw new Error("Game session has expired");
      }

      // Process move based on game type
      const updatedGameState = await this.processMove(session, moveData);
      session.gameState = updatedGameState;
      await session.save();

      return {
        sessionId: session._id,
        gameState: session.gameState,
        status: session.status
      };
    } catch (error) {
      console.error("Error submitting move:", error);
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
        throw new Error("Game session not found");
      }

      let queueInfo = null;
      if (session.status === "waiting_for_house") {
        queueInfo = await gameSessionService.getPlayerQueuePosition(
          session.playerId,
          session.gameType,
          session.tokenType
        );
      }

      return {
        sessionId: session._id,
        status: session.status,
        gameState: session.gameState,
        result: session.result,
        queuePosition: queueInfo ? queueInfo.queuePosition : null,
        estimatedWaitTime: queueInfo ? this.calculateEstimatedWaitTime(queueInfo.queuePosition) : null
      };
    } catch (error) {
      console.error("Error getting game state:", error);
      throw error;
    }
  }

  /**
   * Finalize game and process results
   * @param {string} sessionId - Game session ID
   * @param {Object} finalGameData - Final game data
   * @returns {Object} Game result
   */
  async finalizeGame(sessionId, finalGameData) {
    try {
      const session = await GameSession.findById(sessionId);
      if (!session) {
        throw new Error("Game session not found");
      }

      if (session.status !== "in_progress") {
        throw new Error("Game session is not in progress");
      }

      // Determine game outcome
      const result = await this.determineGameOutcome(session, finalGameData);

      // Complete the session
      const completedSession = await gameSessionService.completeGameSession(sessionId, result);

      return {
        sessionId: completedSession._id,
        result: completedSession.result,
        status: completedSession.status
      };
    } catch (error) {
      console.error("Error finalizing game:", error);
      throw error;
    }
  }

  /**
   * Initialize game state based on game type
   * @param {string} gameType - Type of game
   * @param {Object} gameConfig - Game configuration
   * @returns {Object} Initial game state
   */
  async initializeGameState(gameType, gameConfig) {
    switch (gameType) {
      case "rockPaperScissors":
        return {
          playerMove: null,
          houseMove: null,
          round: 1,
          maxRounds: gameConfig.maxRounds || 1,
          gamePhase: "waiting_for_player_move"
        };
      
      case "coinToss":
        return {
          playerChoice: null, // heads or tails
          coinResult: null,
          gamePhase: "waiting_for_player_choice"
        };
      
      default:
        return {
          gamePhase: "initialized",
          customData: gameConfig
        };
    }
  }

  /**
   * Process a game move
   * @param {Object} session - Game session
   * @param {Object} moveData - Move data
   * @returns {Object} Updated game state
   */
  async processMove(session, moveData) {
    const gameState = { ...session.gameState };

    switch (session.gameType) {
      case "rockPaperScissors":
        if (gameState.gamePhase === "waiting_for_player_move") {
          gameState.playerMove = moveData.move;
          gameState.gamePhase = "processing";
          
          // Generate house move using VRF with failsafe
          gameState.houseMove = await vrfWrapper.rockPaperScissorsChoice();
          gameState.gamePhase = "completed";
        }
        break;
      
      case "coinToss":
        if (gameState.gamePhase === "waiting_for_player_choice") {
          gameState.playerChoice = moveData.choice; // heads or tails
          gameState.gamePhase = "processing";
          
          // Request VRF for fair coin flip with failsafe
          if (!session.vrfRequestId) {
            const vrfRequest = await vrfWrapper.requestRandomness();
            session.vrfRequestId = vrfRequest.requestId;
            await session.save();
          }
          
          // Use VRF with failsafe for coin flip
          gameState.coinResult = await vrfWrapper.coinFlip();
          gameState.gamePhase = "completed";
        }
        break;
      
      default:
        // Handle custom game types
        gameState.lastMove = moveData;
        gameState.moveCount = (gameState.moveCount || 0) + 1;
        break;
    }

    return gameState;
  }

  /**
   * Determine game outcome
   * @param {Object} session - Game session
   * @param {Object} finalGameData - Final game data
   * @returns {Object} Game result
   */
  async determineGameOutcome(session, finalGameData) {
    const gameState = session.gameState;
    const betAmountBigInt = BigInt(session.betAmount);
    
    let winner = "draw";
    let playerPayout = "0";
    let housePayout = "0";

    switch (session.gameType) {
      case "rockPaperScissors":
        const playerMove = gameState.playerMove;
        const houseMove = gameState.houseMove;
        
        if (playerMove === houseMove) {
          winner = "draw";
          playerPayout = session.betAmount; // Return bet
        } else if (
          (playerMove === "rock" && houseMove === "scissors") ||
          (playerMove === "paper" && houseMove === "rock") ||
          (playerMove === "scissors" && houseMove === "paper")
        ) {
          winner = "player";
          playerPayout = (betAmountBigInt * BigInt(2)).toString(); // 2x payout
        } else {
          winner = "house";
          housePayout = session.betAmount;
        }
        break;
      
      case "coinToss":
        const playerChoice = gameState.playerChoice;
        const coinResult = gameState.coinResult;
        
        if (playerChoice === coinResult) {
          winner = "player";
          playerPayout = (betAmountBigInt * BigInt(2)).toString(); // 2x payout
        } else {
          winner = "house";
          housePayout = session.betAmount;
        }
        break;
      
      default:
        // Handle custom game outcomes
        if (finalGameData.winner) {
          winner = finalGameData.winner;
          playerPayout = finalGameData.playerPayout || "0";
          housePayout = finalGameData.housePayout || "0";
        }
        break;
    }

    return {
      winner,
      playerPayout,
      housePayout,
      gameData: {
        gameState,
        finalData: finalGameData
      }
    };
  }

  /**
   * Calculate estimated wait time based on queue position
   * @param {number} queuePosition - Position in queue
   * @returns {number} Estimated wait time in seconds
   */
  calculateEstimatedWaitTime(queuePosition) {
    // Estimate 30 seconds per game on average
    const averageGameDuration = 30;
    return queuePosition * averageGameDuration;
  }

  /**
   * Cancel a game session
   * @param {string} sessionId - Game session ID
   * @returns {Object} Cancelled session info
   */
  async cancelGame(sessionId) {
    try {
      const cancelledSession = await gameSessionService.cancelGameSession(sessionId);
      
      return {
        sessionId: cancelledSession._id,
        status: cancelledSession.status,
        message: "Game cancelled successfully"
      };
    } catch (error) {
      console.error("Error cancelling game:", error);
      throw error;
    }
  }
}

module.exports = new GamingApiService();