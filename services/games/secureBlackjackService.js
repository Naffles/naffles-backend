const cryptographicService = require('../security/cryptographicService');
const gameSecurityService = require('../security/gameSecurityService');
const securityMonitoringService = require('../security/securityMonitoringService');
const vrfWrapper = require('../vrfWrapper');

/**
 * Secure Blackjack Service
 * Server-authoritative blackjack game logic with cryptographic verification
 */
class SecureBlackjackService {
  constructor() {
    this.cardValues = {
      'A': [1, 11], '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10
    };
    this.suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    this.ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  }

  /**
   * Initialize secure blackjack game
   */
  async initializeSecureGame(playerId, betAmount, tokenType) {
    try {
      // Create secure game session
      const session = await gameSecurityService.createSecureGameSession(
        playerId,
        'blackjack',
        tokenType,
        betAmount,
        {}
      );

      // Generate server-side deck with VRF
      const deck = await this.generateSecureDeck();
      
      // Deal initial cards (server-side)
      const playerHand = [deck.pop(), deck.pop()];
      const dealerHand = [deck.pop(), deck.pop()];

      const gameState = {
        gameType: 'blackjack',
        gamePhase: 'playing',
        playerHand,
        dealerHand: [dealerHand[0], { suit: 'hidden', rank: 'hidden' }], // Hide dealer's second card
        deck: deck.length, // Only send deck count, not actual cards
        playerScore: this.calculateHandValue(playerHand),
        dealerScore: this.calculateHandValue([dealerHand[0]]),
        canHit: true,
        canStand: true,
        canDoubleDown: true,
        canSplit: this.canSplit(playerHand),
        betAmount,
        tokenType,
        actualDealerHand: dealerHand // Keep for server processing
      };

      // Create signed game state
      const signedGameState = cryptographicService.createSignedGameState(gameState);

      // Store secure game state
      await this.storeSecureGameState(session.sessionId, {
        ...gameState,
        fullDeck: deck,
        actualDealerHand: dealerHand
      });

      return {
        sessionId: session.sessionId,
        signedGameState,
        gameState: {
          ...gameState,
          actualDealerHand: undefined // Don't send to client
        }
      };
    } catch (error) {
      console.error('Error initializing secure blackjack:', error);
      throw error;
    }
  }

  /**
   * Process secure blackjack action
   */
  async processSecureAction(sessionId, playerId, action, signedGameState) {
    try {
      // Verify game state signature
      if (!cryptographicService.verifySignedGameState(signedGameState)) {
        await securityMonitoringService.logSecurityEvent({
          eventType: 'invalid_game_state',
          playerId,
          sessionId,
          details: { action, gameType: 'blackjack' },
          severity: 'high'
        });
        throw new Error('Invalid game state signature');
      }

      // Get server-side game state
      const serverGameState = await this.getSecureGameState(sessionId);
      if (!serverGameState) {
        throw new Error('Game session not found');
      }

      // Validate action is allowed
      if (!this.isActionAllowed(action, serverGameState)) {
        throw new Error(`Action '${action}' not allowed in current game state`);
      }

      // Process action server-side
      const updatedGameState = await this.processActionServerSide(action, serverGameState);

      // Check if game is completed
      const gameResult = this.checkGameCompletion(updatedGameState);
      
      if (gameResult.isCompleted) {
        // Process payout
        const payout = await this.processPayout(sessionId, playerId, gameResult, updatedGameState.betAmount, updatedGameState.tokenType);
        updatedGameState.payout = payout;
        updatedGameState.gamePhase = 'completed';
      }

      // Create new signed game state
      const newSignedGameState = cryptographicService.createSignedGameState({
        ...updatedGameState,
        fullDeck: undefined,
        actualDealerHand: updatedGameState.gamePhase === 'completed' ? updatedGameState.actualDealerHand : undefined
      });

      // Store updated state
      await this.storeSecureGameState(sessionId, updatedGameState);

      return {
        sessionId,
        signedGameState: newSignedGameState,
        gameCompleted: gameResult.isCompleted,
        result: gameResult.result,
        payout: updatedGameState.payout
      };
    } catch (error) {
      console.error('Error processing secure blackjack action:', error);
      throw error;
    }
  }

  /**
   * Generate cryptographically secure deck
   */
  async generateSecureDeck() {
    const deck = [];
    
    // Create standard 52-card deck
    for (const suit of this.suits) {
      for (const rank of this.ranks) {
        deck.push({ suit, rank });
      }
    }

    // Shuffle using VRF-based randomness
    for (let i = deck.length - 1; i > 0; i--) {
      const j = await cryptographicService.generateSecureRandom(0, i);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }

  /**
   * Calculate hand value (server-side)
   */
  calculateHandValue(hand) {
    let value = 0;
    let aces = 0;

    for (const card of hand) {
      if (card.rank === 'A') {
        aces++;
        value += 11;
      } else if (['J', 'Q', 'K'].includes(card.rank)) {
        value += 10;
      } else {
        value += parseInt(card.rank);
      }
    }

    // Adjust for aces
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }

    return value;
  }

