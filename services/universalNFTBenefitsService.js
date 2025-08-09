const { Alchemy, Network } = require("alchemy-sdk");
const User = require("../models/user/user");
const FoundersKeyContract = require("../models/user/foundersKeyContract");
const SmartContractService = require("./smartContractService");
const BlockchainVerificationService = require("./blockchainVerificationService");
const sendResponse = require("../utils/responseHandler");

/**
 * Universal NFT Benefits Service
 * Manages benefits across all approved NFT collections with smart contract integration
 */
class UniversalNFTBenefitsService {
  constructor() {
    this.alchemySettings = {
      apiKey: process.env.ALCHEMY_API_KEY,
      network: Network.ETH_MAINNET,
    };
    this.alchemy = new Alchemy(this.alchemySettings);
    
    // Initialize smart contract service
    this.smartContractService = SmartContractService;
    this.blockchainVerificationService = BlockchainVerificationService;
    
    // Collection hierarchy - Founders Keys have highest priority
    this.collectionHierarchy = {
      'founders_keys': 1000, // Highest priority
      'premium_collections': 500,
      'standard_collections': 100
    };
  }

  /**
   * Scan wallet for all approved NFT collections across all chains
   */
  async scanWalletForAllNFTs(walletAddress) {
    try {
      const allNFTs = [];
      
      // Get all active NFT contracts (including Founders Keys and other collections)
      const contracts = await FoundersKeyContract.find({ isActive: true });
      
      for (const contract of contracts) {
        const nfts = await this.scanContractForNFTs(walletAddress, contract);
        allNFTs.push(...nfts);
      }
      
      // Sort by collection hierarchy (Founders Keys first)
      allNFTs.sort((a, b) => {
        const aHierarchy = this.getCollectionHierarchy(a.collectionType);
        const bHierarchy = this.getCollectionHierarchy(b.collectionType);
        return bHierarchy - aHierarchy;
      });
      
      return allNFTs;
    } catch (error) {
      console.error("Error scanning wallet for all NFTs:", error);
      throw error;
    }
  }

  /**
   * Scan specific contract for NFTs owned by wallet
   */
  async scanContractForNFTs(walletAddress, contract) {
    try {
      const nfts = [];
      
      if (contract.chainId === "1" || contract.chainId === "ethereum") {
        // Ethereum scanning using Alchemy
        const ownedNFTs = await this.alchemy.nft.getNftsForOwner(walletAddress, {
          contractAddresses: [contract.contractAddress]
        });
        
        for (const nft of ownedNFTs.ownedNfts) {
          const tier = await this.determineNFTTier(nft, contract);
          const stakingStatus = await this.getSmartContractStakingStatus(
            contract.chainId, 
            contract.contractAddress, 
            nft.tokenId
          );
          
          const benefits = await this.calculateNFTBenefits(
            tier, 
            contract, 
            stakingStatus.isStaked ? stakingStatus.stakingDuration : 0
          );
          
          nfts.push({
            tokenId: nft.tokenId,
            contractAddress: contract.contractAddress,
            chainId: contract.chainId,
            collectionType: contract.collectionType || 'standard_collections',
            tier,
            benefits,
            stakingStatus,
            metadata: nft.metadata
          });
        }
      } else if (contract.chainId === "solana") {
        // Solana scanning would be implemented here
        console.log("Solana NFT scanning not yet implemented");
      }
      
      return nfts;
    } catch (error) {
      console.error("Error scanning contract for NFTs:", error);
      return [];
    }
  }

