const cryptographicService = require('../security/cryptographicService');
const gameSecurityService = require('../security/gameSecurityService');
const securityMonitoringService = require('../security/securityMonitoringService');

/**
 * Secure Crypto Slots Service
 * Server-authoritative slot machine with VRF-based reel generation
 */
class SecureCryptoSlotsService {
  constructor() {
    // Define slot symbols with their weights (rarity)
    this.symbols = [
      { id: 'bitcoin', name: 'Bitcoin', multiplier: 100, weight: 1 },
      { id: 'ethereum', name: 'Ethereum', multiplier: 50, weight: 2 },
      { id: 'cardano', name: 'Cardano', multiplier: 25, weight: 4 },
      { id: 'solana', name: 'Solana', multiplier: 15, weight: 6 },
      { id: 'polygon', name: 'Polygon', multiplier: 10, weight: 8 },
      { id: 'chainlink', name: 'Chainlink', multiplier: 8, weight: 10 },
      { id: 'uniswap', name: 'Uniswap', multiplier: 5, weight: 15 },
      { id: 'aave', name: 'Aave', multiplier: 3, weight: 20 },
      { id: 'compound', name: 'Compound', multiplier: 2, weight: 25 },
      { id: 'cherry', name: 'Cherry', multiplier: 1.5, weight: 30 }
    ];
    
    this.reelCount = 5;
    this.paylines = [
      [0, 0, 0, 0, 0], // Top row
      [1, 1, 1, 1, 1], // Middle row
      [2, 2, 2, 2, 2], // Bottom row
      [0, 1, 2, 1, 0], // V shape
      [2, 1, 0, 1, 2], // ^ shape
      [0, 0, 1, 2, 2], // Diagonal
      [2, 2, 1, 0, 0], // Diagonal
      [1, 0, 1, 2, 1], // W shape
      [1, 2, 1, 0, 1], // M shape
      [0, 1, 0, 1, 0]  // Zigzag
    ];
  }

