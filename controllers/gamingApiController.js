const sendResponse = require("../utils/responseHandler");
const gamingApiService = require("../services/gamingApiService");
const gameSessionService = require("../services/gameSessionService");
const { VALID_GAMES } = require("../config/config");
const { getAllValidTickers } = require("../utils/helpers");

/**
 * Initialize a new game session for Naffles platform games
 */
exports.initializeGame = async (req, res) => {
  try {
    const { gameType, tokenType, betAmount, gameConfig = {} } = req.body;
    const playerId = req.user._id;

    // Validate input
    if (!gameType || !tokenType || !betAmount) {
      return sendResponse(res, 400, "Missing required fields: gameType, tokenType, betAmount");
    }

    // Validate game type
    if (!VALID_GAMES.includes(gameType)) {
      return sendResponse(res, 400, "Invalid game type");
    }

    // Validate token type
    const validTokenTypes = await getAllValidTickers();
    if (!validTokenTypes.includes(tokenType.toLowerCase())) {
      return sendResponse(res, 400, "Invalid token type");
    }

    const gameSession = await gamingApiService.initializeGame(
      playerId,
      gameType,
      tokenType.toLowerCase(),
      betAmount,
      gameConfig
    );

    return sendResponse(res, 201, "Game initialized successfully", gameSession);
  } catch (error) {
    console.error("Error initializing game:", error);
    return sendResponse(res, 500, "Error initializing game", {
      error: error.message
    });
  }
};

/**
 * Submit a move/action in an active game
 */
exports.submitMove = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const moveData = req.body;

    if (!sessionId) {
      return sendResponse(res, 400, "Session ID is required");
    }

    const result = await gamingApiService.submitMove(sessionId, moveData);

    return sendResponse(res, 200, "Move submitted successfully", result);
  } catch (error) {
    console.error("Error submitting move:", error);
    return sendResponse(res, 500, "Error submitting move", {
      error: error.message
    });
  }
};

/**
 * Get current game state
 */
exports.getGameState = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return sendResponse(res, 400, "Session ID is required");
    }

    const gameState = await gamingApiService.getGameState(sessionId);

    return sendResponse(res, 200, "Game state retrieved successfully", gameState);
  } catch (error) {
    console.error("Error getting game state:", error);
    return sendResponse(res, 500, "Error retrieving game state", {
      error: error.message
    });
  }
};

/**
 * Finalize game and process results
 */
exports.finalizeGame = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const finalGameData = req.body;

    if (!sessionId) {
      return sendResponse(res, 400, "Session ID is required");
    }

    const result = await gamingApiService.finalizeGame(sessionId, finalGameData);

    return sendResponse(res, 200, "Game finalized successfully", result);
  } catch (error) {
    console.error("Error finalizing game:", error);
    return sendResponse(res, 500, "Error finalizing game", {
      error: error.message
    });
  }
};

/**
 * Cancel an active game session
 */
exports.cancelGame = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return sendResponse(res, 400, "Session ID is required");
    }

    const result = await gamingApiService.cancelGame(sessionId);

    return sendResponse(res, 200, "Game cancelled successfully", result);
  } catch (error) {
    console.error("Error cancelling game:", error);
    return sendResponse(res, 500, "Error cancelling game", {
      error: error.message
    });
  }
};

/**
 * Get player's active game session
 */
exports.getActiveSession = async (req, res) => {
  try {
    const playerId = req.user._id;

    const activeSession = await gameSessionService.getActiveSessionForPlayer(playerId);

    if (!activeSession) {
      return sendResponse(res, 404, "No active game session found");
    }

    const gameState = await gamingApiService.getGameState(activeSession._id);

    return sendResponse(res, 200, "Active session retrieved successfully", gameState);
  } catch (error) {
    console.error("Error getting active session:", error);
    return sendResponse(res, 500, "Error retrieving active session", {
      error: error.message
    });
  }
};

/**
 * Get player's queue position for a specific game type
 */
exports.getQueuePosition = async (req, res) => {
  try {
    const { gameType, tokenType } = req.query;
    const playerId = req.user._id;

    if (!gameType || !tokenType) {
      return sendResponse(res, 400, "gameType and tokenType are required");
    }

    const queuePosition = await gameSessionService.getPlayerQueuePosition(
      playerId,
      gameType,
      tokenType.toLowerCase()
    );

    if (!queuePosition) {
      return sendResponse(res, 404, "Player not in queue");
    }

    // Calculate estimated wait time
    const estimatedWaitTime = queuePosition.queuePosition * 30; // 30 seconds per game

    return sendResponse(res, 200, "Queue position retrieved successfully", {
      queuePosition: queuePosition.queuePosition,
      estimatedWaitTime,
      gameType,
      tokenType,
      betAmount: queuePosition.betAmount,
      createdAt: queuePosition.createdAt,
      expiresAt: queuePosition.expiresAt
    });
  } catch (error) {
    console.error("Error getting queue position:", error);
    return sendResponse(res, 500, "Error retrieving queue position", {
      error: error.message
    });
  }
};

/**
 * Get game session history for the authenticated player
 */
exports.getGameHistory = async (req, res) => {
  try {
    const playerId = req.user._id;
    const { limit = 20, skip = 0, gameType, tokenType } = req.query;

    const GameSession = require("../models/game/gameSession");
    
    let filter = {
      playerId,
      status: "completed",
      isThirdParty: false // Only Naffles platform games
    };

    if (gameType) filter.gameType = gameType;
    if (tokenType) filter.tokenType = tokenType.toLowerCase();

    const sessions = await GameSession.find(filter)
      .sort({ completedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('houseSlotId', 'ownerId');

    const total = await GameSession.countDocuments(filter);

    const gameHistory = sessions.map(session => ({
      sessionId: session._id,
      gameType: session.gameType,
      tokenType: session.tokenType,
      betAmount: session.betAmount,
      result: session.result,
      gameState: session.gameState,
      houseOwner: session.houseSlotId ? session.houseSlotId.ownerId : null,
      createdAt: session.createdAt,
      completedAt: session.completedAt
    }));

    return sendResponse(res, 200, "Game history retrieved successfully", {
      gameHistory,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      hasMore: parseInt(skip) + sessions.length < total
    });
  } catch (error) {
    console.error("Error getting game history:", error);
    return sendResponse(res, 500, "Error retrieving game history", {
      error: error.message
    });
  }
};