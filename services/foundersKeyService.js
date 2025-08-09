const { Alchemy, Network } = require("alchemy-sdk");
const User = require("../models/user/user");
const FoundersKeyContract = require("../models/user/foundersKeyContract");
const FoundersKeyStaking = require("../models/user/foundersKeyStaking");
const OpenEntryAllocation = require("../models/user/openEntryAllocation");
const UniversalNFTBenefitsService = require("./universalNFTBenefitsService");
const SmartContractService = require("./smartContractService");
const sendResponse = require("../utils/responseHandler");

class FoundersKeyService {
  constructor() {
    this.alchemySettings = {
      apiKey: process.env.ALCHEMY_API_KEY,
      network: Network.ETH_MAINNET,
    };
    this.alchemy = new Alchemy(this.alchemySettings);
    
    // Initialize smart contract integration
    this.smartContractService = SmartContractService;
    this.universalNFTBenefitsService = UniversalNFTBenefitsService;
    
    // Solana connection would be initialized here if needed
    this.solanaConnection = null;
  }

  /**
   * Scan wallet for Founders Key NFTs across all configured contracts
   * Now uses Universal NFT Benefits Service with smart contract integration
   */
  async scanWalletForFoundersKeys(walletAddress) {
    try {
      // Use Universal NFT Benefits Service to scan for all NFTs
      const allNFTs = await this.universalNFTBenefitsService.scanWalletForAllNFTs(walletAddress);
      
      // Filter for Founders Keys only
      const foundersKeys = allNFTs.filter(nft => 
        nft.collectionType === 'founders_keys' || 
        this.isFoundersKeyContract(nft.contractAddress)
      );
      
      return foundersKeys;
    } catch (error) {
      console.error("Error scanning wallet for Founders Keys:", error);
      throw error;
    }
  }

  /**
   * Check if a contract address is a Founders Key contract
   */
  async isFoundersKeyContract(contractAddress) {
    try {
      const contract = await FoundersKeyContract.findOne({ 
        contractAddress: contractAddress.toLowerCase(),
        isActive: true,
        collectionType: 'founders_keys'
      });
      return !!contract;
    } catch (error) {
      console.error("Error checking if contract is Founders Key:", error);
      return false;
    }
  }

  /**
   * Scan specific contract for Founders Keys owned by wallet
   */
  async scanContractForKeys(walletAddress, contract) {
    try {
      const foundersKeys = [];
      
      if (contract.chainId === "1" || contract.chainId === "ethereum") {
        // Ethereum scanning using Alchemy
        const nfts = await this.alchemy.nft.getNftsForOwner(walletAddress, {
          contractAddresses: [contract.contractAddress]
        });
        
        for (const nft of nfts.ownedNfts) {
          const tier = await this.determineKeyTier(nft, contract);
          const benefits = await this.calculateTierBenefits(tier, contract);
          
          foundersKeys.push({
            tokenId: nft.tokenId,
            contractAddress: contract.contractAddress,
            chainId: contract.chainId,
            tier,
            benefits,
            stakingPeriod: {
              isActive: false
            }
          });
        }
      } else if (contract.chainId === "solana") {
        // Solana scanning would be implemented here
        // This would require @solana/web3.js and Metaplex integration
        console.log("Solana Founders Key scanning not yet implemented");
      }
      
      return foundersKeys;
    } catch (error) {
      console.error("Error scanning contract for keys:", error);
      return [];
    }
  }

