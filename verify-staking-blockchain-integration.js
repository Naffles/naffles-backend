#!/usr/bin/env node

/**
 * Verification script for NFT Staking System Blockchain Integration
 * 
 * This script verifies that the blockchain integration for the NFT staking system
 * is properly implemented and functional.
 */

const mongoose = require('mongoose');
const stakingService = require('./services/stakingService');
const stakingBlockchainService = require('./services/stakingBlockchainService');
const StakingContract = require('./models/staking/stakingContract');
const StakingPosition = require('./models/staking/stakingPosition');
const User = require('./models/user/user');

// Test configuration
const TEST_CONFIG = {
  testWalletAddress: '0x1234567890123456789012345678901234567890',
  testContractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  testTokenId: '123',
  testBlockchain: 'ethereum'
};

class StakingBlockchainVerification {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  async runVerification() {
    console.log('🔍 Starting NFT Staking Blockchain Integration Verification...\n');

    try {
      // Connect to database
      await this.connectDatabase();

      // Run verification tests
      await this.verifyBlockchainService();
      await this.verifyStakingService();
      await this.verifyModels();
      await this.verifyIntegration();

      // Display results
      this.displayResults();

    } catch (error) {
      console.error('❌ Verification failed with error:', error.message);
      process.exit(1);
    } finally {
      await mongoose.disconnect();
    }
  }

