const HouseSlot = require("../models/game/houseSlot");
const GameSession = require("../models/game/gameSession");
const redisClient = require("../config/redisClient");

class ConnectionMonitorService {
  constructor() {
    this.heartbeatInterval = 5000; // 5 seconds
    this.disconnectionTimeout = 15000; // 15 seconds
    this.activeConnections = new Map(); // sessionId -> connection info
    this.heartbeatTimers = new Map(); // sessionId -> timer
    this.cleanupInterval = null;
  }

  /**
   * Initialize connection monitoring system
   */
  initialize() {
    console.log("Initializing connection monitoring service...");
    
    // Start periodic cleanup of expired sessions
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 30000); // Every 30 seconds

    console.log("Connection monitoring service initialized");
  }

  /**
   * Register a new session connection
   * @param {string} sessionId - Session ID
   * @param {string} playerId - Player ID
   * @param {Object} socketInfo - Socket connection information
   */
  registerConnection(sessionId, playerId, socketInfo) {
    try {
      const connectionInfo = {
        sessionId,
        playerId,
        socketId: socketInfo.id,
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isActive: true,
        disconnectedAt: null,
        recoveryAttempts: 0
      };

      this.activeConnections.set(sessionId, connectionInfo);
      this.startHeartbeatMonitoring(sessionId);

      // Store in Redis for persistence
      this.storeConnectionInRedis(sessionId, connectionInfo);

      console.log(`Connection registered for session ${sessionId}, player ${playerId}`);
      return connectionInfo;
    } catch (error) {
      console.error("Error registering connection:", error);
      throw error;
    }
  }

  /**
   * Update heartbeat for a session
   * @param {string} sessionId - Session ID
   * @param {Object} heartbeatData - Heartbeat data
   */
  updateHeartbeat(sessionId, heartbeatData = {}) {
    try {
      const connection = this.activeConnections.get(sessionId);
      if (!connection) {
        console.warn(`No active connection found for session ${sessionId}`);
        return false;
      }

      connection.lastHeartbeat = new Date();
      connection.isActive = true;
      connection.heartbeatData = heartbeatData;

      // Reset heartbeat timer
      this.resetHeartbeatTimer(sessionId);

      // Update Redis
      this.storeConnectionInRedis(sessionId, connection);

      return true;
    } catch (error) {
      console.error("Error updating heartbeat:", error);
      return false;
    }
  }

  /**
   * Handle connection disconnection
   * @param {string} sessionId - Session ID
   * @param {string} reason - Disconnection reason
   */
  handleDisconnection(sessionId, reason = "unknown") {
    try {
      const connection = this.activeConnections.get(sessionId);
      if (!connection) {
        console.warn(`No connection found for disconnected session ${sessionId}`);
        return;
      }

      connection.isActive = false;
      connection.disconnectedAt = new Date();
      connection.disconnectionReason = reason;

      console.log(`Connection disconnected for session ${sessionId}, reason: ${reason}`);

      // Start disconnection timeout
      this.startDisconnectionTimeout(sessionId);

      // Update Redis
      this.storeConnectionInRedis(sessionId, connection);
    } catch (error) {
      console.error("Error handling disconnection:", error);
    }
  }

  /**
   * Attempt session recovery for reconnection
   * @param {string} sessionId - Session ID
   * @param {string} playerId - Player ID
   * @param {Object} socketInfo - New socket information
   * @returns {Object} Recovery result
   */
  async attemptSessionRecovery(sessionId, playerId, socketInfo) {
    try {
      // Check if session exists in memory or Redis
      let connection = this.activeConnections.get(sessionId);
      if (!connection) {
        connection = await this.getConnectionFromRedis(sessionId);
      }

      if (!connection) {
        throw new Error("Session not found for recovery");
      }

      if (connection.playerId !== playerId) {
        throw new Error("Player ID mismatch for session recovery");
      }

      // Check if session is still within recovery window
      const timeSinceDisconnection = Date.now() - new Date(connection.disconnectedAt).getTime();
      if (timeSinceDisconnection > this.disconnectionTimeout) {
        throw new Error("Session recovery window expired");
      }

      // Verify house slot session is still valid
      const houseSlot = await HouseSlot.findOne({ currentSessionId: sessionId });
      if (!houseSlot || houseSlot.isSessionExpired()) {
        throw new Error("House slot session expired or not found");
      }

      // Update connection info for recovery
      connection.socketId = socketInfo.id;
      connection.isActive = true;
      connection.recoveredAt = new Date();
      connection.recoveryAttempts += 1;
      connection.disconnectedAt = null;

      this.activeConnections.set(sessionId, connection);
      this.startHeartbeatMonitoring(sessionId);

      // Update Redis
      this.storeConnectionInRedis(sessionId, connection);

      console.log(`Session ${sessionId} recovered successfully for player ${playerId}`);

      return {
        success: true,
        sessionId,
        recoveredAt: connection.recoveredAt,
        recoveryAttempts: connection.recoveryAttempts,
        sessionState: {
          roundsUsed: houseSlot.sessionRoundsUsed,
          roundsRemaining: houseSlot.roundsPerSession - houseSlot.sessionRoundsUsed,
          sessionExpiresAt: houseSlot.sessionExpiresAt
        }
      };
    } catch (error) {
      console.error("Error attempting session recovery:", error);
      return {
        success: false,
        error: error.message,
        sessionId
      };
    }
  }

  /**
   * Start heartbeat monitoring for a session
   * @param {string} sessionId - Session ID
   */
  startHeartbeatMonitoring(sessionId) {
    // Clear existing timer if any
    this.clearHeartbeatTimer(sessionId);

    const timer = setTimeout(() => {
      this.handleMissedHeartbeat(sessionId);
    }, this.heartbeatInterval * 2); // Allow 2 heartbeat intervals

    this.heartbeatTimers.set(sessionId, timer);
  }

  /**
   * Reset heartbeat timer for a session
   * @param {string} sessionId - Session ID
   */
  resetHeartbeatTimer(sessionId) {
    this.clearHeartbeatTimer(sessionId);
    this.startHeartbeatMonitoring(sessionId);
  }

  /**
   * Clear heartbeat timer for a session
   * @param {string} sessionId - Session ID
   */
  clearHeartbeatTimer(sessionId) {
    const timer = this.heartbeatTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.heartbeatTimers.delete(sessionId);
    }
  }

  /**
   * Handle missed heartbeat
   * @param {string} sessionId - Session ID
   */
  handleMissedHeartbeat(sessionId) {
    console.warn(`Missed heartbeat for session ${sessionId}`);
    this.handleDisconnection(sessionId, "missed_heartbeat");
  }

  /**
   * Start disconnection timeout
   * @param {string} sessionId - Session ID
   */
  startDisconnectionTimeout(sessionId) {
    setTimeout(async () => {
      await this.handleSessionTimeout(sessionId);
    }, this.disconnectionTimeout);
  }

  /**
   * Handle session timeout and cleanup
   * @param {string} sessionId - Session ID
   */
  async handleSessionTimeout(sessionId) {
    try {
      const connection = this.activeConnections.get(sessionId);
      if (!connection || connection.isActive) {
        // Session was recovered or is still active
        return;
      }

      console.log(`Session ${sessionId} timed out, performing cleanup`);

      // Release house slot
      const houseSlot = await HouseSlot.findOne({ currentSessionId: sessionId });
      if (houseSlot) {
        houseSlot.releaseFromSession();
        await houseSlot.save();
        console.log(`Released house slot ${houseSlot._id} for timed out session ${sessionId}`);
      }

      // Update game session status
      const gameSession = await GameSession.findById(sessionId);
      if (gameSession && gameSession.status === "in_progress") {
        gameSession.status = "timeout";
        gameSession.completedAt = new Date();
        await gameSession.save();
      }

      // Clean up connection tracking
      this.cleanupConnection(sessionId);

      console.log(`Session ${sessionId} cleanup completed`);
    } catch (error) {
      console.error("Error handling session timeout:", error);
    }
  }

  /**
   * Clean up connection tracking
   * @param {string} sessionId - Session ID
   */
  cleanupConnection(sessionId) {
    this.activeConnections.delete(sessionId);
    this.clearHeartbeatTimer(sessionId);
    this.removeConnectionFromRedis(sessionId);
  }

  /**
   * Get connection status for a session
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Connection status
   */
  getConnectionStatus(sessionId) {
    const connection = this.activeConnections.get(sessionId);
    if (!connection) {
      return null;
    }

    return {
      sessionId: connection.sessionId,
      playerId: connection.playerId,
      isActive: connection.isActive,
      connectedAt: connection.connectedAt,
      lastHeartbeat: connection.lastHeartbeat,
      disconnectedAt: connection.disconnectedAt,
      recoveryAttempts: connection.recoveryAttempts,
      timeSinceLastHeartbeat: Date.now() - new Date(connection.lastHeartbeat).getTime()
    };
  }

  /**
   * Get all active connections
   * @returns {Array} Array of active connections
   */
  getAllActiveConnections() {
    return Array.from(this.activeConnections.values())
      .filter(conn => conn.isActive)
      .map(conn => this.getConnectionStatus(conn.sessionId));
  }

  /**
   * Periodic cleanup of expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      const now = Date.now();
      const expiredSessions = [];

      for (const [sessionId, connection] of this.activeConnections.entries()) {
        if (!connection.isActive && connection.disconnectedAt) {
          const timeSinceDisconnection = now - new Date(connection.disconnectedAt).getTime();
          if (timeSinceDisconnection > this.disconnectionTimeout) {
            expiredSessions.push(sessionId);
          }
        }
      }

      for (const sessionId of expiredSessions) {
        await this.handleSessionTimeout(sessionId);
      }

      if (expiredSessions.length > 0) {
        console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
      }
    } catch (error) {
      console.error("Error during periodic cleanup:", error);
    }
  }

  /**
   * Store connection info in Redis for persistence
   * @param {string} sessionId - Session ID
   * @param {Object} connectionInfo - Connection information
   */
  async storeConnectionInRedis(sessionId, connectionInfo) {
    try {
      const key = `session_connection:${sessionId}`;
      await redisClient.setex(key, 3600, JSON.stringify(connectionInfo)); // 1 hour TTL
    } catch (error) {
      console.error("Error storing connection in Redis:", error);
    }
  }

  /**
   * Get connection info from Redis
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Connection information
   */
  async getConnectionFromRedis(sessionId) {
    try {
      const key = `session_connection:${sessionId}`;
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Error getting connection from Redis:", error);
      return null;
    }
  }

  /**
   * Remove connection info from Redis
   * @param {string} sessionId - Session ID
   */
  async removeConnectionFromRedis(sessionId) {
    try {
      const key = `session_connection:${sessionId}`;
      await redisClient.del(key);
    } catch (error) {
      console.error("Error removing connection from Redis:", error);
    }
  }

  /**
   * Shutdown connection monitoring service
   */
  shutdown() {
    console.log("Shutting down connection monitoring service...");
    
    // Clear all timers
    for (const timer of this.heartbeatTimers.values()) {
      clearTimeout(timer);
    }
    this.heartbeatTimers.clear();

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Clear active connections
    this.activeConnections.clear();

    console.log("Connection monitoring service shut down");
  }
}

module.exports = new ConnectionMonitorService();