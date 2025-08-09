const UniversalNFTBenefitsService = require('../../services/universalNFTBenefitsService');
const FoundersKeyContract = require('../../models/user/foundersKeyContract');
const SmartContractService = require('../../services/smartContractService');
const sendResponse = require('../../utils/responseHandler');

/**
 * Admin Controller for Universal NFT Benefits Management
 */
class UniversalNFTBenefitsAdminController {
  
  /**
   * Get all approved NFT collections with their benefit configurations
   */
  async getAllCollections(req, res) {
    try {
      const collections = await FoundersKeyContract.find({ isActive: true })
        .sort({ collectionType: 1, contractAddress: 1 });
      
      const collectionsWithStats = await Promise.all(
        collections.map(async (collection) => {
          // Get smart contract stats if available
          let contractStats = null;
          try {
            contractStats = await SmartContractService.getContractStats(collection.chainId);
          } catch (error) {
            console.log(`Could not get contract stats for ${collection.contractAddress}:`, error.message);
          }
          
          return {
            _id: collection._id,
            contractAddress: collection.contractAddress,
            chainId: collection.chainId,
            collectionType: collection.collectionType || 'standard_collections',
            name: collection.name || 'Unknown Collection',
            isActive: collection.isActive,
            baseBenefits: collection.baseBenefits || {},
            tierMapping: collection.tierMapping || new Map(),
            defaultTier: collection.defaultTier || 1,
            createdAt: collection.createdAt,
            updatedAt: collection.updatedAt,
            contractStats
          };
        })
      );
      
      return sendResponse(res, 200, "Collections retrieved successfully", {
        collections: collectionsWithStats,
        totalCollections: collectionsWithStats.length,
        collectionTypes: {
          founders_keys: collectionsWithStats.filter(c => c.collectionType === 'founders_keys').length,
          premium_collections: collectionsWithStats.filter(c => c.collectionType === 'premium_collections').length,
          standard_collections: collectionsWithStats.filter(c => c.collectionType === 'standard_collections').length
        }
      });
    } catch (error) {
      console.error("Error getting all collections:", error);
      return sendResponse(res, 500, "Failed to retrieve collections");
    }
  }

  /**
   * Add a new NFT collection to the benefits system
   */
  async addCollection(req, res) {
    try {
      const {
        contractAddress,
        chainId,
        collectionType = 'standard_collections',
        name,
        baseBenefits = {},
        tierMapping = {},
        defaultTier = 1,
        addToSmartContract = false
      } = req.body;

      // Validate required fields
      if (!contractAddress || !chainId || !name) {
        return sendResponse(res, 400, "Contract address, chain ID, and name are required");
      }

      // Validate collection type
      const validCollectionTypes = ['founders_keys', 'premium_collections', 'standard_collections'];
      if (!validCollectionTypes.includes(collectionType)) {
        return sendResponse(res, 400, "Invalid collection type");
      }

      // Check if collection already exists
      const existingCollection = await FoundersKeyContract.findOne({
        contractAddress: contractAddress.toLowerCase(),
        chainId
      });

      if (existingCollection) {
        return sendResponse(res, 400, "Collection already exists");
      }

      // Create new collection
      const newCollection = new FoundersKeyContract({
        contractAddress: contractAddress.toLowerCase(),
        chainId,
        collectionType,
        name,
        baseBenefits: {
          feeDiscount: baseBenefits.feeDiscount || 0,
          priorityAccess: baseBenefits.priorityAccess || false,
          openEntryTickets: baseBenefits.openEntryTickets || 0,
          gamingBonus: baseBenefits.gamingBonus || 1.0,
          raffleCreationDiscount: baseBenefits.raffleCreationDiscount || 0,
          affiliateCommissionRate: baseBenefits.affiliateCommissionRate || 0
        },
        tierMapping: new Map(Object.entries(tierMapping)),
        defaultTier,
        isActive: true
      });

      await newCollection.save();

      // Add to smart contract if requested
      if (addToSmartContract && chainId !== 'solana') {
        try {
          const smartContractResult = await SmartContractService.addCollection(
            chainId,
            contractAddress,
            baseBenefits.sixMonthTickets || 0,
            baseBenefits.twelveMonthTickets || 0,
            baseBenefits.threeYearTickets || 0,
            req.user.walletAddress
          );

          newCollection.smartContractIntegrated = true;
          newCollection.smartContractTransactionHash = smartContractResult.transactionHash;
          await newCollection.save();
        } catch (smartContractError) {
          console.error("Error adding collection to smart contract:", smartContractError);
          // Continue without smart contract integration
        }
      }

      return sendResponse(res, 201, "Collection added successfully", {
        collection: newCollection
      });
    } catch (error) {
      console.error("Error adding collection:", error);
      return sendResponse(res, 500, "Failed to add collection");
    }
  }

