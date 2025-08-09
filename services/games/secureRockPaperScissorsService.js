const cryptographicService = require('../security/cryptographicService');
const gameSecurityService = require('../security/gameSecurityService');
const securityMonitoringService = require('../security/securityMonitoringService');

/**
 * Secure Rock Paper Scissors Service
 * Server-authoritative RPS with VRF-based computer choice
 */
class SecureRockPaperScissorsService {
  constructor() {
    this.choices = ['rock', 'paper', 'scissors'];
    this.winConditions = {
      rock: 'scissors',
      paper: 'rock',
      scissors: 'paper'
    };
  }

  /**
   * Initialize secure RPS game
   */
  async initializeSecureGame(playerId, betAmount, tokenType, playerChoice) {
    try {
      // Validate player choice
      if (!this.choices.includes(playerChoice)) {
        throw new Error('Invalid choice. Must be "rock", "paper", or "scissors"');
      }

      // Create secure game session
      const session = await gameSecurityService.createSecureGameSession(
        playerId,
        'rock-paper-scissors',
        tokenType,
        betAmount,
        { playerChoice }
      );

      const gameState = {
        gameType: 'rock-paper-scissors',
        gamePhase: 'playing',
        playerChoice,
        computerChoice: null,
        result: null,
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
      console.error('Error initializing secure RPS:', error);
      throw error;
    }
  }

  /**
   * Process RPS result (server-side)
   */
  async processRPSResult(sessionId, playerId, signedGameState) {
    try {
      // Verify game state signature
      if (!cryptographicService.verifySignedGameState(signedGameState)) {
        await securityMonitoringService.logSecurityEvent({
          eventType: 'invalid_game_state',
          playerId,
          sessionId,
          details: { gameType: 'rock-paper-scissors' },
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

      // Generate secure random computer choice using VRF
      const randomIndex = await cryptographicService.generateSecureRandom(0, 2);
      const computerChoice = this.choices[randomIndex];
      
      // Determine game result
      const gameResult = this.determineWinner(serverGameState.playerChoice, computerChoice);
      
      // Update game state
      const updatedGameState = {
        ...serverGameState,
        gamePhase: 'completed',
        computerChoice,
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
        computerChoice,
        payout
      };
    } catch (error) {
      console.error('Error processing secure RPS:', error);
      throw error;
    }
  }

  /**
   * Determine winner based on choices
   */
  determineWinner(playerChoice, computerChoice) {
    if (playerChoice === computerChoice) {
      return 'draw';
    }
    
    if (this.winConditions[playerChoice] === computerChoice) {
      return 'win';
    }
    
    return 'lose';
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
      case 'draw':
        payout = bet; // Return bet only
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

module.exports = new SecureRockPaperScissorsService();