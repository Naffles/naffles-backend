const GameSession = require("../models/game/gameSession");
const User = require("../models/user/user");
const gameSessionService = require("./gameSessionService");
const gamingNFTService = require("./gamingNFTService");
const { isUserHasEnoughBalance } = require("./socket/helpers");
const { convertToBigInt, convertToNum } = require("../utils/convert");
const { validateBetAmount } = require("../controllers/admin/betLimitsController");

class WageringApiService {
  /**
   * Validate player balance for external third-party games
   * @param {string} playerId - Player user ID
   * @param {string} tokenType - Token type
   * @param {string} betAmount - Bet amount as string
   * @returns {Object} Balance validation result
   */
  async validateBalance(playerId, tokenType, betAmount) {
    try {
      // Validate player exists
      const player = await User.findById(playerId);
      if (!player) {
        throw new Error("Player not found");
      }

      // Check balance
      const hasBalance = await isUserHasEnoughBalance(playerId, tokenType, betAmount);
      
      return {
        playerId,
        tokenType,
        betAmount,
        hasBalance,
        timestamp: new Date()
      };
    } catch (error) {
      console.error("Error validating balance:", error);
      throw error;
    }
  }

  /**
   * Create a wager session for external third-party games
   * @param {string} playerId - Player user ID
   * @param {string} tokenType - Token type
   * @param {string} betAmount - Bet amount as string
   * @param {string} thirdPartyGameId - External game identifier
   * @param {Object} gameMetadata - Additional game metadata
   * @returns {Object} Created wager session
   */
  async createWagerSession(playerId, tokenType, betAmount, thirdPartyGameId, gameMetadata = {}) {
    try {
      // Validate player exists
      const player = await User.findById(playerId);
      if (!player) {
        throw new Error("Player not found");
      }

      // Validate bet amount against limits (for supported game types)
      if (["blackjack", "coinToss", "rockPaperScissors"].includes(gameType)) {
        const betValidation = await validateBetAmount(gameType, tokenType, betAmount);
        if (!betValidation.isValid) {
          throw new Error(betValidation.error);
        }
      }

      // Check balance
      const hasBalance = await isUserHasEnoughBalance(playerId, tokenType, betAmount);
      if (!hasBalance) {
        throw new Error("Insufficient balance");
      }

      // Check for existing active wager session for this third-party game
      const existingSession = await GameSession.findOne({
        playerId,
        thirdPartyGameId,
        isThirdParty: true,
        status: { $in: ["in_progress"] }
      });

      if (existingSession) {
        throw new Error("Player already has an active wager session for this game");
      }

      // Create game session for third-party game
      const gameSession = await gameSessionService.createGameSession(
        playerId,
        "thirdParty", // Generic game type for external games
        tokenType,
        betAmount,
        true, // Is third-party
        thirdPartyGameId
      );

      // Store game metadata
      gameSession.gameState = {
        gameMetadata,
        sessionType: "wager",
        externalGameId: thirdPartyGameId,
        createdAt: new Date()
      };
      await gameSession.save();

      return {
        sessionId: gameSession._id,
        playerId,
        tokenType,
        betAmount,
        thirdPartyGameId,
        status: gameSession.status,
        expiresAt: gameSession.expiresAt
      };
    } catch (error) {
      console.error("Error creating wager session:", error);
      throw error;
    }
  }

