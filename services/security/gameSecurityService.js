const crypto = require('crypto');
const GameSession = require('../../models/game/gameSession');
const vrfWrapper = require('../vrfWrapper');
const { isUserHasEnoughBalance, deductUserBalance, addUserBalance } = require('../socket/helpers');
const cryptographicService = require('./cryptographicService');
const securityMonitoringService = require('./securityMonitoringService');

/**
 * Game Security Service
 * Implements server-authoritative game logic with cryptographic verification
 */
class GameSecurityService {
  constructor() {
    this.gameSecret = process.env.GAME_SECURITY_SECRET || crypto.randomBytes(32).toString('hex');
    this.activeFundLocks = new Map(); // Track locked funds
    this.gameStates = new Map(); // Server-side game state cache
  }

  /**
   * Create a secure game session with fund locking
   */
  async createSecureGameSession(playerId, gameType, tokenType, betAmount, gameConfig = {}) {
    try {
      // 1. Validate user balance
      const hasBalance = await isUserHasEnoughBalance(playerId, tokenType, betAmount);
      if (!hasBalance) {
        throw new Error('Insufficient balance for bet amount');
      }

      // 2. Lock funds immediately
      const fundLockId = await this.lockPlayerFunds(playerId, tokenType, betAmount);

      // 3. Generate secure session
      const sessionId = this.generateSecureSessionId();
      const expiresAt = new Date(Date.now() + (30 * 60 * 1000)); // 30 minutes

      // 4. Initialize server-side game state
      const initialGameState = await this.initializeGameState(gameType, gameConfig);
      const signedGameState = this.signGameState(initialGameState);

      // 5. Create database session
      const gameSession = new GameSession({
        _id: sessionId,
        playerId,
        gameType,
        tokenType,
        betAmount,
        status: 'active',
        gameState: signedGameState,
        fundLockId,
        expiresAt,
        createdAt: new Date(),
        isSecure: true,
        securityVersion: '1.0'
      });

      await gameSession.save();

      // 6. Cache server-side state
      this.gameStates.set(sessionId, {
        gameState: initialGameState,
        playerId,
        gameType,
        betAmount,
        tokenType,
        fundLockId,
        lastActionTime: Date.now()
      });

      return {
        sessionId,
        gameType,
        signedGameState,
        expiresAt,
        fundLockId
      };
    } catch (error) {
      console.error('Error creating secure game session:', error);
      throw error;
    }
  }

  /**
   * Lock player funds for betting
   */
  async lockPlayerFunds(playerId, tokenType, amount) {
    const lockId = this.generateLockId();
    
    try {
      // Deduct from user balance immediately
      await deductUserBalance(playerId, tokenType, amount);
      
      // Track the lock
      this.activeFundLocks.set(lockId, {
        playerId,
        tokenType,
        amount,
        lockedAt: new Date(),
        status: 'locked'
      });

      console.log(`Funds locked: ${amount} ${tokenType} for player ${playerId}`);
      return lockId;
    } catch (error) {
      console.error('Error locking funds:', error);
      throw new Error('Failed to lock funds for betting');
    }
  }

  /**
   * Validate and process game action server-side
   */
  async validateGameAction(sessionId, action, actionData = {}) {
    try {
      const cachedState = this.gameStates.get(sessionId);
      if (!cachedState) {
        throw new Error('Game session not found or expired');
      }

      // Rate limiting check
      const now = Date.now();
      if (now - cachedState.lastActionTime < 100) { // Min 100ms between actions
        throw new Error('Action rate limit exceeded');
      }

      // Validate action based on game type and current state
      const isValidAction = this.validateActionForGameType(
        cachedState.gameType, 
        action, 
        cachedState.gameState, 
        actionData
      );

      if (!isValidAction) {
        throw new Error(`Invalid action '${action}' for current game state`);
      }

      // Process action server-side
      const newGameState = await this.processGameActionServerSide(
        cachedState.gameType,
        cachedState.gameState,
        action,
        actionData
      );

      // Update cached state
      cachedState.gameState = newGameState;
      cachedState.lastActionTime = now;

      // Sign the new state
      const signedGameState = this.signGameState(newGameState);

      // Update database
      await GameSession.findByIdAndUpdate(sessionId, {
        gameState: signedGameState,
        lastActionAt: new Date()
      });

      return {
        sessionId,
        signedGameState,
        isGameComplete: this.isGameComplete(newGameState),
        gameResult: this.isGameComplete(newGameState) ? this.determineGameResult(newGameState, cachedState.betAmount) : null
      };
    } catch (error) {
      console.error('Error validating game action:', error);
      throw error;
    }
  }