  /**
   * Determine the tier of a Founders Key based on metadata or token ID
   */
  async determineKeyTier(nft, contract) {
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
                  attr.trait_type.toLowerCase() === 'level'
        );
        if (tierAttribute) {
          return parseInt(tierAttribute.value) || 1;
        }
      }
      
      // Default tier based on contract configuration
      return contract.defaultTier || 1;
    } catch (error) {
      console.error("Error determining key tier:", error);
      return 1; // Default to tier 1
    }
  }

  /**
   * Calculate benefits based on tier and contract configuration
   */
  async calculateTierBenefits(tier, contract, stakingDurationDays = 0) {
    const FoundersKeyConfig = require('../models/admin/foundersKeyConfig');
    const config = await FoundersKeyConfig.getActiveConfig();
    
    const baseBenefits = contract.baseBenefits || {
      feeDiscount: 0,
      priorityAccess: false,
      openEntryTickets: 0
    };
    
    return config.calculateBenefits(baseBenefits, tier, stakingDurationDays);
  }

  /**
   * Start staking period for a Founders Key using smart contract
   */
  async startStaking(userId, tokenId, contractAddress, stakingDuration, userWallet, blockchain = 'ethereum') {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }
      
      // Verify this is a Founders Key contract
      if (!await this.isFoundersKeyContract(contractAddress)) {
        throw new Error("Contract is not a recognized Founders Key contract");
      }
      
      // Use Universal NFT Benefits Service for smart contract staking
      const stakingResult = await this.universalNFTBenefitsService.startSmartContractStaking(
        userId,
        blockchain,
        contractAddress,
        tokenId,
        stakingDuration,
        userWallet
      );
      
      if (!stakingResult.success) {
        throw new Error("Smart contract staking failed");
      }
      
      // Create legacy staking record for compatibility
      const stakingRecord = new FoundersKeyStaking({
        userId,
        tokenId,
        contractAddress,
        stakingDuration,
        startDate: new Date(),
        endDate: new Date(Date.now() + stakingDuration * 24 * 60 * 60 * 1000),
        status: 'active',
        smartContractPositionId: stakingResult.positionId,
        transactionHash: stakingResult.transactionHash,
        blockchain,
        contractVerified: true
      });
      
      await stakingRecord.save();
      
      return {
        success: true,
        stakingRecord,
        transactionHash: stakingResult.transactionHash,
        positionId: stakingResult.positionId,
        message: "Founders Key staked successfully via smart contract"
      };
    } catch (error) {
      console.error("Error starting staking:", error);
      throw error;
    }
  }

  /**
   * End staking period for a Founders Key using smart contract
   */
  async endStaking(userId, positionId, userWallet, blockchain = 'ethereum') {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }
      
      // Find staking record by position ID
      const stakingRecord = await FoundersKeyStaking.findOne({
        userId,
        smartContractPositionId: positionId,
        status: 'active'
      });
      
      if (!stakingRecord) {
        throw new Error("Active staking record not found");
      }
      
      // Use Universal NFT Benefits Service for smart contract claiming
      const claimResult = await this.universalNFTBenefitsService.claimStakedNFT(
        userId,
        blockchain,
        positionId,
        userWallet
      );
      
      if (!claimResult.success) {
        throw new Error("Smart contract claim failed");
      }
      
      // Update staking record
      stakingRecord.status = 'completed';
      stakingRecord.endedAt = new Date();
      stakingRecord.claimTransactionHash = claimResult.transactionHash;
      await stakingRecord.save();
      
      return {
        success: true,
        message: "Founders Key claimed successfully from smart contract",
        transactionHash: claimResult.transactionHash
      };
    } catch (error) {
      console.error("Error ending staking:", error);
      throw error;
    }
  }

  /**
   * Get staking multiplier based on duration (now uses configurable values)
   */
  async getStakingMultiplier(stakingDuration) {
    const FoundersKeyConfig = require('../models/admin/foundersKeyConfig');
    const config = await FoundersKeyConfig.getActiveConfig();
    return config.getStakingMultiplier(stakingDuration);
  }

  /**
   * Process open-entry ticket allocations for Founders Key holders
   */
  async processOpenEntryAllocations() {
    try {
      const users = await User.find({ 
        "foundersKeys.0": { $exists: true } 
      });
      
      const allocations = [];
      
      for (const user of users) {
        const benefits = user.getFoundersKeyBenefits();
        
        if (benefits.openEntryTickets > 0) {
          // Check if allocation already exists for this month
          const currentMonth = new Date();
          currentMonth.setDate(1);
          currentMonth.setHours(0, 0, 0, 0);
          
          const existingAllocation = await OpenEntryAllocation.findOne({
            userId: user._id,
            allocationDate: { $gte: currentMonth }
          });
          
          if (!existingAllocation) {
            const allocation = new OpenEntryAllocation({
              userId: user._id,
              ticketsAllocated: benefits.openEntryTickets,
              allocationDate: new Date(),
              source: 'founders_key_benefits',
              status: 'pending'
            });
            
            await allocation.save();
            allocations.push(allocation);
          }
        }
      }
      
      return allocations;
    } catch (error) {
      console.error("Error processing open-entry allocations:", error);
      throw error;
    }
  }

  /**
   * Generate snapshot of all Founders Key holders for admin export
   */
  async generateFoundersKeySnapshot() {
    try {
      const users = await User.find({ 
        "foundersKeys.0": { $exists: true } 
      }).select('username primaryWallet foundersKeys tier');
      
      const snapshot = users.map(user => {
        const benefits = user.getFoundersKeyBenefits();
        
        return {
          username: user.username,
          walletAddress: user.primaryWallet?.address || 'N/A',
          tier: user.tier,
          totalKeys: user.foundersKeys.length,
          highestKeyTier: Math.max(...user.foundersKeys.map(key => key.tier)),
          totalFeeDiscount: benefits.feeDiscount,
          priorityAccess: benefits.priorityAccess,
          openEntryTickets: benefits.openEntryTickets,
          stakingKeys: user.foundersKeys.filter(key => key.stakingPeriod.isActive).length,
          foundersKeys: user.foundersKeys.map(key => ({
            tokenId: key.tokenId,
            contractAddress: key.contractAddress,
            tier: key.tier,
            isStaking: key.stakingPeriod.isActive,
            stakingEndDate: key.stakingPeriod.endDate
          }))
        };
      });
      
      return snapshot;
    } catch (error) {
      console.error("Error generating Founders Key snapshot:", error);
      throw error;
    }
  }

  /**
   * Apply fee discount to a transaction amount
   */
  applyFeeDiscount(userId, originalFee) {
    return new Promise(async (resolve, reject) => {
      try {
        const user = await User.findById(userId);
        if (!user) {
          return resolve(originalFee);
        }
        
        const benefits = user.getFoundersKeyBenefits();
        const discountPercent = benefits.feeDiscount;
        
        if (discountPercent > 0) {
          const discountAmount = (originalFee * discountPercent) / 100;
          const discountedFee = originalFee - discountAmount;
          
          return resolve({
            originalFee,
            discountPercent,
            discountAmount,
            finalFee: Math.max(discountedFee, 0),
            appliedDiscount: true
          });
        }
        
        resolve({
          originalFee,
          discountPercent: 0,
          discountAmount: 0,
          finalFee: originalFee,
          appliedDiscount: false
        });
      } catch (error) {
        console.error("Error applying fee discount:", error);
        resolve(originalFee);
      }
    });
  }

  /**
   * Check if user has priority access
   */
  async hasPriorityAccess(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) return false;
      
      const benefits = user.getFoundersKeyBenefits();
      return benefits.priorityAccess;
    } catch (error) {
      console.error("Error checking priority access:", error);
      return false;
    }
  }
}

module.exports = new FoundersKeyService();