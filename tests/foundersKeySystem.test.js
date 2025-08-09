const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const User = require('../models/user/user');
const FoundersKeyContract = require('../models/user/foundersKeyContract');
const FoundersKeyStaking = require('../models/user/foundersKeyStaking');
const OpenEntryAllocation = require('../models/user/openEntryAllocation');
const foundersKeyService = require('../services/foundersKeyService');
const { setupTestDatabase, cleanupTestDatabase } = require('./testDatabase');

describe('Founders Key System', () => {
  let testUser, adminUser, testContract;
  let userToken, adminToken;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  beforeEach(async () => {
    // Create test users
    testUser = new User({
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      primaryWallet: {
        address: '0x1234567890123456789012345678901234567890',
        walletType: 'metamask',
        chainId: '1'
      }
    });
    await testUser.save();

    adminUser = new User({
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin'
    });
    await adminUser.save();

    // Create test contract
    testContract = new FoundersKeyContract({
      name: 'Test Founders Keys',
      contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      chainId: '1',
      network: 'ethereum',
      defaultTier: 2,
      baseBenefits: {
        feeDiscount: 10,
        priorityAccess: true,
        openEntryTickets: 2
      },
      createdBy: adminUser._id
    });
    await testContract.save();

    // Mock tokens for testing
    userToken = 'mock-user-token';
    adminToken = 'mock-admin-token';
  });

  afterEach(async () => {
    await User.deleteMany({});
    await FoundersKeyContract.deleteMany({});
    await FoundersKeyStaking.deleteMany({});
    await OpenEntryAllocation.deleteMany({});
  });

  describe('Founders Key Models', () => {
    describe('FoundersKeyContract Model', () => {
      test('should create a valid contract', async () => {
        const contract = new FoundersKeyContract({
          name: 'New Test Contract',
          contractAddress: '0x1111111111111111111111111111111111111111',
          chainId: '1',
          network: 'ethereum',
          createdBy: adminUser._id
        });

        await contract.save();
        expect(contract.name).toBe('New Test Contract');
        expect(contract.isActive).toBe(true);
        expect(contract.defaultTier).toBe(1);
      });

      test('should calculate benefits for different tiers', () => {
        const tier1Benefits = testContract.getBenefitsForTier(1);
        const tier3Benefits = testContract.getBenefitsForTier(3);
        const tier5Benefits = testContract.getBenefitsForTier(5);

        expect(tier1Benefits.feeDiscount).toBe(10); // base * 1
        expect(tier3Benefits.feeDiscount).toBe(20); // base * 2
        expect(tier5Benefits.feeDiscount).toBe(30); // base * 3

        expect(tier1Benefits.priorityAccess).toBe(false);
        expect(tier3Benefits.priorityAccess).toBe(true);
        expect(tier5Benefits.priorityAccess).toBe(true);
      });

      test('should enforce unique contract address per chain', async () => {
        const duplicateContract = new FoundersKeyContract({
          name: 'Duplicate Contract',
          contractAddress: testContract.contractAddress,
          chainId: testContract.chainId,
          network: 'ethereum',
          createdBy: adminUser._id
        });

        await expect(duplicateContract.save()).rejects.toThrow();
      });
    });

    describe('FoundersKeyStaking Model', () => {
      test('should create valid staking record', async () => {
        const stakingRecord = new FoundersKeyStaking({
          userId: testUser._id,
          tokenId: '123',
          contractAddress: testContract.contractAddress,
          chainId: '1',
          stakingDuration: 180,
          endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
          originalBenefits: { feeDiscount: 10, priorityAccess: true, openEntryTickets: 2 },
          stakedBenefits: { feeDiscount: 15, priorityAccess: true, openEntryTickets: 3 }
        });

        await stakingRecord.save();
        expect(stakingRecord.status).toBe('active');
        expect(stakingRecord.getStakingMultiplier()).toBe(1.5); // 6 months
      });

      test('should calculate rewards correctly', async () => {
        const stakingRecord = new FoundersKeyStaking({
          userId: testUser._id,
          tokenId: '123',
          contractAddress: testContract.contractAddress,
          chainId: '1',
          stakingDuration: 90,
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          originalBenefits: { feeDiscount: 10, priorityAccess: true, openEntryTickets: 2 }
        });

        const rewards = stakingRecord.calculateRewards();
        expect(rewards.openEntryTickets).toBeGreaterThan(0);
        expect(rewards.bonusPoints).toBeGreaterThan(0);
      });

      test('should detect expired staking', async () => {
        const expiredStaking = new FoundersKeyStaking({
          userId: testUser._id,
          tokenId: '123',
          contractAddress: testContract.contractAddress,
          chainId: '1',
          stakingDuration: 30,
          startDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
        });

        expect(expiredStaking.isExpired()).toBe(true);
      });
    });

    describe('OpenEntryAllocation Model', () => {
      test('should create valid allocation', async () => {
        const allocation = new OpenEntryAllocation({
          userId: testUser._id,
          ticketsAllocated: 10,
          source: 'founders_key_benefits'
        });

        await allocation.save();
        expect(allocation.ticketsRemaining).toBe(10);
        expect(allocation.status).toBe('pending');
      });

      test('should use tickets correctly', async () => {
        const allocation = new OpenEntryAllocation({
          userId: testUser._id,
          ticketsAllocated: 10,
          source: 'founders_key_benefits',
          status: 'active'
        });
        await allocation.save();

        await allocation.useTickets(3, new mongoose.Types.ObjectId(), 'test-tx-123');
        
        expect(allocation.ticketsUsed).toBe(3);
        expect(allocation.ticketsRemaining).toBe(7);
        expect(allocation.usageHistory).toHaveLength(1);
      });

      test('should prevent overuse of tickets', async () => {
        const allocation = new OpenEntryAllocation({
          userId: testUser._id,
          ticketsAllocated: 5,
          source: 'founders_key_benefits',
          status: 'active'
        });
        await allocation.save();

        await expect(
          allocation.useTickets(10, new mongoose.Types.ObjectId(), 'test-tx-123')
        ).rejects.toThrow('Insufficient tickets remaining');
      });
    });
  });

  describe('User Model Integration', () => {
    test('should calculate tier based on Founders Keys', async () => {
      // Add Founders Keys to user
      testUser.foundersKeys = [
        {
          tokenId: '1',
          contractAddress: testContract.contractAddress,
          chainId: '1',
          tier: 3,
          benefits: { feeDiscount: 15, priorityAccess: true, openEntryTickets: 3 }
        },
        {
          tokenId: '2',
          contractAddress: testContract.contractAddress,
          chainId: '1',
          tier: 2,
          benefits: { feeDiscount: 10, priorityAccess: true, openEntryTickets: 2 }
        }
      ];

      const tier = testUser.calculateTier();
      expect(tier).toBe('gold'); // Highest tier is 3, which maps to gold
    });

    test('should aggregate benefits from multiple keys', async () => {
      testUser.foundersKeys = [
        {
          tokenId: '1',
          contractAddress: testContract.contractAddress,
          chainId: '1',
          tier: 3,
          benefits: { feeDiscount: 15, priorityAccess: true, openEntryTickets: 3 }
        },
        {
          tokenId: '2',
          contractAddress: testContract.contractAddress,
          chainId: '1',
          tier: 2,
          benefits: { feeDiscount: 10, priorityAccess: false, openEntryTickets: 2 }
        }
      ];

      const benefits = testUser.getFoundersKeyBenefits();
      expect(benefits.feeDiscount).toBe(15); // Max discount
      expect(benefits.priorityAccess).toBe(true); // Any key with priority access
      expect(benefits.openEntryTickets).toBe(5); // Sum of tickets
    });

    test('should detect if user has Founders Keys', async () => {
      expect(testUser.hasFoundersKey()).toBe(false);

      testUser.foundersKeys.push({
        tokenId: '1',
        contractAddress: testContract.contractAddress,
        chainId: '1',
        tier: 1,
        benefits: { feeDiscount: 5, priorityAccess: false, openEntryTickets: 1 }
      });

      expect(testUser.hasFoundersKey()).toBe(true);
    });
  });

  describe('FoundersKeyService', () => {
    test('should calculate tier benefits correctly', () => {
      const tier1Benefits = foundersKeyService.calculateTierBenefits(1, testContract);
      const tier5Benefits = foundersKeyService.calculateTierBenefits(5, testContract);

      expect(tier1Benefits.feeDiscount).toBe(10); // base * 1
      expect(tier5Benefits.feeDiscount).toBe(30); // base * 3
      expect(tier1Benefits.priorityAccess).toBe(false);
      expect(tier5Benefits.priorityAccess).toBe(true);
    });

    test('should get correct staking multiplier', () => {
      expect(foundersKeyService.getStakingMultiplier(29)).toBe(1.0);
      expect(foundersKeyService.getStakingMultiplier(30)).toBe(1.1);
      expect(foundersKeyService.getStakingMultiplier(90)).toBe(1.25);
      expect(foundersKeyService.getStakingMultiplier(180)).toBe(1.5);
      expect(foundersKeyService.getStakingMultiplier(365)).toBe(2.0);
    });

    test('should apply fee discount correctly', async () => {
      // Add Founders Key to user
      testUser.foundersKeys = [{
        tokenId: '1',
        contractAddress: testContract.contractAddress,
        chainId: '1',
        tier: 3,
        benefits: { feeDiscount: 20, priorityAccess: true, openEntryTickets: 3 }
      }];
      await testUser.save();

      const discountResult = await foundersKeyService.applyFeeDiscount(testUser._id, 100);
      
      expect(discountResult.originalFee).toBe(100);
      expect(discountResult.discountPercent).toBe(20);
      expect(discountResult.discountAmount).toBe(20);
      expect(discountResult.finalFee).toBe(80);
      expect(discountResult.appliedDiscount).toBe(true);
    });

    test('should check priority access correctly', async () => {
      // User without Founders Keys
      let hasPriorityAccess = await foundersKeyService.hasPriorityAccess(testUser._id);
      expect(hasPriorityAccess).toBe(false);

      // Add Founders Key with priority access
      testUser.foundersKeys = [{
        tokenId: '1',
        contractAddress: testContract.contractAddress,
        chainId: '1',
        tier: 3,
        benefits: { feeDiscount: 15, priorityAccess: true, openEntryTickets: 3 }
      }];
      await testUser.save();

      hasPriorityAccess = await foundersKeyService.hasPriorityAccess(testUser._id);
      expect(hasPriorityAccess).toBe(true);
    });

    test('should start staking successfully', async () => {
      // Add Founders Key to user
      testUser.foundersKeys = [{
        tokenId: '123',
        contractAddress: testContract.contractAddress,
        chainId: '1',
        tier: 2,
        benefits: { feeDiscount: 10, priorityAccess: true, openEntryTickets: 2 },
        stakingPeriod: { isActive: false }
      }];
      await testUser.save();

      const result = await foundersKeyService.startStaking(
        testUser._id,
        '123',
        testContract.contractAddress,
        90
      );

      expect(result.success).toBe(true);
      expect(result.stakingRecord).toBeDefined();
      expect(result.updatedBenefits.feeDiscount).toBeGreaterThan(10); // Should have staking bonus
    });

    test('should end staking successfully', async () => {
      // Create active staking
      const stakingRecord = new FoundersKeyStaking({
        userId: testUser._id,
        tokenId: '123',
        contractAddress: testContract.contractAddress,
        chainId: '1',
        stakingDuration: 90,
        endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        status: 'active'
      });
      await stakingRecord.save();

      // Add staking key to user
      testUser.foundersKeys = [{
        tokenId: '123',
        contractAddress: testContract.contractAddress,
        chainId: '1',
        tier: 2,
        benefits: { feeDiscount: 15, priorityAccess: true, openEntryTickets: 3 },
        stakingPeriod: { 
          isActive: true,
          startDate: stakingRecord.startDate,
          endDate: stakingRecord.endDate,
          duration: 90
        }
      }];
      await testUser.save();

      const result = await foundersKeyService.endStaking(
        testUser._id,
        '123',
        testContract.contractAddress
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('ended successfully');
    });

    test('should process open-entry allocations', async () => {
      // Add Founders Keys to multiple users
      const user2 = new User({
        username: 'user2',
        email: 'user2@example.com',
        foundersKeys: [{
          tokenId: '1',
          contractAddress: testContract.contractAddress,
          chainId: '1',
          tier: 2,
          benefits: { feeDiscount: 10, priorityAccess: true, openEntryTickets: 2 }
        }]
      });
      await user2.save();

      testUser.foundersKeys = [{
        tokenId: '2',
        contractAddress: testContract.contractAddress,
        chainId: '1',
        tier: 3,
        benefits: { feeDiscount: 15, priorityAccess: true, openEntryTickets: 3 }
      }];
      await testUser.save();

      const allocations = await foundersKeyService.processOpenEntryAllocations();
      
      expect(allocations.length).toBe(2);
      expect(allocations[0].source).toBe('founders_key_benefits');
    });

    test('should generate Founders Key snapshot', async () => {
      // Add Founders Keys to user
      testUser.foundersKeys = [
        {
          tokenId: '1',
          contractAddress: testContract.contractAddress,
          chainId: '1',
          tier: 3,
          benefits: { feeDiscount: 15, priorityAccess: true, openEntryTickets: 3 }
        },
        {
          tokenId: '2',
          contractAddress: testContract.contractAddress,
          chainId: '1',
          tier: 2,
          benefits: { feeDiscount: 10, priorityAccess: true, openEntryTickets: 2 }
        }
      ];
      await testUser.save();

      const snapshot = await foundersKeyService.generateFoundersKeySnapshot();
      
      expect(snapshot).toHaveLength(1);
      expect(snapshot[0].username).toBe('testuser');
      expect(snapshot[0].totalKeys).toBe(2);
      expect(snapshot[0].highestKeyTier).toBe(3);
      expect(snapshot[0].totalFeeDiscount).toBe(15);
      expect(snapshot[0].priorityAccess).toBe(true);
      expect(snapshot[0].openEntryTickets).toBe(5);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid staking duration', async () => {
      testUser.foundersKeys = [{
        tokenId: '123',
        contractAddress: testContract.contractAddress,
        chainId: '1',
        tier: 2,
        benefits: { feeDiscount: 10, priorityAccess: true, openEntryTickets: 2 },
        stakingPeriod: { isActive: false }
      }];
      await testUser.save();

      await expect(
        foundersKeyService.startStaking(testUser._id, '123', testContract.contractAddress, 10)
      ).rejects.toThrow();
    });

    test('should handle staking non-existent key', async () => {
      await expect(
        foundersKeyService.startStaking(testUser._id, '999', testContract.contractAddress, 90)
      ).rejects.toThrow('Founders Key not found');
    });

    test('should handle ending non-active staking', async () => {
      testUser.foundersKeys = [{
        tokenId: '123',
        contractAddress: testContract.contractAddress,
        chainId: '1',
        tier: 2,
        benefits: { feeDiscount: 10, priorityAccess: true, openEntryTickets: 2 },
        stakingPeriod: { isActive: false }
      }];
      await testUser.save();

      await expect(
        foundersKeyService.endStaking(testUser._id, '123', testContract.contractAddress)
      ).rejects.toThrow('Key is not currently being staked');
    });

    test('should handle fee discount for non-existent user', async () => {
      const fakeUserId = new mongoose.Types.ObjectId();
      const result = await foundersKeyService.applyFeeDiscount(fakeUserId, 100);
      
      expect(result).toBe(100); // Should return original fee
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete Founders Key lifecycle', async () => {
      // 1. User gets Founders Key
      testUser.foundersKeys = [{
        tokenId: '123',
        contractAddress: testContract.contractAddress,
        chainId: '1',
        tier: 2,
        benefits: { feeDiscount: 10, priorityAccess: true, openEntryTickets: 2 },
        stakingPeriod: { isActive: false }
      }];
      await testUser.save();

      // 2. User starts staking
      const stakingResult = await foundersKeyService.startStaking(
        testUser._id, '123', testContract.contractAddress, 180
      );
      expect(stakingResult.success).toBe(true);

      // 3. Check enhanced benefits
      const updatedUser = await User.findById(testUser._id);
      const benefits = updatedUser.getFoundersKeyBenefits();
      expect(benefits.feeDiscount).toBeGreaterThan(10); // Should have staking bonus

      // 4. Apply fee discount
      const discountResult = await foundersKeyService.applyFeeDiscount(testUser._id, 100);
      expect(discountResult.appliedDiscount).toBe(true);

      // 5. Check priority access
      const hasPriorityAccess = await foundersKeyService.hasPriorityAccess(testUser._id);
      expect(hasPriorityAccess).toBe(true);

      // 6. Process allocations
      const allocations = await foundersKeyService.processOpenEntryAllocations();
      expect(allocations.length).toBeGreaterThan(0);

      // 7. End staking
      const endResult = await foundersKeyService.endStaking(
        testUser._id, '123', testContract.contractAddress
      );
      expect(endResult.success).toBe(true);
    });
  });
});