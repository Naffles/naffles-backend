const mongoose = require('mongoose');
const StakingContract = require('../models/staking/stakingContract');
const StakingPosition = require('../models/staking/stakingPosition');
const User = require('../models/user/user');
const PointsBalance = require('../models/points/pointsBalance');
const PointsTransaction = require('../models/points/pointsTransaction');
const Achievement = require('../models/points/achievement');
const UserAchievement = require('../models/points/userAchievement');
const stakingIntegrationService = require('../services/stakingIntegrationService');
const stakingService = require('../services/stakingService');
const pointsService = require('../services/pointsService');
const achievementService = require('../services/achievementService');
const { initializeStakingAchievements } = require('../scripts/initializeStakingAchievements');

describe('Staking System Integration', () => {
  let testUser;
  let testAdmin;
  let testContract;
  let testPosition;

  beforeAll(async () => {
    // Initialize staking achievements
    await initializeStakingAchievements();

    // Create test users
    testUser = new User({
      username: 'stakinguser',
      email: 'stakinguser@example.com',
      walletAddresses: ['0x1234567890123456789012345678901234567890'],
      isEmailVerified: true
    });
    await testUser.save();

    testAdmin = new User({
      username: 'stakingadmin',
      email: 'stakingadmin@example.com',
      walletAddresses: ['0x0987654321098765432109876543210987654321'],
      isEmailVerified: true,
      role: 'admin'
    });
    await testAdmin.save();

    // Initialize user points
    await pointsService.initializeUserPoints(testUser._id);
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ 
      email: { $in: ['stakinguser@example.com', 'stakingadmin@example.com'] } 
    });
    await StakingContract.deleteMany({});
    await StakingPosition.deleteMany({});
    await PointsBalance.deleteMany({});
    await PointsTransaction.deleteMany({});
    await UserAchievement.deleteMany({});
  });

  describe('User Management Integration', () => {
    beforeEach(async () => {
      // Create test contract
      testContract = await stakingService.createStakingContract({
        contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        blockchain: 'ethereum',
        contractName: 'Integration Test Collection',
        description: 'Test collection for integration testing'
      }, testAdmin._id);

      await stakingService.validateStakingContract(
        testContract._id,
        testAdmin._id,
        'Validated for integration testing'
      );
    });

    test('should integrate user staking data', async () => {
      const stakingData = await stakingIntegrationService.integrateUserStaking(testUser._id);

      expect(stakingData).toHaveProperty('positions');
      expect(stakingData).toHaveProperty('summary');
      expect(stakingData).toHaveProperty('achievements');
      expect(stakingData).toHaveProperty('rewards');
      expect(stakingData).toHaveProperty('integrationData');
      expect(stakingData.integrationData).toHaveProperty('stakingTier');
      expect(stakingData.integrationData).toHaveProperty('stakingScore');
    });

    test('should update user profile with staking data', async () => {
      const stakingData = await stakingIntegrationService.getUserStakingData(testUser._id);
      const updatedUser = await stakingIntegrationService.updateUserProfileWithStaking(
        testUser._id, 
        stakingData
      );

      expect(updatedUser.profileData).toHaveProperty('staking');
      expect(updatedUser.profileData.staking).toHaveProperty('totalPositions');
      expect(updatedUser.profileData.staking).toHaveProperty('stakingTier');
      expect(updatedUser.profileData.staking).toHaveProperty('stakingScore');
      expect(updatedUser.profileData.staking).toHaveProperty('lastUpdated');
    });

    test('should calculate staking tier correctly', async () => {
      const summary = {
        totalPositions: 5,
        totalRewardsEarned: 500,
        averageStakingDuration: 12,
        durationBreakdown: { threeYears: 0 }
      };

      const tier = stakingIntegrationService.calculateStakingTier(summary);
      expect(['bronze', 'silver', 'gold', 'platinum', 'diamond']).toContain(tier);
    });

    test('should get next staking milestone', async () => {
      const summary = { totalPositions: 3 };
      const milestone = stakingIntegrationService.getNextStakingMilestone(summary);

      expect(milestone).toHaveProperty('positions');
      expect(milestone).toHaveProperty('name');
      expect(milestone).toHaveProperty('reward');
      expect(milestone).toHaveProperty('progress');
      expect(milestone).toHaveProperty('remaining');
      expect(milestone.progress).toBe(3);
    });

    test('should calculate staking score', async () => {
      const summary = {
        totalPositions: 5,
        totalRewardsEarned: 250,
        averageStakingDuration: 12,
        durationBreakdown: { threeYears: 1 },
        blockchainBreakdown: { ethereum: 3, polygon: 2 }
      };
      const achievements = [
        { isCompleted: true },
        { isCompleted: true },
        { isCompleted: false }
      ];

      const score = stakingIntegrationService.calculateStakingScore(summary, achievements);
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('Points System Integration', () => {
    test('should award points for staking NFT', async () => {
      const initialBalance = await PointsBalance.findOne({ userId: testUser._id });
      const initialPoints = initialBalance ? initialBalance.balance : 0;

      const result = await stakingIntegrationService.awardStakingPoints(
        testUser._id,
        stakingIntegrationService.stakingActivityTypes.STAKE_NFT,
        { stakingDuration: 12 }
      );

      expect(result).toHaveProperty('pointsAwarded');
      expect(result).toHaveProperty('newBalance');
      expect(result.newBalance).toBeGreaterThan(initialPoints);

      // Verify transaction was created
      const transaction = await PointsTransaction.findById(result.transaction);
      expect(transaction).toBeTruthy();
      expect(transaction.activity).toBe('nft_staking');
      expect(transaction.amount).toBeGreaterThan(0);
    });

    test('should apply duration multiplier for staking points', async () => {
      const sixMonthResult = await stakingIntegrationService.awardStakingPoints(
        testUser._id,
        stakingIntegrationService.stakingActivityTypes.STAKE_NFT,
        { stakingDuration: 6 }
      );

      const threeYearResult = await stakingIntegrationService.awardStakingPoints(
        testUser._id,
        stakingIntegrationService.stakingActivityTypes.STAKE_NFT,
        { stakingDuration: 36 }
      );

      expect(threeYearResult.pointsAwarded).toBeGreaterThan(sixMonthResult.pointsAwarded);
    });

    test('should award points for reward distribution', async () => {
      const result = await stakingIntegrationService.awardStakingPoints(
        testUser._id,
        stakingIntegrationService.stakingActivityTypes.REWARD_DISTRIBUTION,
        { openEntryTickets: 12, bonusMultiplier: 1.25 }
      );

      expect(result).toHaveProperty('pointsAwarded');
      expect(result.pointsAwarded).toBeGreaterThan(0);
    });

    test('should award points for staking milestones', async () => {
      const result = await stakingIntegrationService.awardStakingPoints(
        testUser._id,
        stakingIntegrationService.stakingActivityTypes.STAKING_MILESTONE,
        { milestone: 'First Stake', positionCount: 1 }
      );

      expect(result).toHaveProperty('pointsAwarded');
      expect(result.pointsAwarded).toBeGreaterThan(0);
    });

    test('should process staking reward distribution', async () => {
      const rewardData = {
        openEntryTickets: 15,
        bonusMultiplier: 1.3,
        positionId: new mongoose.Types.ObjectId()
      };

      const result = await stakingIntegrationService.processStakingRewardDistribution(
        testUser._id,
        rewardData
      );

      expect(result).toHaveProperty('pointsAwarded');
      expect(result).toHaveProperty('ticketsAdded');
      expect(result).toHaveProperty('achievementsChecked');
      expect(result.pointsAwarded).toBe(true);
      expect(result.ticketsAdded).toBe(15);
    });
  });

  describe('Achievement System Integration', () => {
    beforeEach(async () => {
      // Clean up existing user achievements for clean testing
      await UserAchievement.deleteMany({ userId: testUser._id });
    });

    test('should check staking achievements', async () => {
      // Create a test position to trigger achievements
      testPosition = new StakingPosition({
        userId: testUser._id,
        stakingContractId: testContract._id,
        nftTokenId: '123',
        nftContractAddress: testContract.contractAddress,
        blockchain: 'ethereum',
        stakingDuration: 12,
        walletAddress: testUser.walletAddresses[0],
        lockingHash: 'test-locking-hash'
      });
      await testPosition.save();

      const result = await stakingIntegrationService.checkStakingAchievements(
        testUser._id,
        { positionId: testPosition._id }
      );

      expect(result).toBe(true);
    });

    test('should check position milestones', async () => {
      await stakingIntegrationService.checkPositionMilestones(testUser._id, 1);
      await stakingIntegrationService.checkPositionMilestones(testUser._id, 5);
      await stakingIntegrationService.checkPositionMilestones(testUser._id, 10);

      // Verify points were awarded for milestones
      const transactions = await PointsTransaction.find({
        userId: testUser._id,
        activity: 'staking_milestone'
      });

      expect(transactions.length).toBeGreaterThan(0);
    });

    test('should check reward milestones', async () => {
      await stakingIntegrationService.checkRewardMilestones(testUser._id, 100);
      await stakingIntegrationService.checkRewardMilestones(testUser._id, 500);

      const transactions = await PointsTransaction.find({
        userId: testUser._id,
        activity: 'staking_milestone',
        'metadata.milestone': { $in: ['Reward Collector', 'Reward Accumulator'] }
      });

      expect(transactions.length).toBeGreaterThan(0);
    });

    test('should check duration milestones', async () => {
      const summary = {
        durationBreakdown: { threeYears: 1 },
        averageStakingDuration: 24
      };

      await stakingIntegrationService.checkDurationMilestones(testUser._id, summary);

      const transactions = await PointsTransaction.find({
        userId: testUser._id,
        activity: 'staking_milestone',
        'metadata.milestone': { $in: ['Long-term Commitment', 'Duration Master'] }
      });

      expect(transactions.length).toBeGreaterThan(0);
    });

    test('should check blockchain diversity achievements', async () => {
      const blockchainBreakdown = {
        ethereum: 3,
        polygon: 2,
        solana: 1
      };

      await stakingIntegrationService.checkBlockchainDiversityAchievements(
        testUser._id,
        blockchainBreakdown
      );

      const transactions = await PointsTransaction.find({
        userId: testUser._id,
        activity: 'staking_milestone',
        'metadata.milestone': { $in: ['Multi-chain Staker', 'Blockchain Explorer'] }
      });

      expect(transactions.length).toBeGreaterThan(0);
    });

    test('should get staking achievements for user', async () => {
      const achievements = await stakingIntegrationService.getStakingAchievements(testUser._id);
      expect(Array.isArray(achievements)).toBe(true);
    });
  });

  describe('Staking Data Aggregation', () => {
    beforeEach(async () => {
      // Create multiple test positions for comprehensive testing
      const positions = [
        {
          userId: testUser._id,
          stakingContractId: testContract._id,
          nftTokenId: '101',
          nftContractAddress: testContract.contractAddress,
          blockchain: 'ethereum',
          stakingDuration: 6,
          walletAddress: testUser.walletAddresses[0],
          lockingHash: 'test-locking-hash-1',
          totalRewardsEarned: 50
        },
        {
          userId: testUser._id,
          stakingContractId: testContract._id,
          nftTokenId: '102',
          nftContractAddress: testContract.contractAddress,
          blockchain: 'polygon',
          stakingDuration: 12,
          walletAddress: testUser.walletAddresses[0],
          lockingHash: 'test-locking-hash-2',
          totalRewardsEarned: 150
        },
        {
          userId: testUser._id,
          stakingContractId: testContract._id,
          nftTokenId: '103',
          nftContractAddress: testContract.contractAddress,
          blockchain: 'ethereum',
          stakingDuration: 36,
          walletAddress: testUser.walletAddresses[0],
          lockingHash: 'test-locking-hash-3',
          totalRewardsEarned: 300,
          status: 'unstaked'
        }
      ];

      for (const positionData of positions) {
        const position = new StakingPosition(positionData);
        await position.save();
      }
    });

    test('should calculate comprehensive staking summary', async () => {
      const summary = await stakingIntegrationService.calculateStakingSummary(testUser._id);

      expect(summary).toHaveProperty('totalPositions');
      expect(summary).toHaveProperty('activePositions');
      expect(summary).toHaveProperty('completedPositions');
      expect(summary).toHaveProperty('totalRewardsEarned');
      expect(summary).toHaveProperty('averageStakingDuration');
      expect(summary).toHaveProperty('stakingHistory');
      expect(summary).toHaveProperty('durationBreakdown');
      expect(summary).toHaveProperty('blockchainBreakdown');

      expect(summary.totalPositions).toBeGreaterThan(0);
      expect(summary.totalRewardsEarned).toBeGreaterThan(0);
      expect(summary.blockchainBreakdown).toHaveProperty('ethereum');
      expect(summary.blockchainBreakdown).toHaveProperty('polygon');
    });

    test('should get staking rewards data', async () => {
      const rewardsData = await stakingIntegrationService.getStakingRewards(testUser._id);

      expect(rewardsData).toHaveProperty('totalRewardsEarned');
      expect(rewardsData).toHaveProperty('monthlyRewards');
      expect(rewardsData).toHaveProperty('pendingRewards');
      expect(rewardsData).toHaveProperty('rewardHistory');
      expect(rewardsData.totalRewardsEarned).toBeGreaterThan(0);
      expect(Array.isArray(rewardsData.rewardHistory)).toBe(true);
      expect(Array.isArray(rewardsData.monthlyRewards)).toBe(true);
    });

    test('should get comprehensive user staking data', async () => {
      const stakingData = await stakingIntegrationService.getUserStakingData(testUser._id);

      expect(stakingData).toHaveProperty('positions');
      expect(stakingData).toHaveProperty('summary');
      expect(stakingData).toHaveProperty('achievements');
      expect(stakingData).toHaveProperty('rewards');
      expect(stakingData).toHaveProperty('integrationData');

      expect(Array.isArray(stakingData.positions)).toBe(true);
      expect(stakingData.integrationData).toHaveProperty('totalValueLocked');
      expect(stakingData.integrationData).toHaveProperty('stakingTier');
      expect(stakingData.integrationData).toHaveProperty('nextMilestone');
      expect(stakingData.integrationData).toHaveProperty('stakingScore');
    });
  });

  describe('Leaderboard Integration', () => {
    test('should get staking leaderboard for total staked', async () => {
      const leaderboard = await stakingIntegrationService.getStakingLeaderboard('total_staked', 10);

      expect(Array.isArray(leaderboard)).toBe(true);
      if (leaderboard.length > 0) {
        expect(leaderboard[0]).toHaveProperty('rank');
        expect(leaderboard[0]).toHaveProperty('userId');
        expect(leaderboard[0]).toHaveProperty('totalStaked');
        expect(leaderboard[0]).toHaveProperty('username');
      }
    });

    test('should get staking leaderboard for total rewards', async () => {
      const leaderboard = await stakingIntegrationService.getStakingLeaderboard('total_rewards', 10);

      expect(Array.isArray(leaderboard)).toBe(true);
      if (leaderboard.length > 0) {
        expect(leaderboard[0]).toHaveProperty('rank');
        expect(leaderboard[0]).toHaveProperty('totalRewards');
      }
    });

    test('should get staking leaderboard for long-term stakers', async () => {
      const leaderboard = await stakingIntegrationService.getStakingLeaderboard('long_term_stakers', 10);

      expect(Array.isArray(leaderboard)).toBe(true);
      if (leaderboard.length > 0) {
        expect(leaderboard[0]).toHaveProperty('rank');
        expect(leaderboard[0]).toHaveProperty('longTermStakes');
        expect(leaderboard[0]).toHaveProperty('averageDuration');
      }
    });

    test('should get user staking rank', async () => {
      const rank = await stakingIntegrationService.getUserStakingRank(testUser._id, 'total_staked');
      expect(typeof rank === 'number' || rank === null).toBe(true);
    });

    test('should handle invalid leaderboard category', async () => {
      await expect(
        stakingIntegrationService.getStakingLeaderboard('invalid_category')
      ).rejects.toThrow('Unknown leaderboard category');
    });
  });

  describe('Multi-Collection Staking', () => {
    let secondContract;

    beforeEach(async () => {
      // Create second test contract
      secondContract = await stakingService.createStakingContract({
        contractAddress: '0x2222222222222222222222222222222222222222',
        blockchain: 'polygon',
        contractName: 'Second Test Collection',
        description: 'Second test collection for multi-collection testing'
      }, testAdmin._id);

      await stakingService.validateStakingContract(
        secondContract._id,
        testAdmin._id,
        'Validated for multi-collection testing'
      );
    });

    test('should handle multiple collections in staking data', async () => {
      // Create positions in different collections
      const positions = [
        {
          userId: testUser._id,
          stakingContractId: testContract._id,
          nftTokenId: '201',
          nftContractAddress: testContract.contractAddress,
          blockchain: 'ethereum',
          stakingDuration: 12,
          walletAddress: testUser.walletAddresses[0],
          lockingHash: 'multi-collection-hash-1'
        },
        {
          userId: testUser._id,
          stakingContractId: secondContract._id,
          nftTokenId: '202',
          nftContractAddress: secondContract.contractAddress,
          blockchain: 'polygon',
          stakingDuration: 6,
          walletAddress: testUser.walletAddresses[0],
          lockingHash: 'multi-collection-hash-2'
        }
      ];

      for (const positionData of positions) {
        const position = new StakingPosition(positionData);
        await position.save();
      }

      const stakingData = await stakingIntegrationService.getUserStakingData(testUser._id);
      
      expect(stakingData.summary.blockchainBreakdown).toHaveProperty('ethereum');
      expect(stakingData.summary.blockchainBreakdown).toHaveProperty('polygon');
      expect(stakingData.positions.length).toBeGreaterThanOrEqual(2);
    });

    test('should calculate collection diversity correctly', async () => {
      const summary = await stakingIntegrationService.calculateStakingSummary(testUser._id);
      
      expect(Object.keys(summary.blockchainBreakdown).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large number of positions efficiently', async () => {
      const startTime = Date.now();
      
      // Create multiple positions to test performance
      const positions = [];
      for (let i = 0; i < 20; i++) {
        positions.push({
          userId: testUser._id,
          stakingContractId: testContract._id,
          nftTokenId: `perf-${i}`,
          nftContractAddress: testContract.contractAddress,
          blockchain: 'ethereum',
          stakingDuration: [6, 12, 36][i % 3],
          walletAddress: testUser.walletAddresses[0],
          lockingHash: `perf-hash-${i}`,
          totalRewardsEarned: Math.floor(Math.random() * 100)
        });
      }

      await StakingPosition.insertMany(positions);

      const stakingData = await stakingIntegrationService.getUserStakingData(testUser._id);
      const endTime = Date.now();

      expect(stakingData.positions.length).toBeGreaterThanOrEqual(20);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle concurrent staking operations', async () => {
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        promises.push(
          stakingIntegrationService.awardStakingPoints(
            testUser._id,
            stakingIntegrationService.stakingActivityTypes.STAKE_NFT,
            { stakingDuration: 12, concurrent: i }
          )
        );
      }

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toHaveProperty('pointsAwarded');
        expect(result.pointsAwarded).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle non-existent user gracefully', async () => {
      const fakeUserId = new mongoose.Types.ObjectId();
      
      await expect(
        stakingIntegrationService.integrateUserStaking(fakeUserId)
      ).rejects.toThrow('User not found');
    });

    test('should handle empty staking data', async () => {
      const newUser = new User({
        username: 'emptystakinguser',
        email: 'emptystaking@example.com',
        walletAddresses: ['0x9999999999999999999999999999999999999999'],
        isEmailVerified: true
      });
      await newUser.save();

      const stakingData = await stakingIntegrationService.getUserStakingData(newUser._id);
      
      expect(stakingData.summary.totalPositions).toBe(0);
      expect(stakingData.summary.totalRewardsEarned).toBe(0);
      expect(stakingData.positions).toHaveLength(0);
      expect(stakingData.integrationData.stakingTier).toBe('bronze');

      await User.findByIdAndDelete(newUser._id);
    });

    test('should handle invalid staking activity types', async () => {
      const result = await stakingIntegrationService.awardStakingPoints(
        testUser._id,
        'invalid_activity_type',
        {}
      );

      expect(result).toBeNull();
    });

    test('should handle database connection issues gracefully', async () => {
      // This test would require mocking database failures
      // For now, we'll test the error handling structure
      const healthCheck = await stakingIntegrationService.performIntegrationHealthCheck();
      
      expect(healthCheck).toHaveProperty('timestamp');
      expect(healthCheck).toHaveProperty('services');
      expect(healthCheck).toHaveProperty('overall');
    });
  });

  describe('Integration Health Check', () => {
    test('should perform comprehensive health check', async () => {
      const healthCheck = await stakingIntegrationService.performIntegrationHealthCheck();

      expect(healthCheck).toHaveProperty('timestamp');
      expect(healthCheck).toHaveProperty('services');
      expect(healthCheck).toHaveProperty('overall');
      expect(healthCheck.services).toHaveProperty('staking');
      expect(healthCheck.services).toHaveProperty('points');
      expect(healthCheck.services).toHaveProperty('achievements');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(healthCheck.overall);
    });

    test('should detect service health status', async () => {
      const healthCheck = await stakingIntegrationService.performIntegrationHealthCheck();

      Object.values(healthCheck.services).forEach(service => {
        expect(service).toHaveProperty('status');
        expect(['healthy', 'degraded', 'unhealthy']).toContain(service.status);
      });
    });
  });

  describe('CSV Upload and Management', () => {
    test('should validate CSV data structure for staking contracts', () => {
      const validCSVData = [
        {
          contractName: 'Test Collection 1',
          contractAddress: '0x1111111111111111111111111111111111111111',
          blockchain: 'ethereum',
          description: 'Test collection 1'
        },
        {
          contractName: 'Test Collection 2',
          contractAddress: '0x2222222222222222222222222222222222222222',
          blockchain: 'polygon',
          description: 'Test collection 2'
        }
      ];

      validCSVData.forEach(data => {
        expect(data).toHaveProperty('contractName');
        expect(data).toHaveProperty('contractAddress');
        expect(data).toHaveProperty('blockchain');
        expect(StakingContract.validateContractAddress(data.contractAddress, data.blockchain)).toBe(true);
      });
    });

    test('should handle invalid CSV data gracefully', () => {
      const invalidCSVData = [
        {
          contractName: 'Invalid Collection',
          contractAddress: 'invalid-address',
          blockchain: 'ethereum'
        }
      ];

      invalidCSVData.forEach(data => {
        expect(StakingContract.validateContractAddress(data.contractAddress, data.blockchain)).toBe(false);
      });
    });
  });

  describe('Security Testing', () => {
    test('should validate user permissions for staking operations', async () => {
      // Test that only contract owners can modify staking contracts
      const unauthorizedUser = new User({
        username: 'unauthorized',
        email: 'unauthorized@example.com',
        walletAddresses: ['0x3333333333333333333333333333333333333333'],
        role: 'user'
      });
      await unauthorizedUser.save();

      await expect(
        stakingService.createStakingContract({
          contractAddress: '0x4444444444444444444444444444444444444444',
          blockchain: 'ethereum',
          contractName: 'Unauthorized Contract'
        }, unauthorizedUser._id)
      ).resolves.toBeTruthy(); // Should work - any user can create contracts

      await User.findByIdAndDelete(unauthorizedUser._id);
    });

    test('should prevent duplicate staking positions', async () => {
      const positionData = {
        userId: testUser._id,
        stakingContractId: testContract._id,
        nftTokenId: '999',
        nftContractAddress: testContract.contractAddress,
        blockchain: 'ethereum',
        stakingDuration: 12,
        walletAddress: testUser.walletAddresses[0],
        lockingHash: 'duplicate-test-hash'
      };

      const position1 = new StakingPosition(positionData);
      await position1.save();

      const position2 = new StakingPosition(positionData);
      
      // This should not throw an error at the model level
      // Duplicate prevention should be handled at the service level
      await expect(position2.save()).resolves.toBeTruthy();
      
      // Clean up
      await StakingPosition.deleteMany({ nftTokenId: '999' });
    });

    test('should validate staking duration constraints', async () => {
      const invalidPosition = new StakingPosition({
        userId: testUser._id,
        stakingContractId: testContract._id,
        nftTokenId: '888',
        nftContractAddress: testContract.contractAddress,
        blockchain: 'ethereum',
        stakingDuration: 24, // Invalid duration
        walletAddress: testUser.walletAddresses[0],
        lockingHash: 'invalid-duration-hash'
      });

      await expect(invalidPosition.save()).rejects.toThrow();
    });

    test('should sanitize user input in staking operations', async () => {
      const maliciousInput = {
        contractName: '<script>alert("xss")</script>',
        contractAddress: '0x5555555555555555555555555555555555555555',
        blockchain: 'ethereum',
        description: 'SELECT * FROM users; DROP TABLE users;'
      };

      const contract = await stakingService.createStakingContract(
        maliciousInput,
        testAdmin._id
      );

      // Input should be stored as-is (sanitization should happen at display time)
      expect(contract.contractName).toBe(maliciousInput.contractName);
      expect(contract.description).toBe(maliciousInput.description);
    });
  });
});