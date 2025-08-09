const sendResponse = require("../../utils/responseHandler");
const GameBetLimits = require("../../models/admin/gameBetLimits");
const { getAllValidTickers } = require("../../utils/helpers");
const { VALID_GAMES } = require("../../config/config");

/**
 * Get all bet limits for all games and tokens
 */
exports.getAllBetLimits = async (req, res) => {
  try {
    const betLimits = await GameBetLimits.getAllBetLimits();
    
    // Get all valid tokens
    const validTokens = await getAllValidTickers();
    
    // Create a comprehensive structure with all game-token combinations
    const gameTypes = VALID_GAMES;
    const betLimitsMap = {};
    
    // Initialize structure
    gameTypes.forEach(gameType => {
      betLimitsMap[gameType] = {};
      validTokens.forEach(tokenType => {
        betLimitsMap[gameType][tokenType] = {
          maxBetAmount: null,
          hasLimit: false,
          updatedBy: null,
          updatedAt: null
        };
      });
    });
    
    // Fill in existing limits
    betLimits.forEach(limit => {
      if (betLimitsMap[limit.gameType] && betLimitsMap[limit.gameType][limit.tokenType]) {
        betLimitsMap[limit.gameType][limit.tokenType] = {
          maxBetAmount: limit.maxBetAmount,
          hasLimit: true,
          updatedBy: limit.updatedBy,
          updatedAt: limit.updatedAt
        };
      }
    });
    
    return sendResponse(res, 200, "Bet limits retrieved successfully", {
      betLimits: betLimitsMap,
      gameTypes,
      validTokens
    });
  } catch (error) {
    console.error("Error getting bet limits:", error);
    return sendResponse(res, 500, "Error retrieving bet limits", {
      error: error.message
    });
  }
};

/**
 * Update bet limit for a specific game and token
 */
exports.updateBetLimit = async (req, res) => {
  try {
    const { gameType, tokenType, maxBetAmount } = req.body;
    const userId = req.user._id;
    
    // Validate input
    if (!gameType || !tokenType || !maxBetAmount) {
      return sendResponse(res, 400, "Missing required fields: gameType, tokenType, maxBetAmount");
    }
    
    // Validate game type
    if (!VALID_GAMES.includes(gameType)) {
      return sendResponse(res, 400, "Invalid game type");
    }
    
    // Validate token type
    const validTokens = await getAllValidTickers();
    if (!validTokens.includes(tokenType.toLowerCase())) {
      return sendResponse(res, 400, "Invalid token type");
    }
    
    // Validate bet amount
    const betAmountFloat = parseFloat(maxBetAmount);
    if (isNaN(betAmountFloat) || betAmountFloat <= 0) {
      return sendResponse(res, 400, "Max bet amount must be a positive number");
    }
    
    // Handle points exception - points betting should not have limits enforced
    if (tokenType.toLowerCase() === 'points' || tokenType.toLowerCase() === 'nafflings') {
      return sendResponse(res, 400, "Points and Nafflings betting limits are controlled by community owners");
    }
    
    const updatedLimit = await GameBetLimits.setBetLimit(
      gameType,
      tokenType,
      maxBetAmount,
      userId
    );
    
    return sendResponse(res, 200, "Bet limit updated successfully", {
      gameType: updatedLimit.gameType,
      tokenType: updatedLimit.tokenType,
      maxBetAmount: updatedLimit.maxBetAmount,
      updatedAt: updatedLimit.updatedAt
    });
  } catch (error) {
    console.error("Error updating bet limit:", error);
    
    if (error.code === 11000) {
      return sendResponse(res, 409, "Bet limit already exists for this game and token combination");
    }
    
    return sendResponse(res, 500, "Error updating bet limit", {
      error: error.message
    });
  }
};

/**
 * Remove bet limit for a specific game and token
 */
exports.removeBetLimit = async (req, res) => {
  try {
    const { gameType, tokenType } = req.params;
    
    if (!gameType || !tokenType) {
      return sendResponse(res, 400, "Game type and token type are required");
    }
    
    const result = await GameBetLimits.findOneAndUpdate(
      {
        gameType,
        tokenType: tokenType.toLowerCase()
      },
      {
        isActive: false,
        updatedBy: req.user._id
      },
      { new: true }
    );
    
    if (!result) {
      return sendResponse(res, 404, "Bet limit not found");
    }
    
    return sendResponse(res, 200, "Bet limit removed successfully");
  } catch (error) {
    console.error("Error removing bet limit:", error);
    return sendResponse(res, 500, "Error removing bet limit", {
      error: error.message
    });
  }
};

/**
 * Get bet limit for a specific game and token (used by gaming API)
 */
exports.getBetLimit = async (req, res) => {
  try {
    const { gameType, tokenType } = req.params;
    
    if (!gameType || !tokenType) {
      return sendResponse(res, 400, "Game type and token type are required");
    }
    
    const limit = await GameBetLimits.getBetLimit(gameType, tokenType);
    
    return sendResponse(res, 200, "Bet limit retrieved successfully", {
      gameType,
      tokenType,
      maxBetAmount: limit,
      hasLimit: !!limit
    });
  } catch (error) {
    console.error("Error getting bet limit:", error);
    return sendResponse(res, 500, "Error retrieving bet limit", {
      error: error.message
    });
  }
};

/**
 * Validate bet amount against limits
 */
exports.validateBetAmount = async (gameType, tokenType, betAmount) => {
  try {
    // Skip validation for points and nafflings (community controlled)
    if (tokenType.toLowerCase() === 'points' || tokenType.toLowerCase() === 'nafflings') {
      return { isValid: true };
    }
    
    const limit = await GameBetLimits.getBetLimit(gameType, tokenType);
    
    if (!limit) {
      return { isValid: true }; // No limit set
    }
    
    const betAmountFloat = parseFloat(betAmount);
    const limitFloat = parseFloat(limit);
    
    if (betAmountFloat > limitFloat) {
      return {
        isValid: false,
        error: `Bet amount ${betAmount} ${tokenType.toUpperCase()} exceeds maximum limit of ${limit} ${tokenType.toUpperCase()} for ${gameType}`,
        maxLimit: limit
      };
    }
    
    return { isValid: true, maxLimit: limit };
  } catch (error) {
    console.error("Error validating bet amount:", error);
    throw error;
  }
};