  /**
   * Process game completion and payouts
   */
  async processGameCompletion(sessionId, gameResult) {
    try {
      const cachedState = this.gameStates.get(sessionId);
      if (!cachedState) {
        throw new Error('Game session not found');
      }

      const session = await GameSession.findById(sessionId);
      if (!session) {
        throw new Error('Game session not found in database');
      }

      // Verify game result server-side
      const serverResult = this.determineGameResult(cachedState.gameState, cachedState.betAmount);
      
      // Security check: compare server result with claimed result
      if (serverResult.outcome !== gameResult.outcome) {
        await this.logSecurityEvent(cachedState.playerId, 'result_mismatch', {
          serverResult,
          claimedResult: gameResult,
          sessionId
        });
        throw new Error('Game result verification failed');
      }

      // Process payout
      await this.processPayout(cachedState.fundLockId, serverResult);

      // Update session
      session.status = 'completed';
      session.result = serverResult;
      session.completedAt = new Date();
      await session.save();

      // Cleanup
      this.gameStates.delete(sessionId);

      return serverResult;
    } catch (error) {
      console.error('Error processing game completion:', error);
      throw error;
    }
  }

  /**
   * Initialize game state based on game type
   */
  async initializeGameState(gameType, gameConfig) {
    switch (gameType) {
      case 'blackjack':
        return await this.initializeBlackjackState(gameConfig);
      case 'coinToss':
        return await this.initializeCoinTossState(gameConfig);
      case 'rockPaperScissors':
        return await this.initializeRPSState(gameConfig);
      default:
        throw new Error(`Unsupported game type: ${gameType}`);
    }
  }

  /**
   * Initialize Blackjack game state
   */
  async initializeBlackjackState(gameConfig) {
    // Generate server-side deck using VRF
    const shuffledDeck = await this.generateSecureShuffledDeck();
    
    return {
      gameType: 'blackjack',
      gamePhase: 'initialized',
      deck: shuffledDeck,
      playerHand: [],
      dealerHand: [],
      playerValue: 0,
      dealerValue: 0,
      canHit: false,
      canStand: false,
      canDouble: false,
      canSplit: false,
      deckPosition: 0,
      gameStatus: 'waiting'
    };
  }

  /**
   * Initialize Coin Toss game state
   */
  async initializeCoinTossState(gameConfig) {
    return {
      gameType: 'coinToss',
      gamePhase: 'initialized',
      playerChoice: null,
      result: null,
      gameStatus: 'waiting'
    };
  }

  /**
   * Initialize Rock Paper Scissors game state
   */
  async initializeRPSState(gameConfig) {
    return {
      gameType: 'rockPaperScissors',
      gamePhase: 'initialized',
      playerMove: null,
      houseMove: null,
      result: null,
      gameStatus: 'waiting'
    };
  }

  /**
   * Process game actions server-side
   */
  async processGameActionServerSide(gameType, currentState, action, actionData) {
    switch (gameType) {
      case 'blackjack':
        return await this.processBlackjackAction(currentState, action, actionData);
      case 'coinToss':
        return await this.processCoinTossAction(currentState, action, actionData);
      case 'rockPaperScissors':
        return await this.processRPSAction(currentState, action, actionData);
      default:
        throw new Error(`Unsupported game type: ${gameType}`);
    }
  }