  /**
   * Initialize secure crypto slots game
   */
  async initializeSecureGame(playerId, betAmount, tokenType, selectedPaylines = [0, 1, 2]) {
    try {
      // Validate paylines
      if (!Array.isArray(selectedPaylines) || selectedPaylines.length === 0) {
        throw new Error('At least one payline must be selected');
      }
      
      if (selectedPaylines.some(line => line < 0 || line >= this.paylines.length)) {
        throw new Error('Invalid payline selection');
      }

      // Calculate total bet (bet per line * number of lines)
      const totalBet = (parseFloat(betAmount) * selectedPaylines.length).toString();

      // Create secure game session
      const session = await gameSecurityService.createSecureGameSession(
        playerId,
        'crypto-slots',
        tokenType,
        totalBet,
        { selectedPaylines, betPerLine: betAmount }
      );

      const gameState = {
        gameType: 'crypto-slots',
        gamePhase: 'playing',
        betAmount: totalBet,
        betPerLine: betAmount,
        tokenType,
        selectedPaylines,
        reels: null,
        winningLines: [],
        totalWin: '0',
        isSpinning: true
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
      console.error('Error initializing secure crypto slots:', error);
      throw error;
    }
  }

  /**
   * Process slot spin (server-side)
   */
  async processSlotSpin(sessionId, playerId, signedGameState) {
    try {
      // Verify game state signature
      if (!cryptographicService.verifySignedGameState(signedGameState)) {
        await securityMonitoringService.logSecurityEvent({
          eventType: 'invalid_game_state',
          playerId,
          sessionId,
          details: { gameType: 'crypto-slots' },
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

      // Generate secure random reels using VRF
      const reels = await this.generateSecureReels();
      
      // Calculate winnings
      const winResult = this.calculateWinnings(reels, serverGameState.selectedPaylines, parseFloat(serverGameState.betPerLine));
      
      // Update game state
      const updatedGameState = {
        ...serverGameState,
        gamePhase: 'completed',
        reels,
        winningLines: winResult.winningLines,
        totalWin: winResult.totalWin.toString(),
        isSpinning: false
      };

      // Process payout
      const payout = await this.processPayout(sessionId, playerId, winResult.totalWin, updatedGameState.tokenType);
      updatedGameState.payout = payout;

      // Create new signed game state
      const newSignedGameState = cryptographicService.createSignedGameState(updatedGameState);

      // Store updated state
      await this.storeSecureGameState(sessionId, updatedGameState);

      return {
        sessionId,
        signedGameState: newSignedGameState,
        gameCompleted: true,
        reels,
        winningLines: winResult.winningLines,
        totalWin: winResult.totalWin.toString(),
        payout
      };
    } catch (error) {
      console.error('Error processing secure slot spin:', error);
      throw error;
    }
  }

  /**
   * Generate secure random reels using VRF
   */
  async generateSecureReels() {
    const reels = [];
    
    // Create weighted symbol array
    const weightedSymbols = [];
    for (const symbol of this.symbols) {
      for (let i = 0; i < symbol.weight; i++) {
        weightedSymbols.push(symbol);
      }
    }

    // Generate 5 reels with 3 symbols each
    for (let reel = 0; reel < this.reelCount; reel++) {
      const reelSymbols = [];
      for (let position = 0; position < 3; position++) {
        const randomIndex = await cryptographicService.generateSecureRandom(0, weightedSymbols.length - 1);
        reelSymbols.push(weightedSymbols[randomIndex]);
      }
      reels.push(reelSymbols);
    }

    return reels;
  }

  /**
   * Calculate winnings based on paylines
   */
  calculateWinnings(reels, selectedPaylines, betPerLine) {
    let totalWin = 0;
    const winningLines = [];

    for (const paylineIndex of selectedPaylines) {
      const payline = this.paylines[paylineIndex];
      const lineSymbols = [];
      
      // Get symbols for this payline
      for (let reelIndex = 0; reelIndex < this.reelCount; reelIndex++) {
        const symbolPosition = payline[reelIndex];
        lineSymbols.push(reels[reelIndex][symbolPosition]);
      }

      // Check for winning combinations
      const winResult = this.checkLineWin(lineSymbols, betPerLine);
      if (winResult.isWin) {
        totalWin += winResult.winAmount;
        winningLines.push({
          paylineIndex,
          symbols: lineSymbols,
          winAmount: winResult.winAmount,
          matchCount: winResult.matchCount,
          matchingSymbol: winResult.matchingSymbol
        });
      }
    }

    return { totalWin, winningLines };
  }

  /**
   * Check if a payline has winning combinations
   */
  checkLineWin(lineSymbols, betPerLine) {
    // Check for consecutive matching symbols from left to right
    const firstSymbol = lineSymbols[0];
    let matchCount = 1;
    
    for (let i = 1; i < lineSymbols.length; i++) {
      if (lineSymbols[i].id === firstSymbol.id) {
        matchCount++;
      } else {
        break;
      }
    }

    // Minimum 3 matching symbols for a win
    if (matchCount >= 3) {
      // Calculate win amount based on symbol multiplier and match count
      let multiplier = firstSymbol.multiplier;
      
      // Bonus for 4 or 5 matches
      if (matchCount === 4) {
        multiplier *= 2;
      } else if (matchCount === 5) {
        multiplier *= 5;
      }
      
      const winAmount = betPerLine * multiplier;
      
      return {
        isWin: true,
        winAmount,
        matchCount,
        matchingSymbol: firstSymbol
      };
    }

    return { isWin: false, winAmount: 0, matchCount: 0 };
  }

  /**
   * Process payout based on winnings
   */
  async processPayout(sessionId, playerId, totalWin, tokenType) {
    if (totalWin > 0) {
      await gameSecurityService.processPayout(sessionId, playerId, tokenType, totalWin.toString());
      return totalWin.toString();
    }
    return '0';
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

  /**
   * Get symbol information
   */
  getSymbolInfo() {
    return this.symbols.map(symbol => ({
      id: symbol.id,
      name: symbol.name,
      multiplier: symbol.multiplier
    }));
  }

  /**
   * Get payline information
   */
  getPaylineInfo() {
    return this.paylines.map((payline, index) => ({
      index,
      pattern: payline
    }));
  }
}

module.exports = new SecureCryptoSlotsService();