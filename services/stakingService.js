const StakingContract = require('../models/staking/stakingContract');
const StakingPosition = require('../models/staking/stakingPosition');
const User = require('../models/user/user');
const gamingNFTService = require('./gamingNFTService');
const stakingBlockchainService = require('./stakingBlockchainService');

class StakingService {
  // Contract management methods
  async createStakingContract(contractData, adminUserId) {
    try {
      // Validate contract address format
      if (!StakingContract.validateContractAddress(contractData.contractAddress, contractData.blockchain)) {
        throw new Error(`Invalid contract address format for ${contractData.blockchain}`);
      }

      // Check if contract already exists
      const existingContract = await StakingContract.findOne({
        contractAddress: contractData.contractAddress.toLowerCase(),
        blockchain: contractData.blockchain.toLowerCase()
      });

      if (existingContract) {
        throw new Error('Contract already exists in the system');
      }

      // Get default reward structure for the blockchain
      const defaultRewards = await StakingContract.getDefaultRewardStructure(contractData.blockchain);

      const stakingContract = new StakingContract({
        ...contractData,
        contractAddress: contractData.contractAddress.toLowerCase(),
        blockchain: contractData.blockchain.toLowerCase(),
        rewardStructures: contractData.rewardStructures || defaultRewards,
        createdBy: adminUserId
      });

      await stakingContract.save();
      return stakingContract;
    } catch (error) {
      throw new Error(`Failed to create staking contract: ${error.message}`);
    }
  }

