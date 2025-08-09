const vrfWrapper = require('../vrfWrapper');

/**
 * Rock Paper Scissors Game Service
 * Implements PvP mechanics with 30-second timers and house moves
 */
class RockPaperScissorsService {
  constructor() {
    this.moves = ['rock', 'paper', 'scissors'];
    this.moveTimeout = 30000; // 30 seconds in milliseconds
    this.gameTimeout = 180000; // 3 minutes total game timeout
  }

  /**
   * Initialize a new Rock Paper Scissors game
   * @param {string} playerId - Player ID
   * @param {string} betAmount - Bet amount
   * @param {string} gameMode - 'pvp' or 'house'
   * @returns {Object} Initial game state
   */
  async initializeGame(playerId, betAmount, gameMode = 'house') {
    const gameState = {
      gameMode,
      playerMove: null,
      opponentMove: null,
      gamePhase: 'waiting_for_player_move',
      round: 1,
      maxRounds: 1, // Can be configured for best-of-3, etc.
      playerScore: 0,
      opponentScore: 0,
      moveDeadline: new Date(Date.now() + this.moveTimeout),
      gameDeadline: new Date(Date.now() + this.gameTimeout),
      vrfRequestId: null,
      actions: ['rock', 'paper', 'scissors'],
      timeRemaining: this.moveTimeout
    };

    // For PvP mode, we'd need opponent matching logic
    if (gameMode === 'pvp') {
      gameState.gamePhase = 'waiting_for_opponent';
      gameState.actions = [];
    }

    return gameState;
  }

  /**
   * Process player move
   * @param {Object} gameState - Current game state
   * @param {string} move - Player move ('rock', 'paper', or 'scissors')
   * @returns {Object} Updated game state
   */
  async processPlayerMove(gameState, move) {
    if (!this.moves.includes(move)) {
      throw new Error('Invalid move. Must be rock, paper, or scissors');
    }

    if (gameState.gamePhase !== 'waiting_for_player_move') {
      throw new Error('Game is not waiting for player move');
    }

    if (new Date() > gameState.moveDeadline) {
      throw new Error('Move deadline exceeded');
    }

    // Record player move
    gameState.playerMove = move;
    gameState.gamePhase = 'processing_moves';

    // Generate opponent move based on game mode
    if (gameState.gameMode === 'house') {
      gameState.opponentMove = await this.generateHouseMove();
    } else {
      // For PvP, we'd wait for the other player's move
      gameState.gamePhase = 'waiting_for_opponent_move';
      gameState.moveDeadline = new Date(Date.now() + this.moveTimeout);
    }

    // If we have both moves, determine winner
    if (gameState.playerMove && gameState.opponentMove) {
      await this.resolveRound(gameState);
    }

    return gameState;
  }

  /**
   * Generate house move using VRF for fairness
   * @returns {string} House move
   */
  async generateHouseMove() {
    // Request VRF randomness for fair house move
    const vrfRequest = await vrfWrapper.requestRandomness();
    
    // Use VRF with failsafe to select house move
    return await vrfWrapper.rockPaperScissorsChoice();
  }

  /**
   * Process opponent move (for PvP mode)
   * @param {Object} gameState - Current game state
   * @param {string} move - Opponent move
   * @param {string} opponentId - Opponent player ID
   * @returns {Object} Updated game state
   */
  async processOpponentMove(gameState, move, opponentId) {
    if (!this.moves.includes(move)) {
      throw new Error('Invalid opponent move');
    }

    if (gameState.gamePhase !== 'waiting_for_opponent_move') {
      throw new Error('Game is not waiting for opponent move');
    }

    if (new Date() > gameState.moveDeadline) {
      // Opponent timed out, player wins by default
      gameState.opponentMove = null;
      gameState.gamePhase = 'timeout';
      return gameState;
    }

    gameState.opponentMove = move;
    gameState.opponentId = opponentId;

    // Resolve the round
    await this.resolveRound(gameState);

    return gameState;
  }

  /**
   * Resolve a round and determine winner
   * @param {Object} gameState - Current game state
   * @returns {Object} Updated game state
   */
  async resolveRound(gameState) {
    const playerMove = gameState.playerMove;
    const opponentMove = gameState.opponentMove;

    // Determine round winner
    const roundResult = this.determineRoundWinner(playerMove, opponentMove);
    
    // Update scores
    if (roundResult === 'player') {
      gameState.playerScore++;
    } else if (roundResult === 'opponent') {
      gameState.opponentScore++;
    }
    // Draw doesn't change scores

    // Check if game is complete
    if (gameState.round >= gameState.maxRounds) {
      gameState.gamePhase = 'completed';
      gameState.actions = [];
    } else {
      // Prepare for next round
      gameState.round++;
      gameState.playerMove = null;
      gameState.opponentMove = null;
      gameState.gamePhase = 'waiting_for_player_move';
      gameState.moveDeadline = new Date(Date.now() + this.moveTimeout);
      gameState.actions = ['rock', 'paper', 'scissors'];
    }

    gameState.lastRoundResult = {
      playerMove,
      opponentMove,
      winner: roundResult,
      explanation: this.getResultExplanation(playerMove, opponentMove, roundResult)
    };

    return gameState;
  }

  /**
   * Determine winner of a single round
   * @param {string} playerMove - Player's move
   * @param {string} opponentMove - Opponent's move
   * @returns {string} 'player', 'opponent', or 'draw'
   */
  determineRoundWinner(playerMove, opponentMove) {
    if (playerMove === opponentMove) {
      return 'draw';
    }

    const winConditions = {
      'rock': 'scissors',
      'paper': 'rock',
      'scissors': 'paper'
    };

    return winConditions[playerMove] === opponentMove ? 'player' : 'opponent';
  }