  /**
   * Process payout for external third-party games
   * @param {string} sessionId - Game session ID
   * @param {Object} payoutData - Payout information
   * @returns {Object} Payout result
   */
  async processPayout(sessionId, payoutData) {
    try {
      const session = await GameSession.findById(sessionId);
      if (!session) {
        throw new Error("Wager session not found");
      }

      if (!session.isThirdParty) {
        throw new Error("Session is not a third-party wager session");
      }

      if (session.status !== "in_progress") {
        throw new Error("Wager session is not in progress");
      }

      if (session.isExpired()) {
        throw new Error("Wager session has expired");
      }

      // Validate payout data
      const { winner, playerPayout = "0", gameResult = {} } = payoutData;
      
      if (!["player", "house", "draw"].includes(winner)) {
        throw new Error("Invalid winner value");
      }

      // Validate payout amounts
      const playerPayoutBigInt = BigInt(playerPayout);
      const betAmountBigInt = BigInt(session.betAmount);

      if (playerPayoutBigInt < 0) {
        throw new Error("Player payout cannot be negative");
      }

      // For third-party games, house payout is the bet amount if player loses
      const housePayout = winner === "house" ? session.betAmount : "0";

      const result = {
        winner,
        playerPayout,
        housePayout,
        gameData: {
          externalResult: gameResult,
          sessionType: "wager",
          processedAt: new Date()
        }
      };

      // Complete the session
      const completedSession = await gameSessionService.completeGameSession(sessionId, result);

      return {
        sessionId: completedSession._id,
        playerId: completedSession.playerId,
        thirdPartyGameId: completedSession.thirdPartyGameId,
        result: completedSession.result,
        status: completedSession.status,
        processedAt: completedSession.completedAt
      };
    } catch (error) {
      console.error("Error processing payout:", error);
      throw error;
    }
  }

  /**
   * Get wager session status
   * @param {string} sessionId - Game session ID
   * @returns {Object} Session status
   */
  async getWagerSessionStatus(sessionId) {
    try {
      const session = await GameSession.findById(sessionId);
      if (!session) {
        throw new Error("Wager session not found");
      }

      if (!session.isThirdParty) {
        throw new Error("Session is not a third-party wager session");
      }

      return {
        sessionId: session._id,
        playerId: session.playerId,
        thirdPartyGameId: session.thirdPartyGameId,
        tokenType: session.tokenType,
        betAmount: session.betAmount,
        status: session.status,
        gameState: session.gameState,
        result: session.result,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        completedAt: session.completedAt,
        isExpired: session.isExpired()
      };
    } catch (error) {
      console.error("Error getting wager session status:", error);
      throw error;
    }
  }

  /**
   * Cancel a wager session
   * @param {string} sessionId - Game session ID
   * @param {string} reason - Cancellation reason
   * @returns {Object} Cancelled session info
   */
  async cancelWagerSession(sessionId, reason = "cancelled") {
    try {
      const session = await GameSession.findById(sessionId);
      if (!session) {
        throw new Error("Wager session not found");
      }

      if (!session.isThirdParty) {
        throw new Error("Session is not a third-party wager session");
      }

      const cancelledSession = await gameSessionService.cancelGameSession(sessionId, reason);

      return {
        sessionId: cancelledSession._id,
        playerId: cancelledSession.playerId,
        thirdPartyGameId: cancelledSession.thirdPartyGameId,
        status: cancelledSession.status,
        cancelledAt: cancelledSession.completedAt,
        reason
      };
    } catch (error) {
      console.error("Error cancelling wager session:", error);
      throw error;
    }
  }

  /**
   * Get player's active wager sessions
   * @param {string} playerId - Player user ID
   * @returns {Array} Array of active wager sessions
   */
  async getPlayerActiveWagerSessions(playerId) {
    try {
      const sessions = await GameSession.find({
        playerId,
        isThirdParty: true,
        status: { $in: ["in_progress"] }
      }).sort({ createdAt: -1 });

      return sessions.map(session => ({
        sessionId: session._id,
        thirdPartyGameId: session.thirdPartyGameId,
        tokenType: session.tokenType,
        betAmount: session.betAmount,
        status: session.status,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        isExpired: session.isExpired()
      }));
    } catch (error) {
      console.error("Error getting player active wager sessions:", error);
      throw error;
    }
  }

  /**
   * Get wager session history for a player
   * @param {string} playerId - Player user ID
   * @param {number} limit - Number of sessions to return
   * @param {number} skip - Number of sessions to skip
   * @returns {Object} Paginated wager session history
   */
  async getPlayerWagerHistory(playerId, limit = 20, skip = 0) {
    try {
      const sessions = await GameSession.find({
        playerId,
        isThirdParty: true,
        status: { $in: ["completed", "cancelled", "expired"] }
      })
      .sort({ completedAt: -1 })
      .limit(limit)
      .skip(skip);

      const total = await GameSession.countDocuments({
        playerId,
        isThirdParty: true,
        status: { $in: ["completed", "cancelled", "expired"] }
      });

      return {
        sessions: sessions.map(session => ({
          sessionId: session._id,
          thirdPartyGameId: session.thirdPartyGameId,
          tokenType: session.tokenType,
          betAmount: session.betAmount,
          status: session.status,
          result: session.result,
          createdAt: session.createdAt,
          completedAt: session.completedAt
        })),
        total,
        limit,
        skip,
        hasMore: skip + sessions.length < total
      };
    } catch (error) {
      console.error("Error getting player wager history:", error);
      throw error;
    }
  }