  async updateStakingContract(contractId, updates, adminUserId) {
    try {
      const contract = await StakingContract.findById(contractId);
      if (!contract) {
        throw new Error('Staking contract not found');
      }

      // Update allowed fields
      const allowedUpdates = [
        'contractName', 'description', 'isActive', 'rewardStructures'
      ];
      
      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          contract[field] = updates[field];
        }
      });

      contract.lastModifiedBy = adminUserId;
      await contract.save();

      return contract;
    } catch (error) {
      throw new Error(`Failed to update staking contract: ${error.message}`);
    }
  }

  async validateStakingContract(contractId, adminUserId, validationNotes) {
    try {
      const contract = await StakingContract.findById(contractId);
      if (!contract) {
        throw new Error('Staking contract not found');
      }

      contract.contractValidation = {
        isValidated: true,
        validatedAt: new Date(),
        validatedBy: adminUserId,
        validationNotes
      };

      await contract.save();
      return contract;
    } catch (error) {
      throw new Error(`Failed to validate staking contract: ${error.message}`);
    }
  }

  async getStakingContracts(filters = {}) {
    try {
      const query = {};
      
      if (filters.blockchain) {
        query.blockchain = filters.blockchain.toLowerCase();
      }
      
      if (filters.isActive !== undefined) {
        query.isActive = filters.isActive;
      }
      
      if (filters.isValidated !== undefined) {
        query['contractValidation.isValidated'] = filters.isValidated;
      }

      return await StakingContract.find(query)
        .populate('createdBy', 'email username')
        .populate('lastModifiedBy', 'email username')
        .sort({ createdAt: -1 });
    } catch (error) {
      throw new Error(`Failed to get staking contracts: ${error.message}`);
    }
  }

  // Staking position methods
  async stakeNFT(userId, contractId, nftData, stakingDuration) {
    try {
      // Validate staking contract
      const stakingContract = await StakingContract.findById(contractId);
      if (!stakingContract || !stakingContract.isActive) {
        throw new Error('Invalid or inactive staking contract');
      }

      if (!stakingContract.contractValidation.isValidated) {
        throw new Error('Staking contract is not validated');
      }

      // Validate staking duration
      if (![6, 12, 36].includes(stakingDuration)) {
        throw new Error('Invalid staking duration. Must be 6, 12, or 36 months');
      }

      // Check if NFT is already staked
      const existingPosition = await StakingPosition.findOne({
        nftContractAddress: nftData.contractAddress.toLowerCase(),
        nftTokenId: nftData.tokenId,
        status: 'active'
      });

      if (existingPosition) {
        throw new Error('NFT is already staked');
      }

      // Get user's wallet address
      const user = await User.findById(userId);
      if (!user || !user.walletAddresses || user.walletAddresses.length === 0) {
        throw new Error('User has no wallet addresses');
      }

      // Use the primary wallet address for staking
      const walletAddress = user.walletAddresses[0];

      // Verify NFT ownership using blockchain service
      const ownsNFT = await stakingBlockchainService.verifyNFTOwnership(
        walletAddress,
        nftData.contractAddress,
        nftData.tokenId,
        stakingContract.blockchain
      );
      
      if (!ownsNFT) {
        throw new Error('User does not own this NFT');
      }

      // Lock the NFT on blockchain (smart contract or database tracking)
      const lockResult = await stakingBlockchainService.lockNFT(
        walletAddress,
        nftData.contractAddress,
        nftData.tokenId,
        stakingContract.blockchain,
        `${stakingDuration}m`
      );

      if (!lockResult.success) {
        throw new Error(`Failed to lock NFT: ${lockResult.error}`);
      }

      // Create staking position
      const stakingPosition = new StakingPosition({
        userId,
        stakingContractId: contractId,
        nftTokenId: nftData.tokenId,
        nftContractAddress: nftData.contractAddress.toLowerCase(),
        blockchain: stakingContract.blockchain,
        nftMetadata: nftData.metadata,
        stakingDuration,
        stakedAt: new Date(),
        lockingHash: lockResult.lockingData.lockingHash,
        lockingTransactionHash: lockResult.transactionHash,
        walletAddress: walletAddress,
        // Smart contract integration fields
        smartContractPositionId: lockResult.lockingData.smartContractPositionId,
        onChainVerified: lockResult.lockingData.onChainVerified || false,
        stakingTransaction: lockResult.blockNumber ? {
          txHash: lockResult.transactionHash,
          blockNumber: lockResult.blockNumber,
          gasUsed: lockResult.gasUsed,
          confirmed: true
        } : undefined
      });

      await stakingPosition.save();

      // Update contract statistics
      await StakingContract.findByIdAndUpdate(contractId, {
        $inc: { totalStaked: 1 }
      });

      return stakingPosition;
    } catch (error) {
      throw new Error(`Failed to stake NFT: ${error.message}`);
    }
  }

  async unstakeNFT(userId, positionId, txHash, blockNumber) {
    try {
      const position = await StakingPosition.findOne({
        _id: positionId,
        userId,
        status: 'active'
      });

      if (!position) {
        throw new Error('Active staking position not found');
      }

      // Check if staking period has completed
      if (!position.canUnstake()) {
        throw new Error('Staking period has not completed yet');
      }

      // Unlock the NFT on blockchain (smart contract or database tracking)
      const unlockResult = await stakingBlockchainService.unlockNFT(
        position.walletAddress,
        position.nftContractAddress,
        position.nftTokenId,
        position.blockchain,
        position.lockingHash,
        position.smartContractPositionId
      );

      if (!unlockResult.success) {
        throw new Error(`Failed to unlock NFT: ${unlockResult.error}`);
      }

      // Unstake the position
      position.unstake(unlockResult.transactionHash, unlockResult.blockNumber);
      position.unlockingHash = unlockResult.unlockingData.unlockingHash;
      
      // Update smart contract fields
      if (unlockResult.unlockingData.onChainVerified) {
        position.unstakingTransaction = {
          txHash: unlockResult.transactionHash,
          blockNumber: unlockResult.blockNumber,
          gasUsed: unlockResult.gasUsed,
          confirmed: true
        };
      }
      
      await position.save();

      return position;
    } catch (error) {
      throw new Error(`Failed to unstake NFT: ${error.message}`);
    }
  }

  async getUserStakingPortfolio(userId) {
    try {
      const positions = await StakingPosition.getUserPortfolio(userId);
      
      // Calculate summary statistics
      const summary = {
        totalPositions: positions.length,
        activePositions: positions.filter(p => p.status === 'active').length,
        totalRewardsEarned: positions.reduce((sum, p) => sum + p.totalRewardsEarned, 0),
        totalValueLocked: positions.filter(p => p.status === 'active').length, // NFT count
        averageStakingDuration: 0
      };

      if (summary.activePositions > 0) {
        const totalDuration = positions
          .filter(p => p.status === 'active')
          .reduce((sum, p) => sum + p.stakingDuration, 0);
        summary.averageStakingDuration = totalDuration / summary.activePositions;
      }

      return {
        positions,
        summary
      };
    } catch (error) {
      throw new Error(`Failed to get user staking portfolio: ${error.message}`);
    }
  }

  async getUserEligibleNFTs(userId) {
    try {
      // Get user's wallet addresses
      const user = await User.findById(userId);
      if (!user || !user.walletAddresses || user.walletAddresses.length === 0) {
        return [];
      }

      // Get all active staking contracts
      const stakingContracts = await StakingContract.find({ 
        isActive: true,
        'contractValidation.isValidated': true 
      });

      if (stakingContracts.length === 0) {
        return [];
      }

      // Get user's NFTs from gaming NFT service
      const eligibleNFTs = [];
      
      for (const walletAddress of user.walletAddresses) {
        try {
          // Use gaming NFT service to get user's NFTs
          const userNFTs = await gamingNFTService.getUserNFTs(walletAddress);
          
          // Filter NFTs that are eligible for staking (match staking contract addresses)
          const contractAddresses = stakingContracts.map(c => c.contractAddress.toLowerCase());
          
          const walletEligibleNFTs = userNFTs.filter(nft => 
            contractAddresses.includes(nft.contractAddress.toLowerCase())
          );
          
          // Check if NFTs are already staked
          const alreadyStaked = await StakingPosition.find({
            userId,
            status: 'active',
            walletAddress: walletAddress.toLowerCase()
          });
          
          const stakedNFTIds = alreadyStaked.map(pos => 
            `${pos.nftContractAddress}:${pos.nftTokenId}`
          );
          
          const availableNFTs = walletEligibleNFTs.filter(nft => 
            !stakedNFTIds.includes(`${nft.contractAddress.toLowerCase()}:${nft.tokenId}`)
          );
          
          eligibleNFTs.push(...availableNFTs);
        } catch (error) {
          console.error(`Error fetching NFTs for wallet ${walletAddress}:`, error);
          // Continue with other wallets
        }
      }

      return eligibleNFTs;
    } catch (error) {
      throw new Error(`Failed to get eligible NFTs: ${error.message}`);
    }
  }

  async getUserStakingHistory(userId, options = {}) {
    try {
      const { page = 1, limit = 10, status } = options;
      const skip = (page - 1) * limit;

      const query = { userId };
      if (status) {
        query.status = status;
      }

      const [positions, total] = await Promise.all([
        StakingPosition.find(query)
          .populate('stakingContractId')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        StakingPosition.countDocuments(query)
      ]);

      return {
        positions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new Error(`Failed to get staking history: ${error.message}`);
    }
  }

  async getStakingPositionDetails(userId, positionId) {
    try {
      const position = await StakingPosition.findOne({
        _id: positionId,
        userId
      }).populate('stakingContractId');

      if (!position) {
        return null;
      }

      // Calculate additional details
      const pendingRewards = await position.calculatePendingRewards();
      const nextRewardDate = position.getNextRewardDate();

      return {
        ...position.toObject(),
        pendingRewards,
        nextRewardDate
      };
    } catch (error) {
      throw new Error(`Failed to get position details: ${error.message}`);
    }
  }

  async calculateProjectedRewards(contractId, duration, nftCount = 1) {
    try {
      const contract = await StakingContract.findById(contractId);
      if (!contract) {
        throw new Error('Staking contract not found');
      }

      const rewardStructure = contract.getRewardStructure(duration);
      
      const monthlyTickets = rewardStructure.openEntryTicketsPerMonth * nftCount;
      const totalTickets = monthlyTickets * duration;
      const bonusMultiplier = rewardStructure.bonusMultiplier;
      const effectiveValue = totalTickets * bonusMultiplier;

      return {
        contractId,
        contractName: contract.contractName,
        duration,
        nftCount,
        monthlyTickets,
        totalTickets,
        bonusMultiplier,
        effectiveValue,
        breakdown: {
          baseReward: totalTickets,
          bonusReward: totalTickets * (bonusMultiplier - 1),
          totalReward: effectiveValue
        }
      };
    } catch (error) {
      throw new Error(`Failed to calculate projected rewards: ${error.message}`);
    }
  }

  // Reward distribution methods (delegated to reward distribution service)
  async distributeMonthlyRewards() {
    const stakingRewardDistributionService = require('./stakingRewardDistributionService');
    return await stakingRewardDistributionService.distributeMonthlyRewards();
  }

  async calculateUserPendingRewards(userId) {
    const stakingRewardDistributionService = require('./stakingRewardDistributionService');
    return await stakingRewardDistributionService.calculateUserPendingRewards(userId);
  }

  // Analytics methods
  async getStakingAnalytics(timeRange = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange);

      const [
        totalContracts,
        activeContracts,
        totalPositions,
        activePositions,
        recentStakes,
        rewardDistributions
      ] = await Promise.all([
        StakingContract.countDocuments(),
        StakingContract.countDocuments({ isActive: true }),
        StakingPosition.countDocuments(),
        StakingPosition.countDocuments({ status: 'active' }),
        StakingPosition.countDocuments({ stakedAt: { $gte: startDate } }),
        StakingPosition.aggregate([
          { $unwind: '$rewardHistory' },
          { $match: { 'rewardHistory.distributedAt': { $gte: startDate } } },
          { $group: {
            _id: null,
            totalRewards: { $sum: '$rewardHistory.openEntryTickets' },
            totalDistributions: { $sum: 1 }
          }}
        ])
      ]);

      const rewardStats = rewardDistributions[0] || { totalRewards: 0, totalDistributions: 0 };

      return {
        contracts: {
          total: totalContracts,
          active: activeContracts
        },
        positions: {
          total: totalPositions,
          active: activePositions,
          recentStakes
        },
        rewards: {
          totalDistributed: rewardStats.totalRewards,
          totalDistributions: rewardStats.totalDistributions,
          averagePerDistribution: rewardStats.totalDistributions > 0 
            ? rewardStats.totalRewards / rewardStats.totalDistributions 
            : 0
        }
      };
    } catch (error) {
      throw new Error(`Failed to get staking analytics: ${error.message}`);
    }
  }

  // Helper methods
  async verifyNFTOwnership(userId, nftData) {
    try {
      // Get user's wallet addresses
      const user = await User.findById(userId);
      if (!user || !user.walletAddresses || user.walletAddresses.length === 0) {
        return false;
      }

      // Use blockchain service to verify ownership across all user wallets
      for (const walletAddress of user.walletAddresses) {
        const ownsNFT = await stakingBlockchainService.verifyNFTOwnership(
          walletAddress,
          nftData.contractAddress,
          nftData.tokenId,
          nftData.blockchain
        );

        if (ownsNFT) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error verifying NFT ownership:', error);
      return false;
    }
  }

  // Blockchain integration methods
  async getBlockchainStatus() {
    try {
      return await stakingBlockchainService.getChainStatus();
    } catch (error) {
      throw new Error(`Failed to get blockchain status: ${error.message}`);
    }
  }

  async getSupportedBlockchains() {
    try {
      return await stakingBlockchainService.getSupportedChains();
    } catch (error) {
      throw new Error(`Failed to get supported blockchains: ${error.message}`);
    }
  }

  async batchVerifyNFTOwnership(userId, nftList) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.walletAddresses || user.walletAddresses.length === 0) {
        throw new Error('User has no wallet addresses');
      }

      const results = [];
      
      for (const nft of nftList) {
        let isOwned = false;
        
        // Check ownership across all user wallets
        for (const walletAddress of user.walletAddresses) {
          const ownsNFT = await stakingBlockchainService.verifyNFTOwnership(
            walletAddress,
            nft.contractAddress,
            nft.tokenId,
            nft.blockchain
          );
          
          if (ownsNFT) {
            isOwned = true;
            break;
          }
        }
        
        results.push({
          ...nft,
          isOwned,
          verifiedAt: new Date()
        });
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to batch verify NFT ownership: ${error.message}`);
    }
  }

  async getStakingPositionBlockchainStatus(positionId) {
    try {
      const position = await StakingPosition.findById(positionId);
      if (!position) {
        throw new Error('Staking position not found');
      }

      const blockchainStatus = await stakingBlockchainService.getStakingStatus(
        position.walletAddress,
        position.nftContractAddress,
        position.nftTokenId,
        position.blockchain
      );

      return {
        position: {
          id: position._id,
          status: position.status,
          stakedAt: position.stakedAt,
          unlockDate: position.unlockDate
        },
        blockchain: blockchainStatus
      };
    } catch (error) {
      throw new Error(`Failed to get staking position blockchain status: ${error.message}`);
    }
  }

  async getContractPerformanceMetrics(contractId) {
    try {
      const contract = await StakingContract.findById(contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }

      const positions = await StakingPosition.find({ stakingContractId: contractId });
      
      const metrics = {
        totalStaked: positions.length,
        activeStaked: positions.filter(p => p.status === 'active').length,
        totalRewardsDistributed: positions.reduce((sum, p) => sum + p.totalRewardsEarned, 0),
        averageStakingDuration: 0,
        durationBreakdown: {
          sixMonths: positions.filter(p => p.stakingDuration === 6).length,
          twelveMonths: positions.filter(p => p.stakingDuration === 12).length,
          threeYears: positions.filter(p => p.stakingDuration === 36).length
        },
        monthlyRewardDistribution: [],
        smartContractMetrics: {
          onChainVerified: positions.filter(p => p.onChainVerified).length,
          verificationRate: positions.length > 0 ? 
            Math.round((positions.filter(p => p.onChainVerified).length / positions.length) * 100) : 0
        }
      };

      // Calculate average staking duration
      if (positions.length > 0) {
        const totalDuration = positions.reduce((sum, p) => sum + p.stakingDuration, 0);
        metrics.averageStakingDuration = totalDuration / positions.length;
      }

      // Get monthly reward distribution data
      const rewardsByMonth = await StakingPosition.aggregate([
        { $match: { stakingContractId: contract._id } },
        { $unwind: '$rewardHistory' },
        { $group: {
          _id: {
            year: '$rewardHistory.year',
            month: '$rewardHistory.month'
          },
          totalTickets: { $sum: '$rewardHistory.openEntryTickets' },
          distributionCount: { $sum: 1 }
        }},
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 }
      ]);

      metrics.monthlyRewardDistribution = rewardsByMonth;

      return metrics;
    } catch (error) {
      throw new Error(`Failed to get contract performance metrics: ${error.message}`);
    }
  }

  // Smart contract admin functions

  async adminUnlockNFT(positionId, reason, adminUserId) {
    try {
      const position = await StakingPosition.findById(positionId);
      if (!position) {
        throw new Error('Staking position not found');
      }

      if (position.status !== 'active') {
        throw new Error('Position is not active');
      }

      // Get admin user for wallet address
      const User = require('../models/user/user');
      const adminUser = await User.findById(adminUserId);
      if (!adminUser || !adminUser.walletAddresses || adminUser.walletAddresses.length === 0) {
        throw new Error('Admin user has no wallet addresses');
      }

      const adminWallet = adminUser.walletAddresses[0];

      // Use smart contract admin unlock if available
      if (position.smartContractPositionId) {
        const unlockResult = await stakingBlockchainService.adminUnlockNFT(
          position.blockchain,
          position.smartContractPositionId,
          reason,
          adminWallet
        );

        if (!unlockResult.success) {
          throw new Error(`Smart contract admin unlock failed: ${unlockResult.error}`);
        }

        // Update position
        position.status = 'unstaked';
        position.actualUnstakedAt = new Date();
        position.emergencyUnlock = {
          admin: adminUserId,
          reason,
          unlockedAt: new Date(),
          transactionHash: unlockResult.transactionHash
        };

        if (unlockResult.transactionHash) {
          position.unstakingTransaction = {
            txHash: unlockResult.transactionHash,
            blockNumber: unlockResult.blockNumber,
            gasUsed: unlockResult.gasUsed,
            confirmed: true
          };
        }

        await position.save();

        // Update contract statistics
        await StakingContract.findByIdAndUpdate(position.stakingContractId, {
          $inc: { totalStaked: -1 }
        });

        return {
          success: true,
          position,
          transactionHash: unlockResult.transactionHash,
          adminAction: 'smart_contract_unlock'
        };
      } else {
        // Fallback to database-only unlock
        position.status = 'unstaked';
        position.actualUnstakedAt = new Date();
        position.emergencyUnlock = {
          admin: adminUserId,
          reason,
          unlockedAt: new Date(),
          transactionHash: null
        };

        await position.save();

        // Update contract statistics
        await StakingContract.findByIdAndUpdate(position.stakingContractId, {
          $inc: { totalStaked: -1 }
        });

        return {
          success: true,
          position,
          transactionHash: null,
          adminAction: 'database_unlock'
        };
      }
    } catch (error) {
      throw new Error(`Failed to admin unlock NFT: ${error.message}`);
    }
  }

  async emergencyWithdrawNFT(positionId, recipientAddress, reason, adminUserId) {
    try {
      const position = await StakingPosition.findById(positionId);
      if (!position) {
        throw new Error('Staking position not found');
      }

      if (position.status !== 'active') {
        throw new Error('Position is not active');
      }

      // Get admin user for wallet address
      const User = require('../models/user/user');
      const adminUser = await User.findById(adminUserId);
      if (!adminUser || !adminUser.walletAddresses || adminUser.walletAddresses.length === 0) {
        throw new Error('Admin user has no wallet addresses');
      }

      const adminWallet = adminUser.walletAddresses[0];

      // Use smart contract emergency withdraw if available
      if (position.smartContractPositionId) {
        const withdrawResult = await stakingBlockchainService.emergencyWithdrawNFT(
          position.blockchain,
          position.smartContractPositionId,
          recipientAddress,
          reason,
          adminWallet
        );

        if (!withdrawResult.success) {
          throw new Error(`Smart contract emergency withdraw failed: ${withdrawResult.error}`);
        }

        // Update position
        position.status = 'unstaked';
        position.actualUnstakedAt = new Date();
        position.emergencyWithdraw = {
          admin: adminUserId,
          recipient: recipientAddress,
          reason,
          withdrawnAt: new Date(),
          transactionHash: withdrawResult.transactionHash
        };

        if (withdrawResult.transactionHash) {
          position.unstakingTransaction = {
            txHash: withdrawResult.transactionHash,
            blockNumber: withdrawResult.blockNumber,
            gasUsed: withdrawResult.gasUsed,
            confirmed: true
          };
        }

        await position.save();

        // Update contract statistics
        await StakingContract.findByIdAndUpdate(position.stakingContractId, {
          $inc: { totalStaked: -1 }
        });

        return {
          success: true,
          position,
          transactionHash: withdrawResult.transactionHash,
          adminAction: 'smart_contract_withdraw'
        };
      } else {
        throw new Error('Emergency withdraw requires smart contract integration');
      }
    } catch (error) {
      throw new Error(`Failed to emergency withdraw NFT: ${error.message}`);
    }
  }

  async pauseStakingContract(blockchain, adminUserId) {
    try {
      // Get admin user for wallet address
      const User = require('../models/user/user');
      const adminUser = await User.findById(adminUserId);
      if (!adminUser || !adminUser.walletAddresses || adminUser.walletAddresses.length === 0) {
        throw new Error('Admin user has no wallet addresses');
      }

      const adminWallet = adminUser.walletAddresses[0];

      const result = await stakingBlockchainService.pauseStakingContract(blockchain, adminWallet);
      
      if (!result.success) {
        throw new Error(`Failed to pause contract: ${result.error}`);
      }

      return {
        success: true,
        blockchain,
        transactionHash: result.transactionHash,
        pausedAt: new Date(),
        adminAction: 'contract_pause'
      };
    } catch (error) {
      throw new Error(`Failed to pause staking contract: ${error.message}`);
    }
  }

  async unpauseStakingContract(blockchain, adminUserId) {
    try {
      // Get admin user for wallet address
      const User = require('../models/user/user');
      const adminUser = await User.findById(adminUserId);
      if (!adminUser || !adminUser.walletAddresses || adminUser.walletAddresses.length === 0) {
        throw new Error('Admin user has no wallet addresses');
      }

      const adminWallet = adminUser.walletAddresses[0];

      const result = await stakingBlockchainService.unpauseStakingContract(blockchain, adminWallet);
      
      if (!result.success) {
        throw new Error(`Failed to unpause contract: ${result.error}`);
      }

      return {
        success: true,
        blockchain,
        transactionHash: result.transactionHash,
        unpausedAt: new Date(),
        adminAction: 'contract_unpause'
      };
    } catch (error) {
      throw new Error(`Failed to unpause staking contract: ${error.message}`);
    }
  }

  // Verification and monitoring functions

  async verifyStakingPosition(positionId) {
    try {
      const position = await StakingPosition.findById(positionId);
      if (!position) {
        throw new Error('Staking position not found');
      }

      if (!position.smartContractPositionId) {
        return {
          verified: false,
          error: 'Position has no smart contract ID',
          position
        };
      }

      const verification = await stakingBlockchainService.verifyStakingPosition(
        position.blockchain,
        position.smartContractPositionId
      );

      return {
        ...verification,
        position
      };
    } catch (error) {
      throw new Error(`Failed to verify staking position: ${error.message}`);
    }
  }

  async verifyUserStaking(userId) {
    try {
      const User = require('../models/user/user');
      const user = await User.findById(userId);
      if (!user || !user.walletAddresses || user.walletAddresses.length === 0) {
        throw new Error('User has no wallet addresses');
      }

      const verification = await stakingBlockchainService.verifyUserStaking(user.walletAddresses);
      
      return {
        userId,
        walletAddresses: user.walletAddresses,
        ...verification
      };
    } catch (error) {
      throw new Error(`Failed to verify user staking: ${error.message}`);
    }
  }

  async getSmartContractHealth() {
    try {
      return await stakingBlockchainService.getSmartContractHealth();
    } catch (error) {
      throw new Error(`Failed to get smart contract health: ${error.message}`);
    }
  }

  async performDataConsistencyCheck(blockchain = null) {
    try {
      return await stakingBlockchainService.performDataConsistencyCheck(blockchain);
    } catch (error) {
      throw new Error(`Failed to perform data consistency check: ${error.message}`);
    }
  }

  // Migration functions for transitioning to smart contracts

  async migrateToSmartContract(positionId, adminUserId) {
    try {
      const position = await StakingPosition.findById(positionId);
      if (!position) {
        throw new Error('Staking position not found');
      }

      if (position.smartContractPositionId) {
        throw new Error('Position already has smart contract integration');
      }

      if (position.status !== 'active') {
        throw new Error('Can only migrate active positions');
      }

      // This would involve creating a new smart contract position
      // and transferring the NFT from the user to the contract
      // This is a complex operation that would need careful implementation

      throw new Error('Migration to smart contract not yet implemented');
    } catch (error) {
      throw new Error(`Failed to migrate to smart contract: ${error.message}`);
    }
  }
}

module.exports = new StakingService();

module.exports = new StakingService();