  /**
   * Get smart contract staking status for an NFT
   */
  async getSmartContractStakingStatus(blockchain, nftContract, tokenId) {
    try {
      const stakingInfo = await this.smartContractService.isNFTStaked(
        blockchain, 
        nftContract, 
        tokenId
      );
      
      if (stakingInfo.isStaked) {
        const position = await this.smartContractService.getStakingPosition(
          blockchain, 
          stakingInfo.positionId
        );
        
        return {
          isStaked: true,
          positionId: stakingInfo.positionId,
          stakedAt: position.stakedAt,
          unlockAt: position.unlockAt,
          stakingDuration: this.calculateStakingDuration(position.stakedAt, position.unlockAt),
          contractVerified: true
        };
      }
      
      return {
        isStaked: false,
        positionId: null,
        contractVerified: true
      };
    } catch (error) {
      console.error("Error getting smart contract staking status:", error);
      return {
        isStaked: false,
        positionId: null,
        contractVerified: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate staking duration in days from dates
   */
  calculateStakingDuration(stakedAt, unlockAt) {
    const diffTime = Math.abs(unlockAt - stakedAt);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Determine the tier of an NFT based on metadata or token ID
   */
  async determineNFTTier(nft, contract) {
    try {
      // Check if tier is defined in contract configuration
      if (contract.tierMapping && contract.tierMapping.size > 0) {
        const tier = contract.tierMapping.get(nft.tokenId);
        if (tier) return tier;
      }
      
      // Try to get tier from NFT metadata
      if (nft.metadata && nft.metadata.attributes) {
        const tierAttribute = nft.metadata.attributes.find(
          attr => attr.trait_type.toLowerCase() === 'tier' || 
                  attr.trait_type.toLowerCase() === 'level' ||
                  attr.trait_type.toLowerCase() === 'rarity'
        );
        if (tierAttribute) {
          return parseInt(tierAttribute.value) || 1;
        }
      }
      
      // Default tier based on contract configuration
      return contract.defaultTier || 1;
    } catch (error) {
      console.error("Error determining NFT tier:", error);
      return 1; // Default to tier 1
    }
  }

  /**
   * Calculate benefits based on tier, contract configuration, and staking duration
   */
  async calculateNFTBenefits(tier, contract, stakingDurationDays = 0) {
    try {
      // Get collection-specific configuration
      const collectionConfig = await this.getCollectionConfiguration(contract);
      
      const baseBenefits = contract.baseBenefits || {
        feeDiscount: 0,
        priorityAccess: false,
        openEntryTickets: 0,
        gamingBonus: 1.0,
        raffleCreationDiscount: 0,
        affiliateCommissionRate: 0
      };
      
      // Apply tier multipliers
      const tierMultiplier = this.getTierMultiplier(tier, contract.collectionType);
      
      // Apply staking multipliers
      const stakingMultiplier = this.getStakingMultiplier(stakingDurationDays, contract.collectionType);
      
      // Calculate final benefits
      const benefits = {
        feeDiscount: Math.min(baseBenefits.feeDiscount * tierMultiplier * stakingMultiplier, 75), // Max 75%
        priorityAccess: baseBenefits.priorityAccess || tier >= 3,
        openEntryTickets: Math.floor(baseBenefits.openEntryTickets * tierMultiplier * stakingMultiplier),
        gamingBonus: baseBenefits.gamingBonus * tierMultiplier * stakingMultiplier,
        raffleCreationDiscount: Math.min(baseBenefits.raffleCreationDiscount * tierMultiplier * stakingMultiplier, 50),
        affiliateCommissionRate: baseBenefits.affiliateCommissionRate * tierMultiplier,
        tier,
        stakingDurationDays,
        collectionType: contract.collectionType,
        contractAddress: contract.contractAddress,
        chainId: contract.chainId
      };
      
      return benefits;
    } catch (error) {
      console.error("Error calculating NFT benefits:", error);
      return {
        feeDiscount: 0,
        priorityAccess: false,
        openEntryTickets: 0,
        gamingBonus: 1.0,
        raffleCreationDiscount: 0,
        affiliateCommissionRate: 0,
        tier: 1,
        stakingDurationDays: 0,
        error: error.message
      };
    }
  }

  /**
   * Get collection-specific configuration
   */
  async getCollectionConfiguration(contract) {
    try {
      // This would fetch from admin configuration
      // For now, return default configuration based on collection type
      const defaultConfigs = {
        'founders_keys': {
          tierMultipliers: [1.0, 1.2, 1.5, 2.0, 2.5], // Bronze to Diamond
          stakingMultipliers: {
            30: 1.1,   // 30 days
            90: 1.2,   // 3 months
            180: 1.4,  // 6 months
            365: 1.6,  // 1 year
            1095: 2.0  // 3 years
          },
          maxBenefits: {
            feeDiscount: 75,
            openEntryTickets: 100,
            gamingBonus: 3.0
          }
        },
        'premium_collections': {
          tierMultipliers: [1.0, 1.1, 1.3, 1.6, 2.0],
          stakingMultipliers: {
            30: 1.05,
            90: 1.1,
            180: 1.2,
            365: 1.3,
            1095: 1.5
          },
          maxBenefits: {
            feeDiscount: 50,
            openEntryTickets: 50,
            gamingBonus: 2.0
          }
        },
        'standard_collections': {
          tierMultipliers: [1.0, 1.05, 1.1, 1.2, 1.3],
          stakingMultipliers: {
            30: 1.02,
            90: 1.05,
            180: 1.1,
            365: 1.15,
            1095: 1.2
          },
          maxBenefits: {
            feeDiscount: 25,
            openEntryTickets: 25,
            gamingBonus: 1.5
          }
        }
      };
      
      return defaultConfigs[contract.collectionType] || defaultConfigs['standard_collections'];
    } catch (error) {
      console.error("Error getting collection configuration:", error);
      return defaultConfigs['standard_collections'];
    }
  }

  /**
   * Get tier multiplier based on tier and collection type
   */
  getTierMultiplier(tier, collectionType = 'standard_collections') {
    const multipliers = {
      'founders_keys': [1.0, 1.2, 1.5, 2.0, 2.5],
      'premium_collections': [1.0, 1.1, 1.3, 1.6, 2.0],
      'standard_collections': [1.0, 1.05, 1.1, 1.2, 1.3]
    };
    
    const tierMultipliers = multipliers[collectionType] || multipliers['standard_collections'];
    return tierMultipliers[Math.min(tier - 1, tierMultipliers.length - 1)] || 1.0;
  }

  /**
   * Get staking multiplier based on duration and collection type
   */
  getStakingMultiplier(stakingDurationDays, collectionType = 'standard_collections') {
    const multipliers = {
      'founders_keys': {
        30: 1.1, 90: 1.2, 180: 1.4, 365: 1.6, 1095: 2.0
      },
      'premium_collections': {
        30: 1.05, 90: 1.1, 180: 1.2, 365: 1.3, 1095: 1.5
      },
      'standard_collections': {
        30: 1.02, 90: 1.05, 180: 1.1, 365: 1.15, 1095: 1.2
      }
    };
    
    const stakingMultipliers = multipliers[collectionType] || multipliers['standard_collections'];
    
    // Find the appropriate multiplier based on staking duration
    const durations = Object.keys(stakingMultipliers).map(Number).sort((a, b) => a - b);
    
    for (let i = durations.length - 1; i >= 0; i--) {
      if (stakingDurationDays >= durations[i]) {
        return stakingMultipliers[durations[i]];
      }
    }
    
    return 1.0; // No staking bonus
  }

  /**
   * Get collection hierarchy priority
   */
  getCollectionHierarchy(collectionType) {
    return this.collectionHierarchy[collectionType] || this.collectionHierarchy['standard_collections'];
  }

  /**
   * Aggregate benefits across all user's NFT collections
   * Returns the highest available benefits with Founders Keys taking precedence
   */
  async aggregateUserBenefits(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }
      
      const allUserNFTs = [];
      
      // Scan all connected wallets
      for (const wallet of user.connectedWallets || []) {
        const nfts = await this.scanWalletForAllNFTs(wallet.address);
        allUserNFTs.push(...nfts);
      }
      
      if (allUserNFTs.length === 0) {
        return this.getDefaultBenefits();
      }
      
      // Group by collection type
      const collectionGroups = this.groupNFTsByCollection(allUserNFTs);
      
      // Calculate best benefits from each collection
      const collectionBenefits = [];
      
      for (const [collectionType, nfts] of Object.entries(collectionGroups)) {
        const bestNFT = this.findBestNFTInCollection(nfts);
        if (bestNFT) {
          collectionBenefits.push({
            collectionType,
            benefits: bestNFT.benefits,
            nft: bestNFT,
            hierarchy: this.getCollectionHierarchy(collectionType)
          });
        }
      }
      
      // Sort by hierarchy (Founders Keys first)
      collectionBenefits.sort((a, b) => b.hierarchy - a.hierarchy);
      
      // Aggregate benefits with Founders Keys taking precedence
      const aggregatedBenefits = this.aggregateBenefitsWithPrecedence(collectionBenefits);
      
      return {
        ...aggregatedBenefits,
        totalNFTs: allUserNFTs.length,
        collectionsOwned: Object.keys(collectionGroups),
        foundersKeysOwned: collectionGroups['founders_keys']?.length || 0,
        highestTier: Math.max(...allUserNFTs.map(nft => nft.tier)),
        totalStakedNFTs: allUserNFTs.filter(nft => nft.stakingStatus.isStaked).length
      };
    } catch (error) {
      console.error("Error aggregating user benefits:", error);
      return this.getDefaultBenefits();
    }
  }

  /**
   * Group NFTs by collection type
   */
  groupNFTsByCollection(nfts) {
    return nfts.reduce((groups, nft) => {
      const collectionType = nft.collectionType || 'standard_collections';
      if (!groups[collectionType]) {
        groups[collectionType] = [];
      }
      groups[collectionType].push(nft);
      return groups;
    }, {});
  }

  /**
   * Find the best NFT in a collection (highest benefits)
   */
  findBestNFTInCollection(nfts) {
    if (!nfts || nfts.length === 0) return null;
    
    return nfts.reduce((best, current) => {
      if (!best) return current;
      
      // Compare by total benefit score
      const bestScore = this.calculateBenefitScore(best.benefits);
      const currentScore = this.calculateBenefitScore(current.benefits);
      
      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Calculate a benefit score for comparison
   */
  calculateBenefitScore(benefits) {
    return (
      (benefits.feeDiscount || 0) * 10 +
      (benefits.openEntryTickets || 0) * 5 +
      (benefits.gamingBonus || 1) * 20 +
      (benefits.raffleCreationDiscount || 0) * 8 +
      (benefits.affiliateCommissionRate || 0) * 15 +
      (benefits.priorityAccess ? 50 : 0)
    );
  }

  /**
   * Aggregate benefits with collection precedence
   */
  aggregateBenefitsWithPrecedence(collectionBenefits) {
    if (collectionBenefits.length === 0) {
      return this.getDefaultBenefits();
    }
    
    // Start with the highest priority collection (Founders Keys if available)
    const primaryCollection = collectionBenefits[0];
    const aggregated = { ...primaryCollection.benefits };
    
    // For each benefit type, take the maximum across all collections
    // but give precedence to Founders Keys
    for (const collection of collectionBenefits) {
      const benefits = collection.benefits;
      
      // For Founders Keys, always use their values
      if (collection.collectionType === 'founders_keys') {
        Object.assign(aggregated, benefits);
        continue;
      }
      
      // For other collections, only use if better than current
      aggregated.feeDiscount = Math.max(aggregated.feeDiscount || 0, benefits.feeDiscount || 0);
      aggregated.openEntryTickets = Math.max(aggregated.openEntryTickets || 0, benefits.openEntryTickets || 0);
      aggregated.gamingBonus = Math.max(aggregated.gamingBonus || 1, benefits.gamingBonus || 1);
      aggregated.raffleCreationDiscount = Math.max(aggregated.raffleCreationDiscount || 0, benefits.raffleCreationDiscount || 0);
      aggregated.affiliateCommissionRate = Math.max(aggregated.affiliateCommissionRate || 0, benefits.affiliateCommissionRate || 0);
      aggregated.priorityAccess = aggregated.priorityAccess || benefits.priorityAccess;
    }
    
    return {
      ...aggregated,
      primaryCollection: primaryCollection.collectionType,
      benefitSources: collectionBenefits.map(cb => ({
        collectionType: cb.collectionType,
        contractAddress: cb.nft.contractAddress,
        tokenId: cb.nft.tokenId,
        tier: cb.nft.tier,
        isStaked: cb.nft.stakingStatus.isStaked
      }))
    };
  }

  /**
   * Get default benefits for users with no NFTs
   */
  getDefaultBenefits() {
    return {
      feeDiscount: 0,
      priorityAccess: false,
      openEntryTickets: 0,
      gamingBonus: 1.0,
      raffleCreationDiscount: 0,
      affiliateCommissionRate: 0,
      tier: 0,
      stakingDurationDays: 0,
      totalNFTs: 0,
      collectionsOwned: [],
      foundersKeysOwned: 0,
      highestTier: 0,
      totalStakedNFTs: 0,
      primaryCollection: null,
      benefitSources: []
    };
  }

  /**
   * Start staking an NFT through smart contract
   */
  async startSmartContractStaking(userId, blockchain, nftContract, tokenId, stakingDuration, userWallet) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }
      
      // Verify user owns the NFT
      const userNFTs = await this.scanWalletForAllNFTs(userWallet);
      const nftToStake = userNFTs.find(
        nft => nft.contractAddress.toLowerCase() === nftContract.toLowerCase() && 
               nft.tokenId === tokenId
      );
      
      if (!nftToStake) {
        throw new Error("NFT not found in user's wallet");
      }
      
      // Check if NFT is already staked
      if (nftToStake.stakingStatus.isStaked) {
        throw new Error("NFT is already staked");
      }
      
      // Execute smart contract staking
      const stakingResult = await this.smartContractService.stakeNFT(
        blockchain,
        nftContract,
        tokenId,
        stakingDuration,
        userWallet
      );
      
      if (!stakingResult.success) {
        throw new Error("Smart contract staking failed");
      }
      
      // Update user's NFT record
      await this.updateUserNFTStakingStatus(userId, nftContract, tokenId, {
        isStaked: true,
        positionId: stakingResult.positionId,
        transactionHash: stakingResult.transactionHash,
        stakedAt: new Date(),
        stakingDuration,
        blockchain,
        contractVerified: true
      });
      
      return {
        success: true,
        transactionHash: stakingResult.transactionHash,
        positionId: stakingResult.positionId,
        message: "NFT staked successfully via smart contract"
      };
    } catch (error) {
      console.error("Error starting smart contract staking:", error);
      throw error;
    }
  }

  /**
   * Claim staked NFT through smart contract
   */
  async claimStakedNFT(userId, blockchain, positionId, userWallet) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }
      
      // Get staking position from smart contract
      const position = await this.smartContractService.getStakingPosition(blockchain, positionId);
      
      if (!position) {
        throw new Error("Staking position not found");
      }
      
      if (position.owner.toLowerCase() !== userWallet.toLowerCase()) {
        throw new Error("User is not the owner of this staking position");
      }
      
      if (new Date() < position.unlockAt) {
        throw new Error("Staking period has not ended yet");
      }
      
      // Execute smart contract claim
      const claimResult = await this.smartContractService.claimNFT(
        blockchain,
        positionId,
        userWallet
      );
      
      if (!claimResult.success) {
        throw new Error("Smart contract claim failed");
      }
      
      // Update user's NFT record
      await this.updateUserNFTStakingStatus(userId, position.nftContract, position.tokenId, {
        isStaked: false,
        positionId: null,
        claimedAt: new Date(),
        claimTransactionHash: claimResult.transactionHash,
        contractVerified: true
      });
      
      return {
        success: true,
        transactionHash: claimResult.transactionHash,
        message: "NFT claimed successfully from smart contract"
      };
    } catch (error) {
      console.error("Error claiming staked NFT:", error);
      throw error;
    }
  }

  /**
   * Update user's NFT staking status in database
   */
  async updateUserNFTStakingStatus(userId, nftContract, tokenId, stakingStatus) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }
      
      // Find and update the NFT record
      // This would depend on how NFTs are stored in the user model
      // For now, we'll create a separate tracking mechanism
      
      const StakingPosition = require('../models/staking/stakingPosition');
      
      if (stakingStatus.isStaked) {
        // Create new staking position
        const position = new StakingPosition({
          userId,
          nftContract,
          tokenId,
          positionId: stakingStatus.positionId,
          transactionHash: stakingStatus.transactionHash,
          stakedAt: stakingStatus.stakedAt,
          stakingDuration: stakingStatus.stakingDuration,
          blockchain: stakingStatus.blockchain,
          contractVerified: stakingStatus.contractVerified,
          status: 'active'
        });
        
        await position.save();
      } else {
        // Update existing position
        await StakingPosition.findOneAndUpdate(
          { userId, nftContract, tokenId, status: 'active' },
          {
            status: 'completed',
            claimedAt: stakingStatus.claimedAt,
            claimTransactionHash: stakingStatus.claimTransactionHash,
            contractVerified: stakingStatus.contractVerified
          }
        );
      }
      
      return true;
    } catch (error) {
      console.error("Error updating user NFT staking status:", error);
      throw error;
    }
  }

  /**
   * Verify NFT ownership and staking status through smart contracts
   */
  async verifyNFTOwnershipAndStaking(userId, nftContract, tokenId, blockchain) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }
      
      // Check all user's wallets for NFT ownership
      let isOwned = false;
      let ownerWallet = null;
      
      for (const wallet of user.connectedWallets || []) {
        const nfts = await this.scanContractForNFTs(wallet.address, {
          contractAddress: nftContract,
          chainId: blockchain
        });
        
        const ownedNFT = nfts.find(nft => nft.tokenId === tokenId);
        if (ownedNFT) {
          isOwned = true;
          ownerWallet = wallet.address;
          break;
        }
      }
      
      // Check staking status via smart contract
      const stakingStatus = await this.getSmartContractStakingStatus(
        blockchain,
        nftContract,
        tokenId
      );
      
      return {
        isOwned,
        ownerWallet,
        stakingStatus,
        verified: true
      };
    } catch (error) {
      console.error("Error verifying NFT ownership and staking:", error);
      return {
        isOwned: false,
        ownerWallet: null,
        stakingStatus: { isStaked: false, contractVerified: false },
        verified: false,
        error: error.message
      };
    }
  }

  /**
   * Get user's complete NFT benefits profile
   */
  async getUserBenefitsProfile(userId) {
    try {
      const aggregatedBenefits = await this.aggregateUserBenefits(userId);
      
      // Get detailed breakdown by collection
      const user = await User.findById(userId);
      const allNFTs = [];
      
      if (user) {
        for (const wallet of user.connectedWallets || []) {
          const nfts = await this.scanWalletForAllNFTs(wallet.address);
          allNFTs.push(...nfts);
        }
      }
      
      const collectionBreakdown = this.groupNFTsByCollection(allNFTs);
      
      return {
        userId,
        aggregatedBenefits,
        collectionBreakdown,
        totalCollections: Object.keys(collectionBreakdown).length,
        lastUpdated: new Date(),
        smartContractVerified: allNFTs.every(nft => nft.stakingStatus.contractVerified !== false)
      };
    } catch (error) {
      console.error("Error getting user benefits profile:", error);
      return {
        userId,
        aggregatedBenefits: this.getDefaultBenefits(),
        collectionBreakdown: {},
        totalCollections: 0,
        lastUpdated: new Date(),
        smartContractVerified: false,
        error: error.message
      };
    }
  }
}

module.exports = new UniversalNFTBenefitsService();