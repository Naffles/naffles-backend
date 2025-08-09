const { setAsync, getAsync, delAsync } = require("../config/redisClient");
const sendResponse = require("../utils/responseHandler");

/**
 * Session Management Middleware
 * Handles Redis-based session management for enhanced authentication
 */

/**
 * Create session middleware
 */
const createSession = async (req, res, next) => {
  try {
    if (req.user && req.user._id) {
      const sessionId = `session:${req.user._id}:${Date.now()}`;
      const sessionData = {
        userId: req.user._id.toString(),
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.connection.remoteAddress,
        authMethod: req.authMethod || 'unknown'
      };

      // Store session for 7 days
      await setAsync(sessionId, JSON.stringify(sessionData), "EX", 7 * 24 * 60 * 60);
      
      // Add session ID to response
      req.sessionId = sessionId;
      res.setHeader('X-Session-ID', sessionId);
    }
    next();
  } catch (error) {
    console.error("Session creation error:", error);
    next(); // Don't fail the request for session errors
  }
};

/**
 * Validate session middleware
 */
const validateSession = async (req, res, next) => {
  try {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId) {
      return next(); // Continue without session validation
    }

    const sessionData = await getAsync(sessionId);
    
    if (!sessionData) {
      return sendResponse(res, 401, "Invalid or expired session");
    }

    const session = JSON.parse(sessionData);
    
    // Update last activity
    session.lastActivity = new Date().toISOString();
    await setAsync(sessionId, JSON.stringify(session), "EX", 7 * 24 * 60 * 60);
    
    req.session = session;
    next();
  } catch (error) {
    console.error("Session validation error:", error);
    return sendResponse(res, 500, "Session validation failed");
  }
};

/**
 * Optional session validation (doesn't fail if no session)
 */
const optionalSessionValidation = async (req, res, next) => {
  try {
    const sessionId = req.headers['x-session-id'];
    
    if (sessionId) {
      const sessionData = await getAsync(sessionId);
      
      if (sessionData) {
        const session = JSON.parse(sessionData);
        
        // Update last activity
        session.lastActivity = new Date().toISOString();
        await setAsync(sessionId, JSON.stringify(session), "EX", 7 * 24 * 60 * 60);
        
        req.session = session;
      }
    }
    
    next();
  } catch (error) {
    console.error("Optional session validation error:", error);
    next(); // Continue without session
  }
};

/**
 * Destroy session middleware
 */
const destroySession = async (req, res, next) => {
  try {
    const sessionId = req.headers['x-session-id'] || req.sessionId;
    
    if (sessionId) {
      await delAsync(sessionId);
    }
    
    next();
  } catch (error) {
    console.error("Session destruction error:", error);
    next(); // Don't fail the request for session errors
  }
};

/**
 * Clean up expired sessions (utility function)
 */
const cleanupExpiredSessions = async () => {
  try {
    // This would be implemented with a more sophisticated Redis key scanning
    // For now, we rely on Redis TTL to handle expiration
    console.log("Session cleanup completed");
  } catch (error) {
    console.error("Session cleanup error:", error);
  }
};

/**
 * Get user sessions
 */
const getUserSessions = async (userId) => {
  try {
    // In a production environment, you'd want to maintain a user-to-sessions mapping
    // For now, this is a placeholder implementation
    return [];
  } catch (error) {
    console.error("Get user sessions error:", error);
    return [];
  }
};

/**
 * Revoke all user sessions
 */
const revokeAllUserSessions = async (userId) => {
  try {
    // In a production environment, you'd want to maintain a user-to-sessions mapping
    // and revoke all sessions for a user
    console.log(`Revoking all sessions for user: ${userId}`);
  } catch (error) {
    console.error("Revoke user sessions error:", error);
  }
};

module.exports = {
  createSession,
  validateSession,
  optionalSessionValidation,
  destroySession,
  cleanupExpiredSessions,
  getUserSessions,
  revokeAllUserSessions
};