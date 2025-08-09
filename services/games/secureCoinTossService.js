const cryptographicService = require('../security/cryptographicService');
const gameSecurityService = require('../security/gameSecurityService');
const securityMonitoringService = require('../security/securityMonitoringService');

/**
 * Secure Coin Toss Service
 * Server-authoritative coin toss with VRF-based randomness
 */
class SecureCoinTossService {
  /**
   * Initialize secure coin toss game
   */
  async initializeSecureGame(playerId, betAmount, tokenType, playerChoice) {
    try {
      // Validate player choice
      if (!['heads', 'tails'].includes(playerChoice)) {
        throw new Error('Invalid choice. Must be "heads" or "tails"');
      }

      // Create secure game session
      const session = await gameSecurityService.createSecureGameSession(
        playerId,
        'coin-toss',
        tokenType,
        betAmount,
        { playerChoice }
      );

      const gameState = {
        gameType: 'coin-toss',
        gamePhase: 'playing',
        playerChoice,
        result: null,
        coinResult: null,
        betAmount,
        tokenType,
        isAnimating: true
      };

      // Create signed game state
      const signedGameState = cryptographicService.createSignedGameState(gameState);

      // Store secure game state
      await this.storeSecureGameState(session.sessionId, gameState);

      return {
        sessionId: session.sessionId,
        signedGameState,
        gameState
      };
    } catch (error) {
      console.error('Error initializing secure coin toss:', error);
      throw error;
    }
  }

  /**
   * Process coin toss result (server-side)
   */
  async processCoinToss(sessionId, playerId, signedGameState) {
    try {
      // Verify game state signature
      if (!cryptographicService.verifySignedGameState(signedGameState)) {
        await securityMonitoringService.logSecurityEvent({
          eventType: 'invalid_game_state',
          playerId,
          sessionId,
          details: { gameType: 'coin-toss' },
          severity: 'high'
        });
        throw new Error('Invalid game state signature');
      }

      // Get server-side game state
      const serverGameState = await this.getSecureGameState(sessionId);
      if (!serverGameState) {
        throw new Error('Game session not found');
      }

      if (serverGameState.gamePhase !== 'playing') {
        throw new Error('Game is not in playing state');
      }

      // Generate secure random coin result using VRF
      const randomValue = await cryptographicService.generateSecureRandom(0, 1);
      const coinResult = randomValue === 0 ? 'heads' : 'tails';
      
      // Determine game result
      const gameResult = coinResult === serverGameState.playerChoice ? 'win' : 'lose';
      
      // Update game state
      const updatedGameState = {
        ...serverGameState,
        gamePhase: 'completed',
        coinResult,
        result: gameResult,
        isAnimating: false
      };

      // Process payout
      const payout = await this.processPayout(sessionId, playerId, gameResult, updatedGameState.betAmount, updatedGameState.tokenType);
      updatedGameState.payout = payout;

      // Create new signed game state
      const newSignedGameState = cryptographicService.createSignedGameState(updatedGameState);

      // Store updated state
      await this.storeSecureGameState(sessionId, updatedGameState);

      return {
        sessionId,
        signedGameState: newSignedGameState,
        gameCompleted: true,
        result: gameResult,
        coinResult,
        payout
      };
    } catch (error) {
      console.error('Error processing secure coin toss:', error);
      throw error;
    }
  }

  /**
   * Process payout based on game result
   */
  async processPayout(sessionId, playerId, gameResult, betAmount, tokenType) {
    const bet = parseFloat(betAmount);
    let payout = 0;

    switch (gameResult) {
      case 'win':
        payout = bet * 2; // Return bet + winnings (2x multiplier)
        break;
      case 'lose':
        payout = 0; // No payout
        break;
    }

    // Process payout through security service
    if (payout > 0) {
      await gameSecurityService.processPayout(sessionId, playerId, tokenType, payout.toString());
    }

    return payout.toString();
  }

  /**
   * Store secure game state
   */
  async storeSecureGameState(sessionId, gameState) {
    if (!this.gameStates) {
      this.gameStates = new Map();
    }
    this.gameStates.set(sessionId, gameState);
  }

  /**
   * Get secure game state
   */
  async getSecureGameState(sessionId) {
    if (!this.gameStates) {
      return null;
    }
    return this.gameStates.get(sessionId);
  }
}

module.exports = new SecureCoinTossService();