  /**
   * Check if player can split
   */
  canSplit(hand) {
    if (hand.length !== 2) return false;
    return hand[0].rank === hand[1].rank;
  }

  /**
   * Check if action is allowed
   */
  isActionAllowed(action, gameState) {
    if (gameState.gamePhase !== 'playing') return false;

    switch (action) {
      case 'hit':
        return gameState.canHit && gameState.playerScore < 21;
      case 'stand':
        return gameState.canStand;
      case 'double':
        return gameState.canDoubleDown && gameState.playerHand.length === 2;
      case 'split':
        return gameState.canSplit && gameState.playerHand.length === 2;
      default:
        return false;
    }
  }

  /**
   * Process action server-side
   */
  async processActionServerSide(action, gameState) {
    const updatedState = { ...gameState };

    switch (action) {
      case 'hit':
        // Deal card from server deck
        const newCard = updatedState.fullDeck.pop();
        updatedState.playerHand.push(newCard);
        updatedState.playerScore = this.calculateHandValue(updatedState.playerHand);
        
        // Check if player busted
        if (updatedState.playerScore > 21) {
          updatedState.canHit = false;
          updatedState.canStand = false;
          updatedState.canDoubleDown = false;
        } else if (updatedState.playerScore === 21) {
          updatedState.canHit = false;
        }
        
        updatedState.canDoubleDown = false; // Can't double after hit
        break;

      case 'stand':
        // Reveal dealer's hidden card and play dealer hand
        updatedState.dealerHand = [...updatedState.actualDealerHand];
        updatedState.dealerScore = this.calculateHandValue(updatedState.dealerHand);
        
        // Dealer hits on soft 17
        while (updatedState.dealerScore < 17) {
          const dealerCard = updatedState.fullDeck.pop();
          updatedState.dealerHand.push(dealerCard);
          updatedState.actualDealerHand.push(dealerCard);
          updatedState.dealerScore = this.calculateHandValue(updatedState.dealerHand);
        }
        
        updatedState.canHit = false;
        updatedState.canStand = false;
        updatedState.canDoubleDown = false;
        break;

      case 'double':
        // Double the bet and hit once
        updatedState.betAmount = (parseFloat(updatedState.betAmount) * 2).toString();
        const doubleCard = updatedState.fullDeck.pop();
        updatedState.playerHand.push(doubleCard);
        updatedState.playerScore = this.calculateHandValue(updatedState.playerHand);
        
        // Automatically stand after double
        if (updatedState.playerScore <= 21) {
          updatedState.dealerHand = [...updatedState.actualDealerHand];
          updatedState.dealerScore = this.calculateHandValue(updatedState.dealerHand);
          
          while (updatedState.dealerScore < 17) {
            const dealerCard = updatedState.fullDeck.pop();
            updatedState.dealerHand.push(dealerCard);
            updatedState.actualDealerHand.push(dealerCard);
            updatedState.dealerScore = this.calculateHandValue(updatedState.dealerHand);
          }
        }
        
        updatedState.canHit = false;
        updatedState.canStand = false;
        updatedState.canDoubleDown = false;
        break;
    }

    updatedState.deck = updatedState.fullDeck.length;
    return updatedState;
  }

  /**
   * Check game completion and determine result
   */
  checkGameCompletion(gameState) {
    const playerScore = gameState.playerScore;
    const dealerScore = gameState.dealerScore;

    // Player busted
    if (playerScore > 21) {
      return { isCompleted: true, result: 'lose', reason: 'player_bust' };
    }

    // Game not completed if player can still act
    if (gameState.canHit || gameState.canStand) {
      return { isCompleted: false };
    }

    // Dealer busted
    if (dealerScore > 21) {
      return { isCompleted: true, result: 'win', reason: 'dealer_bust' };
    }

    // Compare scores
    if (playerScore > dealerScore) {
      return { isCompleted: true, result: 'win', reason: 'higher_score' };
    } else if (playerScore < dealerScore) {
      return { isCompleted: true, result: 'lose', reason: 'lower_score' };
    } else {
      return { isCompleted: true, result: 'draw', reason: 'tie' };
    }
  }

  /**
   * Process payout based on game result
   */
  async processPayout(sessionId, playerId, gameResult, betAmount, tokenType) {
    const bet = parseFloat(betAmount);
    let payout = 0;

    switch (gameResult.result) {
      case 'win':
        payout = bet * 2; // Return bet + winnings
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
    // In production, store in Redis or database
    // For now, use in-memory storage
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

module.exports = new SecureBlackjackService();