  /**
   * Process Blackjack actions server-side
   */
  async processBlackjackAction(gameState, action, actionData) {
    const newState = { ...gameState };

    switch (action) {
      case 'start':
        // Deal initial cards
        newState.playerHand = [
          newState.deck[newState.deckPosition++],
          newState.deck[newState.deckPosition++]
        ];
        newState.dealerHand = [
          newState.deck[newState.deckPosition++],
          newState.deck[newState.deckPosition++]
        ];
        
        newState.playerValue = this.calculateBlackjackValue(newState.playerHand);
        newState.dealerValue = this.calculateBlackjackValue([newState.dealerHand[0]]); // Only show first card
        
        newState.gamePhase = 'playing';
        newState.gameStatus = 'playing';
        newState.canHit = newState.playerValue < 21;
        newState.canStand = true;
        newState.canDouble = newState.playerHand.length === 2;
        newState.canSplit = newState.playerHand[0].value === newState.playerHand[1].value;
        break;

      case 'hit':
        if (!newState.canHit) throw new Error('Cannot hit in current state');
        
        newState.playerHand.push(newState.deck[newState.deckPosition++]);
        newState.playerValue = this.calculateBlackjackValue(newState.playerHand);
        
        if (newState.playerValue >= 21) {
          newState.canHit = false;
          newState.canStand = false;
          newState.canDouble = false;
          
          if (newState.playerValue > 21) {
            newState.gamePhase = 'completed';
            newState.gameStatus = 'completed';
          } else {
            // Player has 21, dealer plays
            await this.playDealerHand(newState);
          }
        } else {
          newState.canDouble = false; // Can only double on first action
        }
        break;

      case 'stand':
        if (!newState.canStand) throw new Error('Cannot stand in current state');
        
        newState.canHit = false;
        newState.canStand = false;
        newState.canDouble = false;
        
        // Dealer plays
        await this.playDealerHand(newState);
        break;

      default:
        throw new Error(`Invalid blackjack action: ${action}`);
    }

    return newState;
  }

  /**
   * Play dealer hand automatically
   */
  async playDealerHand(gameState) {
    // Reveal dealer's second card
    gameState.dealerValue = this.calculateBlackjackValue(gameState.dealerHand);
    
    // Dealer hits on 16, stands on 17
    while (gameState.dealerValue < 17) {
      gameState.dealerHand.push(gameState.deck[gameState.deckPosition++]);
      gameState.dealerValue = this.calculateBlackjackValue(gameState.dealerHand);
    }
    
    gameState.gamePhase = 'completed';
    gameState.gameStatus = 'completed';
  }

  /**
   * Process Coin Toss actions server-side
   */
  async processCoinTossAction(gameState, action, actionData) {
    const newState = { ...gameState };

    if (action === 'choose' && actionData.choice) {
      newState.playerChoice = actionData.choice;
      
      // Generate secure random result using VRF
      const randomValue = await vrfWrapper.generateSecureRandom(0, 1);
      newState.result = randomValue === 0 ? 'heads' : 'tails';
      
      newState.gamePhase = 'completed';
      newState.gameStatus = 'completed';
    }

    return newState;
  }

  /**
   * Process Rock Paper Scissors actions server-side
   */
  async processRPSAction(gameState, action, actionData) {
    const newState = { ...gameState };

    if (action === 'move' && actionData.move) {
      newState.playerMove = actionData.move;
      
      // Generate secure random house move
      const moves = ['rock', 'paper', 'scissors'];
      const randomIndex = await vrfWrapper.generateSecureRandom(0, 2);
      newState.houseMove = moves[randomIndex];
      
      newState.gamePhase = 'completed';
      newState.gameStatus = 'completed';
    }

    return newState;
  }

  /**
   * Generate cryptographically secure shuffled deck
   */
  async generateSecureShuffledDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    
    // Create deck
    const deck = [];
    for (const suit of suits) {
      for (const value of values) {
        deck.push({
          suit,
          value,
          numericValue: this.getCardNumericValue(value)
        });
      }
    }

    // Secure shuffle using VRF
    for (let i = deck.length - 1; i > 0; i--) {
      const j = await vrfWrapper.generateSecureRandom(0, i);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }

  /**
   * Calculate blackjack hand value
   */
  calculateBlackjackValue(hand) {
    let value = 0;
    let aces = 0;

    for (const card of hand) {
      if (card.value === 'A') {
        aces++;
        value += 11;
      } else if (['J', 'Q', 'K'].includes(card.value)) {
        value += 10;
      } else {
        value += parseInt(card.value);
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
   * Get numeric value for card
   */
  getCardNumericValue(value) {
    if (value === 'A') return 11;
    if (['J', 'Q', 'K'].includes(value)) return 10;
    return parseInt(value);
  }

  /**
   * Validate action for game type
   */
  validateActionForGameType(gameType, action, gameState, actionData) {
    switch (gameType) {
      case 'blackjack':
        return ['start', 'hit', 'stand', 'double', 'split'].includes(action);
      case 'coinToss':
        return action === 'choose' && ['heads', 'tails'].includes(actionData.choice);
      case 'rockPaperScissors':
        return action === 'move' && ['rock', 'paper', 'scissors'].includes(actionData.move);
      default:
        return false;
    }
  }

  /**
   * Check if game is complete
   */
  isGameComplete(gameState) {
    return gameState.gamePhase === 'completed';
  }

  /**
   * Determine game result
   */
  determineGameResult(gameState, betAmount) {
    const betAmountNum = parseFloat(betAmount);

    switch (gameState.gameType) {
      case 'blackjack':
        return this.determineBlackjackResult(gameState, betAmountNum);
      case 'coinToss':
        return this.determineCoinTossResult(gameState, betAmountNum);
      case 'rockPaperScissors':
        return this.determineRPSResult(gameState, betAmountNum);
      default:
        throw new Error(`Unknown game type: ${gameState.gameType}`);
    }
  }

  /**
   * Determine Blackjack result
   */
  determineBlackjackResult(gameState, betAmount) {
    const { playerValue, dealerValue, playerHand } = gameState;
    
    // Player bust
    if (playerValue > 21) {
      return {
        outcome: 'lose',
        winAmount: '0',
        details: { reason: 'player_bust', playerValue, dealerValue }
      };
    }
    
    // Dealer bust
    if (dealerValue > 21) {
      const isBlackjack = playerValue === 21 && playerHand.length === 2;
      const winAmount = isBlackjack ? betAmount * 2.5 : betAmount * 2;
      return {
        outcome: 'win',
        winAmount: winAmount.toString(),
        details: { reason: 'dealer_bust', playerValue, dealerValue, isBlackjack }
      };
    }
    
    // Compare values
    if (playerValue > dealerValue) {
      const isBlackjack = playerValue === 21 && playerHand.length === 2;
      const winAmount = isBlackjack ? betAmount * 2.5 : betAmount * 2;
      return {
        outcome: 'win',
        winAmount: winAmount.toString(),
        details: { reason: 'higher_value', playerValue, dealerValue, isBlackjack }
      };
    } else if (playerValue < dealerValue) {
      return {
        outcome: 'lose',
        winAmount: '0',
        details: { reason: 'lower_value', playerValue, dealerValue }
      };
    } else {
      return {
        outcome: 'draw',
        winAmount: betAmount.toString(),
        details: { reason: 'push', playerValue, dealerValue }
      };
    }
  }

  /**
   * Determine Coin Toss result
   */
  determineCoinTossResult(gameState, betAmount) {
    const { playerChoice, result } = gameState;
    
    if (playerChoice === result) {
      return {
        outcome: 'win',
        winAmount: (betAmount * 2).toString(),
        details: { playerChoice, result }
      };
    } else {
      return {
        outcome: 'lose',
        winAmount: '0',
        details: { playerChoice, result }
      };
    }
  }

  /**
   * Determine Rock Paper Scissors result
   */
  determineRPSResult(gameState, betAmount) {
    const { playerMove, houseMove } = gameState;
    
    if (playerMove === houseMove) {
      return {
        outcome: 'draw',
        winAmount: betAmount.toString(),
        details: { playerMove, houseMove }
      };
    }
    
    const winConditions = {
      rock: 'scissors',
      paper: 'rock',
      scissors: 'paper'
    };
    
    if (winConditions[playerMove] === houseMove) {
      return {
        outcome: 'win',
        winAmount: (betAmount * 2).toString(),
        details: { playerMove, houseMove }
      };
    } else {
      return {
        outcome: 'lose',
        winAmount: '0',
        details: { playerMove, houseMove }
      };
    }
  }

  /**
   * Process payout based on game result
   */
  async processPayout(fundLockId, gameResult) {
    const fundLock = this.activeFundLocks.get(fundLockId);
    if (!fundLock) {
      throw new Error('Fund lock not found');
    }

    try {
      const winAmount = parseFloat(gameResult.winAmount);
      
      if (winAmount > 0) {
        // Add winnings to user balance
        await addUserBalance(fundLock.playerId, fundLock.tokenType, winAmount.toString());
      }
      
      // Mark lock as processed
      fundLock.status = 'processed';
      fundLock.processedAt = new Date();
      
      console.log(`Payout processed: ${winAmount} ${fundLock.tokenType} for player ${fundLock.playerId}`);
    } catch (error) {
      console.error('Error processing payout:', error);
      
      // Return locked funds on error
      await addUserBalance(fundLock.playerId, fundLock.tokenType, fundLock.amount);
      fundLock.status = 'refunded';
      
      throw error;
    } finally {
      // Remove from active locks
      this.activeFundLocks.delete(fundLockId);
    }
  }

  /**
   * Sign game state with cryptographic signature
   */
  signGameState(gameState) {
    const stateString = JSON.stringify(gameState);
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    
    const dataToSign = `${stateString}:${timestamp}:${nonce}`;
    const signature = crypto
      .createHmac('sha256', this.gameSecret)
      .update(dataToSign)
      .digest('hex');

    return {
      data: gameState,
      signature,
      timestamp,
      nonce
    };
  }

  /**
   * Verify game state signature
   */
  verifyGameStateSignature(signedGameState) {
    try {
      const { data, signature, timestamp, nonce } = signedGameState;
      const stateString = JSON.stringify(data);
      const dataToSign = `${stateString}:${timestamp}:${nonce}`;
      
      const expectedSignature = crypto
        .createHmac('sha256', this.gameSecret)
        .update(dataToSign)
        .digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      console.error('Error verifying game state signature:', error);
      return false;
    }
  }

  /**
   * Generate secure session ID
   */
  generateSecureSessionId() {
    return crypto.randomBytes(24).toString('hex');
  }

  /**
   * Generate fund lock ID
   */
  generateLockId() {
    return `lock_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Log security events
   */
  async logSecurityEvent(playerId, eventType, details) {
    const SecurityLog = require('../../models/security/securityLog');
    
    try {
      await SecurityLog.create({
        playerId,
        eventType,
        details,
        timestamp: new Date(),
        severity: this.getEventSeverity(eventType)
      });

      // Alert on critical events
      if (this.getEventSeverity(eventType) === 'critical') {
        console.error(`CRITICAL SECURITY EVENT: ${eventType}`, { playerId, details });
        // TODO: Implement alerting system
      }
    } catch (error) {
      console.error('Error logging security event:', error);
    }
  }

  /**
   * Get event severity level
   */
  getEventSeverity(eventType) {
    const severityMap = {
      'result_mismatch': 'critical',
      'invalid_game_state': 'high',
      'suspicious_betting': 'medium',
      'rapid_actions': 'medium',
      'unauthorized_origin': 'high'
    };
    
    return severityMap[eventType] || 'low';
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      const expiredSessions = await GameSession.find({
        status: 'active',
        expiresAt: { $lt: new Date() }
      });

      for (const session of expiredSessions) {
        // Return locked funds
        const cachedState = this.gameStates.get(session._id.toString());
        if (cachedState && cachedState.fundLockId) {
          const fundLock = this.activeFundLocks.get(cachedState.fundLockId);
          if (fundLock) {
            await addUserBalance(fundLock.playerId, fundLock.tokenType, fundLock.amount);
            this.activeFundLocks.delete(cachedState.fundLockId);
          }
        }

        // Update session status
        session.status = 'expired';
        await session.save();

        // Remove from cache
        this.gameStates.delete(session._id.toString());
      }

      console.log(`Cleaned up ${expiredSessions.length} expired game sessions`);
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
    }
  }
}

module.exports = new GameSecurityService();