  async connectDatabase() {
    try {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles-test';
      await mongoose.connect(mongoUri);
      console.log('✅ Database connected successfully');
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  async verifyBlockchainService() {
    console.log('📋 Verifying Blockchain Service...');

    await this.test('Blockchain service initialization', async () => {
      expect(stakingBlockchainService).toBeDefined();
      expect(typeof stakingBlockchainService.verifyNFTOwnership).toBe('function');
      expect(typeof stakingBlockchainService.lockNFT).toBe('function');
      expect(typeof stakingBlockchainService.unlockNFT).toBe('function');
    });

    await this.test('Get supported blockchains', async () => {
      const chains = await stakingBlockchainService.getSupportedChains();
      expect(Array.isArray(chains)).toBe(true);
    });

    await this.test('Get blockchain status', async () => {
      const status = await stakingBlockchainService.getChainStatus();
      expect(typeof status).toBe('object');
    });

    await this.test('NFT ownership verification (mock)', async () => {
      const result = await stakingBlockchainService.verifyNFTOwnership(
        TEST_CONFIG.testWalletAddress,
        TEST_CONFIG.testContractAddress,
        TEST_CONFIG.testTokenId,
        TEST_CONFIG.testBlockchain
      );
      expect(typeof result).toBe('boolean');
    });

    await this.test('NFT locking mechanism', async () => {
      const lockResult = await stakingBlockchainService.lockNFT(
        TEST_CONFIG.testWalletAddress,
        TEST_CONFIG.testContractAddress,
        TEST_CONFIG.testTokenId,
        TEST_CONFIG.testBlockchain,
        '12m'
      );
      expect(lockResult).toHaveProperty('success');
      expect(typeof lockResult.success).toBe('boolean');
    });

    await this.test('Hash generation utilities', () => {
      const lockingHash = stakingBlockchainService.generateLockingHash(
        TEST_CONFIG.testWalletAddress,
        TEST_CONFIG.testContractAddress,
        TEST_CONFIG.testTokenId,
        TEST_CONFIG.testBlockchain
      );
      expect(typeof lockingHash).toBe('string');
      expect(lockingHash.length).toBe(64);
    });

    await this.test('Unlock date calculation', () => {
      const sixMonthDate = stakingBlockchainService.calculateUnlockDate('6m');
      const twelveMonthDate = stakingBlockchainService.calculateUnlockDate('12m');
      const threeYearDate = stakingBlockchainService.calculateUnlockDate('3yr');
      
      expect(sixMonthDate instanceof Date).toBe(true);
      expect(twelveMonthDate instanceof Date).toBe(true);
      expect(threeYearDate instanceof Date).toBe(true);
      expect(twelveMonthDate.getTime()).toBeGreaterThan(sixMonthDate.getTime());
    });

    console.log('✅ Blockchain Service verification completed\n');
  }

  async verifyStakingService() {
    console.log('📋 Verifying Staking Service Integration...');

    await this.test('Staking service blockchain methods', async () => {
      expect(typeof stakingService.getBlockchainStatus).toBe('function');
      expect(typeof stakingService.getSupportedBlockchains).toBe('function');
      expect(typeof stakingService.batchVerifyNFTOwnership).toBe('function');
    });

    await this.test('Get supported blockchains via service', async () => {
      const chains = await stakingService.getSupportedBlockchains();
      expect(Array.isArray(chains)).toBe(true);
    });

    await this.test('Get blockchain status via service', async () => {
      const status = await stakingService.getBlockchainStatus();
      expect(typeof status).toBe('object');
    });

    console.log('✅ Staking Service integration verification completed\n');
  }

  async verifyModels() {
    console.log('📋 Verifying Model Updates...');

    await this.test('StakingPosition model has blockchain fields', () => {
      const schema = StakingPosition.schema;
      expect(schema.paths.walletAddress).toBeDefined();
      expect(schema.paths.lockingHash).toBeDefined();
      expect(schema.paths.unlockingHash).toBeDefined();
      expect(schema.paths.lockingTransactionHash).toBeDefined();
      expect(schema.paths.unlockingTransactionHash).toBeDefined();
    });

    await this.test('StakingPosition model methods', () => {
      const position = new StakingPosition({
        userId: new mongoose.Types.ObjectId(),
        stakingContractId: new mongoose.Types.ObjectId(),
        nftTokenId: '123',
        nftContractAddress: '0x1234567890123456789012345678901234567890',
        blockchain: 'ethereum',
        stakingDuration: 12,
        walletAddress: '0x1234567890123456789012345678901234567890',
        lockingHash: 'test-hash'
      });

      expect(typeof position.canUnstake).toBe('function');
      expect(typeof position.isEligibleForRewards).toBe('function');
    });

    console.log('✅ Model verification completed\n');
  }

  async verifyIntegration() {
    console.log('📋 Verifying End-to-End Integration...');

    // Create test user
    const testUser = new User({
      email: 'blockchain-test@example.com',
      walletAddresses: [TEST_CONFIG.testWalletAddress],
      isEmailVerified: true
    });

    try {
      await testUser.save();

      await this.test('Batch NFT ownership verification', async () => {
        const nftList = [
          {
            contractAddress: TEST_CONFIG.testContractAddress,
            tokenId: TEST_CONFIG.testTokenId,
            blockchain: TEST_CONFIG.testBlockchain
          }
        ];

        const results = await stakingService.batchVerifyNFTOwnership(testUser._id, nftList);
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(1);
        expect(results[0]).toHaveProperty('isOwned');
        expect(results[0]).toHaveProperty('verifiedAt');
      });

      await this.test('Error handling for invalid user', async () => {
        const fakeUserId = new mongoose.Types.ObjectId();
        
        try {
          await stakingService.batchVerifyNFTOwnership(fakeUserId, []);
          throw new Error('Should have thrown an error');
        } catch (error) {
          expect(error.message).toContain('User has no wallet addresses');
        }
      });

    } finally {
      // Clean up test data
      await User.deleteOne({ email: 'blockchain-test@example.com' });
    }

    console.log('✅ Integration verification completed\n');
  }

  async test(description, testFn) {
    try {
      await testFn();
      console.log(`  ✅ ${description}`);
      this.results.passed++;
    } catch (error) {
      console.log(`  ❌ ${description}: ${error.message}`);
      this.results.failed++;
      this.results.errors.push({ description, error: error.message });
    }
  }

  displayResults() {
    console.log('📊 Verification Results:');
    console.log(`  ✅ Passed: ${this.results.passed}`);
    console.log(`  ❌ Failed: ${this.results.failed}`);
    console.log(`  📈 Success Rate: ${((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1)}%`);

    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.errors.forEach(({ description, error }) => {
        console.log(`  - ${description}: ${error}`);
      });
      process.exit(1);
    } else {
      console.log('\n🎉 All blockchain integration tests passed!');
      console.log('\n✅ NFT Staking System Blockchain Integration is properly implemented');
    }
  }
}

// Helper function for assertions
function expect(actual) {
  return {
    toBe: (expected) => {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, but got ${actual}`);
      }
    },
    toBeDefined: () => {
      if (actual === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
    toHaveProperty: (property) => {
      if (!(property in actual)) {
        throw new Error(`Expected object to have property ${property}`);
      }
    },
    toBeGreaterThan: (expected) => {
      if (actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    }
  };
}

// Run verification if called directly
if (require.main === module) {
  const verification = new StakingBlockchainVerification();
  verification.runVerification().catch(console.error);
}

module.exports = StakingBlockchainVerification;