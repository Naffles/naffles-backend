const stakingService = require('../services/stakingService');

class StakingController {
  // User staking endpoints
  async getUserPortfolio(req, res) {
    try {
      const userId = req.user.id;
      const portfolio = await stakingService.getUserStakingPortfolio(userId);
      
      res.json({
        success: true,
        data: portfolio
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getEligibleNFTs(req, res) {
    try {
      const userId = req.user.id;
      const eligibleNFTs = await stakingService.getUserEligibleNFTs(userId);
      
      res.json({
        success: true,
        data: eligibleNFTs
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getStakingHistory(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10, status } = req.query;
      
      const history = await stakingService.getUserStakingHistory(userId, {
        page: parseInt(page),
        limit: parseInt(limit),
        status
      });
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getPositionDetails(req, res) {
    try {
      const userId = req.user.id;
      const { positionId } = req.params;
      
      const position = await stakingService.getStakingPositionDetails(userId, positionId);
      
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Staking position not found'
        });
      }
      
      res.json({
        success: true,
        data: position
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async calculateProjectedRewards(req, res) {
    try {
      const { contractId, duration, nftCount = 1 } = req.query;
      
      if (!contractId || !duration) {
        return res.status(400).json({
          success: false,
          message: 'Contract ID and duration are required'
        });
      }

      const projectedRewards = await stakingService.calculateProjectedRewards(
        contractId,
        parseInt(duration),
        parseInt(nftCount)
      );
      
      res.json({
        success: true,
        data: projectedRewards
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async stakeNFT(req, res) {
    try {
      const userId = req.user.id;
      const { contractId, nftData, stakingDuration } = req.body;

      // Validate required fields
      if (!contractId || !nftData || !stakingDuration) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: contractId, nftData, stakingDuration'
        });
      }

      if (!nftData.contractAddress || !nftData.tokenId) {
        return res.status(400).json({
          success: false,
          message: 'NFT data must include contractAddress and tokenId'
        });
      }

      const position = await stakingService.stakeNFT(userId, contractId, nftData, stakingDuration);
      
      res.json({
        success: true,
        message: 'NFT staked successfully',
        data: position
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async unstakeNFT(req, res) {
    try {
      const userId = req.user.id;
      const { positionId } = req.params;
      const { txHash, blockNumber } = req.body;

      const position = await stakingService.unstakeNFT(userId, positionId, txHash, blockNumber);
      
      res.json({
        success: true,
        message: 'NFT unstaked successfully',
        data: position
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getPendingRewards(req, res) {
    try {
      const userId = req.user.id;
      const rewards = await stakingService.calculateUserPendingRewards(userId);
      
      res.json({
        success: true,
        data: rewards
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getStakingContracts(req, res) {
    try {
      const filters = {
        isActive: true,
        isValidated: true
      };

      if (req.query.blockchain) {
        filters.blockchain = req.query.blockchain;
      }

      const contracts = await stakingService.getStakingContracts(filters);
      
      res.json({
        success: true,
        data: contracts
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Admin endpoints
  async createStakingContract(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const contractData = req.body;
      const adminUserId = req.user.id;

      const contract = await stakingService.createStakingContract(contractData, adminUserId);
      
      res.json({
        success: true,
        message: 'Staking contract created successfully',
        data: contract
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateStakingContract(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { contractId } = req.params;
      const updates = req.body;
      const adminUserId = req.user.id;

      const contract = await stakingService.updateStakingContract(contractId, updates, adminUserId);
      
      res.json({
        success: true,
        message: 'Staking contract updated successfully',
        data: contract
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async validateStakingContract(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { contractId } = req.params;
      const { validationNotes } = req.body;
      const adminUserId = req.user.id;

      const contract = await stakingService.validateStakingContract(contractId, adminUserId, validationNotes);
      
      res.json({
        success: true,
        message: 'Staking contract validated successfully',
        data: contract
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getAllStakingContracts(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const filters = {};
      
      if (req.query.blockchain) {
        filters.blockchain = req.query.blockchain;
      }
      
      if (req.query.isActive !== undefined) {
        filters.isActive = req.query.isActive === 'true';
      }
      
      if (req.query.isValidated !== undefined) {
        filters.isValidated = req.query.isValidated === 'true';
      }

      const contracts = await stakingService.getStakingContracts(filters);
      
      res.json({
        success: true,
        data: contracts
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getStakingAnalytics(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const timeRange = parseInt(req.query.timeRange) || 30;
      const analytics = await stakingService.getStakingAnalytics(timeRange);
      
      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getContractPerformance(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { contractId } = req.params;
      const metrics = await stakingService.getContractPerformanceMetrics(contractId);
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async distributeRewards(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const results = await stakingService.distributeMonthlyRewards();
      
      res.json({
        success: true,
        message: 'Monthly rewards distributed',
        data: results
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Reward-specific endpoints
  async getRewardHistory(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10 } = req.query;
      
      const stakingRewardDistributionService = require('../services/stakingRewardDistributionService');
      const history = await stakingRewardDistributionService.getUserRewardHistory(userId, {
        page: parseInt(page),
        limit: parseInt(limit)
      });
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async claimRewards(req, res) {
    try {
      const userId = req.user.id;
      const { claimRequests } = req.body;

      if (!claimRequests || !Array.isArray(claimRequests)) {
        return res.status(400).json({
          success: false,
          message: 'claimRequests array is required'
        });
      }

      const stakingRewardDistributionService = require('../services/stakingRewardDistributionService');
      const results = await stakingRewardDistributionService.processRewardClaims(userId, claimRequests);
      
      res.json({
        success: true,
        message: 'Reward claims processed',
        data: results
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getDistributionStats(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const stakingRewardScheduler = require('../services/stakingRewardScheduler');
      const stats = stakingRewardScheduler.getDistributionStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async manualDistribution(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { positionIds } = req.body;
      
      const stakingRewardScheduler = require('../services/stakingRewardScheduler');
      const results = await stakingRewardScheduler.manualDistribution(positionIds);
      
      res.json({
        success: true,
        message: 'Manual distribution completed',
        data: results
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async checkMissedDistributions(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const stakingRewardDistributionService = require('../services/stakingRewardDistributionService');
      const results = await stakingRewardDistributionService.checkAndProcessMissedDistributions();
      
      res.json({
        success: true,
        message: 'Missed distributions check completed',
        data: results
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new StakingController();