  /**
   * Get explanation for round result
   * @param {string} playerMove - Player's move
   * @param {string} opponentMove - Opponent's move
   * @param {string} winner - Round winner
   * @returns {string} Result explanation
   */
  getResultExplanation(playerMove, opponentMove, winner) {
    if (winner === 'draw') {
      return `Both played ${playerMove}. It's a draw!`;
    }

    const explanations = {
      'rock-scissors': 'Rock crushes scissors',
      'paper-rock': 'Paper covers rock',
      'scissors-paper': 'Scissors cuts paper'
    };

    const winningCombo = winner === 'player' ? 
      `${playerMove}-${opponentMove}` : 
      `${opponentMove}-${playerMove}`;

    const explanation = explanations[winningCombo] || 'Unknown combination';
    const winnerName = winner === 'player' ? 'You' : 'Opponent';
    
    return `${explanation}. ${winnerName} win${winner === 'player' ? '' : 's'}!`;
  }

  /**
   * Handle move timeout
   * @param {Object} gameState - Current game state
   * @returns {Object} Updated game state
   */
  handleMoveTimeout(gameState) {
    if (gameState.gamePhase === 'waiting_for_player_move') {
      // Player timed out, they lose
      gameState.gamePhase = 'timeout';
      gameState.playerMove = null;
      gameState.opponentScore = gameState.maxRounds; // Opponent wins
    } else if (gameState.gamePhase === 'waiting_for_opponent_move') {
      // Opponent timed out, player wins
      gameState.gamePhase = 'timeout';
      gameState.opponentMove = null;
      gameState.playerScore = gameState.maxRounds; // Player wins
    }

    gameState.actions = [];
    return gameState;
  }

  /**
   * Determine final game outcome and calculate payouts
   * @param {Object} gameState - Final game state
   * @param {string} betAmount - Original bet amount
   * @returns {Object} Game result with payouts
   */
  determineOutcome(gameState, betAmount) {
    const bet = BigInt(betAmount);
    let winner, playerPayout, housePayout;

    // Handle timeout scenarios
    if (gameState.gamePhase === 'timeout') {
      if (gameState.playerScore > gameState.opponentScore) {
        winner = 'player';
        playerPayout = (bet * BigInt(2)).toString();
        housePayout = '0';
      } else {
        winner = 'house';
        playerPayout = '0';
        housePayout = betAmount;
      }
    } else {
      // Normal game completion
      if (gameState.playerScore > gameState.opponentScore) {
        winner = 'player';
        playerPayout = (bet * BigInt(2)).toString(); // 2x payout (1:1 odds)
        housePayout = '0';
      } else if (gameState.playerScore < gameState.opponentScore) {
        winner = 'house';
        playerPayout = '0';
        housePayout = betAmount;
      } else {
        // Draw - return bet
        winner = 'draw';
        playerPayout = betAmount;
        housePayout = '0';
      }
    }

    return {
      winner,
      playerPayout,
      housePayout,
      gameData: {
        finalScore: {
          player: gameState.playerScore,
          opponent: gameState.opponentScore
        },
        rounds: gameState.round,
        gameMode: gameState.gameMode,
        lastRoundResult: gameState.lastRoundResult,
        timedOut: gameState.gamePhase === 'timeout',
        vrfRequestId: gameState.vrfRequestId
      }
    };
  }

  /**
   * Get game display information for UI
   * @param {Object} gameState - Current game state
   * @returns {Object} Display information
   */
  getDisplayInfo(gameState) {
    const timeRemaining = gameState.moveDeadline ? 
      Math.max(0, gameState.moveDeadline.getTime() - Date.now()) : 0;

    return {
      gamePhase: gameState.gamePhase,
      gameMode: gameState.gameMode,
      playerMove: gameState.playerMove,
      opponentMove: gameState.opponentMove,
      playerScore: gameState.playerScore,
      opponentScore: gameState.opponentScore,
      round: gameState.round,
      maxRounds: gameState.maxRounds,
      actions: gameState.actions,
      timeRemaining: Math.floor(timeRemaining / 1000), // Convert to seconds
      lastRoundResult: gameState.lastRoundResult,
      showMoves: gameState.gamePhase === 'completed' || gameState.gamePhase === 'timeout'
    };
  }

  /**
   * Check if game has expired
   * @param {Object} gameState - Game state to check
   * @returns {boolean} Is expired
   */
  isGameExpired(gameState) {
    return new Date() > gameState.gameDeadline;
  }

  /**
   * Get remaining time for current move
   * @param {Object} gameState - Current game state
   * @returns {number} Remaining time in milliseconds
   */
  getRemainingMoveTime(gameState) {
    if (!gameState.moveDeadline) return 0;
    return Math.max(0, gameState.moveDeadline.getTime() - Date.now());
  }

  /**
   * Validate move input
   * @param {string} move - Move to validate
   * @returns {boolean} Is valid move
   */
  isValidMove(move) {
    return this.moves.includes(move);
  }

  /**
   * Get game statistics for analytics
   * @param {Object} gameState - Final game state
   * @returns {Object} Game statistics
   */
  getGameStats(gameState) {
    return {
      gameType: 'rockPaperScissors',
      gameMode: gameState.gameMode,
      rounds: gameState.round,
      playerScore: gameState.playerScore,
      opponentScore: gameState.opponentScore,
      winner: gameState.playerScore > gameState.opponentScore ? 'player' : 
              gameState.playerScore < gameState.opponentScore ? 'opponent' : 'draw',
      timedOut: gameState.gamePhase === 'timeout',
      vrfUsed: !!gameState.vrfRequestId
    };
  }
}

module.exports = new RockPaperScissorsService();