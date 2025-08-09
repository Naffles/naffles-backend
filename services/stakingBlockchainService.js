// Smart contract integration
const smartContractService = require('./smartContractService');
const blockchainVerificationService = require('./blockchainVerificationService');

// Blockchain dependencies - loaded conditionally to avoid errors in test environments
let ethers, Connection, gamingNFTService;

try {
  ethers = require('ethers');
} catch (error) {
  console.warn('Ethers.js not available - blockchain functionality will be limited');
}

try {
  const solanaWeb3 = require('@solana/web3.js');
  Connection = solanaWeb3.Connection;
} catch (error) {
  console.warn('Solana Web3.js not available - Solana functionality will be limited');
}

try {
  gamingNFTService = require('./gamingNFTService');
} catch (error) {
  console.warn('Gaming NFT Service not available - NFT verification will be limited');
}

class StakingBlockchainService {
  constructor() {
    this.providers = {
      ethereum: null,
      polygon: null,
      base: null
    };
    this.solanaConnection = null;
    this.smartContractEnabled = process.env.SMART_CONTRACT_ENABLED === 'true';
    this.initializeProviders();
  }

  initializeProviders() {
    try {
      // Initialize Ethereum-based providers only if ethers is available
      if (ethers) {
        if (process.env.ETHEREUM_RPC_URL) {
          this.providers.ethereum = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
        }
        
        if (process.env.POLYGON_RPC_URL) {
          this.providers.polygon = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
        }
        
        if (process.env.BASE_RPC_URL) {
          this.providers.base = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
        }
      }

      // Initialize Solana connection only if Connection is available
      if (Connection && process.env.SOLANA_RPC_URL) {
        this.solanaConnection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
      }

      console.log(`Staking blockchain service initialized - Smart contracts: ${this.smartContractEnabled ? 'ENABLED' : 'DISABLED'}`);
    } catch (error) {
      console.error('Error initializing blockchain providers:', error);
    }
  }

  // NFT Ownership Verification
  async verifyNFTOwnership(walletAddress, contractAddress, tokenId, blockchain) {
    try {
      switch (blockchain.toLowerCase()) {
        case 'ethereum':
        case 'polygon':
        case 'base':
          return await this.verifyEthereumNFTOwnership(walletAddress, contractAddress, tokenId, blockchain);
        case 'solana':
          return await this.verifySolanaNFTOwnership(walletAddress, contractAddress, tokenId);
        default:
          throw new Error(`Unsupported blockchain: ${blockchain}`);
      }
    } catch (error) {
      console.error(`Error verifying NFT ownership on ${blockchain}:`, error);
      return false;
    }
  }

  async verifyEthereumNFTOwnership(walletAddress, contractAddress, tokenId, blockchain) {
    try {
      if (!ethers) {
        console.warn('Ethers.js not available - cannot verify Ethereum NFT ownership');
        return false;
      }

      const provider = this.providers[blockchain];
      if (!provider) {
        throw new Error(`Provider not available for ${blockchain}`);
      }

      // ERC-721 ownerOf function signature
      const contract = new ethers.Contract(contractAddress, [
        'function ownerOf(uint256 tokenId) view returns (address)'
      ], provider);

      const owner = await contract.ownerOf(tokenId);
      return owner.toLowerCase() === walletAddress.toLowerCase();
    } catch (error) {
      console.error(`Error verifying Ethereum NFT ownership:`, error);
      return false;
    }
  }

  async verifySolanaNFTOwnership(walletAddress, mintAddress, tokenId) {
    try {
      if (!this.solanaConnection) {
        console.warn('Solana connection not available');
        return false;
      }

      if (!gamingNFTService) {
        console.warn('Gaming NFT Service not available');
        return false;
      }

      // For Solana, we use the Gaming NFT Service which already has Alchemy integration
      const nftData = await gamingNFTService.getNFTsByWallet(walletAddress, 'solana');
      
      // Check if the specific NFT is owned by the wallet
      return nftData.some(nft => 
        nft.contract.address.toLowerCase() === mintAddress.toLowerCase() &&
        nft.tokenId === tokenId
      );
    } catch (error) {
      console.error(`Error verifying Solana NFT ownership:`, error);
      return false;
    }
  }

