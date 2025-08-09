const stakingService = require('../../services/stakingService');
const smartContractService = require('../../services/smartContractService');
const blockchainVerificationService = require('../../services/blockchainVerificationService');
const StakingPosition = require('../../models/staking/stakingPosition');
const StakingContract = require('../../models/staking/stakingContract');

class SmartContractAdminController {
  // Emergency unlock functions

  async adminUnlockNFT(req, res) {
    try {
      const { positionId, reason } = req.body;
      const adminUserId = req.user.id;

      if (!positionId || !reason) {
        return res.status(400).json({
          success: false,
          message: 'Position ID and reason are required'
        });
      }

      if (reason.length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Reason must be at least 10 characters long'
        });
      }

      const result = await stakingService.adminUnlockNFT(positionId, reason, adminUserId);

      res.json({
        success: true,
        message: 'NFT unlocked successfully',
        data: result
      });
    } catch (error) {
      console.error('Error admin unlocking NFT:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async emergencyWithdrawNFT(req, res) {
    try {
      const { positionId, recipientAddress, reason } = req.body;
      const adminUserId = req.user.id;

      if (!positionId || !recipientAddress || !reason) {
        return res.status(400).json({
          success: false,
          message: 'Position ID, recipient address, and reason are required'
        });
      }

      if (reason.length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Reason must be at least 10 characters long'
        });
      }

      // Validate recipient address format
      if (!this.isValidAddress(recipientAddress)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid recipient address format'
        });
      }

      const result = await stakingService.emergencyWithdrawNFT(
        positionId,
        recipientAddress,
        reason,
        adminUserId
      );

      res.json({
        success: true,
        message: 'NFT withdrawn successfully',
        data: result
      });
    } catch (error) {
      console.error('Error emergency withdrawing NFT:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Contract control functions

  async pauseContract(req, res) {
    try {
      const { blockchain } = req.body;
      const adminUserId = req.user.id;

      if (!blockchain) {
        return res.status(400).json({
          success: false,
          message: 'Blockchain is required'
        });
      }

      const supportedChains = ['ethereum', 'polygon', 'base', 'solana'];
      if (!supportedChains.includes(blockchain.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'Unsupported blockchain'
        });
      }

      const result = await stakingService.pauseStakingContract(blockchain, adminUserId);

      res.json({
        success: true,
        message: `${blockchain} staking contract paused successfully`,
        data: result
      });
    } catch (error) {
      console.error('Error pausing contract:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async unpauseContract(req, res) {
    try {
      const { blockchain } = req.body;
      const adminUserId = req.user.id;

      if (!blockchain) {
        return res.status(400).json({
          success: false,
          message: 'Blockchain is required'
        });
      }

      const supportedChains = ['ethereum', 'polygon', 'base', 'solana'];
      if (!supportedChains.includes(blockchain.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'Unsupported blockchain'
        });
      }

      const result = await stakingService.unpauseStakingContract(blockchain, adminUserId);

      res.json({
        success: true,
        message: `${blockchain} staking contract unpaused successfully`,
        data: result
      });
    } catch (error) {
      console.error('Error unpausing contract:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Verification and monitoring functions

  async verifyStakingPosition(req, res) {
    try {
      const { positionId } = req.params;

      if (!positionId) {
        return res.status(400).json({
          success: false,
          message: 'Position ID is required'
        });
      }

      const verification = await stakingService.verifyStakingPosition(positionId);

      res.json({
        success: true,
        message: 'Position verification completed',
        data: verification
      });
    } catch (error) {
      console.error('Error verifying staking position:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async verifyUserStaking(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      const verification = await stakingService.verifyUserStaking(userId);

      res.json({
        success: true,
        message: 'User staking verification completed',
        data: verification
      });
    } catch (error) {
      console.error('Error verifying user staking:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async performDataConsistencyCheck(req, res) {
    try {
      const { blockchain } = req.query;

      const consistencyCheck = await stakingService.performDataConsistencyCheck(blockchain);

      res.json({
        success: true,
        message: 'Data consistency check completed',
        data: consistencyCheck
      });
    } catch (error) {
      console.error('Error performing data consistency check:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Smart contract status and health

  async getSmartContractHealth(req, res) {
    try {
      const health = await stakingService.getSmartContractHealth();

      res.json({
        success: true,
        message: 'Smart contract health retrieved',
        data: health
      });
    } catch (error) {
      console.error('Error getting smart contract health:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getContractStats(req, res) {
    try {
      const { blockchain } = req.params;

      if (!blockchain) {
        return res.status(400).json({
          success: false,
          message: 'Blockchain is required'
        });
      }

      const stats = await smartContractService.getContractStats(blockchain);

      if (!stats) {
        return res.status(404).json({
          success: false,
          message: 'Contract stats not available'
        });
      }

      res.json({
        success: true,
        message: 'Contract stats retrieved',
        data: stats
      });
    } catch (error) {
      console.error('Error getting contract stats:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Collection management for smart contracts

  async addCollectionToContract(req, res) {
    try {
      const { blockchain, nftContract, sixMonthTickets, twelveMonthTickets, threeYearTickets } = req.body;
      const adminUserId = req.user.id;

      if (!blockchain || !nftContract || !sixMonthTickets || !twelveMonthTickets || !threeYearTickets) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required'
        });
      }

      // Get admin user for wallet address
      const User = require('../../models/user/user');
      const adminUser = await User.findById(adminUserId);
      if (!adminUser || !adminUser.walletAddresses || adminUser.walletAddresses.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Admin user has no wallet addresses'
        });
      }

      const adminWallet = adminUser.walletAddresses[0];

      const result = await smartContractService.addCollection(
        blockchain,
        nftContract,
        sixMonthTickets,
        twelveMonthTickets,
        threeYearTickets,
        adminWallet
      );

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: `Failed to add collection to smart contract: ${result.error}`
        });
      }

      res.json({
        success: true,
        message: 'Collection added to smart contract successfully',
        data: result
      });
    } catch (error) {
      console.error('Error adding collection to contract:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Batch operations

  async batchVerifyPositions(req, res) {
    try {
      const { positionIds } = req.body;

      if (!positionIds || !Array.isArray(positionIds) || positionIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Position IDs array is required'
        });
      }

      if (positionIds.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Maximum 100 positions can be verified at once'
        });
      }

      // Get positions from database
      const positions = await StakingPosition.find({
        _id: { $in: positionIds },
        smartContractPositionId: { $exists: true, $ne: null }
      });

      if (positions.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No positions found with smart contract integration'
        });
      }

      // Prepare verification data
      const verificationData = positions.map(pos => ({
        blockchain: pos.blockchain,
        positionId: pos.smartContractPositionId,
        dbPositionId: pos._id
      }));

      const results = await blockchainVerificationService.batchVerifyStakingPositions(verificationData);

      res.json({
        success: true,
        message: 'Batch verification completed',
        data: {
          totalRequested: positionIds.length,
          totalFound: positions.length,
          totalVerified: results.filter(r => r.verified).length,
          results
        }
      });
    } catch (error) {
      console.error('Error batch verifying positions:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Analytics and reporting

  async getSmartContractAnalytics(req, res) {
    try {
      const { timeRange = 30 } = req.query;

      // Get basic analytics
      const analytics = await stakingService.getStakingAnalytics(parseInt(timeRange));

      // Add smart contract specific metrics
      const smartContractMetrics = await this.getSmartContractMetrics();

      res.json({
        success: true,
        message: 'Smart contract analytics retrieved',
        data: {
          ...analytics,
          smartContract: smartContractMetrics
        }
      });
    } catch (error) {
      console.error('Error getting smart contract analytics:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getSmartContractMetrics() {
    try {
      const [
        totalPositions,
        onChainVerified,
        recentTransactions,
        contractHealth
      ] = await Promise.all([
        StakingPosition.countDocuments({ status: 'active' }),
        StakingPosition.countDocuments({ 
          status: 'active', 
          onChainVerified: true 
        }),
        StakingPosition.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          onChainVerified: true
        }),
        stakingService.getSmartContractHealth()
      ]);

      return {
        totalActivePositions: totalPositions,
        onChainVerified,
        verificationRate: totalPositions > 0 ? 
          Math.round((onChainVerified / totalPositions) * 100) : 0,
        recentTransactions,
        contractHealth
      };
    } catch (error) {
      console.error('Error getting smart contract metrics:', error);
      return {
        totalActivePositions: 0,
        onChainVerified: 0,
        verificationRate: 0,
        recentTransactions: 0,
        contractHealth: { status: 'error', error: error.message }
      };
    }
  }

  // Utility functions

  isValidAddress(address) {
    // Ethereum-style address validation
    if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return true;
    }
    
    // Solana address validation (base58, 32-44 characters)
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      return true;
    }
    
    return false;
  }

  // Export functions for CSV/reporting

  async exportStakingData(req, res) {
    try {
      const { blockchain, format = 'csv', includeSmartContract = true } = req.query;

      const query = { status: 'active' };
      if (blockchain) {
        query.blockchain = blockchain.toLowerCase();
      }

      const positions = await StakingPosition.find(query)
        .populate('stakingContractId userId')
        .sort({ createdAt: -1 })
        .limit(10000); // Limit for performance

      if (format === 'csv') {
        const csv = this.convertToCSV(positions, includeSmartContract === 'true');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="staking-data-${Date.now()}.csv"`);
        res.send(csv);
      } else {
        res.json({
          success: true,
          message: 'Staking data exported',
          data: positions
        });
      }
    } catch (error) {
      console.error('Error exporting staking data:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  convertToCSV(positions, includeSmartContract) {
    const headers = [
      'Position ID',
      'User ID',
      'User Email',
      'NFT Contract',
      'Token ID',
      'Blockchain',
      'Staking Duration',
      'Staked At',
      'Unlock At',
      'Status',
      'Total Rewards',
      'Wallet Address'
    ];

    if (includeSmartContract) {
      headers.push(
        'Smart Contract Position ID',
        'On-Chain Verified',
        'Transaction Hash',
        'Block Number'
      );
    }

    const rows = [headers.join(',')];

    for (const position of positions) {
      const row = [
        position._id,
        position.userId,
        position.userId?.email || 'N/A',
        position.nftContractAddress,
        position.nftTokenId,
        position.blockchain,
        `${position.stakingDuration} months`,
        position.stakedAt.toISOString(),
        position.unstakeAt.toISOString(),
        position.status,
        position.totalRewardsEarned,
        position.walletAddress
      ];

      if (includeSmartContract) {
        row.push(
          position.smartContractPositionId || 'N/A',
          position.onChainVerified ? 'Yes' : 'No',
          position.stakingTransaction?.txHash || 'N/A',
          position.stakingTransaction?.blockNumber || 'N/A'
        );
      }

      rows.push(row.join(','));
    }

    return rows.join('\n');
  }
}

module.exports = new SmartContractAdminController();