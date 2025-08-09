const blackjackService = require('../services/games/blackjackService');

describe('Enhanced Blackjack Service', () => {
  describe('Game Initialization', () => {
    test('should initialize game with start overlay', async () => {
      const gameState = await blackjackService.initializeGame('player1', '100');
      
      expect(gameState.gamePhase).toBe('waiting_to_start');
      expect(gameState.showStartOverlay).toBe(true);
      expect(gameState.actions).toContain('start_game');
      expect(gameState.playerHand).toEqual([]);
      expect(gameState.dealerHand).toEqual([]);
    });
  });

  describe('Blackjack Detection', () => {
    test('should detect player blackjack', () => {
      const blackjackHand = [
        { rank: 'A', suit: 'hearts', value: 11 },
        { rank: 'K', suit: 'spades', value: 10 }
      ];
      
      expect(blackjackService.detectBlackjack(blackjackHand)).toBe(true);
    });

    test('should not detect blackjack with more than 2 cards', () => {
      const hand = [
        { rank: 'A', suit: 'hearts', value: 11 },
        { rank: '5', suit: 'spades', value: 5 },
        { rank: '5', suit: 'clubs', value: 5 }
      ];
      
      expect(blackjackService.detectBlackjack(hand)).toBe(false);
    });

    test('should handle both player and dealer blackjack as push', async () => {
      const gameState = {
        playerId: 'player1',
        betAmount: '100',
        gamePhase: 'waiting_to_start'
      };

      // Mock deck to ensure blackjack for both
      const mockDeck = [
        { rank: 'K', suit: 'hearts', value: 10 }, // Dealer hole card
        { rank: 'A', suit: 'spades', value: 11 }, // Player second card
        { rank: 'A', suit: 'clubs', value: 11 },  // Dealer up card
        { rank: 'Q', suit: 'diamonds', value: 10 } // Player first card
      ];

      // Mock the deck creation
      jest.spyOn(blackjackService, 'createAndShuffleDeck').mockResolvedValue(mockDeck);

      const result = await blackjackService.startNewRound(gameState);
      
      expect(result.gamePhase).toBe('blackjack_resolution');
      expect(result.result).toBe('push');
      expect(result.resultMessage).toBe('Both have blackjack - Push!');
    });
  });

  describe('Enhanced Split Logic', () => {
    test('should allow split for same rank cards', () => {
      const sameRankHand = [
        { rank: '8', suit: 'hearts', value: 8 },
        { rank: '8', suit: 'spades', value: 8 }
      ];
      
      expect(blackjackService.canSplit(sameRankHand)).toBe(true);
    });

    test('should allow split for same value cards (10-J, Q-K, etc.)', () => {
      const sameValueHand = [
        { rank: '10', suit: 'hearts', value: 10 },
        { rank: 'J', suit: 'spades', value: 10 }
      ];
      
      expect(blackjackService.canSplit(sameValueHand)).toBe(true);
    });

    test('should not allow split for different values', () => {
      const differentValueHand = [
        { rank: '9', suit: 'hearts', value: 9 },
        { rank: 'J', suit: 'spades', value: 10 }
      ];
      
      expect(blackjackService.canSplit(differentValueHand)).toBe(false);
    });

    test('should handle Ace split with one card only', async () => {
      const gameState = {
        deck: [
          { rank: '5', suit: 'hearts', value: 5 },
          { rank: '7', suit: 'spades', value: 7 }
        ],
        playerHand: [
          { rank: 'A', suit: 'hearts', value: 11 },
          { rank: 'A', suit: 'spades', value: 11 }
        ],
        gamePhase: 'player_turn'
      };

      const result = await blackjackService.processSplit(gameState);
      
      expect(result.isAceSplit).toBe(true);
      expect(result.gamePhase).toBe('dealer_turn');
      expect(result.actions).toEqual([]);
      expect(result.splitHands).toHaveLength(2);
      expect(result.splitHands[0]).toHaveLength(2); // Ace + one card
      expect(result.splitHands[1]).toHaveLength(2); // Ace + one card
    });
  });

  describe('Animation Support', () => {
    test('should provide card animation data', () => {
      const gameState = {
        showStartOverlay: false,
        gamePhase: 'player_turn',
        playerHand: [{ rank: 'A', suit: 'hearts', value: 11 }],
        dealerHand: [{ rank: 'K', suit: 'spades', value: 10 }],
        splitHands: null,
        currentSplitHand: 0
      };

      const animationData = blackjackService.getCardAnimationData(gameState);
      
      expect(animationData.showStartOverlay).toBe(false);
      expect(animationData.gamePhase).toBe('player_turn');
      expect(animationData.playerHandSize).toBe(1);
      expect(animationData.dealerHandSize).toBe(1);
      expect(animationData.splitHands).toBe(0);
    });

    test('should provide minimal animation instructions for hit', () => {
      const gameState = {
        playerHand: [
          { rank: 'A', suit: 'hearts', value: 11 },
          { rank: '5', suit: 'spades', value: 5 },
          { rank: '3', suit: 'clubs', value: 3 }
        ]
      };

      const instructions = blackjackService.getMinimalAnimationInstructions(gameState, 'hit');
      
      expect(instructions.animateNewCards).toBe(true);
      expect(instructions.animateCardIndices).toEqual([2]); // Only the newest card
      expect(instructions.keepExistingCardsStationary).toBe(true);
      expect(instructions.animateDealerReveal).toBe(false);
    });

    test('should provide animation instructions for split', () => {
      const gameState = {
        splitHands: [
          [{ rank: '8', suit: 'hearts', value: 8 }, { rank: '5', suit: 'clubs', value: 5 }],
          [{ rank: '8', suit: 'spades', value: 8 }, { rank: '7', suit: 'diamonds', value: 7 }]
        ]
      };

      const instructions = blackjackService.getMinimalAnimationInstructions(gameState, 'split');
      
      expect(instructions.animateSplitRepositioning).toBe(true);
      expect(instructions.animateNewCards).toBe(true);
      expect(instructions.keepExistingCardsStationary).toBe(true);
    });
  });

  describe('Display Information', () => {
    test('should provide complete display info with start overlay', () => {
      const gameState = {
        playerHand: [],
        dealerHand: [],
        gamePhase: 'waiting_to_start',
        showStartOverlay: true,
        actions: ['start_game']
      };

      const displayInfo = blackjackService.getDisplayInfo(gameState);
      
      expect(displayInfo.showStartOverlay).toBe(true);
      expect(displayInfo.actions).toContain('start_game');
      expect(displayInfo.playerHand).toEqual([]);
      expect(displayInfo.dealerHand).toEqual([]);
    });

    test('should hide dealer hole card during player turn', () => {
      const gameState = {
        playerHand: [{ rank: 'A', suit: 'hearts', value: 11 }],
        dealerHand: [
          { rank: 'K', suit: 'spades', value: 10 },
          { rank: '7', suit: 'clubs', value: 7 }
        ],
        gamePhase: 'player_turn'
      };

      const displayInfo = blackjackService.getDisplayInfo(gameState);
      
      expect(displayInfo.dealerHand).toHaveLength(2);
      expect(displayInfo.dealerHand[1].hidden).toBe(true);
      expect(displayInfo.dealerHand[1].rank).toBe('?');
    });

    test('should show all dealer cards after player turn', () => {
      const gameState = {
        playerHand: [{ rank: 'A', suit: 'hearts', value: 11 }],
        dealerHand: [
          { rank: 'K', suit: 'spades', value: 10 },
          { rank: '7', suit: 'clubs', value: 7 }
        ],
        dealerHandValue: { value: 17, isSoft: false },
        gamePhase: 'dealer_turn'
      };

      const displayInfo = blackjackService.getDisplayInfo(gameState);
      
      expect(displayInfo.dealerHand).toHaveLength(2);
      expect(displayInfo.dealerHand[1].hidden).toBeUndefined();
      expect(displayInfo.dealerHand[1].rank).toBe('7');
    });
  });

  describe('Game Flow', () => {
    test('should handle complete game flow from start to finish', async () => {
      // Initialize game
      let gameState = await blackjackService.initializeGame('player1', '100');
      expect(gameState.gamePhase).toBe('waiting_to_start');

      // Mock deck for predictable game
      const mockDeck = [
        { rank: '6', suit: 'hearts', value: 6 },   // Dealer hits
        { rank: '5', suit: 'spades', value: 5 },   // Player hits
        { rank: '7', suit: 'clubs', value: 7 },    // Dealer hole card
        { rank: '9', suit: 'diamonds', value: 9 }, // Player second card
        { rank: 'K', suit: 'hearts', value: 10 },  // Dealer up card
        { rank: '8', suit: 'spades', value: 8 }    // Player first card
      ];

      jest.spyOn(blackjackService, 'createAndShuffleDeck').mockResolvedValue(mockDeck);

      // Start game
      gameState = await blackjackService.processPlayerAction(gameState, 'start_game');
      expect(gameState.gamePhase).toBe('player_turn');
      expect(gameState.playerHand).toHaveLength(2);
      expect(gameState.dealerHand).toHaveLength(2);

      // Player hits
      gameState = await blackjackService.processPlayerAction(gameState, 'hit');
      expect(gameState.playerHand).toHaveLength(3);

      // Player stands
      gameState = await blackjackService.processPlayerAction(gameState, 'stand');
      expect(gameState.gamePhase).toBe('dealer_turn');

      // Play dealer hand
      gameState = await blackjackService.playDealerHand(gameState);
      expect(gameState.gamePhase).toBe('game_over');
    });
  });
});