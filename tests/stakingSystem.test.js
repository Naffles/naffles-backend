const mongoose = require('mongoose');
const StakingContract = require('../models/staking/stakingContract');
const StakingPosition = require('../models/staking/stakingPosition');
const stakingService = require('../services/stakingService');
const stakingBlockchainService = require('../services/stakingBlockchainService');
const User = require('../models/user/user');

describe('NFT Staking System', () => {
  let testUser;
  let testAdmin;
  let testContract;

  beforeAll(async () => {
    // Create test users
    testUser = new User({
      email: 'testuser@example.com',
      walletAddresses: ['0x1234567890123456789012345678901234567890'],
      isEmailVerified: true
    });
    await testUser.save();

    testAdmin = new User({
      email: 'admin@example.com',
      walletAddresses: ['0x0987654321098765432109876543210987654321'],
      isEmailVerified: true,
      isAdmin: true
    });
    await testAdmin.save();
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ email: { $in: ['testuser@example.com', 'admin@example.com'] } });
    await StakingContract.deleteMany({});
    await StakingPosition.deleteMany({});
  });

  describe('StakingContract Model', () => {
    test('should create a staking contract with default reward structure', async () => {
      const contractData = {
        contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        blockchain: 'ethereum',
        contractName: 'Test NFT Collection',
        description: 'Test collection for staking',
        createdBy: testAdmin._id
      };

      const contract = new StakingContract(contractData);
      await contract.save();

      expect(contract.contractAddress).toBe(contractData.contractAddress.toLowerCase());
      expect(contract.blockchain).toBe('ethereum');
      expect(contract.rewardStructures.sixMonths.openEntryTicketsPerMonth).toBe(5);
      expect(contract.rewardStructures.twelveMonths.openEntryTicketsPerMonth).toBe(12);
      expect(contract.rewardStructures.threeYears.openEntryTicketsPerMonth).toBe(30);

      testContract = contract;
    });

    test('should validate contract address format', () => {
      expect(StakingContract.validateContractAddress('0x1234567890123456789012345678901234567890', 'ethereum')).toBe(true);
      expect(StakingContract.validateContractAddress('invalid', 'ethereum')).toBe(false);
      expect(StakingContract.validateContractAddress('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', 'solana')).toBe(true);
    });

    test('should get reward structure for specific duration', () => {
      const sixMonthRewards = testContract.getRewardStructure(6);
      expect(sixMonthRewards.openEntryTicketsPerMonth).toBe(5);
      expect(sixMonthRewards.bonusMultiplier).toBe(1.1);

      const twelveMonthRewards = testContract.getRewardStructure(12);
      expect(twelveMonthRewards.openEntryTicketsPerMonth).toBe(12);

      expect(() => testContract.getRewardStructure(24)).toThrow('Invalid staking duration: 24 months');
    });

    test('should calculate monthly rewards', () => {
      expect(testContract.calculateMonthlyRewards(6, 1)).toBe(5);
      expect(testContract.calculateMonthlyRewards(12, 2)).toBe(24);
      expect(testContract.calculateMonthlyRewards(36, 3)).toBe(90);
    });
  });

  describe('StakingPosition Model', () => {
    let testPosition;

    test('should create a staking position', async () => {
      const positionData = {
        userId: testUser._id,
        stakingContractId: testContract._id,
        nftTokenId: '123',
        nftContractAddress: testContract.contractAddress,
        blockchain: 'ethereum',
        stakingDuration: 12,
        nftMetadata: {
          name: 'Test NFT #123',
          description: 'A test NFT',
          image: 'https://example.com/nft.png'
        }
      };

      testPosition = new StakingPosition(positionData);
      await testPosition.save();

      expect(testPosition.userId.toString()).toBe(testUser._id.toString());
      expect(testPosition.stakingDuration).toBe(12);
      expect(testPosition.status).toBe('active');
      expect(testPosition.unstakeAt).toBeDefined();
    });

    test('should calculate staking progress', () => {
      const progress = testPosition.stakingProgress;
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(100);
    });

    test('should calculate remaining time', () => {
      const remaining = testPosition.remainingTime;
      expect(remaining).toBeGreaterThan(0);
      
      const remainingDays = testPosition.remainingDays;
      expect(remainingDays).toBeGreaterThan(0);
    });

    test('should check eligibility for rewards', () => {
      expect(testPosition.isEligibleForRewards()).toBe(true);
    });

    test('should calculate next reward date', () => {
      const nextReward = testPosition.getNextRewardDate();
      expect(nextReward).toBeInstanceOf(Date);
      expect(nextReward.getTime()).toBeGreaterThan(Date.now());
    });

    test('should add reward distribution record', () => {
      const initialRewards = testPosition.totalRewardsEarned;
      testPosition.addRewardDistribution(12, 1.25);
      
      expect(testPosition.totalRewardsEarned).toBe(initialRewards + 12);
      expect(testPosition.rewardHistory).toHaveLength(1);
      expect(testPosition.rewardHistory[0].openEntryTickets).toBe(12);
      expect(testPosition.rewardHistory[0].bonusMultiplier).toBe(1.25);
    });

    test('should unstake position', () => {
      const txHash = '0xabcdef1234567890';
      const blockNumber = 12345;
      
      testPosition.unstake(txHash, blockNumber);
      
      expect(testPosition.status).toBe('unstaked');
      expect(testPosition.actualUnstakedAt).toBeDefined();
      expect(testPosition.unstakingTransaction.txHash).toBe(txHash);
      expect(testPosition.unstakingTransaction.blockNumber).toBe(blockNumber);
    });
  });

  describe('StakingService', () => {
    let serviceTestContract;

    beforeEach(async () => {
      // Create a fresh contract for service tests
      serviceTestContract = await stakingService.createStakingContract({
        contractAddress: '0x1111111111111111111111111111111111111111',
        blockchain: 'ethereum',
        contractName: 'Service Test Collection',
        description: 'Test collection for service testing'
      }, testAdmin._id);
    });

    test('should create staking contract', async () => {
      expect(serviceTestContract).toBeDefined();
      expect(serviceTestContract.contractName).toBe('Service Test Collection');
      expect(serviceTestContract.createdBy.toString()).toBe(testAdmin._id.toString());
    });

    test('should not create duplicate contract', async () => {
      await expect(stakingService.createStakingContract({
        contractAddress: '0x1111111111111111111111111111111111111111',
        blockchain: 'ethereum',
        contractName: 'Duplicate Contract'
      }, testAdmin._id)).rejects.toThrow('Contract already exists in the system');
    });

    test('should validate staking contract', async () => {
      const validatedContract = await stakingService.validateStakingContract(
        serviceTestContract._id,
        testAdmin._id,
        'Contract validated for testing'
      );

      expect(validatedContract.contractValidation.isValidated).toBe(true);
      expect(validatedContract.contractValidation.validatedBy.toString()).toBe(testAdmin._id.toString());
    });

    test('should get staking contracts with filters', async () => {
      const contracts = await stakingService.getStakingContracts({
        blockchain: 'ethereum',
        isActive: true
      });

      expect(contracts).toBeInstanceOf(Array);
      expect(contracts.length).toBeGreaterThan(0);
      expect(contracts.every(c => c.blockchain === 'ethereum')).toBe(true);
    });

    test('should get staking analytics', async () => {
      const analytics = await stakingService.getStakingAnalytics(30);

      expect(analytics).toHaveProperty('contracts');
      expect(analytics).toHaveProperty('positions');
      expect(analytics).toHaveProperty('rewards');
      expect(analytics.contracts).toHaveProperty('total');
      expect(analytics.contracts).toHaveProperty('active');
    });

    test('should get contract performance metrics', async () => {
      const metrics = await stakingService.getContractPerformanceMetrics(serviceTestContract._id);

      expect(metrics).toHaveProperty('totalStaked');
      expect(metrics).toHaveProperty('activeStaked');
      expect(metrics).toHaveProperty('totalRewardsDistributed');
      expect(metrics).toHaveProperty('durationBreakdown');
      expect(metrics.durationBreakdown).toHaveProperty('sixMonths');
      expect(metrics.durationBreakdown).toHaveProperty('twelveMonths');
      expect(metrics.durationBreakdown).toHaveProperty('threeYears');
    });
  });

  describe('Reward Distribution', () => {
    let rewardTestContract;
    let rewardTestPosition;

    beforeEach(async () => {
      // Create contract and position for reward testing
      rewardTestContract = await stakingService.createStakingContract({
        contractAddress: '0x2222222222222222222222222222222222222222',
        blockchain: 'ethereum',
        contractName: 'Reward Test Collection'
      }, testAdmin._id);

      await stakingService.validateStakingContract(
        rewardTestContract._id,
        testAdmin._id,
        'Validated for reward testing'
      );

      // Create a position that's eligible for rewards
      rewardTestPosition = new StakingPosition({
        userId: testUser._id,
        stakingContractId: rewardTestContract._id,
        nftTokenId: '456',
        nftContractAddress: rewardTestContract.contractAddress,
        blockchain: 'ethereum',
        stakingDuration: 12,
        stakedAt: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000) // 32 days ago
      });
      await rewardTestPosition.save();
    });

    test('should calculate pending rewards', async () => {
      const pendingRewards = await stakingService.calculateUserPendingRewards(testUser._id);

      expect(pendingRewards).toHaveProperty('totalPendingRewards');
      expect(pendingRewards).toHaveProperty('positionRewards');
      expect(pendingRewards.positionRewards).toBeInstanceOf(Array);
    });

    test('should distribute monthly rewards', async () => {
      const results = await stakingService.distributeMonthlyRewards();

      expect(results).toHaveProperty('totalProcessed');
      expect(results).toHaveProperty('successful');
      expect(results).toHaveProperty('failed');
      expect(results).toHaveProperty('results');
      expect(results.results).toBeInstanceOf(Array);
    });
  });

  describe('User Portfolio', () => {
    test('should get user staking portfolio', async () => {
      const portfolio = await stakingService.getUserStakingPortfolio(testUser._id);

      expect(portfolio).toHaveProperty('positions');
      expect(portfolio).toHaveProperty('summary');
      expect(portfolio.positions).toBeInstanceOf(Array);
      expect(portfolio.summary).toHaveProperty('totalPositions');
      expect(portfolio.summary).toHaveProperty('activePositions');
      expect(portfolio.summary).toHaveProperty('totalRewardsEarned');
    });
  });

  describe('Blockchain Integration', () => {
    test('should get supported blockchains', async () => {
      const supportedChains = await stakingService.getSupportedBlockchains();
      
      expect(supportedChains).toBeInstanceOf(Array);
      expect(supportedChains.length).toBeGreaterThan(0);
    });

    test('should get blockchain status', async () => {
      const status = await stakingService.getBlockchainStatus();
      
      expect(status).toBeInstanceOf(Object);
      // Status may vary based on environment configuration
    });

    test('should verify NFT ownership', async () => {
      // Mock NFT ownership verification
      const mockNFTData = {
        contractAddress: '0x1234567890123456789012345678901234567890',
        tokenId: '123',
        blockchain: 'ethereum'
      };

      const ownsNFT = await stakingService.verifyNFTOwnership(testUser._id, mockNFTData);
      
      // This will return false in test environment since we don't have real NFTs
      expect(typeof ownsNFT).toBe('boolean');
    });

    test('should batch verify NFT ownership', async () => {
      const nftList = [
        {
          contractAddress: '0x1234567890123456789012345678901234567890',
          tokenId: '123',
          blockchain: 'ethereum'
        },
        {
          contractAddress: '0x0987654321098765432109876543210987654321',
          tokenId: '456',
          blockchain: 'polygon'
        }
      ];

      const results = await stakingService.batchVerifyNFTOwnership(testUser._id, nftList);
      
      expect(results).toBeInstanceOf(Array);
      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('isOwned');
      expect(results[0]).toHaveProperty('verifiedAt');
    });

    test('should handle blockchain service errors gracefully', async () => {
      // Test with invalid user ID
      const fakeUserId = new mongoose.Types.ObjectId();
      
      await expect(stakingService.batchVerifyNFTOwnership(fakeUserId, [])).rejects.toThrow();
    });
  });

  describe('Staking Mechanics with Blockchain Integration', () => {
    let blockchainTestContract;

    beforeEach(async () => {
      blockchainTestContract = await stakingService.createStakingContract({
        contractAddress: '0x3333333333333333333333333333333333333333',
        blockchain: 'ethereum',
        contractName: 'Blockchain Integration Test Collection',
        description: 'Test collection for blockchain integration'
      }, testAdmin._id);

      await stakingService.validateStakingContract(
        blockchainTestContract._id,
        testAdmin._id,
        'Validated for blockchain integration testing'
      );
    });

    test('should create staking position with blockchain integration', async () => {
      const nftData = {
        contractAddress: blockchainTestContract.contractAddress,
        tokenId: '789',
        blockchain: 'ethereum',
        metadata: {
          name: 'Blockchain Test NFT #789',
          description: 'Test NFT for blockchain integration',
          image: 'https://example.com/blockchain-nft.png'
        }
      };

      // This will fail in test environment due to NFT ownership verification
      // but we can test the error handling
      await expect(stakingService.stakeNFT(
        testUser._id,
        blockchainTestContract._id,
        nftData,
        12
      )).rejects.toThrow();
    });

    test('should handle blockchain locking failures', async () => {
      // Test blockchain service methods directly
      const lockResult = await stakingBlockchainService.lockNFT(
        testUser.walletAddresses[0],
        '0x1234567890123456789012345678901234567890',
        '123',
        'ethereum',
        '12m'
      );

      // In test environment, this should fail due to ownership verification
      expect(lockResult).toHaveProperty('success');
      expect(lockResult.success).toBe(false);
      expect(lockResult).toHaveProperty('error');
    });

    test('should generate proper locking and unlocking hashes', () => {
      const walletAddress = testUser.walletAddresses[0];
      const contractAddress = '0x1234567890123456789012345678901234567890';
      const tokenId = '123';
      const blockchain = 'ethereum';

      const lockingHash = stakingBlockchainService.generateLockingHash(
        walletAddress,
        contractAddress,
        tokenId,
        blockchain
      );

      const unlockingHash = stakingBlockchainService.generateUnlockingHash(
        walletAddress,
        contractAddress,
        tokenId,
        blockchain
      );

      expect(typeof lockingHash).toBe('string');
      expect(lockingHash).toHaveLength(64); // SHA256 hex string
      expect(typeof unlockingHash).toBe('string');
      expect(unlockingHash).toHaveLength(64);
      expect(lockingHash).not.toBe(unlockingHash);
    });

    test('should calculate unlock dates correctly', () => {
      const sixMonthUnlock = stakingBlockchainService.calculateUnlockDate('6m');
      const twelveMonthUnlock = stakingBlockchainService.calculateUnlockDate('12m');
      const threeYearUnlock = stakingBlockchainService.calculateUnlockDate('3yr');

      const now = new Date();
      
      expect(sixMonthUnlock.getTime()).toBeGreaterThan(now.getTime());
      expect(twelveMonthUnlock.getTime()).toBeGreaterThan(sixMonthUnlock.getTime());
      expect(threeYearUnlock.getTime()).toBeGreaterThan(twelveMonthUnlock.getTime());
    });

    test('should handle invalid staking durations', () => {
      expect(() => stakingBlockchainService.calculateUnlockDate('invalid')).toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid contract address', async () => {
      await expect(stakingService.createStakingContract({
        contractAddress: 'invalid-address',
        blockchain: 'ethereum',
        contractName: 'Invalid Contract'
      }, testAdmin._id)).rejects.toThrow('Invalid contract address format');
    });

    test('should handle invalid staking duration', async () => {
      const position = new StakingPosition({
        userId: testUser._id,
        stakingContractId: testContract._id,
        nftTokenId: '999',
        nftContractAddress: testContract.contractAddress,
        blockchain: 'ethereum',
        stakingDuration: 24 // Invalid duration
      });

      await expect(position.save()).rejects.toThrow();
    });

    test('should handle non-existent contract', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      await expect(stakingService.updateStakingContract(
        fakeId,
        { contractName: 'Updated Name' },
        testAdmin._id
      )).rejects.toThrow('Staking contract not found');
    });

    test('should handle blockchain service unavailability', async () => {
      // Test error handling when blockchain services are unavailable
      const result = await stakingBlockchainService.verifyNFTOwnership(
        'invalid-address',
        '0x1234567890123456789012345678901234567890',
        '123',
        'unsupported-blockchain'
      );

      expect(result).toBe(false);
    });
  });
});