  /**
   * Extend wager session expiration time
   * @param {string} sessionId - Game session ID
   * @param {number} additionalMinutes - Additional minutes to extend
   * @returns {Object} Updated session info
   */
  async extendWagerSession(sessionId, additionalMinutes = 10) {
    try {
      const session = await GameSession.findById(sessionId);
      if (!session) {
        throw new Error("Wager session not found");
      }

      if (!session.isThirdParty) {
        throw new Error("Session is not a third-party wager session");
      }

      if (session.status !== "in_progress") {
        throw new Error("Can only extend active wager sessions");
      }

      const additionalTime = additionalMinutes * 60 * 1000; // Convert to milliseconds
      session.expiresAt = new Date(session.expiresAt.getTime() + additionalTime);
      await session.save();

      return {
        sessionId: session._id,
        newExpiresAt: session.expiresAt,
        extendedBy: additionalMinutes
      };
    } catch (error) {
      console.error("Error extending wager session:", error);
      throw error;
    }
  }

  /**
   * Initialize session-based house slot
   * @param {string} playerId - Player user ID
   * @param {string} gameType - Game type
   * @param {string} tokenType - Token type
   * @param {number} roundsNeeded - Number of rounds needed for session
   * @returns {Object} Session initialization response
   */
  async initializeSlotSession(playerId, gameType, tokenType, roundsNeeded) {
    try {
      const HouseSlot = require("../models/game/houseSlot");
      const vrfService = require("./vrfService");
      const { v4: uuidv4 } = require('uuid');

      // Validate player exists
      const player = await User.findById(playerId);
      if (!player) {
        throw new Error("Player not found");
      }

      // Find available house slot for session
      const availableHouseSlot = await HouseSlot.findOne({
        gameType,
        tokenType,
        isActive: true,
        currentSessionId: null,
        status: "active"
      }).sort({ queuePosition: 1, lastUsed: 1 });

      if (!availableHouseSlot) {
        throw new Error("No available house slots for this game type and token");
      }

      // Generate session ID
      const sessionId = uuidv4();

      // Reserve house slot for session
      availableHouseSlot.reserveForSession(sessionId, 30); // 30 minute session
      await availableHouseSlot.save();

      // Generate batch VRF randomness for entire session
      const vrfData = await vrfService.generateBatchRandomness(roundsNeeded);

      // Calculate balance reserved (safety buffer)
      const maxPayoutPerRound = BigInt(availableHouseSlot.fundAmount) / 
        (BigInt(availableHouseSlot.safetyMultiplier) * BigInt(availableHouseSlot.roundsPerSession));
      const balanceReserved = (BigInt(roundsNeeded) * maxPayoutPerRound).toString();

      // Queue next house slot if current session is near capacity
      let nextHouseSlotQueued = false;
      if (availableHouseSlot.isSessionNearLimit(0.7)) {
        const nextHouseSlot = await this.queueNextHouseSlot(sessionId, gameType, tokenType);
        nextHouseSlotQueued = !!nextHouseSlot;
      }

      return {
        sessionId,
        houseSlotId: availableHouseSlot._id.toString(),
        gameType,
        tokenType,
        roundsAllocated: roundsNeeded,
        vrfData: {
          randomness: vrfData.randomness,
          proof: vrfData.proof,
          seed: vrfData.seed
        },
        balanceReserved,
        sessionExpiresAt: availableHouseSlot.sessionExpiresAt,
        nextHouseSlotQueued
      };
    } catch (error) {
      console.error("Error initializing slot session:", error);
      throw error;
    }
  }

