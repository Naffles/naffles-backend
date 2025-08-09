const sendResponse = require("../utils/responseHandler");
const wageringApiService = require("../services/wageringApiService");
const { getAllValidTickers } = require("../utils/helpers");

/**
 * Validate player balance for external third-party games
 */
exports.validateBalance = async (req, res) => {
  try {
    const { tokenType, betAmount } = req.body;
    const playerId = req.user._id;

    // Validate input
    if (!tokenType || !betAmount) {
      return sendResponse(res, 400, "Missing required fields: tokenType, betAmount");
    }

    // Validate token type
    const validTokenTypes = await getAllValidTickers();
    if (!validTokenTypes.includes(tokenType.toLowerCase())) {
      return sendResponse(res, 400, "Invalid token type");
    }

    const validationResult = await wageringApiService.validateBalance(
      playerId,
      tokenType.toLowerCase(),
      betAmount
    );

    return sendResponse(res, 200, "Balance validation completed", validationResult);
  } catch (error) {
    console.error("Error validating balance:", error);
    return sendResponse(res, 500, "Error validating balance", {
      error: error.message
    });
  }
};

/**
 * Create a wager session for external third-party games
 */
exports.createWagerSession = async (req, res) => {
  try {
    const { tokenType, betAmount, thirdPartyGameId, gameMetadata = {} } = req.body;
    const playerId = req.user._id;

    // Validate input
    if (!tokenType || !betAmount || !thirdPartyGameId) {
      return sendResponse(res, 400, "Missing required fields: tokenType, betAmount, thirdPartyGameId");
    }

    // Validate token type
    const validTokenTypes = await getAllValidTickers();
    if (!validTokenTypes.includes(tokenType.toLowerCase())) {
      return sendResponse(res, 400, "Invalid token type");
    }

    const wagerSession = await wageringApiService.createWagerSession(
      playerId,
      tokenType.toLowerCase(),
      betAmount,
      thirdPartyGameId,
      gameMetadata
    );

    return sendResponse(res, 201, "Wager session created successfully", wagerSession);
  } catch (error) {
    console.error("Error creating wager session:", error);
    return sendResponse(res, 500, "Error creating wager session", {
      error: error.message
    });
  }
};

/**
 * Process payout for external third-party games
 */
exports.processPayout = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const payoutData = req.body;

    if (!sessionId) {
      return sendResponse(res, 400, "Session ID is required");
    }

    // Validate payout data
    const { winner, playerPayout, gameResult } = payoutData;
    if (!winner) {
      return sendResponse(res, 400, "Winner is required");
    }

    const result = await wageringApiService.processPayout(sessionId, payoutData);

    return sendResponse(res, 200, "Payout processed successfully", result);
  } catch (error) {
    console.error("Error processing payout:", error);
    return sendResponse(res, 500, "Error processing payout", {
      error: error.message
    });
  }
};

/**
 * Get wager session status
 */
exports.getWagerSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return sendResponse(res, 400, "Session ID is required");
    }

    const sessionStatus = await wageringApiService.getWagerSessionStatus(sessionId);

    return sendResponse(res, 200, "Wager session status retrieved successfully", sessionStatus);
  } catch (error) {
    console.error("Error getting wager session status:", error);
    return sendResponse(res, 500, "Error retrieving wager session status", {
      error: error.message
    });
  }
};

/**
 * Cancel a wager session
 */
exports.cancelWagerSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason = "cancelled" } = req.body;

    if (!sessionId) {
      return sendResponse(res, 400, "Session ID is required");
    }

    const result = await wageringApiService.cancelWagerSession(sessionId, reason);

    return sendResponse(res, 200, "Wager session cancelled successfully", result);
  } catch (error) {
    console.error("Error cancelling wager session:", error);
    return sendResponse(res, 500, "Error cancelling wager session", {
      error: error.message
    });
  }
};

/**
 * Get player's active wager sessions
 */
exports.getActiveWagerSessions = async (req, res) => {
  try {
    const playerId = req.user._id;

    const activeSessions = await wageringApiService.getPlayerActiveWagerSessions(playerId);

    return sendResponse(res, 200, "Active wager sessions retrieved successfully", {
      activeSessions,
      count: activeSessions.length
    });
  } catch (error) {
    console.error("Error getting active wager sessions:", error);
    return sendResponse(res, 500, "Error retrieving active wager sessions", {
      error: error.message
    });
  }
};

/**
 * Get player's wager session history
 */
exports.getWagerHistory = async (req, res) => {
  try {
    const playerId = req.user._id;
    const { limit = 20, skip = 0 } = req.query;

    const history = await wageringApiService.getPlayerWagerHistory(
      playerId,
      parseInt(limit),
      parseInt(skip)
    );

    return sendResponse(res, 200, "Wager history retrieved successfully", history);
  } catch (error) {
    console.error("Error getting wager history:", error);
    return sendResponse(res, 500, "Error retrieving wager history", {
      error: error.message
    });
  }
};

/**
 * Extend wager session expiration time
 */
exports.extendWagerSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { additionalMinutes = 10 } = req.body;

    if (!sessionId) {
      return sendResponse(res, 400, "Session ID is required");
    }

    const result = await wageringApiService.extendWagerSession(
      sessionId,
      parseInt(additionalMinutes)
    );

    return sendResponse(res, 200, "Wager session extended successfully", result);
  } catch (error) {
    console.error("Error extending wager session:", error);
    return sendResponse(res, 500, "Error extending wager session", {
      error: error.message
    });
  }
};

/**
 * Get wager sessions by third-party game ID (for external game providers)
 */
