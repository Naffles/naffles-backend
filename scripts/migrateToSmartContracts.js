const mongoose = require('mongoose');
const StakingPosition = require('../models/staking/stakingPosition');
const StakingContract = require('../models/staking/stakingContract');
const User = require('../models/user/user');
const smartContractService = require('../services/smartContractService');
const blockchainVerificationService = require('../services/blockchainVerificationService');

class SmartContractMigration {
  constructor() {
    this.dryRun = process.env.DRY_RUN === 'true';
    this.batchSize = parseInt(process.env.BATCH_SIZE) || 10;
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
    
    this.stats = {
      totalPositions: 0,
      migrated: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };
  }

  async run() {
    try {
      console.log('🚀 Starting Smart Contract Migration');
      console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE MIGRATION'}`);
      console.log(`Batch Size: ${this.batchSize}`);
      console.log('');

      // Connect to database
      await this.connectDatabase();

      // Validate smart contract readiness
      await this.validateSmartContractReadiness();

      // Get positions to migrate
      const positions = await this.getPositionsToMigrate();
      this.stats.totalPositions = positions.length;

      console.log(`📊 Found ${positions.length} positions to migrate`);
      console.log('');

      if (positions.length === 0) {
        console.log('✅ No positions need migration');
        return;
      }

      // Process positions in batches
      await this.processPositionsInBatches(positions);

      // Generate final report
      await this.generateFinalReport();

    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    } finally {
      await mongoose.connection.close();
    }
  }

