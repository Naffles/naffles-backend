const adminSessionConfigService = require("../services/adminSessionConfigService");
const sendResponse = require("../utils/responseHandler");

/**
 * Get session configuration for a specific game type and token
 */
exports.getSessionConfiguration = async (req, res) => {
  try {
    const { gameType, tokenType } = req.params;
    
    const config = await adminSessionConfigService.getSessionConfiguration(gameType, tokenType);
    
    return sendResponse(res, 200, "Session configuration retrieved successfully", config);
  } catch (error) {
    console.error("Error getting session configuration:", error);
    return sendResponse(res, 500, "Error retrieving session configuration", {
      error: error.message
    });
  }
};

/**
 * Update session configuration for a specific game type and token
 */
exports.updateSessionConfiguration = async (req, res) => {
  try {
    const { gameType, tokenType } = req.params;
    const configuration = req.body;
    
    // Validate configuration
    const { roundsPerSession, safetyMultiplier } = configuration;
    
    if (roundsPerSession !== undefined && (typeof roundsPerSession !== 'number' || roundsPerSession < 1 || roundsPerSession > 1000)) {
      return sendResponse(res, 400, "Rounds per session must be a number between 1 and 1000");
    }
    
    if (safetyMultiplier !== undefined && (typeof safetyMultiplier !== 'number' || safetyMultiplier < 1 || safetyMultiplier > 100)) {
      return sendResponse(res, 400, "Safety multiplier must be a number between 1 and 100");
    }
    
    const result = await adminSessionConfigService.updateSessionConfiguration(
      gameType, 
      tokenType, 
      configuration
    );
    
    return sendResponse(res, 200, "Session configuration updated successfully", result);
  } catch (error) {
    console.error("Error updating session configuration:", error);
    return sendResponse(res, 500, "Error updating session configuration", {
      error: error.message
    });
  }
};

/**
 * Calculate minimum funding requirements
 */
exports.calculateMinimumFunding = async (req, res) => {
  try {
    const { gameType, tokenType, maxPayout, configuration } = req.body;
    
    if (!gameType || !tokenType || !maxPayout) {
      return sendResponse(res, 400, "Missing required fields: gameType, tokenType, maxPayout");
    }
    
    // Validate maxPayout is a valid BigInt string
    try {
      BigInt(maxPayout);
    } catch (error) {
      return sendResponse(res, 400, "Invalid maxPayout value - must be a valid number string");
    }
    
    const calculation = adminSessionConfigService.calculateMinimumFunding(
      gameType,
      tokenType,
      maxPayout,
      configuration || {}
    );
    
    return sendResponse(res, 200, "Minimum funding calculated successfully", calculation);
  } catch (error) {
    console.error("Error calculating minimum funding:", error);
    return sendResponse(res, 500, "Error calculating minimum funding", {
      error: error.message
    });
  }
};

/**
 * Get session monitoring dashboard
 */
exports.getSessionMonitoringDashboard = async (req, res) => {
  try {
    const { gameType, tokenType } = req.query;
    
    const dashboard = await adminSessionConfigService.getSessionMonitoringDashboard(
      gameType || null,
      tokenType || null
    );
    
    return sendResponse(res, 200, "Session monitoring dashboard retrieved successfully", dashboard);
  } catch (error) {
    console.error("Error getting session monitoring dashboard:", error);
    return sendResponse(res, 500, "Error retrieving session monitoring dashboard", {
      error: error.message
    });
  }
};

/**
 * Get session performance analytics
 */
exports.getSessionPerformanceAnalytics = async (req, res) => {
  try {
    const { gameType, tokenType } = req.params;
    const { days = 7 } = req.query;
    
    const daysInt = parseInt(days);
    if (isNaN(daysInt) || daysInt < 1 || daysInt > 365) {
      return sendResponse(res, 400, "Days parameter must be a number between 1 and 365");
    }
    
    const analytics = await adminSessionConfigService.getSessionPerformanceAnalytics(
      gameType,
      tokenType,
      daysInt
    );
    
    return sendResponse(res, 200, "Session performance analytics retrieved successfully", analytics);
  } catch (error) {
    console.error("Error getting session performance analytics:", error);
    return sendResponse(res, 500, "Error retrieving session performance analytics", {
      error: error.message
    });
  }
};

/**
 * Get available game types and tokens
 */
exports.getAvailableOptions = async (req, res) => {
  try {
    const options = await adminSessionConfigService.getAvailableGameTypesAndTokens();
    
    return sendResponse(res, 200, "Available options retrieved successfully", options);
  } catch (error) {
    console.error("Error getting available options:", error);
    return sendResponse(res, 500, "Error retrieving available options", {
      error: error.message
    });
  }
};

/**
 * Bulk update session configurations
 */
exports.bulkUpdateConfigurations = async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!Array.isArray(updates) || updates.length === 0) {
      return sendResponse(res, 400, "Updates array is required and must not be empty");
    }
    
    // Validate each update
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      if (!update.gameType || !update.tokenType || !update.configuration) {
        return sendResponse(res, 400, `Update at index ${i} is missing required fields: gameType, tokenType, configuration`);
      }
    }
    
    const result = await adminSessionConfigService.bulkUpdateSessionConfigurations(updates);
    
    return sendResponse(res, 200, "Bulk update completed", result);
  } catch (error) {
    console.error("Error bulk updating configurations:", error);
    return sendResponse(res, 500, "Error performing bulk update", {
      error: error.message
    });
  }
};

/**
 * Get real-time session status
 */
exports.getRealTimeSessionStatus = async (req, res) => {
  try {
    const { gameType, tokenType } = req.query;
    
    const dashboard = await adminSessionConfigService.getSessionMonitoringDashboard(
      gameType || null,
      tokenType || null
    );
    
    // Return only the essential real-time data
    const realTimeData = {
      statistics: dashboard.statistics,
      activeSessions: dashboard.activeSessions.map(session => ({
        sessionId: session.sessionId,
        gameType: session.gameType,
        tokenType: session.tokenType,
        utilizationRate: session.utilizationRate,
        isNearLimit: session.isNearLimit,
        isExpired: session.isExpired,
        roundsRemaining: session.roundsRemaining
      })),
      queuedSessions: dashboard.queuedSessions.length,
      activeConnections: dashboard.connections.length,
      lastUpdated: dashboard.lastUpdated
    };
    
    return sendResponse(res, 200, "Real-time session status retrieved successfully", realTimeData);
  } catch (error) {
    console.error("Error getting real-time session status:", error);
    return sendResponse(res, 500, "Error retrieving real-time session status", {
      error: error.message
    });
  }
};