exports.getSessionsByGameId = async (req, res) => {
  try {
    const { thirdPartyGameId } = req.params;
    const { status = "all" } = req.query;

    if (!thirdPartyGameId) {
      return sendResponse(res, 400, "Third-party game ID is required");
    }

    const GameSession = require("../models/game/gameSession");
    
    let filter = {
      thirdPartyGameId,
      isThirdParty: true
    };

    if (status !== "all") {
      filter.status = status;
    }

    const sessions = await GameSession.find(filter)
      .sort({ createdAt: -1 })
      .limit(100); // Limit to prevent large responses

    const sessionData = sessions.map(session => ({
      sessionId: session._id,
      playerId: session.playerId,
      tokenType: session.tokenType,
      betAmount: session.betAmount,
      status: session.status,
      result: session.result,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      completedAt: session.completedAt
    }));

    return sendResponse(res, 200, "Sessions retrieved successfully", {
      sessions: sessionData,
      count: sessionData.length,
      thirdPartyGameId
    });
  } catch (error) {
    console.error("Error getting sessions by game ID:", error);
    return sendResponse(res, 500, "Error retrieving sessions", {
      error: error.message
    });
  }
};

/**
 * Initialize session-based house slot
 */
exports.initializeSlotSession = async (req, res) => {
  try {
    const { gameType, tokenType, roundsNeeded } = req.body;
    const playerId = req.user._id;

    // Validate input
    if (!gameType || !tokenType || !roundsNeeded) {
      return sendResponse(res, 400, "Missing required fields: gameType, tokenType, roundsNeeded");
    }

    // Validate token type
    const validTokenTypes = await getAllValidTickers();
    if (!validTokenTypes.includes(tokenType.toLowerCase())) {
      return sendResponse(res, 400, "Invalid token type");
    }

    const sessionResponse = await wageringApiService.initializeSlotSession(
      playerId,
      gameType,
      tokenType.toLowerCase(),
      roundsNeeded
    );

    return sendResponse(res, 201, "Slot session initialized successfully", sessionResponse);
  } catch (error) {
    console.error("Error initializing slot session:", error);
    return sendResponse(res, 500, "Error initializing slot session", {
      error: error.message
    });
  }
};

/**
 * Sync session state for periodic updates
 */
exports.syncSlotSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { roundsUsed, currentBalance } = req.body;

    if (!sessionId) {
      return sendResponse(res, 400, "Session ID is required");
    }

    const syncResult = await wageringApiService.syncSlotSession(
      sessionId,
      roundsUsed,
      currentBalance
    );

    return sendResponse(res, 200, "Session synced successfully", syncResult);
  } catch (error) {
    console.error("Error syncing slot session:", error);
    return sendResponse(res, 500, "Error syncing slot session", {
      error: error.message
    });
  }
};

/**
 * Complete session with final state reconciliation
 */
exports.completeSlotSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { finalResult, totalRoundsPlayed, finalBalance } = req.body;

    if (!sessionId) {
      return sendResponse(res, 400, "Session ID is required");
    }

    const completionResult = await wageringApiService.completeSlotSession(
      sessionId,
      finalResult,
      totalRoundsPlayed,
      finalBalance
    );

    return sendResponse(res, 200, "Session completed successfully", completionResult);
  } catch (error) {
    console.error("Error completing slot session:", error);
    return sendResponse(res, 500, "Error completing slot session", {
      error: error.message
    });
  }
};
/**

 * Initialize gaming session with NFT data for external games
 */
exports.initializeGamingSession = async (req, res) => {
  try {
    const { gameType, tokenType, betAmount, thirdPartyGameId } = req.body;
    const playerId = req.user._id;

    // Validate input
    if (!gameType || !tokenType || !betAmount || !thirdPartyGameId) {
      return sendResponse(res, 400, "Missing required fields: gameType, tokenType, betAmount, thirdPartyGameId");
    }

    // Validate token type
    const validTokenTypes = await getAllValidTickers();
    if (!validTokenTypes.includes(tokenType.toLowerCase())) {
      return sendResponse(res, 400, "Invalid token type");
    }

    const initializationResult = await wageringApiService.initializeGamingSession(
      playerId,
      gameType,
      tokenType.toLowerCase(),
      betAmount,
      thirdPartyGameId
    );

    return sendResponse(res, 200, "Gaming session initialized successfully", initializationResult);
  } catch (error) {
    console.error("Error initializing gaming session:", error);
    return sendResponse(res, 500, "Error initializing gaming session", {
      error: error.message
    });
  }
};

/**
 * Refresh player's NFT data during active session
 */
exports.refreshPlayerNFTs = async (req, res) => {
  try {
    const { gameType } = req.body;
    const playerId = req.user._id;

    if (!gameType) {
      return sendResponse(res, 400, "Missing required field: gameType");
    }

    const nftData = await wageringApiService.refreshPlayerNFTs(playerId, gameType);

    return sendResponse(res, 200, "NFT data refreshed successfully", nftData);
  } catch (error) {
    console.error("Error refreshing player NFTs:", error);
    return sendResponse(res, 500, "Error refreshing NFT data", {
      error: error.message
    });
  }
};

/**
 * Validate NFT ownership for anti-cheat purposes
 */
exports.validateNFTOwnership = async (req, res) => {
  try {
    const { contractAddress, tokenId } = req.body;
    const playerId = req.user._id;

    if (!contractAddress || !tokenId) {
      return sendResponse(res, 400, "Missing required fields: contractAddress, tokenId");
    }

    const validationResult = await wageringApiService.validateNFTOwnership(
      playerId,
      contractAddress,
      tokenId
    );

    return sendResponse(res, 200, "NFT ownership validated", validationResult);
  } catch (error) {
    console.error("Error validating NFT ownership:", error);
    return sendResponse(res, 500, "Error validating NFT ownership", {
      error: error.message
    });
  }
};