  /**
   * Update an existing NFT collection's benefit configuration
   */
  async updateCollection(req, res) {
    try {
      const { collectionId } = req.params;
      const {
        name,
        baseBenefits,
        tierMapping,
        defaultTier,
        isActive,
        updateSmartContract = false
      } = req.body;

      const collection = await FoundersKeyContract.findById(collectionId);
      if (!collection) {
        return sendResponse(res, 404, "Collection not found");
      }

      // Update fields
      if (name) collection.name = name;
      if (baseBenefits) {
        collection.baseBenefits = {
          ...collection.baseBenefits,
          ...baseBenefits
        };
      }
      if (tierMapping) {
        collection.tierMapping = new Map(Object.entries(tierMapping));
      }
      if (defaultTier !== undefined) collection.defaultTier = defaultTier;
      if (isActive !== undefined) collection.isActive = isActive;

      await collection.save();

      // Update smart contract if requested
      if (updateSmartContract && collection.chainId !== 'solana') {
        try {
          const smartContractResult = await SmartContractService.updateCollectionRewards(
            collection.chainId,
            collection.contractAddress,
            baseBenefits?.sixMonthTickets || 0,
            baseBenefits?.twelveMonthTickets || 0,
            baseBenefits?.threeYearTickets || 0,
            req.user.walletAddress
          );

          collection.lastSmartContractUpdate = new Date();
          collection.lastSmartContractTransactionHash = smartContractResult.transactionHash;
          await collection.save();
        } catch (smartContractError) {
          console.error("Error updating collection in smart contract:", smartContractError);
          // Continue without smart contract update
        }
      }

      return sendResponse(res, 200, "Collection updated successfully", {
        collection
      });
    } catch (error) {
      console.error("Error updating collection:", error);
      return sendResponse(res, 500, "Failed to update collection");
    }
  }

  /**
   * Remove an NFT collection from the benefits system
   */
  async removeCollection(req, res) {
    try {
      const { collectionId } = req.params;
      const { removeFromSmartContract = false } = req.body;

      const collection = await FoundersKeyContract.findById(collectionId);
      if (!collection) {
        return sendResponse(res, 404, "Collection not found");
      }

      // Don't allow removal of Founders Keys
      if (collection.collectionType === 'founders_keys') {
        return sendResponse(res, 400, "Cannot remove Founders Keys collection");
      }

      // Remove from smart contract if requested
      if (removeFromSmartContract && collection.chainId !== 'solana') {
        try {
          // This would require a smart contract function to disable collections
          console.log("Smart contract collection removal not yet implemented");
        } catch (smartContractError) {
          console.error("Error removing collection from smart contract:", smartContractError);
        }
      }

      // Soft delete by setting isActive to false
      collection.isActive = false;
      collection.removedAt = new Date();
      await collection.save();

      return sendResponse(res, 200, "Collection removed successfully");
    } catch (error) {
      console.error("Error removing collection:", error);
      return sendResponse(res, 500, "Failed to remove collection");
    }
  }

