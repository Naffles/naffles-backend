const request = require('supertest');
const mongoose = require('mongoose');
const StakingContract = require('../models/staking/stakingContract');
const StakingPosition = require('../models/staking/stakingPosition');
const User = require('../models/user/user');
const stakingService = require('../services/stakingService');

describe('User Staking Interface', () => {
  let testUser;
  let userToken;
  let testContract;
  let testPosition;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/naffles-test');
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up
    await User.deleteMany({});
    await StakingContract.deleteMany({});
    await StakingPosition.deleteMany({});

    // Create test user
    testUser = new User({
      email: 'user@test.com',
      username: 'testuser',
      walletAddresses: ['0x1234567890123456789012345678901234567890'],
      isAdmin: false
    });
    await testUser.save();

    // Generate user token (mock implementation)
    userToken = 'mock-user-token';

    // Create test staking contract
    testContract = new StakingContract({
      contractName: 'Test NFT Collection',
      contractAddress: '0x1234567890123456789012345678901234567890',
      blockchain: 'ethereum',
      description: 'Test contract',
      isActive: true,
      contractValidation: { isValidated: true },
      createdBy: testUser._id,
      rewardStructures: {
        sixMonths: {
          openEntryTicketsPerMonth: 5,
          bonusMultiplier: 1.1
        },
        twelveMonths: {
          openEntryTicketsPerMonth: 12,
          bonusMultiplier: 1.25
        },
        threeYears: {
          openEntryTicketsPerMonth: 30,
          bonusMultiplier: 1.5
        }
      }
    });
    await testContract.save();

    // Create test staking position
    testPosition = new StakingPosition({
      userId: testUser._id,
      stakingContractId: testContract._id,
      nftTokenId: '123',
      nftContractAddress: testContract.contractAddress,
      blockchain: testContract.blockchain,
      nftMetadata: {
        name: 'Test NFT',
        description: 'Test NFT for staking',
        image: 'https://example.com/nft.png'
      },
      stakingDuration: 12,
      stakedAt: new Date(),
      walletAddress: testUser.walletAddresses[0],
      lockingHash: 'test-locking-hash'
    });
    await testPosition.save();
  });

  afterEach(async () => {
    await User.deleteMany({});
    await StakingContract.deleteMany({});
    await StakingPosition.deleteMany({});
  });

  describe('User Portfolio', () => {
    it('should get user staking portfolio', async () => {
      const portfolio = await stakingService.getUserStakingPortfolio(testUser._id);

      expect(portfolio).toBeDefined();
      expect(portfolio.positions).toHaveLength(1);
      expect(portfolio.summary.totalPositions).toBe(1);
      expect(portfolio.summary.activePositions).toBe(1);
      expect(portfolio.positions[0].nftTokenId).toBe('123');
    });

    it('should calculate portfolio summary correctly', async () => {
      // Add another position
      const secondPosition = new StakingPosition({
        userId: testUser._id,
        stakingContractId: testContract._id,
        nftTokenId: '456',
        nftContractAddress: testContract.contractAddress,
        blockchain: testContract.blockchain,
        nftMetadata: {
          name: 'Test NFT 2',
          image: 'https://example.com/nft2.png'
        },
        stakingDuration: 6,
        stakedAt: new Date(),
        walletAddress: testUser.walletAddresses[0],
        lockingHash: 'test-locking-hash-2',
        totalRewardsEarned: 10
      });
      await secondPosition.save();

      const portfolio = await stakingService.getUserStakingPortfolio(testUser._id);

      expect(portfolio.summary.totalPositions).toBe(2);
      expect(portfolio.summary.activePositions).toBe(2);
      expect(portfolio.summary.totalRewardsEarned).toBe(10);
      expect(portfolio.summary.averageStakingDuration).toBe(9); // (12 + 6) / 2
    });
  });

  describe('Eligible NFTs', () => {
    it('should get eligible NFTs for staking', async () => {
      // Mock the gaming NFT service
      const mockNFTs = [
        {
          tokenId: '789',
          contractAddress: testContract.contractAddress,
          blockchain: 'ethereum',
          name: 'Available NFT',
          image: 'https://example.com/available.png'
        }
      ];

      // Mock the gamingNFTService.getUserNFTs method
      const originalGetUserNFTs = require('../services/gamingNFTService').getUserNFTs;
      require('../services/gamingNFTService').getUserNFTs = jest.fn().mockResolvedValue(mockNFTs);

      const eligibleNFTs = await stakingService.getUserEligibleNFTs(testUser._id);

      expect(eligibleNFTs).toHaveLength(1);
      expect(eligibleNFTs[0].tokenId).toBe('789');
      expect(eligibleNFTs[0].name).toBe('Available NFT');

      // Restore original method
      require('../services/gamingNFTService').getUserNFTs = originalGetUserNFTs;
    });

    it('should exclude already staked NFTs', async () => {
      const mockNFTs = [
        {
          tokenId: '123', // Already staked
          contractAddress: testContract.contractAddress,
          blockchain: 'ethereum',
          name: 'Staked NFT',
          image: 'https://example.com/staked.png'
        },
        {
          tokenId: '789',
          contractAddress: testContract.contractAddress,
          blockchain: 'ethereum',
          name: 'Available NFT',
          image: 'https://example.com/available.png'
        }
      ];

      // Mock the gamingNFTService.getUserNFTs method
      require('../services/gamingNFTService').getUserNFTs = jest.fn().mockResolvedValue(mockNFTs);

      const eligibleNFTs = await stakingService.getUserEligibleNFTs(testUser._id);

      expect(eligibleNFTs).toHaveLength(1);
      expect(eligibleNFTs[0].tokenId).toBe('789'); // Only the non-staked NFT
    });
  });

  describe('Staking History', () => {
    it('should get user staking history with pagination', async () => {
      const history = await stakingService.getUserStakingHistory(testUser._id, {
        page: 1,
        limit: 10
      });

      expect(history).toBeDefined();
      expect(history.positions).toHaveLength(1);
      expect(history.pagination.total).toBe(1);
      expect(history.pagination.pages).toBe(1);
    });

    it('should filter history by status', async () => {
      // Update position to unstaked
      await StakingPosition.findByIdAndUpdate(testPosition._id, { status: 'unstaked' });

      const activeHistory = await stakingService.getUserStakingHistory(testUser._id, {
        status: 'active'
      });

      const unstakedHistory = await stakingService.getUserStakingHistory(testUser._id, {
        status: 'unstaked'
      });

      expect(activeHistory.positions).toHaveLength(0);
      expect(unstakedHistory.positions).toHaveLength(1);
    });
  });

  describe('Position Details', () => {
    it('should get detailed position information', async () => {
      const details = await stakingService.getStakingPositionDetails(testUser._id, testPosition._id);

      expect(details).toBeDefined();
      expect(details._id.toString()).toBe(testPosition._id.toString());
      expect(details.nftTokenId).toBe('123');
      expect(details.stakingContractId).toBeDefined();
      expect(details.pendingRewards).toBeDefined();
    });

    it('should return null for non-existent position', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const details = await stakingService.getStakingPositionDetails(testUser._id, fakeId);

      expect(details).toBeNull();
    });

    it('should not return position for different user', async () => {
      const otherUser = new User({
        email: 'other@test.com',
        username: 'otheruser',
        walletAddresses: ['0x9876543210987654321098765432109876543210']
      });
      await otherUser.save();

      const details = await stakingService.getStakingPositionDetails(otherUser._id, testPosition._id);

      expect(details).toBeNull();
    });
  });

  describe('Projected Rewards Calculation', () => {
    it('should calculate projected rewards correctly', async () => {
      const projection = await stakingService.calculateProjectedRewards(
        testContract._id,
        12, // 12 months
        1   // 1 NFT
      );

      expect(projection).toBeDefined();
      expect(projection.contractId.toString()).toBe(testContract._id.toString());
      expect(projection.duration).toBe(12);
      expect(projection.nftCount).toBe(1);
      expect(projection.monthlyTickets).toBe(12); // 12 tickets per month
      expect(projection.totalTickets).toBe(144); // 12 * 12
      expect(projection.bonusMultiplier).toBe(1.25);
      expect(projection.effectiveValue).toBe(180); // 144 * 1.25
    });

    it('should calculate rewards for multiple NFTs', async () => {
      const projection = await stakingService.calculateProjectedRewards(
        testContract._id,
        6,  // 6 months
        3   // 3 NFTs
      );

      expect(projection.nftCount).toBe(3);
      expect(projection.monthlyTickets).toBe(15); // 5 * 3
      expect(projection.totalTickets).toBe(90); // 15 * 6
      expect(projection.effectiveValue).toBe(99); // 90 * 1.1
    });

    it('should include breakdown information', async () => {
      const projection = await stakingService.calculateProjectedRewards(
        testContract._id,
        36, // 3 years
        1
      );

      expect(projection.breakdown).toBeDefined();
      expect(projection.breakdown.baseReward).toBe(1080); // 30 * 36
      expect(projection.breakdown.bonusReward).toBe(540); // 1080 * (1.5 - 1)
      expect(projection.breakdown.totalReward).toBe(1620); // 1080 * 1.5
    });

    it('should throw error for invalid contract', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await expect(
        stakingService.calculateProjectedRewards(fakeId, 12, 1)
      ).rejects.toThrow('Staking contract not found');
    });

    it('should throw error for invalid duration', async () => {
      await expect(
        stakingService.calculateProjectedRewards(testContract._id, 18, 1)
      ).rejects.toThrow('Invalid staking duration: 18 months');
    });
  });

  describe('Pending Rewards', () => {
    it('should calculate pending rewards for active positions', async () => {
      // Set last reward distribution to 2 months ago
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      
      await StakingPosition.findByIdAndUpdate(testPosition._id, {
        lastRewardDistribution: twoMonthsAgo
      });

      const pendingRewards = await stakingService.calculateUserPendingRewards(testUser._id);

      expect(pendingRewards).toBeDefined();
      expect(pendingRewards.totalPendingRewards).toBeGreaterThan(0);
      expect(pendingRewards.positionRewards).toHaveLength(1);
      expect(pendingRewards.positionRewards[0].pendingRewards).toBe(24); // 2 months * 12 tickets
    });

    it('should return zero for positions with recent rewards', async () => {
      // Set last reward distribution to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      await StakingPosition.findByIdAndUpdate(testPosition._id, {
        lastRewardDistribution: yesterday
      });

      const pendingRewards = await stakingService.calculateUserPendingRewards(testUser._id);

      expect(pendingRewards.totalPendingRewards).toBe(0);
    });
  });
});