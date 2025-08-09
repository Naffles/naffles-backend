const express = require("express");
const router = express.Router();
const adminSessionConfigService = require("../services/adminSessionConfigService");
const { authenticate } = require("../middleware/authenticate");
const { requireRole } = require("../middleware/roleMiddleware");

// Middleware to ensure admin access
router.use(authenticate);
router.use(requireRole(['admin', 'super']));

/**
 * Get session configuration for a specific game type and token
 */
router.get("/config/:gameType/:tokenType", async (req, res) => {
  try {
    const { gameType, tokenType } = req.params;
    
    const config = await adminSessionConfigService.getSessionConfiguration(gameType, tokenType);
    
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error("Error getting session configuration:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update session configuration for a specific game type and token
 */
router.put("/config/:gameType/:tokenType", async (req, res) => {
  try {
    const { gameType, tokenType } = req.params;
    const configuration = req.body;
    
    const result = await adminSessionConfigService.updateSessionConfiguration(
      gameType, 
      tokenType, 
      configuration
    );
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Error updating session configuration:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Calculate minimum funding requirements
 */
router.post("/funding-calculator", async (req, res) => {
  try {
    const { gameType, tokenType, maxPayout, configuration } = req.body;
    
    if (!gameType || !tokenType || !maxPayout) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: gameType, tokenType, maxPayout"
      });
    }
    
    const calculation = adminSessionConfigService.calculateMinimumFunding(
      gameType,
      tokenType,
      maxPayout,
      configuration || {}
    );
    
    res.json({
      success: true,
      data: calculation
    });
  } catch (error) {
    console.error("Error calculating minimum funding:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get session monitoring dashboard
 */
router.get("/dashboard", async (req, res) => {
  try {
    const { gameType, tokenType } = req.query;
    
    const dashboard = await adminSessionConfigService.getSessionMonitoringDashboard(
      gameType || null,
      tokenType || null
    );
    
    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    console.error("Error getting session monitoring dashboard:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get session performance analytics
 */
router.get("/analytics/:gameType/:tokenType", async (req, res) => {
  try {
    const { gameType, tokenType } = req.params;
    const { days = 7 } = req.query;
    
    const analytics = await adminSessionConfigService.getSessionPerformanceAnalytics(
      gameType,
      tokenType,
      parseInt(days)
    );
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error("Error getting session performance analytics:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get available game types and tokens
 */
router.get("/options", async (req, res) => {
  try {
    const options = await adminSessionConfigService.getAvailableGameTypesAndTokens();
    
    res.json({
      success: true,
      data: options
    });
  } catch (error) {
    console.error("Error getting available options:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Bulk update session configurations
 */
router.post("/config/bulk-update", async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Updates array is required and must not be empty"
      });
    }
    
    const result = await adminSessionConfigService.bulkUpdateSessionConfigurations(updates);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Error bulk updating configurations:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get real-time session status
 */
router.get("/sessions/status", async (req, res) => {
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
    
    res.json({
      success: true,
      data: realTimeData
    });
  } catch (error) {
    console.error("Error getting real-time session status:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;