  /**
   * Queue next house slot when current session approaches limit
   * @param {string} currentSessionId - Current session ID
   * @param {string} gameType - Game type
   * @param {string} tokenType - Token type
   * @returns {Object|null} Next house slot reservation or null
   */
  async queueNextHouseSlot(currentSessionId, gameType, tokenType) {
    try {
      const HouseSlot = require("../models/game/houseSlot");

      // Find next available house slot
      const nextHouseSlot = await HouseSlot.findOne({
        gameType,
        tokenType,
        isActive: true,
        currentSessionId: null,
        status: "active"
      }).sort({ queuePosition: 1, lastUsed: 1 });

      if (!nextHouseSlot) {
        return null;
      }

      // Pre-reserve for seamless transition
      const nextSessionId = `${currentSessionId}_next`;
      nextHouseSlot.reserveForSession(nextSessionId, 35); // Slightly longer reservation
      await nextHouseSlot.save();

      return {
        houseSlotId: nextHouseSlot._id.toString(),
        sessionId: nextSessionId,
        roundsAllocated: nextHouseSlot.roundsPerSession
      };
    } catch (error) {
      console.error("Error queuing next house slot:", error);
      return null;
    }
  }

  /**
   * Sync session state for periodic updates
   * @param {string} sessionId - Session ID
   * @param {number} roundsUsed - Rounds used so far
   * @param {string} currentBalance - Current balance
   * @returns {Object} Sync result
   */
  async syncSlotSession(sessionId, roundsUsed, currentBalance) {
    try {
      const HouseSlot = require("../models/game/houseSlot");

      const houseSlot = await HouseSlot.findOne({ currentSessionId: sessionId });
      if (!houseSlot) {
        throw new Error("House slot session not found");
      }

      if (houseSlot.isSessionExpired()) {
        throw new Error("Session has expired");
      }

      // Update session state
      houseSlot.sessionRoundsUsed = roundsUsed;
      await houseSlot.save();

      // Check if we need to queue next house slot
      let nextHouseSlotQueued = false;
      if (houseSlot.isSessionNearLimit(0.8) && !houseSlot.nextHouseSlotQueued) {
        const nextSlot = await this.queueNextHouseSlot(
          sessionId, 
          houseSlot.gameType, 
          houseSlot.tokenType
        );
        nextHouseSlotQueued = !!nextSlot;
        
        if (nextHouseSlotQueued) {
          houseSlot.nextHouseSlotQueued = true;
          await houseSlot.save();
        }
      }

      return {
        sessionId,
        roundsUsed,
        roundsRemaining: houseSlot.roundsPerSession - roundsUsed,
        sessionExpiresAt: houseSlot.sessionExpiresAt,
        nextHouseSlotQueued,
        isNearLimit: houseSlot.isSessionNearLimit(0.8)
      };
    } catch (error) {
      console.error("Error syncing slot session:", error);
      throw error;
    }
  }

  /**
   * Complete session with final state reconciliation
   * @param {string} sessionId - Session ID
   * @param {Object} finalResult - Final game result
   * @param {number} totalRoundsPlayed - Total rounds played
   * @param {string} finalBalance - Final balance
   * @returns {Object} Completion result
   */
  async completeSlotSession(sessionId, finalResult, totalRoundsPlayed, finalBalance) {
    try {
      const HouseSlot = require("../models/game/houseSlot");

      const houseSlot = await HouseSlot.findOne({ currentSessionId: sessionId });
      if (!houseSlot) {
        throw new Error("House slot session not found");
      }

      // Update house slot with final results
      if (finalResult.winner === "house") {
        houseSlot.processWin(finalResult.houseWinnings || "0");
      } else if (finalResult.winner === "player") {
        houseSlot.processLoss(finalResult.houseLosses || "0");
      }

      // Release house slot from session
      houseSlot.releaseFromSession();
      await houseSlot.save();

      // Clean up any queued next house slot if not used
      const nextSessionId = `${sessionId}_next`;
      const queuedSlot = await HouseSlot.findOne({ currentSessionId: nextSessionId });
      if (queuedSlot) {
        queuedSlot.releaseFromSession();
        await queuedSlot.save();
      }

      return {
        sessionId,
        houseSlotId: houseSlot._id.toString(),
        totalRoundsPlayed,
        finalResult,
        completedAt: new Date(),
        houseSlotReleased: true
      };
    } catch (error) {
      console.error("Error completing slot session:", error);
      throw error;
    }
  }

