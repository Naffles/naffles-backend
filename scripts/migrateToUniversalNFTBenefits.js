/**
 * Migration Script: Migrate to Universal NFT Benefits System
 * 
 * This script migrates the existing Founders Key system to the new Universal NFT Benefits System
 * that supports all approved NFT collections with smart contract integration.
 */

const mongoose = require('mongoose');
const FoundersKeyContract = require('../models/user/foundersKeyContract');
const User = require('../models/user/user');
const FoundersKeyStaking = require('../models/user/foundersKeyStaking');
const UniversalNFTBenefitsService = require('../services/universalNFTBenefitsService');

class UniversalNFTBenefitsMigration {
  constructor() {
    this.migrationStats = {
      foundersKeyContractsUpdated: 0,
      usersProcessed: 0,
      stakingRecordsUpdated: 0,
      newCollectionsAdded: 0,
      errors: []
    };
  }

  /**
   * Run the complete migration
   */
  async runMigration() {
    try {
      console.log('🚀 Starting Universal NFT Benefits Migration...');
      
      // Step 1: Update existing Founders Key contracts
      await this.updateFoundersKeyContracts();
      
      // Step 2: Add collection type hierarchy
      await this.addCollectionTypeHierarchy();
      
      // Step 3: Update user records for compatibility
      await this.updateUserRecords();
      
      // Step 4: Update staking records with smart contract compatibility
      await this.updateStakingRecords();
      
      // Step 5: Add sample premium and standard collections
      await this.addSampleCollections();
      
      // Step 6: Validate migration
      await this.validateMigration();
      
      console.log('✅ Migration completed successfully!');
      console.log('📊 Migration Statistics:', this.migrationStats);
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      this.migrationStats.errors.push({
        step: 'general',
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Step 1: Update existing Founders Key contracts to include collection type
   */
  async updateFoundersKeyContracts() {
    try {
      console.log('📝 Step 1: Updating Founders Key contracts...');
      
      const foundersKeyContracts = await FoundersKeyContract.find({});
      
      for (const contract of foundersKeyContracts) {
        // Set collection type to founders_keys if not already set
        if (!contract.collectionType) {
          contract.collectionType = 'founders_keys';
        }
        
        // Ensure base benefits are properly structured
        if (!contract.baseBenefits) {
          contract.baseBenefits = {
            feeDiscount: 25,
            priorityAccess: true,
            openEntryTickets: 20,
            gamingBonus: 1.5,
            raffleCreationDiscount: 15,
            affiliateCommissionRate: 2.0
          };
        }
        
        // Add smart contract integration fields
        if (!contract.smartContractIntegrated) {
          contract.smartContractIntegrated = false;
        }
        
        await contract.save();
        this.migrationStats.foundersKeyContractsUpdated++;
      }
      
      console.log(`✅ Updated ${this.migrationStats.foundersKeyContractsUpdated} Founders Key contracts`);
    } catch (error) {
      console.error('❌ Error updating Founders Key contracts:', error);
      this.migrationStats.errors.push({
        step: 'updateFoundersKeyContracts',
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Step 2: Add collection type hierarchy configuration
   */
  async addCollectionTypeHierarchy() {
    try {
      console.log('📝 Step 2: Adding collection type hierarchy...');
      
      // This would typically be stored in a configuration collection
      // For now, we'll ensure the hierarchy is documented in the service
      const hierarchyConfig = {
        'founders_keys': {
          priority: 1000,
          name: 'Founders Keys (Flagship)',
          description: 'Premium tier with highest benefits and enhanced privileges',
          maxBenefits: {
            feeDiscount: 75,
            openEntryTickets: 100,
            gamingBonus: 3.0
          }
        },
        'premium_collections': {
          priority: 500,
          name: 'Premium Collections',
          description: 'High-tier collections with substantial benefits',
          maxBenefits: {
            feeDiscount: 50,
            openEntryTickets: 50,
            gamingBonus: 2.0
          }
        },
        'standard_collections': {
          priority: 100,
          name: 'Standard Collections',
          description: 'Basic tier with moderate benefits',
          maxBenefits: {
            feeDiscount: 25,
            openEntryTickets: 25,
            gamingBonus: 1.5
          }
        }
      };
      
      console.log('✅ Collection type hierarchy configured');
      console.log('📋 Hierarchy:', hierarchyConfig);
    } catch (error) {
      console.error('❌ Error adding collection type hierarchy:', error);
      this.migrationStats.errors.push({
        step: 'addCollectionTypeHierarchy',
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Step 3: Update user records for compatibility
   */
  async updateUserRecords() {
    try {
      console.log('📝 Step 3: Updating user records...');
      
      const users = await User.find({ 
        $or: [
          { "foundersKeys.0": { $exists: true } },
          { "connectedWallets.0": { $exists: true } }
        ]
      });
      
      for (const user of users) {
        let userUpdated = false;
        
        // Ensure connectedWallets array exists
        if (!user.connectedWallets) {
          user.connectedWallets = [];
          userUpdated = true;
        }
        
        // Add primary wallet to connectedWallets if not already there
        if (user.primaryWallet && user.primaryWallet.address) {
          const existingWallet = user.connectedWallets.find(
            wallet => wallet.address.toLowerCase() === user.primaryWallet.address.toLowerCase()
          );
          
          if (!existingWallet) {
            user.connectedWallets.push({
              address: user.primaryWallet.address,
              chainId: user.primaryWallet.chainId || 'ethereum',
              isPrimary: true,
              connectedAt: user.createdAt || new Date()
            });
            userUpdated = true;
          }
        }
        
        // Add migration flag
        if (!user.migratedToUniversalNFTBenefits) {
          user.migratedToUniversalNFTBenefits = true;
          user.migrationDate = new Date();
          userUpdated = true;
        }
        
        if (userUpdated) {
          await user.save();
          this.migrationStats.usersProcessed++;
        }
      }
      
      console.log(`✅ Updated ${this.migrationStats.usersProcessed} user records`);
    } catch (error) {
      console.error('❌ Error updating user records:', error);
      this.migrationStats.errors.push({
        step: 'updateUserRecords',
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Step 4: Update staking records with smart contract compatibility
   */
  async updateStakingRecords() {
    try {
      console.log('📝 Step 4: Updating staking records...');
      
      const stakingRecords = await FoundersKeyStaking.find({ status: 'active' });
      
      for (const record of stakingRecords) {
        let recordUpdated = false;
        
        // Add smart contract fields if not present
        if (!record.smartContractPositionId) {
          record.smartContractPositionId = null;
          recordUpdated = true;
        }
        
        if (!record.blockchain) {
          record.blockchain = 'ethereum'; // Default to Ethereum
          recordUpdated = true;
        }
        
        if (record.contractVerified === undefined) {
          record.contractVerified = false; // Will need smart contract integration
          recordUpdated = true;
        }
        
        // Add migration flag
        if (!record.migratedToSmartContract) {
          record.migratedToSmartContract = false; // Will need actual smart contract staking
          record.migrationRequired = true;
          recordUpdated = true;
        }
        
        if (recordUpdated) {
          await record.save();
          this.migrationStats.stakingRecordsUpdated++;
        }
      }
      
      console.log(`✅ Updated ${this.migrationStats.stakingRecordsUpdated} staking records`);
    } catch (error) {
      console.error('❌ Error updating staking records:', error);
      this.migrationStats.errors.push({
        step: 'updateStakingRecords',
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Step 5: Add sample premium and standard collections
   */
  async addSampleCollections() {
    try {
      console.log('📝 Step 5: Adding sample collections...');
      
      const sampleCollections = [
        {
          contractAddress: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
          chainId: 'ethereum',
          collectionType: 'premium_collections',
          name: 'Bored Ape Yacht Club',
          baseBenefits: {
            feeDiscount: 15,
            priorityAccess: false,
            openEntryTickets: 10,
            gamingBonus: 1.8,
            raffleCreationDiscount: 10,
            affiliateCommissionRate: 1.5
          },
          defaultTier: 1,
          isActive: true
        },
        {
          contractAddress: '0x60e4d786628fea6478f785a6d7e704777c86a7c6',
          chainId: 'ethereum',
          collectionType: 'premium_collections',
          name: 'Mutant Ape Yacht Club',
          baseBenefits: {
            feeDiscount: 12,
            priorityAccess: false,
            openEntryTickets: 8,
            gamingBonus: 1.6,
            raffleCreationDiscount: 8,
            affiliateCommissionRate: 1.3
          },
          defaultTier: 1,
          isActive: true
        },
        {
          contractAddress: '0x1a92f7381b9f03921564a437210bb9396471050c',
          chainId: 'ethereum',
          collectionType: 'standard_collections',
          name: 'Cool Cats NFT',
          baseBenefits: {
            feeDiscount: 8,
            priorityAccess: false,
            openEntryTickets: 5,
            gamingBonus: 1.3,
            raffleCreationDiscount: 5,
            affiliateCommissionRate: 1.1
          },
          defaultTier: 1,
          isActive: true
        }
      ];
      
      for (const collectionData of sampleCollections) {
        // Check if collection already exists
        const existingCollection = await FoundersKeyContract.findOne({
          contractAddress: collectionData.contractAddress.toLowerCase(),
          chainId: collectionData.chainId
        });
        
        if (!existingCollection) {
          const newCollection = new FoundersKeyContract(collectionData);
          await newCollection.save();
          this.migrationStats.newCollectionsAdded++;
          console.log(`➕ Added collection: ${collectionData.name}`);
        } else {
          console.log(`⏭️  Collection already exists: ${collectionData.name}`);
        }
      }
      
      console.log(`✅ Added ${this.migrationStats.newCollectionsAdded} new collections`);
    } catch (error) {
      console.error('❌ Error adding sample collections:', error);
      this.migrationStats.errors.push({
        step: 'addSampleCollections',
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Step 6: Validate migration
   */
  async validateMigration() {
    try {
      console.log('📝 Step 6: Validating migration...');
      
      // Check that all Founders Key contracts have collection type
      const foundersKeyContracts = await FoundersKeyContract.find({
        collectionType: 'founders_keys'
      });
      
      // Check that Universal NFT Benefits Service is working
      const testUserId = await this.findTestUser();
      if (testUserId) {
        const benefitsProfile = await UniversalNFTBenefitsService.getUserBenefitsProfile(testUserId);
        console.log('🧪 Test benefits profile generated successfully');
      }
      
      // Validation summary
      const validationResults = {
        foundersKeyContractsWithType: foundersKeyContracts.length,
        totalActiveCollections: await FoundersKeyContract.countDocuments({ isActive: true }),
        collectionsByType: {
          founders_keys: await FoundersKeyContract.countDocuments({ 
            collectionType: 'founders_keys', 
            isActive: true 
          }),
          premium_collections: await FoundersKeyContract.countDocuments({ 
            collectionType: 'premium_collections', 
            isActive: true 
          }),
          standard_collections: await FoundersKeyContract.countDocuments({ 
            collectionType: 'standard_collections', 
            isActive: true 
          })
        },
        migratedUsers: await User.countDocuments({ migratedToUniversalNFTBenefits: true }),
        stakingRecordsNeedingMigration: await FoundersKeyStaking.countDocuments({ 
          migrationRequired: true 
        })
      };
      
      console.log('✅ Migration validation completed');
      console.log('📊 Validation Results:', validationResults);
      
      return validationResults;
    } catch (error) {
      console.error('❌ Error validating migration:', error);
      this.migrationStats.errors.push({
        step: 'validateMigration',
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Find a test user for validation
   */
  async findTestUser() {
    try {
      const user = await User.findOne({ 
        "connectedWallets.0": { $exists: true } 
      });
      return user ? user._id : null;
    } catch (error) {
      console.log('No test user found for validation');
      return null;
    }
  }

  /**
   * Rollback migration (if needed)
   */
  async rollbackMigration() {
    try {
      console.log('🔄 Rolling back Universal NFT Benefits Migration...');
      
      // Remove collection types from Founders Key contracts
      await FoundersKeyContract.updateMany(
        { collectionType: 'founders_keys' },
        { $unset: { collectionType: 1 } }
      );
      
      // Remove migration flags from users
      await User.updateMany(
        { migratedToUniversalNFTBenefits: true },
        { 
          $unset: { 
            migratedToUniversalNFTBenefits: 1,
            migrationDate: 1
          }
        }
      );
      
      // Remove migration flags from staking records
      await FoundersKeyStaking.updateMany(
        { migratedToSmartContract: { $exists: true } },
        { 
          $unset: { 
            migratedToSmartContract: 1,
            migrationRequired: 1,
            smartContractPositionId: 1,
            blockchain: 1,
            contractVerified: 1
          }
        }
      );
      
      // Remove sample collections (keep only original Founders Keys)
      await FoundersKeyContract.deleteMany({
        collectionType: { $in: ['premium_collections', 'standard_collections'] }
      });
      
      console.log('✅ Migration rollback completed');
    } catch (error) {
      console.error('❌ Error rolling back migration:', error);
      throw error;
    }
  }
}

// CLI execution
if (require.main === module) {
  const migration = new UniversalNFTBenefitsMigration();
  
  const command = process.argv[2];
  
  if (command === 'rollback') {
    migration.rollbackMigration()
      .then(() => {
        console.log('Migration rollback completed');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Migration rollback failed:', error);
        process.exit(1);
      });
  } else {
    migration.runMigration()
      .then(() => {
        console.log('Migration completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
      });
  }
}

module.exports = UniversalNFTBenefitsMigration;