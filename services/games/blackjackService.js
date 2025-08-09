const vrfWrapper = require('../vrfWrapper');

/**
 * Blackjack Game Service
 * Implements standard casino blackjack rules with 8-deck shuffling
 */
class BlackjackService {
  constructor() {
    this.suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    this.ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    this.deckCount = 8; // Standard casino 8-deck shoe
  }

  /**
   * Create a fresh 8-deck shoe and shuffle using Fisher-Yates algorithm
   * @returns {Array} Shuffled deck of cards
   */
  async createAndShuffleDeck() {
    const deck = [];
    
    // Create 8 decks
    for (let deckNum = 0; deckNum < this.deckCount; deckNum++) {
      for (const suit of this.suits) {
        for (const rank of this.ranks) {
          deck.push({
            suit,
            rank,
            value: this.getCardValue(rank)
          });
        }
      }
    }

    // Fisher-Yates shuffle with VRF randomness
    for (let i = deck.length - 1; i > 0; i--) {
      const j = await vrfWrapper.getRandomInt(0, i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }

  /**
   * Get the base value of a card (Aces handled separately)
   * @param {string} rank - Card rank
   * @returns {number} Card value
   */
  getCardValue(rank) {
    if (rank === 'A') return 11; // Ace defaults to 11
    if (['J', 'Q', 'K'].includes(rank)) return 10;
    return parseInt(rank);
  }

  /**
   * Calculate hand value with proper Ace handling
   * @param {Array} hand - Array of cards
   * @returns {Object} Hand value and soft/hard status
   */
  calculateHandValue(hand) {
    let value = 0;
    let aces = 0;
    let isSoft = false;

    // Count base values and aces
    for (const card of hand) {
      if (card.rank === 'A') {
        aces++;
        value += 11;
      } else {
        value += card.value;
      }
    }

    // Adjust for aces if over 21
    while (value > 21 && aces > 0) {
      value -= 10; // Convert ace from 11 to 1
      aces--;
      isSoft = aces > 0; // Still soft if we have more aces counting as 11
    }

    // Determine if hand is soft (has ace counting as 11)
    if (aces > 0 && value <= 21) {
      isSoft = true;
    }

    return {
      value,
      isSoft,
      isBlackjack: hand.length === 2 && value === 21,
      isBust: value > 21
    };
  }

  /**
   * Initialize a new blackjack game with start overlay
   * @param {string} playerId - Player ID
   * @param {string} betAmount - Bet amount
   * @returns {Object} Initial game state with start overlay
   */
  async initializeGame(playerId, betAmount) {
    return {
      playerId,
      betAmount,
      gamePhase: 'waiting_to_start',
      showStartOverlay: true,
      deck: null,
      playerHand: [],
      dealerHand: [],
      playerHandValue: null,
      dealerHandValue: null,
      actions: ['start_game']
    };
  }

  /**
   * Start a new blackjack round
   * @param {Object} gameState - Current game state
   * @returns {Object} Game state with dealt cards
   */
  async startNewRound(gameState) {
    const deck = await this.createAndShuffleDeck();
    
    // Deal initial cards
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];

    const playerHandValue = this.calculateHandValue(playerHand);
    const dealerHandValue = this.calculateHandValue([dealerHand[0]]); // Only show first card
    const fullDealerHandValue = this.calculateHandValue(dealerHand); // For blackjack checking

    const newGameState = {
      ...gameState,
      deck,
      playerHand,
      dealerHand,
      playerHandValue,
      dealerHandValue,
      dealerHoleCard: dealerHand[1], // Hidden card
      gamePhase: 'player_turn',
      showStartOverlay: false,
      canDouble: true,
      canSplit: this.canSplit(playerHand),
      splitHands: null,
      currentSplitHand: 0,
      insurance: null,
      actions: this.getAvailableActions(playerHandValue, true, this.canSplit(playerHand))
    };

    // Enhanced blackjack detection
    if (playerHandValue.isBlackjack) {
      // Player has blackjack - reveal dealer hole card to check for dealer blackjack
      newGameState.dealerHandValue = fullDealerHandValue;
      newGameState.gamePhase = 'blackjack_resolution';
      newGameState.actions = [];
      
      if (fullDealerHandValue.isBlackjack) {
        // Both have blackjack - push
        newGameState.result = 'push';
        newGameState.resultMessage = 'Both have blackjack - Push!';
      } else {
        // Player wins with blackjack
        newGameState.result = 'player_blackjack';
        newGameState.resultMessage = 'Blackjack! You win!';
      }
    } else if (fullDealerHandValue.isBlackjack) {
      // Dealer has blackjack - reveal and end game
      newGameState.dealerHandValue = fullDealerHandValue;
      newGameState.gamePhase = 'blackjack_resolution';
      newGameState.result = 'dealer_blackjack';
      newGameState.resultMessage = 'Dealer Blackjack! House wins!';
      newGameState.actions = [];
    }

    return newGameState;
  }

  /**
   * Check if player can split their hand
   * @param {Array} hand - Player's hand
   * @returns {boolean} Can split
   */
  canSplit(hand) {
    if (hand.length !== 2) return false;
    
    // Enhanced split logic: Can split if both cards have same rank or same value
    // This includes A-A, 2-2, 3-3, etc. and also 10-J, 10-Q, 10-K, J-Q, J-K, Q-K
    const card1 = hand[0];
    const card2 = hand[1];
    
    return card1.rank === card2.rank || 
           (card1.value === 10 && card2.value === 10);
  }

  /**
   * Check if two specific cards can be split (for validation)
   * @param {Object} card1 - First card
   * @param {Object} card2 - Second card
   * @returns {boolean} Can split these cards
   */
  canSplitPair(card1, card2) {
    return card1.rank === card2.rank || 
           (card1.value === 10 && card2.value === 10);
  }

  /**
   * Get available player actions
   * @param {Object} handValue - Current hand value
   * @param {boolean} canDouble - Can double down
   * @param {boolean} canSplit - Can split
   * @returns {Array} Available actions
   */
  getAvailableActions(handValue, canDouble, canSplit) {
    const actions = [];

    if (handValue.isBust) {
      return actions; // No actions if bust
    }

    actions.push('hit', 'stand');

    if (canDouble) {
      actions.push('double');
    }

    if (canSplit) {
      actions.push('split');
    }

    return actions;
  }

  /**
   * Process player action
   * @param {Object} gameState - Current game state
   * @param {string} action - Player action
   * @returns {Object} Updated game state
   */
  async processPlayerAction(gameState, action) {
    const newGameState = { ...gameState };

    switch (action) {
      case 'start_game':
        return await this.startNewRound(newGameState);
      
      case 'hit':
        return await this.processHit(newGameState);
      
      case 'stand':
        return await this.processStand(newGameState);
      
      case 'double':
        return await this.processDouble(newGameState);
      
      case 'split':
        return await this.processSplit(newGameState);
      
      default:
        throw new Error(`Invalid action: ${action}`);
    }
  }

  /**
   * Process hit action with proper split hand logic
   * @param {Object} gameState - Current game state
   * @returns {Object} Updated game state
   */
  async processHit(gameState) {
    const card = gameState.deck.pop();
    gameState.lastAction = 'hit';
    
    if (gameState.splitHands) {
      // Handle split hands
      const currentHand = gameState.splitHands[gameState.currentSplitHand];
      currentHand.push(card);
      
      const handValue = this.calculateHandValue(currentHand);
      gameState.splitHands[gameState.currentSplitHand] = currentHand;
      
      if (handValue.isBust || handValue.value === 21) {
        // Current hand is finished, move to next split hand or dealer turn
        if (gameState.currentSplitHand < gameState.splitHands.length - 1) {
          gameState.currentSplitHand++;
          
          // Deal second card to the second split hand only after first hand is done
          if (gameState.splitHands[gameState.currentSplitHand].length === 1) {
            gameState.splitHands[gameState.currentSplitHand].push(gameState.deck.pop());
          }
          
          const nextHandValue = this.calculateHandValue(gameState.splitHands[gameState.currentSplitHand]);
          gameState.actions = this.getAvailableActions(nextHandValue, true, false);
        } else {
          // All split hands completed
          gameState.gamePhase = 'dealer_turn';
          gameState.actions = [];
        }
      } else {
        // Continue with current split hand
        gameState.actions = this.getAvailableActions(handValue, false, false);
      }
    } else {
      // Regular hand
      gameState.playerHand.push(card);
      gameState.playerHandValue = this.calculateHandValue(gameState.playerHand);
      gameState.canDouble = false; // Can't double after hitting
      
      if (gameState.playerHandValue.isBust) {
        gameState.gamePhase = 'game_over';
        gameState.result = 'player_bust';
        gameState.resultMessage = 'Bust! House wins!';
        gameState.actions = [];
      } else if (gameState.playerHandValue.value === 21) {
        gameState.gamePhase = 'dealer_turn';
        gameState.actions = [];
      } else {
        gameState.actions = this.getAvailableActions(gameState.playerHandValue, false, false);
      }
    }

    return gameState;
  }

  /**
   * Process stand action with proper split hand progression
   * @param {Object} gameState - Current game state
   * @returns {Object} Updated game state
   */
  async processStand(gameState) {
    gameState.lastAction = 'stand';
    
    if (gameState.splitHands && gameState.currentSplitHand < gameState.splitHands.length - 1) {
      // Move to next split hand (second hand)
      gameState.currentSplitHand++;
      
      // Deal second card to the second split hand only after first hand is completed
      if (gameState.splitHands[gameState.currentSplitHand].length === 1) {
        gameState.splitHands[gameState.currentSplitHand].push(gameState.deck.pop());
      }
      
      const nextHandValue = this.calculateHandValue(gameState.splitHands[gameState.currentSplitHand]);
      gameState.actions = this.getAvailableActions(nextHandValue, true, false);
    } else {
      // All split hands completed or no split hands - move to dealer turn
      gameState.gamePhase = 'dealer_turn';
      gameState.actions = [];
    }

    return gameState;
  }

  /**
   * Process double down action with proper split hand logic
   * @param {Object} gameState - Current game state
   * @returns {Object} Updated game state
   */
  async processDouble(gameState) {
    gameState.lastAction = 'double';
    
    // Hit once and stand
    const card = gameState.deck.pop();
    
    if (gameState.splitHands) {
      // Handle double on split hand
      const currentHand = gameState.splitHands[gameState.currentSplitHand];
      currentHand.push(card);
      gameState.splitHands[gameState.currentSplitHand] = currentHand;
      
      if (gameState.currentSplitHand < gameState.splitHands.length - 1) {
        // Move to next split hand and deal its second card only after first hand is done
        gameState.currentSplitHand++;
        
        // Deal second card to the second split hand only after first hand is completed
        if (gameState.splitHands[gameState.currentSplitHand].length === 1) {
          gameState.splitHands[gameState.currentSplitHand].push(gameState.deck.pop());
        }
        
        const nextHandValue = this.calculateHandValue(gameState.splitHands[gameState.currentSplitHand]);
        gameState.actions = this.getAvailableActions(nextHandValue, true, false);
      } else {
        // All split hands complete, move to dealer
        gameState.gamePhase = 'dealer_turn';
        gameState.actions = [];
      }
    } else {
      // Regular double
      gameState.playerHand.push(card);
      gameState.playerHandValue = this.calculateHandValue(gameState.playerHand);
      gameState.gamePhase = 'dealer_turn';
      gameState.actions = [];
    }
    
    gameState.doubled = true;
    return gameState;
  }

  /**
   * Process split action with proper casino rules
   * @param {Object} gameState - Current game state
   * @returns {Object} Updated game state
   */
  async processSplit(gameState) {
    const originalHand = gameState.playerHand;
    const isAceSplit = originalHand[0].rank === 'A';
    
    // Create two hands from the split - each gets one card from original pair
    gameState.splitHands = [
      [originalHand[0]], // First hand with first card only
      [originalHand[1]]  // Second hand with second card only
    ];
    
    // Deal second card ONLY to first hand initially
    // Second hand remains with one card until first hand is completed
    gameState.splitHands[0].push(gameState.deck.pop());
    
    gameState.currentSplitHand = 0;
    gameState.canDouble = !isAceSplit; // Can't double on split Aces
    gameState.canSplit = false; // No re-splitting for now
    gameState.isAceSplit = isAceSplit;
    gameState.lastAction = 'split';
    
    // Special handling for split Aces - they get only one card each and are automatically completed
    if (isAceSplit) {
      // Deal second card to second hand as well for Aces
      gameState.splitHands[1].push(gameState.deck.pop());
      // Both hands are complete with split Aces - no further actions allowed
      gameState.gamePhase = 'dealer_turn';
      gameState.actions = [];
    } else {
      // For non-Ace splits, continue with first hand
      const firstHandValue = this.calculateHandValue(gameState.splitHands[0]);
      if (firstHandValue.value === 21) {
        // First hand has 21, move to second hand and deal its second card
        gameState.currentSplitHand = 1;
        gameState.splitHands[1].push(gameState.deck.pop());
        
        const secondHandValue = this.calculateHandValue(gameState.splitHands[1]);
        if (secondHandValue.value === 21) {
          // Both hands have 21, move to dealer
          gameState.gamePhase = 'dealer_turn';
          gameState.actions = [];
        } else {
          gameState.actions = this.getAvailableActions(secondHandValue, true, false);
        }
      } else {
        // Continue playing first hand
        gameState.actions = this.getAvailableActions(firstHandValue, true, false);
      }
    }

    return gameState;
  }

  /**
   * Play dealer hand according to standard rules
   * @param {Object} gameState - Current game state
   * @returns {Object} Updated game state with dealer results
   */
  async playDealerHand(gameState) {
    // Reveal hole card
    gameState.dealerHandValue = this.calculateHandValue(gameState.dealerHand);
    
    // Dealer hits on soft 17
    while (gameState.dealerHandValue.value < 17 || 
           (gameState.dealerHandValue.value === 17 && gameState.dealerHandValue.isSoft)) {
      const card = gameState.deck.pop();
      gameState.dealerHand.push(card);
      gameState.dealerHandValue = this.calculateHandValue(gameState.dealerHand);
    }

    gameState.gamePhase = 'game_over';
    return gameState;
  }

  /**
   * Determine game outcome and payouts
   * @param {Object} gameState - Final game state
   * @param {string} betAmount - Original bet amount
   * @returns {Object} Game result with payouts
   */
  determineOutcome(gameState, betAmount) {
    const bet = BigInt(betAmount);
    let totalPayout = BigInt(0);
    let results = [];

    if (gameState.splitHands) {
      // Handle split hands
      for (let i = 0; i < gameState.splitHands.length; i++) {
        const handValue = this.calculateHandValue(gameState.splitHands[i]);
        const result = this.compareHands(handValue, gameState.dealerHandValue);
        results.push(result);
        
        if (result.outcome === 'player_wins') {
          totalPayout += result.isBlackjack ? bet + (bet * BigInt(3) / BigInt(2)) : bet * BigInt(2);
        } else if (result.outcome === 'push') {
          totalPayout += bet; // Return bet
        }
      }
    } else {
      // Regular hand
      const result = this.compareHands(gameState.playerHandValue, gameState.dealerHandValue);
      results.push(result);
      
      if (result.outcome === 'player_wins') {
        const multiplier = gameState.doubled ? BigInt(4) : BigInt(2);
        const blackjackBonus = result.isBlackjack ? bet / BigInt(2) : BigInt(0);
        totalPayout = bet * multiplier + blackjackBonus;
      } else if (result.outcome === 'push') {
        const multiplier = gameState.doubled ? BigInt(2) : BigInt(1);
        totalPayout = bet * multiplier; // Return bet(s)
      }
    }

    return {
      winner: totalPayout > BigInt(0) ? 'player' : (totalPayout === BigInt(0) ? 'push' : 'house'),
      playerPayout: totalPayout.toString(),
      housePayout: totalPayout > BigInt(0) ? '0' : betAmount,
      gameData: {
        results,
        finalGameState: gameState,
        splitHands: gameState.splitHands ? true : false,
        doubled: gameState.doubled || false
      }
    };
  }

  /**
   * Compare player hand vs dealer hand
   * @param {Object} playerHandValue - Player hand value
   * @param {Object} dealerHandValue - Dealer hand value
   * @returns {Object} Comparison result
   */
  compareHands(playerHandValue, dealerHandValue) {
    // Player bust
    if (playerHandValue.isBust) {
      return { outcome: 'house_wins', reason: 'player_bust' };
    }

    // Dealer bust
    if (dealerHandValue.isBust) {
      return { outcome: 'player_wins', reason: 'dealer_bust' };
    }

    // Both have blackjack
    if (playerHandValue.isBlackjack && dealerHandValue.isBlackjack) {
      return { outcome: 'push', reason: 'both_blackjack' };
    }

    // Player blackjack
    if (playerHandValue.isBlackjack) {
      return { outcome: 'player_wins', reason: 'player_blackjack', isBlackjack: true };
    }

    // Dealer blackjack
    if (dealerHandValue.isBlackjack) {
      return { outcome: 'house_wins', reason: 'dealer_blackjack' };
    }

    // Compare values
    if (playerHandValue.value > dealerHandValue.value) {
      return { outcome: 'player_wins', reason: 'higher_value' };
    } else if (playerHandValue.value < dealerHandValue.value) {
      return { outcome: 'house_wins', reason: 'lower_value' };
    } else {
      return { outcome: 'push', reason: 'same_value' };
    }
  }

  /**
   * Detect if a hand is blackjack (21 with exactly 2 cards)
   * @param {Array} hand - Array of cards
   * @returns {boolean} Is blackjack
   */
  detectBlackjack(hand) {
    if (hand.length !== 2) return false;
    const handValue = this.calculateHandValue(hand);
    return handValue.value === 21;
  }

  /**
   * Check dealer blackjack when player has 21
   * @param {Object} gameState - Current game state
   * @returns {Object} Updated game state with dealer check
   */
  async checkDealerBlackjackWhenPlayerHas21(gameState) {
    if (gameState.playerHandValue && gameState.playerHandValue.isBlackjack) {
      // Reveal dealer hole card
      const fullDealerHandValue = this.calculateHandValue(gameState.dealerHand);
      gameState.dealerHandValue = fullDealerHandValue;
      
      if (fullDealerHandValue.isBlackjack) {
        gameState.result = 'push';
        gameState.resultMessage = 'Both have blackjack - Push!';
      } else {
        gameState.result = 'player_blackjack';
        gameState.resultMessage = 'Blackjack! You win!';
      }
      
      gameState.gamePhase = 'blackjack_resolution';
      gameState.actions = [];
    }
    
    return gameState;
  }

  /**
   * Get card animation data for UI
   * @param {Object} gameState - Current game state
   * @returns {Object} Animation instructions
   */
  getCardAnimationData(gameState) {
    return {
      showStartOverlay: gameState.showStartOverlay || false,
      gamePhase: gameState.gamePhase,
      playerHandSize: gameState.playerHand ? gameState.playerHand.length : 0,
      dealerHandSize: gameState.dealerHand ? gameState.dealerHand.length : 0,
      splitHands: gameState.splitHands ? gameState.splitHands.length : 0,
      currentSplitHand: gameState.currentSplitHand || 0,
      isAceSplit: gameState.isAceSplit || false,
      lastAction: gameState.lastAction || null
    };
  }

  /**
   * Get minimal animation instructions for UI
   * @param {Object} gameState - Current game state
   * @param {string} lastAction - Last action performed
   * @returns {Object} Animation instructions
   */
  getMinimalAnimationInstructions(gameState, lastAction) {
    const instructions = {
      animateNewCards: false,
      animateCardIndices: [],
      animateDealerReveal: false,
      animateSplitRepositioning: false,
      keepExistingCardsStationary: true
    };

    switch (lastAction) {
      case 'start_game':
        instructions.animateNewCards = true;
        instructions.animateCardIndices = [0, 1]; // Both initial cards
        break;
        
      case 'hit':
        instructions.animateNewCards = true;
        const handSize = gameState.splitHands ? 
          gameState.splitHands[gameState.currentSplitHand].length :
          gameState.playerHand.length;
        instructions.animateCardIndices = [handSize - 1]; // Only the new card
        break;
        
      case 'double':
        instructions.animateNewCards = true;
        instructions.animateCardIndices = [gameState.playerHand.length - 1];
        instructions.animateDealerReveal = true;
        break;
        
      case 'stand':
        instructions.animateDealerReveal = true;
        break;
        
      case 'split':
        instructions.animateSplitRepositioning = true;
        instructions.animateNewCards = true;
        instructions.animateCardIndices = [1]; // New cards for each split hand
        break;
        
      case 'blackjack_detected':
        instructions.animateDealerReveal = true;
        break;
    }

    return instructions;
  }

  /**
   * Get game display information for UI
   * @param {Object} gameState - Current game state
   * @returns {Object} Display information
   */
  getDisplayInfo(gameState) {
    const displayInfo = {
      playerHand: gameState.playerHand || [],
      playerHandValue: gameState.playerHandValue,
      dealerHand: (gameState.gamePhase === 'player_turn' && gameState.dealerHand) ? 
        [gameState.dealerHand[0], { rank: '?', suit: '?', hidden: true }] : 
        (gameState.dealerHand || []),
      dealerHandValue: (gameState.gamePhase === 'player_turn' && gameState.dealerHand) ?
        this.calculateHandValue([gameState.dealerHand[0]]) :
        gameState.dealerHandValue,
      gamePhase: gameState.gamePhase,
      actions: gameState.actions || [],
      canDouble: gameState.canDouble || false,
      canSplit: gameState.canSplit || false,
      showStartOverlay: gameState.showStartOverlay || false,
      result: gameState.result,
      resultMessage: gameState.resultMessage
    };

    if (gameState.splitHands) {
      displayInfo.splitHands = gameState.splitHands;
      displayInfo.currentSplitHand = gameState.currentSplitHand;
      displayInfo.isAceSplit = gameState.isAceSplit;
    }

    return displayInfo;
  }
}

module.exports = new BlackjackService();