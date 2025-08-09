const vrfWrapper = require('../vrfWrapper');

/**
 * Coin Toss Game Service
 * Implements fair coin toss with multiple animation outcomes
 */
class CoinTossService {
  constructor() {
    this.animationOutcomes = [
      'heads_quick',
      'heads_slow',
      'heads_dramatic',
      'tails_quick', 
      'tails_slow',
      'tails_dramatic',
      'edge_bounce_heads', // Rare edge case
      'edge_bounce_tails'  // Rare edge case
    ];
  }

  /**
   * Initialize a new coin toss game
   * @param {string} playerId - Player ID
   * @param {string} betAmount - Bet amount
   * @returns {Object} Initial game state
   */
  async initializeGame(playerId, betAmount) {
    return {
      playerChoice: null,
      coinResult: null,
      animationType: null,
      gamePhase: 'waiting_for_choice',
      vrfRequestId: null,
      actions: ['choose_heads', 'choose_tails']
    };
  }

  /**
   * Process player choice and execute coin toss
   * @param {Object} gameState - Current game state
   * @param {string} choice - Player choice ('heads' or 'tails')
   * @returns {Object} Updated game state with results
   */
  async processChoice(gameState, choice) {
    if (!['heads', 'tails'].includes(choice)) {
      throw new Error('Invalid choice. Must be "heads" or "tails"');
    }

    if (gameState.gamePhase !== 'waiting_for_choice') {
      throw new Error('Game is not waiting for player choice');
    }

    // Record player choice
    gameState.playerChoice = choice;
    gameState.gamePhase = 'flipping';

    // Request VRF randomness for fair coin flip
    const vrfRequest = await vrfWrapper.requestRandomness();
    gameState.vrfRequestId = vrfRequest.requestId;

    // Generate coin result using VRF with failsafe
    gameState.coinResult = await vrfWrapper.coinFlip();

    // Select animation type based on result and add some randomness
    gameState.animationType = await this.selectAnimationType(gameState.coinResult);

    gameState.gamePhase = 'completed';
    gameState.actions = [];

    return gameState;
  }

  /**
   * Select animation type for the coin flip
   * @param {string} result - Coin flip result ('heads' or 'tails')
   * @returns {string} Animation type
   */
  async selectAnimationType(result) {
    // Filter animations by result
    const resultAnimations = this.animationOutcomes.filter(anim => 
      anim.includes(result)
    );

    // Add weight to different animation types
    const animationWeights = {
      'quick': 40,      // 40% chance
      'slow': 35,       // 35% chance  
      'dramatic': 20,   // 20% chance
      'edge_bounce': 5  // 5% chance (rare)
    };

    // Create weighted array
    const weightedAnimations = [];
    for (const animation of resultAnimations) {
      const type = animation.includes('edge_bounce') ? 'edge_bounce' :
                   animation.includes('dramatic') ? 'dramatic' :
                   animation.includes('slow') ? 'slow' : 'quick';
      
      const weight = animationWeights[type];
      for (let i = 0; i < weight; i++) {
        weightedAnimations.push(animation);
      }
    }

    // Select random animation using VRF
    return await vrfWrapper.getRandomChoice(weightedAnimations);
  }

  /**
   * Determine game outcome and calculate payouts
   * @param {Object} gameState - Final game state
   * @param {string} betAmount - Original bet amount
   * @returns {Object} Game result with payouts
   */
  determineOutcome(gameState, betAmount) {
    const bet = BigInt(betAmount);
    const playerWon = gameState.playerChoice === gameState.coinResult;

    let winner, playerPayout, housePayout;

    if (playerWon) {
      winner = 'player';
      playerPayout = (bet * BigInt(2)).toString(); // 2x payout (1:1 odds)
      housePayout = '0';
    } else {
      winner = 'house';
      playerPayout = '0';
      housePayout = betAmount;
    }

    return {
      winner,
      playerPayout,
      housePayout,
      gameData: {
        playerChoice: gameState.playerChoice,
        coinResult: gameState.coinResult,
        animationType: gameState.animationType,
        vrfRequestId: gameState.vrfRequestId,
        playerWon
      }
    };
  }

  /**
   * Get game display information for UI
   * @param {Object} gameState - Current game state
   * @returns {Object} Display information
   */
  getDisplayInfo(gameState) {
    return {
      gamePhase: gameState.gamePhase,
      playerChoice: gameState.playerChoice,
      coinResult: gameState.coinResult,
      animationType: gameState.animationType,
      actions: gameState.actions,
      showResult: gameState.gamePhase === 'completed'
    };
  }

  /**
   * Get animation configuration for frontend
   * @param {string} animationType - Animation type
   * @returns {Object} Animation configuration
   */
  getAnimationConfig(animationType) {
    const configs = {
      'heads_quick': {
        duration: 1500,
        rotations: 3,
        finalSide: 'heads',
        easing: 'ease-out'
      },
      'heads_slow': {
        duration: 3000,
        rotations: 6,
        finalSide: 'heads',
        easing: 'ease-in-out'
      },
      'heads_dramatic': {
        duration: 4000,
        rotations: 8,
        finalSide: 'heads',
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        bounces: 2
      },
      'tails_quick': {
        duration: 1500,
        rotations: 3,
        finalSide: 'tails',
        easing: 'ease-out'
      },
      'tails_slow': {
        duration: 3000,
        rotations: 6,
        finalSide: 'tails',
        easing: 'ease-in-out'
      },
      'tails_dramatic': {
        duration: 4000,
        rotations: 8,
        finalSide: 'tails',
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        bounces: 2
      },
      'edge_bounce_heads': {
        duration: 5000,
        rotations: 10,
        finalSide: 'heads',
        easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        bounces: 3,
        edgeLanding: true
      },
      'edge_bounce_tails': {
        duration: 5000,
        rotations: 10,
        finalSide: 'tails',
        easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        bounces: 3,
        edgeLanding: true
      }
    };

    return configs[animationType] || configs['heads_quick'];
  }

  /**
   * Validate game state for processing
   * @param {Object} gameState - Game state to validate
   * @returns {boolean} Is valid
   */
  validateGameState(gameState) {
    if (!gameState) return false;
    
    const requiredFields = ['gamePhase', 'actions'];
    return requiredFields.every(field => gameState.hasOwnProperty(field));
  }

  /**
   * Get game statistics for analytics
   * @param {Object} gameState - Final game state
   * @returns {Object} Game statistics
   */
  getGameStats(gameState) {
    return {
      gameType: 'coinToss',
      playerChoice: gameState.playerChoice,
      result: gameState.coinResult,
      animationType: gameState.animationType,
      playerWon: gameState.playerChoice === gameState.coinResult,
      vrfUsed: !!gameState.vrfRequestId,
      gameDuration: gameState.animationType ? 
        this.getAnimationConfig(gameState.animationType).duration : 0
    };
  }
}

module.exports = new CoinTossService();