  /**
   * Get collection-specific benefit configuration templates
   */
  async getBenefitTemplates(req, res) {
    try {
      const templates = {
        founders_keys: {
          name: "Founders Keys (Flagship)",
          description: "Premium tier with highest benefits and enhanced privileges",
          baseBenefits: {
            feeDiscount: 25,
            priorityAccess: true,
            openEntryTickets: 20,
            gamingBonus: 1.5,
            raffleCreationDiscount: 15,
            affiliateCommissionRate: 2.0
          },
          tierMultipliers: [1.0, 1.2, 1.5, 2.0, 2.5],
          stakingMultipliers: {
            30: 1.1, 90: 1.2, 180: 1.4, 365: 1.6, 1095: 2.0
          },
          maxBenefits: {
            feeDiscount: 75,
            openEntryTickets: 100,
            gamingBonus: 3.0
          }
        },
        premium_collections: {
          name: "Premium Collections",
          description: "High-tier collections with substantial benefits",
          baseBenefits: {
            feeDiscount: 15,
            priorityAccess: false,
            openEntryTickets: 10,
            gamingBonus: 1.3,
            raffleCreationDiscount: 10,
            affiliateCommissionRate: 1.5
          },
          tierMultipliers: [1.0, 1.1, 1.3, 1.6, 2.0],
          stakingMultipliers: {
            30: 1.05, 90: 1.1, 180: 1.2, 365: 1.3, 1095: 1.5
          },
          maxBenefits: {
            feeDiscount: 50,
            openEntryTickets: 50,
            gamingBonus: 2.0
          }
        },
        standard_collections: {
          name: "Standard Collections",
          description: "Basic tier with moderate benefits",
          baseBenefits: {
            feeDiscount: 5,
            priorityAccess: false,
            openEntryTickets: 5,
            gamingBonus: 1.1,
            raffleCreationDiscount: 5,
            affiliateCommissionRate: 1.0
          },
          tierMultipliers: [1.0, 1.05, 1.1, 1.2, 1.3],
          stakingMultipliers: {
            30: 1.02, 90: 1.05, 180: 1.1, 365: 1.15, 1095: 1.2
          },
          maxBenefits: {
            feeDiscount: 25,
            openEntryTickets: 25,
            gamingBonus: 1.5
          }
        }
      };

      return sendResponse(res, 200, "Benefit templates retrieved successfully", {
        templates
      });
    } catch (error) {
      console.error("Error getting benefit templates:", error);
      return sendResponse(res, 500, "Failed to retrieve benefit templates");
    }
  }

  /**
   * Test user's benefits across all collections
   */
  async testUserBenefits(req, res) {
    try {
      const { userId, walletAddress } = req.body;

      if (!userId && !walletAddress) {
        return sendResponse(res, 400, "User ID or wallet address is required");
      }

      let benefitsProfile;
      
      if (userId) {
        benefitsProfile = await UniversalNFTBenefitsService.getUserBenefitsProfile(userId);
      } else {
        // Test wallet directly
        const allNFTs = await UniversalNFTBenefitsService.scanWalletForAllNFTs(walletAddress);
        benefitsProfile = {
          walletAddress,
          allNFTs,
          totalNFTs: allNFTs.length,
          collectionsFound: [...new Set(allNFTs.map(nft => nft.collectionType))],
          smartContractVerified: allNFTs.every(nft => nft.stakingStatus.contractVerified !== false)
        };
      }

      return sendResponse(res, 200, "User benefits tested successfully", {
        benefitsProfile
      });
    } catch (error) {
      console.error("Error testing user benefits:", error);
      return sendResponse(res, 500, "Failed to test user benefits");
    }
  }

