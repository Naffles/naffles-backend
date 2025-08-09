const blackjackService = require('../services/games/blackjackService');

describe('Blackjack Split Logic - Proper Casino Rules', () => {
  let gameState;

  beforeEach(() => {
    // Mock VRF wrapper to return predictable values
    jest.mock('../services/vrfWrapper', () => ({
      getRandomInt: jest.fn().mockResolvedValue(0),
      getRandomFloat: jest.fn().mockResolvedValue(0.5)
    }));

    // Create a basic game state for testing
    gameState = {
      playerId: 'test-player',
      betAmount: '100',
      gamePhase: 'player_turn',
      deck: [
        { suit: 'hearts', rank: '10', value: 10 },
        { suit: 'spades', rank: 'J', value: 10 },
        { suit: 'diamonds', rank: 'Q', value: 10 },
        { suit: 'clubs', rank: 'K', value: 10 },
        { suit: 'hearts', rank: 'A', value: 11 },
        { suit: 'spades', rank: 'A', value: 11 },
        { suit: 'diamonds', rank: '9', value: 9 },
        { suit: 'clubs', rank: '8', value: 8 }
      ],
      playerHand: [
        { suit: 'hearts', rank: '10', value: 10 },
        { suit: 'spades', rank: 'J', value: 10 }
      ],
      dealerHand: [
        { suit: 'diamonds', rank: '7', value: 7 },
        { suit: 'clubs', rank: '6', value: 6 }
      ],
      actions: ['hit', 'stand', 'double', 'split']
    };
  });

  describe('Split Hand Creation', () => {
    test('should create two hands with one card each from original pair', async () => {
      const result = await blackjackService.processSplit(gameState);
      
      expect(result.splitHands).toBeDefined();
      expect(result.splitHands).toHaveLength(2);
      expect(result.splitHands[0]).toHaveLength(2); // First hand gets second card immediately
      expect(result.splitHands[1]).toHaveLength(1); // Second hand remains with one card
      expect(result.splitHands[0][0]).toEqual(gameState.playerHand[0]); // First card from original pair
      expect(result.splitHands[1][0]).toEqual(gameState.playerHand[1]); // Second card from original pair
    });

    test('should set current split hand to 0 (first hand)', async () => {
      const result = await blackjackService.processSplit(gameState);
      
      expect(result.currentSplitHand).toBe(0);
    });

    test('should deal second card only to first hand initially', async () => {
      const result = await blackjackService.processSplit(gameState);
      
      expect(result.splitHands[0]).toHaveLength(2); // First hand has 2 cards
      expect(result.splitHands[1]).toHaveLength(1); // Second hand has 1 card
    });
  });

  describe('Split Hand Progression', () => {
    test('should move to second hand and deal its second card only after first hand stands', async () => {
      // First, split the hand
      let result = await blackjackService.processSplit(gameState);
      
      // Then stand on first hand
      result = await blackjackService.processStand(result);
      
      expect(result.currentSplitHand).toBe(1); // Moved to second hand
      expect(result.splitHands[1]).toHaveLength(2); // Second hand now has 2 cards
    });

    test('should move to second hand and deal its second card only after first hand hits and gets 21 or busts', async () => {
      // Create a scenario where first hand will get 21
      gameState.playerHand = [
        { suit: 'hearts', rank: '8', value: 8 },
        { suit: 'spades', rank: '8', value: 8 }
      ];
      // Deck is popped from the end, so reverse order
      gameState.deck = [
        { suit: 'spades', rank: '6', value: 6 },   // Additional cards
        { suit: 'hearts', rank: '7', value: 7 },  // This will be dealt to second hand
        { suit: 'clubs', rank: '8', value: 8 },   // This will give first hand 21 (8+6+8=22, bust) - wait, let me use A
        { suit: 'diamonds', rank: '6', value: 6 }  // This will be dealt to first hand after split (8+6=14)
      ];

      // Split the hand
      let result = await blackjackService.processSplit(gameState);
      
      // First hand should have 8+6=14 after split
      expect(result.splitHands[0]).toHaveLength(2);
      expect(blackjackService.calculateHandValue(result.splitHands[0]).value).toBe(14);
      expect(result.currentSplitHand).toBe(0); // Still on first hand
      
      // Hit on first hand (should get 8, total = 22, bust)
      result = await blackjackService.processHit(result);
      
      // Should move to second hand and deal its second card when first hand busts
      expect(result.currentSplitHand).toBe(1);
      expect(result.splitHands[1]).toHaveLength(2); // Second hand now has 2 cards
    });

    test('should move to dealer turn after both split hands are completed', async () => {
      // Split the hand
      let result = await blackjackService.processSplit(gameState);
      
      // Stand on first hand (moves to second hand)
      result = await blackjackService.processStand(result);
      
      // Stand on second hand (should move to dealer turn)
      result = await blackjackService.processStand(result);
      
      expect(result.gamePhase).toBe('dealer_turn');
      expect(result.actions).toEqual([]);
    });
  });

  describe('Ace Split Handling', () => {
    beforeEach(() => {
      gameState.playerHand = [
        { suit: 'hearts', rank: 'A', value: 11 },
        { suit: 'spades', rank: 'A', value: 11 }
      ];
    });

    test('should deal one card to each Ace and automatically complete both hands', async () => {
      const result = await blackjackService.processSplit(gameState);
      
      expect(result.splitHands[0]).toHaveLength(2); // First Ace hand gets one additional card
      expect(result.splitHands[1]).toHaveLength(2); // Second Ace hand gets one additional card
      expect(result.gamePhase).toBe('dealer_turn'); // Automatically moves to dealer
      expect(result.actions).toEqual([]); // No further actions allowed
      expect(result.isAceSplit).toBe(true);
    });

    test('should not allow hit, stand, or double actions on split Aces', async () => {
      const result = await blackjackService.processSplit(gameState);
      
      expect(result.actions).toEqual([]); // No actions available for split Aces
    });
  });

  describe('Split Logic Validation', () => {
    test('should allow splitting same rank cards', () => {
      const hand = [
        { suit: 'hearts', rank: '8', value: 8 },
        { suit: 'spades', rank: '8', value: 8 }
      ];
      
      expect(blackjackService.canSplit(hand)).toBe(true);
    });

    test('should allow splitting same value cards (10-J, Q-K, etc.)', () => {
      const hand1 = [
        { suit: 'hearts', rank: '10', value: 10 },
        { suit: 'spades', rank: 'J', value: 10 }
      ];
      const hand2 = [
        { suit: 'diamonds', rank: 'Q', value: 10 },
        { suit: 'clubs', rank: 'K', value: 10 }
      ];
      
      expect(blackjackService.canSplit(hand1)).toBe(true);
      expect(blackjackService.canSplit(hand2)).toBe(true);
    });

    test('should not allow splitting different value cards', () => {
      const hand = [
        { suit: 'hearts', rank: 'A', value: 11 },
        { suit: 'spades', rank: '10', value: 10 }
      ];
      
      expect(blackjackService.canSplit(hand)).toBe(false);
    });

    test('should not allow splitting with more than 2 cards', () => {
      const hand = [
        { suit: 'hearts', rank: '8', value: 8 },
        { suit: 'spades', rank: '8', value: 8 },
        { suit: 'diamonds', rank: '5', value: 5 }
      ];
      
      expect(blackjackService.canSplit(hand)).toBe(false);
    });
  });

  describe('Double Down on Split Hands', () => {
    test('should allow double down on non-Ace split hands', async () => {
      // Split the hand
      let result = await blackjackService.processSplit(gameState);
      
      // Double down on first hand
      result = await blackjackService.processDouble(result);
      
      expect(result.splitHands[0]).toHaveLength(3); // First hand gets one more card
      expect(result.currentSplitHand).toBe(1); // Moves to second hand
      expect(result.splitHands[1]).toHaveLength(2); // Second hand gets its second card
      expect(result.doubled).toBe(true);
    });

    test('should not allow double down on split Aces', async () => {
      gameState.playerHand = [
        { suit: 'hearts', rank: 'A', value: 11 },
        { suit: 'spades', rank: 'A', value: 11 }
      ];
      
      const result = await blackjackService.processSplit(gameState);
      
      // Split Aces should automatically complete with no actions available
      expect(result.actions).toEqual([]);
      expect(result.gamePhase).toBe('dealer_turn');
    });
  });
});