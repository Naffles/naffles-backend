const communityGamblingService = require('../services/communityGamblingService');

class CommunityGamblingController {
  // Create community raffle
  async createCommunityRaffle(req, res) {
    try {
      const { communityId } = req.params;
      const creatorId = req.user.id;
      const raffleData = req.body;

      const raffle = await communityGamblingService.createCommunityRaffle(
        communityId,
        creatorId,
        raffleData
      );

      res.status(201).json({
        success: true,
        message: 'Community raffle created successfully',
        data: raffle
      });
    } catch (error) {
      console.error('Error creating community raffle:', error);
      const statusCode = error.message.includes('permission') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to create community raffle',
        error: error.message
      });
    }
  }

  // Create community allowlist raffle
  async createCommunityAllowlistRaffle(req, res) {
    try {
      const { communityId } = req.params;
      const creatorId = req.user.id;
      const allowlistData = req.body;

      const raffle = await communityGamblingService.createCommunityAllowlistRaffle(
        communityId,
        creatorId,
        allowlistData
      );

      res.status(201).json({
        success: true,
        message: 'Community allowlist raffle created successfully',
        data: raffle
      });
    } catch (error) {
      console.error('Error creating community allowlist raffle:', error);
      const statusCode = error.message.includes('permission') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to create community allowlist raffle',
        error: error.message
      });
    }
  }

  // Create community gaming session
  async createCommunityGamingSession(req, res) {
    try {
      const { communityId } = req.params;
      const creatorId = req.user.id;
      const gameConfig = req.body;

      const gameSession = await communityGamblingService.createCommunityGamingSession(
        communityId,
        creatorId,
        gameConfig
      );

      res.status(201).json({
        success: true,
        message: 'Community gaming session created successfully',
        data: gameSession
      });
    } catch (error) {
      console.error('Error creating community gaming session:', error);
      const statusCode = error.message.includes('permission') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to create community gaming session',
        error: error.message
      });
    }
  }

  // Fund community house slot
  async fundCommunityHouseSlot(req, res) {
    try {
      const { communityId } = req.params;
      const ownerId = req.user.id;
      const houseSlotData = req.body;

      const houseSlot = await communityGamblingService.fundCommunityHouseSlot(
        communityId,
        ownerId,
        houseSlotData
      );

      res.status(201).json({
        success: true,
        message: 'Community house slot funded successfully',
        data: houseSlot
      });
    } catch (error) {
      console.error('Error funding community house slot:', error);
      const statusCode = error.message.includes('permission') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to fund community house slot',
        error: error.message
      });
    }
  }

  // Get community raffles
  async getCommunityRaffles(req, res) {
    try {
      const { communityId } = req.params;
      const options = {
        status: req.query.status,
        type: req.query.type,
        limit: parseInt(req.query.limit) || 50,
        skip: parseInt(req.query.skip) || 0
      };

      const raffles = await communityGamblingService.getCommunityRaffles(communityId, options);

      res.json({
        success: true,
        data: raffles
      });
    } catch (error) {
      console.error('Error getting community raffles:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get community raffles',
        error: error.message
      });
    }
  }

  // Get community gaming sessions
  async getCommunityGamingSessions(req, res) {
    try {
      const { communityId } = req.params;
      const options = {
        gameType: req.query.gameType,
        status: req.query.status,
        limit: parseInt(req.query.limit) || 50,
        skip: parseInt(req.query.skip) || 0
      };

      const sessions = await communityGamblingService.getCommunityGamingSessions(
        communityId,
        options
      );

      res.json({
        success: true,
        data: sessions
      });
    } catch (error) {
      console.error('Error getting community gaming sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get community gaming sessions',
        error: error.message
      });
    }
  }

  // Get community house slots
  async getCommunityHouseSlots(req, res) {
    try {
      const { communityId } = req.params;
      const options = {
        status: req.query.status,
        limit: parseInt(req.query.limit) || 50,
        skip: parseInt(req.query.skip) || 0
      };

      const houseSlots = await communityGamblingService.getCommunityHouseSlots(
        communityId,
        options
      );

      res.json({
        success: true,
        data: houseSlots
      });
    } catch (error) {
      console.error('Error getting community house slots:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get community house slots',
        error: error.message
      });
    }
  }

  // Process community points bet
  async processCommunityPointsBet(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;
      const { gameType, betAmount, gameData } = req.body;

      if (!gameType || !betAmount || betAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid game type and bet amount are required'
        });
      }

      const result = await communityGamblingService.processCommunityPointsBet(
        communityId,
        userId,
        gameType,
        betAmount,
        gameData
      );

      res.json({
        success: true,
        message: 'Bet processed successfully',
        data: result
      });
    } catch (error) {
      console.error('Error processing community points bet:', error);
      const statusCode = error.message.includes('Insufficient') ? 400 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to process bet',
        error: error.message
      });
    }
  }

  // Manage community raffle VRF
  async manageCommunityRaffleVRF(req, res) {
    try {
      const { raffleId } = req.params;
      const { action, data } = req.body;

      if (!action) {
        return res.status(400).json({
          success: false,
          message: 'Action is required'
        });
      }

      const result = await communityGamblingService.manageCommunityRaffleVRF(
        raffleId,
        action,
        data
      );

      res.json({
        success: true,
        message: `Raffle ${action} completed successfully`,
        data: result
      });
    } catch (error) {
      console.error('Error managing community raffle VRF:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to manage raffle VRF',
        error: error.message
      });
    }
  }

  // Get community gambling analytics
  async getCommunityGamblingAnalytics(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;
      const timeframe = req.query.timeframe || '30d';

      const analytics = await communityGamblingService.getCommunityGamblingAnalytics(
        communityId,
        userId,
        timeframe
      );

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Error getting community gambling analytics:', error);
      const statusCode = error.message.includes('permission') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to get gambling analytics',
        error: error.message
      });
    }
  }

  // Get supported game types for community gambling
  async getSupportedGameTypes(req, res) {
    try {
      const gameTypes = [
        {
          type: 'blackjack',
          name: 'Blackjack',
          description: 'Classic card game with community points betting',
          minBet: 1,
          maxBet: 1000,
          houseEdge: 0.005,
          supportsCommunityPoints: true
        },
        {
          type: 'coin_toss',
          name: 'Coin Toss',
          description: 'Simple heads or tails betting game',
          minBet: 1,
          maxBet: 500,
          houseEdge: 0.02,
          supportsCommunityPoints: true
        },
        {
          type: 'rock_paper_scissors',
          name: 'Rock Paper Scissors',
          description: 'Classic hand game with betting',
          minBet: 1,
          maxBet: 300,
          houseEdge: 0.01,
          supportsCommunityPoints: true
        },
        {
          type: 'crypto_slots',
          name: 'Crypto Slots',
          description: 'Slot machine game with various themes',
          minBet: 1,
          maxBet: 2000,
          houseEdge: 0.03,
          supportsCommunityPoints: true
        }
      ];

      res.json({
        success: true,
        data: gameTypes
      });
    } catch (error) {
      console.error('Error getting supported game types:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get supported game types',
        error: error.message
      });
    }
  }

  // Get raffle types for community raffles
  async getSupportedRaffleTypes(req, res) {
    try {
      const raffleTypes = [
        {
          type: 'nft',
          name: 'NFT Raffle',
          description: 'Raffle for NFT prizes',
          requiresNFTDeposit: true,
          supportsCommunityPoints: true,
          supportsVRF: true
        },
        {
          type: 'token',
          name: 'Token Raffle',
          description: 'Raffle for cryptocurrency tokens',
          requiresTokenDeposit: true,
          supportsCommunityPoints: true,
          supportsVRF: true
        },
        {
          type: 'allowlist',
          name: 'Allowlist Raffle',
          description: 'Raffle for project allowlist spots',
          requiresNFTDeposit: false,
          supportsCommunityPoints: true,
          supportsVRF: true,
          isAllowlistOnly: true
        },
        {
          type: 'physical',
          name: 'Physical Prize Raffle',
          description: 'Raffle for physical items',
          requiresNFTDeposit: false,
          supportsCommunityPoints: true,
          supportsVRF: true
        }
      ];

      res.json({
        success: true,
        data: raffleTypes
      });
    } catch (error) {
      console.error('Error getting supported raffle types:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get supported raffle types',
        error: error.message
      });
    }
  }
}

module.exports = new CommunityGamblingController();