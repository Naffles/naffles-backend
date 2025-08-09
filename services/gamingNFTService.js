/**
 * Gaming NFT Service
 * Handles NFT ownership verification and bonus calculations for gaming integrations
 * Now integrates with Universal NFT Benefits Service for smart contract verification
 */

const { createAlchemyInstance } = require("./alchemy/alchemy");
const WalletAddress = require("../models/user/walletAddress");
const User = require("../models/user/user");
const UniversalNFTBenefitsService = require("./universalNFTBenefitsService");

class GamingNFTService {
  constructor() {
    // Cache NFT data for 5 minutes to avoid excessive blockchain calls
    this.nftCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get player's NFT collection for gaming bonuses
   * Now uses Universal NFT Benefits Service with smart contract verification
   * @param {String} userId - Player's user ID
   * @param {Array} configuredContracts - Game-specific NFT contracts with bonuses (optional)
   * @returns {Object} Player's eligible NFTs with bonus information
   */
  async getPlayerGamingNFTs(userId, configuredContracts = []) {
    try {
      // Get comprehensive NFT benefits profile from Universal NFT Benefits Service
      const benefitsProfile = await UniversalNFTBenefitsService.getUserBenefitsProfile(userId);
      
      if (!benefitsProfile || benefitsProfile.aggregatedBenefits.totalNFTs === 0) {
        return {
          hasNFTs: false,
          eligibleNFTs: [],
          totalMultiplier: 1,
          gamingBonus: 1.0,
          smartContractVerified: false,
          error: null
        };
      }

      const eligibleNFTs = [];
      let totalMultiplier = 1;

      // Process all NFT collections for gaming bonuses
      for (const [collectionType, nfts] of Object.entries(benefitsProfile.collectionBreakdown)) {
        for (const nft of nfts) {
          // Check if this NFT provides gaming bonuses
          if (nft.benefits && nft.benefits.gamingBonus > 1) {
            eligibleNFTs.push({
              contractAddress: nft.contractAddress,
              contractName: this.getCollectionName(collectionType),
              tokenId: nft.tokenId,
              multiplier: nft.benefits.gamingBonus,
              bonusType: 'multiplier',
              collectionType: nft.collectionType,
              tier: nft.tier,
              isStaked: nft.stakingStatus.isStaked,
              stakingDuration: nft.stakingStatus.stakingDuration || 0,
              smartContractVerified: nft.stakingStatus.contractVerified,
              metadata: nft.metadata,
              chainId: nft.chainId,
              benefits: nft.benefits
            });
          }
        }
      }

      // Use the aggregated gaming bonus from Universal NFT Benefits Service
      const gamingBonus = benefitsProfile.aggregatedBenefits.gamingBonus || 1.0;
      
      // For backward compatibility, also calculate multiplicative total
      eligibleNFTs.forEach(nft => {
        totalMultiplier *= nft.multiplier;
      });

      return {
        hasNFTs: eligibleNFTs.length > 0,
        eligibleNFTs,
        totalMultiplier,
        gamingBonus, // This is the recommended bonus to use
        totalNFTs: benefitsProfile.aggregatedBenefits.totalNFTs,
        totalCollections: benefitsProfile.totalCollections,
        foundersKeysOwned: benefitsProfile.aggregatedBenefits.foundersKeysOwned,
        smartContractVerified: benefitsProfile.smartContractVerified,
        primaryCollection: benefitsProfile.aggregatedBenefits.primaryCollection,
        scannedAt: new Date()
      };

    } catch (error) {
      console.error('Error getting player gaming NFTs:', error);
      return {
        hasNFTs: false,
        eligibleNFTs: [],
        totalMultiplier: 1,
        gamingBonus: 1.0,
        smartContractVerified: false,
        error: error.message
      };
    }
  }

  /**
   * Scan a specific wallet for gaming-eligible NFTs
   * @param {String} walletAddress - Wallet address to scan
   * @param {String} chainId - Blockchain chain ID
   * @param {Array} configuredContracts - Contracts to check for
   * @returns {Array} Eligible NFTs found in wallet
   */
  async scanWalletForGamingNFTs(walletAddress, chainId, configuredContracts) {
    const cacheKey = `${walletAddress}-${chainId}-${Date.now()}`;
    
    // Check cache first
    if (this.nftCache.has(cacheKey)) {
      const cached = this.nftCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      const alchemy = createAlchemyInstance(chainId);
      if (!alchemy) {
        console.warn(`Unsupported chain ID for NFT scanning: ${chainId}`);
        return [];
      }

      const eligibleNFTs = [];

      // Check each configured contract
      for (const contract of configuredContracts) {
        if (contract.chainId !== chainId) continue;

        try {
          // Get NFTs owned by wallet for this contract
          const nftsForContract = await alchemy.nft.getNftsForOwner(walletAddress, {
            contractAddresses: [contract.contractAddress]
          });

          // Process each owned NFT
          for (const nft of nftsForContract.ownedNfts) {
            eligibleNFTs.push({
              contractAddress: contract.contractAddress,
              contractName: contract.contractName,
              tokenId: nft.tokenId,
              multiplier: contract.multiplier,
              bonusType: contract.bonusType,
              metadata: {
                name: nft.title || nft.name,
                image: nft.media?.[0]?.gateway || nft.image,
                description: nft.description
              },
              chainId: chainId,
              walletAddress: walletAddress
            });
          }

        } catch (contractError) {
          console.error(`Error scanning contract ${contract.contractAddress}:`, contractError);
          // Continue with other contracts
        }
      }

      // Cache the results
      this.nftCache.set(cacheKey, {
        data: eligibleNFTs,
        timestamp: Date.now()
      });

      return eligibleNFTs;

    } catch (error) {
      console.error('Error scanning wallet for gaming NFTs:', error);
      return [];
    }
  }

  /**
   * Get gaming NFT configuration for a specific game
   * @param {String} gameType - Type of game (e.g., 'cryptoReels')
   * @returns {Array} Configured NFT contracts for the game
   */
  async getGameNFTConfiguration(gameType) {
    try {
      // This would be stored in a new collection: gamingNFTConfigurations
      // For now, return a sample configuration
      const sampleConfig = [
        {
          contractAddress: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d", // BAYC
          contractName: "Bored Ape Yacht Club",
          chainId: "1", // Ethereum
          multiplier: 2.0,
          bonusType: "multiplier",
          symbolId: "nft_bayc",
          isActive: true
        },
        {
          contractAddress: "0x60e4d786628fea6478f785a6d7e704777c86a7c6", // MAYC
          contractName: "Mutant Ape Yacht Club", 
          chainId: "1",
          multiplier: 1.5,
          bonusType: "multiplier",
          symbolId: "nft_mayc",
          isActive: true
        },
        {
          contractAddress: "0x1a92f7381b9f03921564a437210bb9396471050c", // Cool Cats
          contractName: "Cool Cats NFT",
          chainId: "1", 
          multiplier: 1.8,
          bonusType: "multiplier",
          symbolId: "nft_coolcats",
          isActive: true
        }
      ];

      return sampleConfig.filter(config => config.isActive);

    } catch (error) {
      console.error('Error getting game NFT configuration:', error);
      return [];
    }
  }

  /**
   * Validate NFT ownership in real-time (for anti-cheat)
   * Now uses Universal NFT Benefits Service with smart contract verification
   * @param {String} userId - Player's user ID
   * @param {String} contractAddress - NFT contract address
   * @param {String} tokenId - NFT token ID
   * @param {String} blockchain - Blockchain network
   * @returns {Object} Ownership and staking verification result
   */
  async validateNFTOwnership(userId, contractAddress, tokenId, blockchain = 'ethereum') {
    try {
      // Use Universal NFT Benefits Service for comprehensive verification
      const verificationResult = await UniversalNFTBenefitsService.verifyNFTOwnershipAndStaking(
        userId,
        contractAddress,
        tokenId,
        blockchain
      );

      return {
        isOwned: verificationResult.isOwned,
        ownerWallet: verificationResult.ownerWallet,
        isStaked: verificationResult.stakingStatus.isStaked,
        stakingPositionId: verificationResult.stakingStatus.positionId,
        smartContractVerified: verificationResult.stakingStatus.contractVerified,
        verified: verificationResult.verified,
        error: verificationResult.error
      };

    } catch (error) {
      console.error('Error validating NFT ownership:', error);
      return {
        isOwned: false,
        ownerWallet: null,
        isStaked: false,
        stakingPositionId: null,
        smartContractVerified: false,
        verified: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate gaming bonus multiplier based on owned NFTs
   * @param {Array} eligibleNFTs - Player's eligible NFTs
   * @param {String} bonusType - Type of bonus calculation
   * @returns {Number} Calculated multiplier
   */
  calculateGamingBonus(eligibleNFTs, bonusType = 'multiplicative') {
    if (!eligibleNFTs.length) return 1;

    switch (bonusType) {
      case 'multiplicative':
        return eligibleNFTs.reduce((total, nft) => total * nft.multiplier, 1);
      
      case 'additive':
        return eligibleNFTs.reduce((total, nft) => total + (nft.multiplier - 1), 1);
      
      case 'highest':
        return Math.max(...eligibleNFTs.map(nft => nft.multiplier));
      
      default:
        return eligibleNFTs.reduce((total, nft) => total * nft.multiplier, 1);
    }
  }

  /**
   * Clear NFT cache for a specific wallet (call when wallet changes)
   * @param {String} walletAddress - Wallet address to clear cache for
   */
  clearWalletCache(walletAddress) {
    for (const [key, value] of this.nftCache.entries()) {
      if (key.includes(walletAddress)) {
        this.nftCache.delete(key);
      }
    }
  }

  /**
   * Get collection name from collection type
   * @param {String} collectionType - Collection type identifier
   * @returns {String} Human-readable collection name
   */
  getCollectionName(collectionType) {
    const collectionNames = {
      'founders_keys': 'Founders Keys',
      'premium_collections': 'Premium Collection',
      'standard_collections': 'Standard Collection'
    };
    
    return collectionNames[collectionType] || 'Unknown Collection';
  }

  /**
   * Refresh player's NFT data (clears cache and re-scans)
   * @param {String} userId - Player's user ID
   * @returns {Object} Fresh NFT data
   */
  async refreshPlayerNFTs(userId) {
    try {
      // Clear any cached data for this user
      const user = await User.findById(userId);
      if (user && user.connectedWallets) {
        for (const wallet of user.connectedWallets) {
          this.clearWalletCache(wallet.address);
        }
      }

      // Get fresh data
      return await this.getPlayerGamingNFTs(userId);
    } catch (error) {
      console.error('Error refreshing player NFTs:', error);
      return {
        hasNFTs: false,
        eligibleNFTs: [],
        totalMultiplier: 1,
        gamingBonus: 1.0,
        error: error.message
      };
    }
  }

  /**
   * Get cached NFT data statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const values = Array.from(this.nftCache.values());
    return {
      cacheSize: this.nftCache.size,
      cacheTimeout: this.cacheTimeout,
      oldestEntry: values.length > 0 ? Math.min(...values.map(v => v.timestamp)) : null,
      newestEntry: values.length > 0 ? Math.max(...values.map(v => v.timestamp)) : null
    };
  }
}

module.exports = new GamingNFTService();