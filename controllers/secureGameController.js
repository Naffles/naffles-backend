const gameSecurityService = require('../services/security/gameSecurityService');
const secureCommunicationService = require('../services/security/secureCommunicationService');
const securityMonitoringService = require('../services/security/securityMonitoringService');
const sendResponse = require('../utils/responseHandler');
const { authenticate } = require('../middleware/authenticate');

/**
 * Secure Game Controller
 * Handles secure game operations with server-side authority
 */
class SecureGameController {
  /**
   * Initialize a secure game session
   */
  async initializeSecureGame(req, res) {
    try {
      const { gameType, tokenType, betAmount, gameConfig = {} } = req.body;
      const playerId = req.user._id;
      const clientId = req.ip + '_' + req.headers['user-agent'];

      // Validate input
      if (!gameType || !tokenType || !betAmount) {
        return sendResponse(res, 400, 'Missing required fields: gameType, tokenType, betAmount');
      }

      // Create secure game session
      const secureSession = await gameSecurityService.createSecureGameSession(
        playerId,
        gameType,
        tokenType,
        betAmount,
        gameConfig
      );

      // Log security event
      await securityMonitoringService.logSecurityEvent({
        eventType: 'secure_game_initialized',
        playerId,
        sessionId: secureSession.sessionId,
        details: { gameType, tokenType, betAmount },
        severity: 'low',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return sendResponse(res, 201, 'Secure game session created', {
        sessionId: secureSession.sessionId,
        gameType: secureSession.gameType,
        signedGameState: secureSession.signedGameState,
        fundLockId: secureSession.fundLockId,
        expiresAt: secureSession.expiresAt
      });
    } catch (error) {
      console.error('Error initializing secure game:', error);
      
      // Log security event for errors
      await securityMonitoringService.logSecurityEvent({
        eventType: 'secure_game_init_error',
        playerId: req.user?._id,
        details: { error: error.message, gameType: req.body.gameType },
        severity: 'medium',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return sendResponse(res, 500, 'Error initializing secure game', {
        error: error.message
      });
    }
  }

  /**
   * Process secure game action
   */
  async processSecureAction(req, res) {
    try {
      const { sessionId } = req.params;
      const { action, actionData = {}, signedGameState } = req.body;
      const playerId = req.user._id;

      if (!sessionId || !action) {
        return sendResponse(res, 400, 'Session ID and action are required');
      }

      // Validate and process action
      const result = await gameSecurityService.validateAndProcessAction(
        sessionId,
        playerId,
        action,
        actionData,
        signedGameState
      );

      // Log action
      await securityMonitoringService.logSecurityEvent({
        eventType: 'secure_game_action',
        playerId,
        sessionId,
        details: { action, actionData, result: result.outcome },
        severity: 'low',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return sendResponse(res, 200, 'Action processed successfully', {
        sessionId: result.sessionId,
        signedGameState: result.signedGameState,
        gameCompleted: result.gameCompleted,
        result: result.result,
        payout: result.payout
      });
    } catch (error) {
      console.error('Error processing secure action:', error);
      
      // Log security event for suspicious activity
      await securityMonitoringService.logSecurityEvent({
        eventType: 'secure_action_error',
        playerId: req.user._id,
        sessionId: req.params.sessionId,
        details: { 
          error: error.message, 
          action: req.body.action,
          suspiciousActivity: error.message.includes('Invalid') || error.message.includes('Tampered')
        },
        severity: error.message.includes('Invalid') ? 'high' : 'medium',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return sendResponse(res, 500, 'Error processing action', {
        error: error.message
      });
    }
  }

  /**
   * Get secure game state
   */
  async getSecureGameState(req, res) {
    try {
      const { sessionId } = req.params;
      const playerId = req.user._id;

      if (!sessionId) {
        return sendResponse(res, 400, 'Session ID is required');
      }

      const gameState = await gameSecurityService.getSecureGameState(sessionId, playerId);

      return sendResponse(res, 200, 'Game state retrieved successfully', {
        sessionId: gameState.sessionId,
        signedGameState: gameState.signedGameState,
        gameStatus: gameState.gameStatus,
        canPerformActions: gameState.canPerformActions
      });
    } catch (error) {
      console.error('Error getting secure game state:', error);
      return sendResponse(res, 500, 'Error retrieving game state', {
        error: error.message
      });
    }
  }

  /**
   * Handle secure iframe communication
   */
  async handleSecureMessage(req, res) {
    try {
      const { message, origin } = req.body;
      const clientId = req.ip + '_' + req.headers['user-agent'];

      if (!message || !origin) {
        return sendResponse(res, 400, 'Message and origin are required');
      }

      // Process secure message
      const result = await secureCommunicationService.processSecureMessage(
        message,
        origin,
        clientId
      );

      if (!result.success) {
        return sendResponse(res, 400, 'Invalid secure message', {
          error: result.error
        });
      }

      return sendResponse(res, 200, 'Message processed successfully', {
        message: result.message,
        rateLimitRemaining: result.rateLimitRemaining
      });
    } catch (error) {
      console.error('Error handling secure message:', error);
      return sendResponse(res, 500, 'Error processing secure message', {
        error: error.message
      });
    }
  }

  /**
   * Establish secure communication channel
   */
  async establishSecureChannel(req, res) {
    try {
      const clientId = req.ip + '_' + req.headers['user-agent'];
      const playerId = req.user._id;

      const channel = await secureCommunicationService.establishSecureChannel(clientId);

      // Log channel establishment
      await securityMonitoringService.logSecurityEvent({
        eventType: 'secure_channel_established',
        playerId,
        clientId,
        details: { channelId: channel.channelId },
        severity: 'low',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return sendResponse(res, 201, 'Secure channel established', channel);
    } catch (error) {
      console.error('Error establishing secure channel:', error);
      return sendResponse(res, 500, 'Error establishing secure channel', {
        error: error.message
      });
    }
  }

  /**
   * Get security status for a player
   */
  async getSecurityStatus(req, res) {
    try {
      const playerId = req.user._id;
      const clientId = req.ip + '_' + req.headers['user-agent'];

      // Get recent security events
      const recentEvents = await securityMonitoringService.getPlayerSecurityEvents(
        playerId,
        24 * 60 * 60 * 1000 // Last 24 hours
      );

      // Get secure channel info
      const channelInfo = secureCommunicationService.getSecureChannel(clientId);

      // Get active game sessions
      const activeSessions = await gameSecurityService.getActiveSecureSessions(playerId);

      return sendResponse(res, 200, 'Security status retrieved', {
        recentEvents: recentEvents.length,
        hasSecureChannel: !!channelInfo,
        activeSessions: activeSessions.length,
        securityLevel: recentEvents.filter(e => e.severity === 'high').length > 0 ? 'high_risk' : 'normal'
      });
    } catch (error) {
      console.error('Error getting security status:', error);
      return sendResponse(res, 500, 'Error retrieving security status', {
        error: error.message
      });
    }
  }

  /**
   * Emergency session termination
   */
  async emergencyTerminate(req, res) {
    try {
      const { sessionId } = req.params;
      const playerId = req.user._id;
      const { reason } = req.body;

      if (!sessionId) {
        return sendResponse(res, 400, 'Session ID is required');
      }

      const result = await gameSecurityService.emergencyTerminateSession(
        sessionId,
        playerId,
        reason || 'Emergency termination requested'
      );

      // Log emergency termination
      await securityMonitoringService.logSecurityEvent({
        eventType: 'emergency_session_termination',
        playerId,
        sessionId,
        details: { reason, result },
        severity: 'high',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return sendResponse(res, 200, 'Session terminated successfully', result);
    } catch (error) {
      console.error('Error terminating session:', error);
      return sendResponse(res, 500, 'Error terminating session', {
        error: error.message
      });
    }
  }
}

module.exports = new SecureGameController();