  // NFT Locking Mechanism
  async lockNFT(walletAddress, contractAddress, tokenId, blockchain, stakingDuration) {
    try {
      // First verify ownership
      const isOwner = await this.verifyNFTOwnership(walletAddress, contractAddress, tokenId, blockchain);
      if (!isOwner) {
        throw new Error('NFT not owned by wallet address');
      }

      if (this.smartContractEnabled) {
        // Use smart contract for actual NFT locking
        const durationCode = this.mapDurationToCode(stakingDuration);
        const result = await smartContractService.stakeNFT(
          blockchain,
          contractAddress,
          tokenId,
          durationCode,
          walletAddress
        );

        if (result.success) {
          return {
            success: true,
            lockingData: {
              walletAddress,
              contractAddress,
              tokenId,
              blockchain,
              stakingDuration,
              lockedAt: new Date(),
              unlockAt: this.calculateUnlockDate(stakingDuration),
              lockingHash: result.positionId,
              smartContractPositionId: result.positionId,
              onChainVerified: true
            },
            transactionHash: result.transactionHash,
            blockNumber: result.blockNumber,
            gasUsed: result.gasUsed
          };
        } else {
          throw new Error(`Smart contract staking failed: ${result.error}`);
        }
      } else {
        // Fallback to database-only tracking (legacy mode)
        const lockingData = {
          walletAddress,
          contractAddress,
          tokenId,
          blockchain,
          stakingDuration,
          lockedAt: new Date(),
          unlockAt: this.calculateUnlockDate(stakingDuration),
          lockingHash: this.generateLockingHash(walletAddress, contractAddress, tokenId, blockchain),
          smartContractPositionId: null,
          onChainVerified: false
        };

        return {
          success: true,
          lockingData,
          transactionHash: this.generateMockTransactionHash()
        };
      }
    } catch (error) {
      console.error('Error locking NFT:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // NFT Unlocking Mechanism
  async unlockNFT(walletAddress, contractAddress, tokenId, blockchain, lockingHash, smartContractPositionId = null) {
    try {
      if (this.smartContractEnabled && smartContractPositionId) {
        // Use smart contract for actual NFT unlocking
        const result = await smartContractService.claimNFT(
          blockchain,
          smartContractPositionId,
          walletAddress
        );

        if (result.success) {
          return {
            success: true,
            unlockingData: {
              walletAddress,
              contractAddress,
              tokenId,
              blockchain,
              unlockedAt: new Date(),
              unlockingHash: result.claimData.positionId,
              smartContractPositionId,
              onChainVerified: true
            },
            transactionHash: result.transactionHash,
            blockNumber: result.blockNumber,
            gasUsed: result.gasUsed
          };
        } else {
          throw new Error(`Smart contract claiming failed: ${result.error}`);
        }
      } else {
        // Fallback to database-only tracking (legacy mode)
        if (!this.smartContractEnabled) {
          // Verify the locking hash matches for legacy mode
          const expectedHash = this.generateLockingHash(walletAddress, contractAddress, tokenId, blockchain);
          if (lockingHash !== expectedHash) {
            throw new Error('Invalid locking hash');
          }
        }

        const unlockingData = {
          walletAddress,
          contractAddress,
          tokenId,
          blockchain,
          unlockedAt: new Date(),
          unlockingHash: this.generateUnlockingHash(walletAddress, contractAddress, tokenId, blockchain),
          smartContractPositionId,
          onChainVerified: false
        };

        return {
          success: true,
          unlockingData,
          transactionHash: this.generateMockTransactionHash()
        };
      }
    } catch (error) {
      console.error('Error unlocking NFT:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Batch NFT Operations
  async batchVerifyNFTOwnership(nftList) {
    const results = [];
    
    for (const nft of nftList) {
      const { walletAddress, contractAddress, tokenId, blockchain } = nft;
      const isOwned = await this.verifyNFTOwnership(walletAddress, contractAddress, tokenId, blockchain);
      
      results.push({
        ...nft,
        isOwned,
        verifiedAt: new Date()
      });
    }

    return results;
  }

  async batchLockNFTs(nftList, stakingDuration) {
    const results = [];
    
    for (const nft of nftList) {
      const { walletAddress, contractAddress, tokenId, blockchain } = nft;
      const lockResult = await this.lockNFT(walletAddress, contractAddress, tokenId, blockchain, stakingDuration);
      
      results.push({
        ...nft,
        lockResult
      });
    }

    return results;
  }

  // Utility Methods
  calculateUnlockDate(stakingDuration) {
    const now = new Date();
    switch (stakingDuration) {
      case '6m':
        return new Date(now.setMonth(now.getMonth() + 6));
      case '12m':
        return new Date(now.setFullYear(now.getFullYear() + 1));
      case '3yr':
        return new Date(now.setFullYear(now.getFullYear() + 3));
      default:
        throw new Error(`Invalid staking duration: ${stakingDuration}`);
    }
  }

  generateLockingHash(walletAddress, contractAddress, tokenId, blockchain) {
    const crypto = require('crypto');
    const data = `${walletAddress}-${contractAddress}-${tokenId}-${blockchain}-${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  generateUnlockingHash(walletAddress, contractAddress, tokenId, blockchain) {
    const crypto = require('crypto');
    const data = `unlock-${walletAddress}-${contractAddress}-${tokenId}-${blockchain}-${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  generateMockTransactionHash() {
    const crypto = require('crypto');
    return '0x' + crypto.randomBytes(32).toString('hex');
  }

  // Smart contract utility methods

  mapDurationToCode(stakingDuration) {
    // Convert duration string to smart contract code
    switch (stakingDuration) {
      case '6m':
        return 0;
      case '12m':
        return 1;
      case '3yr':
        return 2;
      default:
        throw new Error(`Invalid staking duration: ${stakingDuration}`);
    }
  }

  mapContractDurationToMonths(contractDuration) {
    // Convert smart contract duration code to months
    switch (contractDuration) {
      case 0:
        return 6;
      case 1:
        return 12;
      case 2:
        return 36;
      default:
        return null;
    }
  }

  // Admin functions for smart contract management

  async adminUnlockNFT(blockchain, smartContractPositionId, reason, adminWallet) {
    try {
      if (!this.smartContractEnabled) {
        throw new Error('Smart contracts not enabled');
      }

      const result = await smartContractService.adminUnlock(
        blockchain,
        smartContractPositionId,
        reason,
        adminWallet
      );

      return result;
    } catch (error) {
      console.error('Error admin unlocking NFT:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async emergencyWithdrawNFT(blockchain, smartContractPositionId, recipient, reason, adminWallet) {
    try {
      if (!this.smartContractEnabled) {
        throw new Error('Smart contracts not enabled');
      }

      const result = await smartContractService.emergencyWithdrawNFT(
        blockchain,
        smartContractPositionId,
        recipient,
        reason,
        adminWallet
      );

      return result;
    } catch (error) {
      console.error('Error emergency withdrawing NFT:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async pauseStakingContract(blockchain, adminWallet) {
    try {
      if (!this.smartContractEnabled) {
        throw new Error('Smart contracts not enabled');
      }

      const result = await smartContractService.pauseContract(blockchain, adminWallet);
      return result;
    } catch (error) {
      console.error('Error pausing staking contract:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async unpauseStakingContract(blockchain, adminWallet) {
    try {
      if (!this.smartContractEnabled) {
        throw new Error('Smart contracts not enabled');
      }

      const result = await smartContractService.unpauseContract(blockchain, adminWallet);
      return result;
    } catch (error) {
      console.error('Error unpausing staking contract:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Verification and monitoring

  async verifyStakingPosition(blockchain, smartContractPositionId) {
    try {
      if (!this.smartContractEnabled) {
        return {
          verified: false,
          error: 'Smart contracts not enabled'
        };
      }

      return await blockchainVerificationService.verifyStakingStatus(
        blockchain,
        smartContractPositionId,
        false // Don't use cache for explicit verification
      );
    } catch (error) {
      console.error('Error verifying staking position:', error);
      return {
        verified: false,
        error: error.message
      };
    }
  }

  async verifyUserStaking(userWallets) {
    try {
      if (!this.smartContractEnabled) {
        return {
          verified: false,
          error: 'Smart contracts not enabled'
        };
      }

      return await blockchainVerificationService.verifyCrossChainStaking(userWallets);
    } catch (error) {
      console.error('Error verifying user staking:', error);
      return {
        verified: false,
        error: error.message
      };
    }
  }

  async getGamingBonuses(userWallets) {
    try {
      if (!this.smartContractEnabled) {
        return {
          eligible: false,
          bonuses: {},
          totalMultiplier: 1.0,
          error: 'Smart contracts not enabled'
        };
      }

      return await blockchainVerificationService.verifyGamingBonuses(userWallets);
    } catch (error) {
      console.error('Error getting gaming bonuses:', error);
      return {
        eligible: false,
        bonuses: {},
        totalMultiplier: 1.0,
        error: error.message
      };
    }
  }

  // Health and status checks

  async getSmartContractHealth() {
    try {
      if (!this.smartContractEnabled) {
        return {
          enabled: false,
          status: 'disabled',
          message: 'Smart contracts are disabled'
        };
      }

      const health = await smartContractService.getServiceHealth();
      return {
        enabled: true,
        ...health
      };
    } catch (error) {
      return {
        enabled: this.smartContractEnabled,
        status: 'error',
        error: error.message
      };
    }
  }

  async performDataConsistencyCheck(blockchain = null) {
    try {
      if (!this.smartContractEnabled) {
        return {
          enabled: false,
          message: 'Smart contracts are disabled - consistency check not available'
        };
      }

      return await blockchainVerificationService.performDataConsistencyCheck(blockchain);
    } catch (error) {
      console.error('Error performing data consistency check:', error);
      return {
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // Staking Status Verification
  async getStakingStatus(walletAddress, contractAddress, tokenId, blockchain, smartContractPositionId = null) {
    try {
      if (this.smartContractEnabled && smartContractPositionId) {
        // Query smart contract for real staking status
        const position = await smartContractService.getStakingPosition(blockchain, smartContractPositionId);
        
        if (position) {
          return {
            isStaked: position.active,
            stakingDuration: this.mapContractDurationToMonths(position.duration),
            lockedAt: position.stakedAt,
            unlockAt: position.unlockAt,
            canUnstake: position.active && new Date() >= position.unlockAt,
            smartContractVerified: true,
            positionId: smartContractPositionId
          };
        }
      } else if (this.smartContractEnabled) {
        // Check if NFT is staked using smart contract
        const stakingStatus = await smartContractService.isNFTStaked(blockchain, contractAddress, tokenId);
        
        if (stakingStatus.isStaked) {
          const position = await smartContractService.getStakingPosition(blockchain, stakingStatus.positionId);
          
          return {
            isStaked: position.active,
            stakingDuration: this.mapContractDurationToMonths(position.duration),
            lockedAt: position.stakedAt,
            unlockAt: position.unlockAt,
            canUnstake: position.active && new Date() >= position.unlockAt,
            smartContractVerified: true,
            positionId: stakingStatus.positionId
          };
        }
      }

      // Fallback to database-only status (legacy mode)
      return {
        isStaked: false,
        stakingDuration: null,
        lockedAt: null,
        unlockAt: null,
        canUnstake: false,
        smartContractVerified: false,
        positionId: null
      };
    } catch (error) {
      console.error('Error getting staking status:', error);
      return null;
    }
  }

  // Multi-chain Support Methods
  async getSupportedChains() {
    const supportedChains = [];
    
    if (this.providers.ethereum) supportedChains.push('ethereum');
    if (this.providers.polygon) supportedChains.push('polygon');
    if (this.providers.base) supportedChains.push('base');
    if (this.solanaConnection) supportedChains.push('solana');
    
    return supportedChains;
  }

  async getChainStatus() {
    const status = {};
    
    for (const [chain, provider] of Object.entries(this.providers)) {
      if (provider) {
        try {
          const blockNumber = await provider.getBlockNumber();
          status[chain] = {
            connected: true,
            blockNumber,
            lastChecked: new Date()
          };
        } catch (error) {
          status[chain] = {
            connected: false,
            error: error.message,
            lastChecked: new Date()
          };
        }
      }
    }

    if (this.solanaConnection) {
      try {
        const slot = await this.solanaConnection.getSlot();
        status.solana = {
          connected: true,
          slot,
          lastChecked: new Date()
        };
      } catch (error) {
        status.solana = {
          connected: false,
          error: error.message,
          lastChecked: new Date()
        };
      }
    }

    return status;
  }
}

try {
  const instance = new StakingBlockchainService();
  console.log('StakingBlockchainService instance created successfully');
  module.exports = instance;
} catch (error) {
  console.error('Error creating StakingBlockchainService instance:', error);
  module.exports = {};
}