  /**
   * Initialize gaming session with NFT data for external games
   * @param {string} playerId - Player user ID
   * @param {string} gameType - Type of game (e.g., 'cryptoReels')
   * @param {string} tokenType - Token type
   * @param {string} betAmount - Bet amount as string
   * @param {string} thirdPartyGameId - External game identifier
   * @returns {Object} Game initialization data including NFT bonuses
   */
  async initializeGamingSession(playerId, gameType, tokenType, betAmount, thirdPartyGameId) {
    try {
      // Validate player exists
      const player = await User.findById(playerId);
      if (!player) {
        throw new Error("Player not found");
      }

      // Validate bet amount against limits (for supported game types)
      if (["blackjack", "coinToss", "rockPaperScissors"].includes(gameType)) {
        const betValidation = await validateBetAmount(gameType, tokenType, betAmount);
        if (!betValidation.isValid) {
          throw new Error(betValidation.error);
        }
      }

      // Check balance
      const hasBalance = await isUserHasEnoughBalance(playerId, tokenType, betAmount);
      if (!hasBalance) {
        throw new Error("Insufficient balance");
      }

      // Get NFT configuration for this game type
      const nftConfig = await gamingNFTService.getGameNFTConfiguration(gameType);
      
      // Get player's eligible NFTs
      const playerNFTs = await gamingNFTService.getPlayerGamingNFTs(playerId, nftConfig);

      // Create the wager session
      const wagerSession = await this.createWagerSession(
        playerId, 
        tokenType, 
        betAmount, 
        thirdPartyGameId,
        {
          gameType,
          nftBonusEnabled: playerNFTs.hasNFTs,
          nftMultiplier: playerNFTs.totalMultiplier
        }
      );

      return {
        sessionId: wagerSession.sessionId,
        playerId,
        gameType,
        tokenType,
        betAmount,
        playerBalance: player.balance[tokenType] || "0",
        nftData: {
          hasEligibleNFTs: playerNFTs.hasNFTs,
          eligibleNFTs: playerNFTs.eligibleNFTs,
          totalMultiplier: playerNFTs.totalMultiplier,
          walletCount: playerNFTs.walletCount,
          scannedAt: playerNFTs.scannedAt
        },
        gameConfiguration: {
          nftContracts: nftConfig,
          bonusType: 'multiplicative' // How NFT bonuses stack
        },
        status: wagerSession.status,
        expiresAt: wagerSession.expiresAt,
        timestamp: new Date()
      };

    } catch (error) {
      console.error("Error initializing gaming session:", error);
      throw error;
    }
  }

  /**
   * Refresh player's NFT data during active session
   * @param {string} playerId - Player user ID
   * @param {string} gameType - Type of game
   * @returns {Object} Updated NFT data
   */
  async refreshPlayerNFTs(playerId, gameType) {
    try {
      const nftConfig = await gamingNFTService.getGameNFTConfiguration(gameType);
      const playerNFTs = await gamingNFTService.getPlayerGamingNFTs(playerId, nftConfig);

      return {
        hasEligibleNFTs: playerNFTs.hasNFTs,
        eligibleNFTs: playerNFTs.eligibleNFTs,
        totalMultiplier: playerNFTs.totalMultiplier,
        refreshedAt: new Date()
      };

    } catch (error) {
      console.error("Error refreshing player NFTs:", error);
      throw error;
    }
  }

  /**
   * Validate NFT ownership for anti-cheat purposes
   * @param {string} playerId - Player user ID
   * @param {string} contractAddress - NFT contract address
   * @param {string} tokenId - NFT token ID
   * @returns {Object} Validation result
   */
  async validateNFTOwnership(playerId, contractAddress, tokenId) {
    try {
      const isValid = await gamingNFTService.validateNFTOwnership(playerId, contractAddress, tokenId);
      
      return {
        playerId,
        contractAddress,
        tokenId,
        isValid,
        validatedAt: new Date()
      };

    } catch (error) {
      console.error("Error validating NFT ownership:", error);
      throw error;
    }
  }
}

module.exports = new WageringApiService();