  /**
   * Get collection hierarchy and precedence rules
   */
  async getCollectionHierarchy(req, res) {
    try {
      const hierarchy = {
        precedenceRules: {
          description: "Collections are prioritized in the following order:",
          order: [
            {
              type: "founders_keys",
              priority: 1000,
              description: "Founders Keys (Flagship) - Always takes precedence",
              privileges: [
                "Highest tier benefits",
                "Enhanced staking multipliers",
                "Exclusive access features",
                "Priority in benefit aggregation"
              ]
            },
            {
              type: "premium_collections",
              priority: 500,
              description: "Premium Collections - High-tier benefits",
              privileges: [
                "Substantial benefits",
                "Good staking multipliers",
                "Priority access to some features"
              ]
            },
            {
              type: "standard_collections",
              priority: 100,
              description: "Standard Collections - Basic benefits",
              privileges: [
                "Moderate benefits",
                "Basic staking multipliers",
                "Standard access"
              ]
            }
          ]
        },
        aggregationRules: {
          description: "How benefits are combined when users own multiple collections:",
          rules: [
            "Founders Keys always override other collections for all benefits",
            "For non-Founders collections, the highest benefit value is used",
            "Priority access is granted if any collection provides it",
            "Gaming bonuses are taken from the highest-tier collection",
            "Staking multipliers are collection-specific and don't stack"
          ]
        },
        smartContractIntegration: {
          description: "Smart contract verification ensures true NFT ownership and staking status",
          features: [
            "Real-time ownership verification",
            "Blockchain-enforced staking periods",
            "Admin override capabilities for emergencies",
            "Cross-chain support for multiple networks"
          ]
        }
      };

      return sendResponse(res, 200, "Collection hierarchy retrieved successfully", {
        hierarchy
      });
    } catch (error) {
      console.error("Error getting collection hierarchy:", error);
      return sendResponse(res, 500, "Failed to retrieve collection hierarchy");
    }
  }

  /**
   * Bulk import collections from CSV
   */
  async bulkImportCollections(req, res) {
    try {
      const { collections } = req.body;

      if (!Array.isArray(collections) || collections.length === 0) {
        return sendResponse(res, 400, "Collections array is required");
      }

      const results = {
        successful: [],
        failed: [],
        skipped: []
      };

      for (const collectionData of collections) {
        try {
          const {
            contractAddress,
            chainId,
            collectionType = 'standard_collections',
            name
          } = collectionData;

          // Check if collection already exists
          const existingCollection = await FoundersKeyContract.findOne({
            contractAddress: contractAddress.toLowerCase(),
            chainId
          });

          if (existingCollection) {
            results.skipped.push({
              contractAddress,
              chainId,
              reason: "Collection already exists"
            });
            continue;
          }

          // Create new collection
          const newCollection = new FoundersKeyContract({
            contractAddress: contractAddress.toLowerCase(),
            chainId,
            collectionType,
            name,
            baseBenefits: this.getDefaultBenefitsForType(collectionType),
            defaultTier: 1,
            isActive: true
          });

          await newCollection.save();
          results.successful.push({
            contractAddress,
            chainId,
            name,
            collectionType
          });
        } catch (error) {
          results.failed.push({
            contractAddress: collectionData.contractAddress,
            chainId: collectionData.chainId,
            error: error.message
          });
        }
      }

      return sendResponse(res, 200, "Bulk import completed", {
        results,
        summary: {
          total: collections.length,
          successful: results.successful.length,
          failed: results.failed.length,
          skipped: results.skipped.length
        }
      });
    } catch (error) {
      console.error("Error bulk importing collections:", error);
      return sendResponse(res, 500, "Failed to bulk import collections");
    }
  }

  /**
   * Get default benefits for collection type
   */
  getDefaultBenefitsForType(collectionType) {
    const defaults = {
      founders_keys: {
        feeDiscount: 25,
        priorityAccess: true,
        openEntryTickets: 20,
        gamingBonus: 1.5,
        raffleCreationDiscount: 15,
        affiliateCommissionRate: 2.0
      },
      premium_collections: {
        feeDiscount: 15,
        priorityAccess: false,
        openEntryTickets: 10,
        gamingBonus: 1.3,
        raffleCreationDiscount: 10,
        affiliateCommissionRate: 1.5
      },
      standard_collections: {
        feeDiscount: 5,
        priorityAccess: false,
        openEntryTickets: 5,
        gamingBonus: 1.1,
        raffleCreationDiscount: 5,
        affiliateCommissionRate: 1.0
      }
    };

    return defaults[collectionType] || defaults.standard_collections;
  }
}

module.exports = new UniversalNFTBenefitsAdminController();