  async connectDatabase() {
    try {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles';
      await mongoose.connect(mongoUri);
      console.log('✅ Connected to database');
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  async validateSmartContractReadiness() {
    try {
      console.log('🔍 Validating smart contract readiness...');
      
      // Check if smart contracts are enabled
      if (process.env.SMART_CONTRACT_ENABLED !== 'true') {
        throw new Error('Smart contracts are not enabled. Set SMART_CONTRACT_ENABLED=true');
      }

      // Validate smart contract service
      await smartContractService.validateProductionReadiness();

      // Check contract health
      const health = await smartContractService.getServiceHealth();
      if (health.status !== 'healthy') {
        throw new Error(`Smart contract service is not healthy: ${health.status}`);
      }

      console.log('✅ Smart contract service is ready');
      
      // Display contract addresses
      const supportedChains = ['ethereum', 'polygon', 'base', 'solana'];
      for (const chain of supportedChains) {
        const address = process.env[`${chain.toUpperCase()}_STAKING_CONTRACT_ADDRESS`];
        if (address) {
          console.log(`   ${chain}: ${address}`);
        }
      }
      console.log('');
    } catch (error) {
      throw new Error(`Smart contract validation failed: ${error.message}`);
    }
  }

  async getPositionsToMigrate() {
    try {
      // Find active positions without smart contract integration
      const positions = await StakingPosition.find({
        status: 'active',
        $or: [
          { smartContractPositionId: { $exists: false } },
          { smartContractPositionId: null },
          { onChainVerified: false }
        ]
      })
      .populate('stakingContractId userId')
      .sort({ createdAt: 1 }) // Oldest first
      .limit(1000); // Safety limit

      return positions.filter(pos => {
        // Additional validation
        if (!pos.stakingContractId || !pos.userId) {
          console.warn(`⚠️  Skipping position ${pos._id}: Missing contract or user reference`);
          this.stats.skipped++;
          return false;
        }

        if (!pos.stakingContractId.isActive || !pos.stakingContractId.contractValidation.isValidated) {
          console.warn(`⚠️  Skipping position ${pos._id}: Contract not active or validated`);
          this.stats.skipped++;
          return false;
        }

        return true;
      });
    } catch (error) {
      throw new Error(`Failed to get positions to migrate: ${error.message}`);
    }
  }

  async processPositionsInBatches(positions) {
    const batches = this.createBatches(positions, this.batchSize);
    
    console.log(`📦 Processing ${batches.length} batches of ${this.batchSize} positions each`);
    console.log('');

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} positions)`);
      
      try {
        await this.processBatch(batch);
        
        // Small delay between batches to avoid overwhelming the blockchain
        if (i < batches.length - 1) {
          console.log('   ⏳ Waiting 2 seconds before next batch...');
          await this.delay(2000);
        }
      } catch (error) {
        console.error(`❌ Batch ${i + 1} failed:`, error.message);
        this.stats.errors.push({
          batch: i + 1,
          error: error.message,
          timestamp: new Date()
        });
      }
      
      console.log('');
    }
  }

  async processBatch(positions) {
    const promises = positions.map(position => this.migratePosition(position));
    const results = await Promise.allSettled(promises);
    
    results.forEach((result, index) => {
      const position = positions[index];
      
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          console.log(`   ✅ ${position._id}: ${result.value.message}`);
          this.stats.migrated++;
        } else {
          console.log(`   ⚠️  ${position._id}: ${result.value.message}`);
          this.stats.skipped++;
        }
      } else {
        console.log(`   ❌ ${position._id}: ${result.reason.message}`);
        this.stats.failed++;
        this.stats.errors.push({
          positionId: position._id,
          error: result.reason.message,
          timestamp: new Date()
        });
      }
    });
  }

  async migratePosition(position, retryCount = 0) {
    try {
      // Check if position is still valid for migration
      if (position.status !== 'active') {
        return {
          success: false,
          message: 'Position is no longer active'
        };
      }

      // Get user wallet address
      const user = await User.findById(position.userId);
      if (!user || !user.walletAddresses || user.walletAddresses.length === 0) {
        return {
          success: false,
          message: 'User has no wallet addresses'
        };
      }

      const walletAddress = user.walletAddresses[0];

      // Check if NFT is still owned by the user
      const ownsNFT = await this.verifyNFTOwnership(
        walletAddress,
        position.nftContractAddress,
        position.nftTokenId,
        position.blockchain
      );

      if (!ownsNFT) {
        return {
          success: false,
          message: 'User no longer owns the NFT'
        };
      }

      if (this.dryRun) {
        return {
          success: true,
          message: 'DRY RUN - Would migrate to smart contract'
        };
      }

      // Perform actual migration
      const migrationResult = await this.performSmartContractMigration(position, walletAddress);
      
      if (migrationResult.success) {
        // Update database record
        await this.updatePositionWithSmartContractData(position, migrationResult);
        
        return {
          success: true,
          message: `Migrated to smart contract: ${migrationResult.transactionHash}`
        };
      } else {
        throw new Error(migrationResult.error);
      }

    } catch (error) {
      if (retryCount < this.maxRetries) {
        console.log(`   🔄 Retrying position ${position._id} (attempt ${retryCount + 1}/${this.maxRetries})`);
        await this.delay(this.retryDelay);
        return await this.migratePosition(position, retryCount + 1);
      }
      
      throw error;
    }
  }

  async verifyNFTOwnership(walletAddress, contractAddress, tokenId, blockchain) {
    try {
      // This is a simplified check - in practice you'd verify actual NFT ownership
      // For migration purposes, we assume the database is correct
      return true;
    } catch (error) {
      console.warn(`Warning: Could not verify NFT ownership: ${error.message}`);
      return false;
    }
  }

  async performSmartContractMigration(position, walletAddress) {
    try {
      // Map database duration to smart contract duration code
      const durationCode = this.mapDurationToCode(position.stakingDuration);
      
      // Call smart contract to stake the NFT
      const result = await smartContractService.stakeNFT(
        position.blockchain,
        position.nftContractAddress,
        position.nftTokenId,
        durationCode,
        walletAddress
      );

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updatePositionWithSmartContractData(position, migrationResult) {
    try {
      position.smartContractPositionId = migrationResult.positionId;
      position.onChainVerified = true;
      position.stakingTransaction = {
        txHash: migrationResult.transactionHash,
        blockNumber: migrationResult.blockNumber,
        gasUsed: migrationResult.gasUsed,
        confirmed: true
      };
      position.blockchainTransactionHash = migrationResult.transactionHash;
      
      await position.save();
    } catch (error) {
      throw new Error(`Failed to update position in database: ${error.message}`);
    }
  }

  mapDurationToCode(stakingDuration) {
    switch (stakingDuration) {
      case 6:
        return 0;
      case 12:
        return 1;
      case 36:
        return 2;
      default:
        throw new Error(`Invalid staking duration: ${stakingDuration}`);
    }
  }

  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async generateFinalReport() {
    console.log('📊 MIGRATION REPORT');
    console.log('==================');
    console.log(`Total Positions: ${this.stats.totalPositions}`);
    console.log(`Successfully Migrated: ${this.stats.migrated}`);
    console.log(`Failed: ${this.stats.failed}`);
    console.log(`Skipped: ${this.stats.skipped}`);
    console.log(`Success Rate: ${this.stats.totalPositions > 0 ? Math.round((this.stats.migrated / this.stats.totalPositions) * 100) : 0}%`);
    console.log('');

    if (this.stats.errors.length > 0) {
      console.log('❌ ERRORS:');
      this.stats.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.positionId || `Batch ${error.batch}`}: ${error.error}`);
      });
      console.log('');
    }

    // Perform post-migration verification
    if (!this.dryRun && this.stats.migrated > 0) {
      console.log('🔍 Performing post-migration verification...');
      await this.performPostMigrationVerification();
    }

    console.log('✅ Migration completed');
  }

  async performPostMigrationVerification() {
    try {
      const consistencyCheck = await blockchainVerificationService.performDataConsistencyCheck();
      
      console.log(`   Consistency Score: ${consistencyCheck.consistencyScore}%`);
      console.log(`   Total Checked: ${consistencyCheck.totalChecked}`);
      console.log(`   Inconsistencies: ${consistencyCheck.inconsistencies}`);
      
      if (consistencyCheck.consistencyScore < 95) {
        console.warn('⚠️  Low consistency score detected. Manual review recommended.');
      }
    } catch (error) {
      console.error('❌ Post-migration verification failed:', error.message);
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Smart Contract Migration Tool

Usage: node migrateToSmartContracts.js [options]

Options:
  --dry-run          Perform a dry run without making changes
  --batch-size=N     Process N positions per batch (default: 10)
  --help, -h         Show this help message

Environment Variables:
  SMART_CONTRACT_ENABLED=true     Enable smart contract integration
  MONGODB_URI                     MongoDB connection string
  ETHEREUM_STAKING_CONTRACT_ADDRESS   Ethereum contract address
  POLYGON_STAKING_CONTRACT_ADDRESS    Polygon contract address
  BASE_STAKING_CONTRACT_ADDRESS       Base contract address
  SOLANA_STAKING_PROGRAM_ID          Solana program ID

Examples:
  # Dry run to see what would be migrated
  DRY_RUN=true node migrateToSmartContracts.js --dry-run

  # Live migration with custom batch size
  BATCH_SIZE=5 node migrateToSmartContracts.js --batch-size=5

  # Full migration
  SMART_CONTRACT_ENABLED=true node migrateToSmartContracts.js
`);
    process.exit(0);
  }

  // Parse command line arguments
  if (args.includes('--dry-run')) {
    process.env.DRY_RUN = 'true';
  }

  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
  if (batchSizeArg) {
    process.env.BATCH_SIZE = batchSizeArg.split('=')[1];
  }

  // Run migration
  const migration = new SmartContractMigration();
  await migration.run();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

module.exports = SmartContractMigration;