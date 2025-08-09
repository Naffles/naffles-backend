const mongoose = require('mongoose');
const StakingContract = require('../models/staking/stakingContract');
const StakingPosition = require('../models/staking/stakingPosition');
const User = require('../models/user/user');
const stakingService = require('../services/stakingService');
const stakingRewardDistributionService = require('../services/stakingRewardDistributionService');
const stakingIntegrationService = require('../services/stakingIntegrationService');

describe('Staking System Performance Tests', () => {
  let testUsers = [];
  let testContracts = [];
  let testAdmin;

  beforeAll(async () => {
    // Create admin user
    testAdmin = new User({
      username: 'perfadmin',
      email: 'perfadmin@example.com',
      walletAddresses: ['0x0000000000000000000000000000000000000000'],
      role: 'admin'
    });
    await testAdmin.save();

    // Create multiple test users for performance testing
    const userPromises = [];
    for (let i = 0; i < 100; i++) {
      userPromises.push(
        new User({
          username: `perfuser${i}`,
          email: `perfuser${i}@example.com`,
          walletAddresses: [`0x${i.toString().padStart(40, '0')}`],
          isEmailVerified: true
        }).save()
      );
    }
    testUsers = await Promise.all(userPromises);

    // Create multiple test contracts
    const contractPromises = [];
    for (let i = 0; i < 10; i++) {
      contractPromises.push(
        stakingService.createStakingContract({
          contractAddress: `0x${(i + 1000).toString(16).padStart(40, '0')}`,
          blockchain: ['ethereum', 'polygon', 'solana', 'base'][i % 4],
          contractName: `Performance Test Collection ${i}`,
          description: `Performance test collection ${i}`
        }, testAdmin._id)
      );
    }
    testContracts = await Promise.all(contractPromises);

    // Validate all contracts
    for (const contract of testContracts) {
      await stakingService.validateStakingContract(
        contract._id,
        testAdmin._id,
        'Validated for performance testing'
      );
    }
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ 
      email: { $regex: /^perf.*@example\.com$/ }
    });
    await StakingContract.deleteMany({
      contractName: { $regex: /^Performance Test Collection/ }
    });
    await StakingPosition.deleteMany({});
  });

  describe('Large Scale Position Creation', () => {
    test('should handle creating 1000 staking positions efficiently', async () => {
      const startTime = Date.now();
      const positions = [];

      // Create 1000 positions across users and contracts
      for (let i = 0; i < 1000; i++) {
        const user = testUsers[i % testUsers.length];
        const contract = testContracts[i % testContracts.length];
        
        positions.push({
          userId: user._id,
          stakingContractId: contract._id,
          nftTokenId: `perf-${i}`,
          nftContractAddress: contract.contractAddress,
          blockchain: contract.blockchain,
          stakingDuration: [6, 12, 36][i % 3],
          walletAddress: user.walletAddresses[0],
          lockingHash: `perf-hash-${i}`,
          totalRewardsEarned: Math.floor(Math.random() * 100)
        });
      }

      // Batch insert for better performance
      await StakingPosition.insertMany(positions);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`Created 1000 positions in ${duration}ms`);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

      // Verify all positions were created
      const count = await StakingPosition.countDocuments({
        nftTokenId: { $regex: /^perf-/ }
      });
      expect(count).toBe(1000);
    });

    test('should handle concurrent position queries efficiently', async () => {
      const startTime = Date.now();
      const promises = [];

      // Create 50 concurrent queries
      for (let i = 0; i < 50; i++) {
        const user = testUsers[i % testUsers.length];
        promises.push(
          stakingIntegrationService.getUserStakingData(user._id)
        );
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`Processed 50 concurrent queries in ${duration}ms`);
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      expect(results).toHaveLength(50);

      // Verify all results have expected structure
      results.forEach(result => {
        expect(result).toHaveProperty('positions');
        expect(result).toHaveProperty('summary');
        expect(result).toHaveProperty('integrationData');
      });
    });
  });

  describe('Reward Distribution Performance', () => {
    beforeEach(async () => {
      // Set up positions eligible for rewards (older than 1 month)
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 2);

      const eligiblePositions = [];
      for (let i = 0; i < 500; i++) {
        const user = testUsers[i % testUsers.length];
        const contract = testContracts[i % testContracts.length];
        
        eligiblePositions.push({
          userId: user._id,
          stakingContractId: contract._id,
          nftTokenId: `reward-${i}`,
          nftContractAddress: contract.contractAddress,
          blockchain: contract.blockchain,
          stakingDuration: [6, 12, 36][i % 3],
          walletAddress: user.walletAddresses[0],
          lockingHash: `reward-hash-${i}`,
          stakedAt: oldDate,
          status: 'active'
        });
      }

      await StakingPosition.insertMany(eligiblePositions);
    });

    test('should distribute rewards to 500 positions efficiently', async () => {
      const startTime = Date.now();
      
      const results = await stakingRewardDistributionService.distributeMonthlyRewards();
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`Distributed rewards to ${results.successful} positions in ${duration}ms`);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      expect(results.successful).toBeGreaterThan(0);
      expect(results.failed).toBe(0);
    });

    test('should calculate pending rewards for multiple users efficiently', async () => {
      const startTime = Date.now();
      const promises = [];

      // Calculate pending rewards for 100 users
      for (let i = 0; i < 100; i++) {
        const user = testUsers[i];
        promises.push(
          stakingRewardDistributionService.calculateUserPendingRewards(user._id)
        );
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`Calculated pending rewards for 100 users in ${duration}ms`);
      expect(duration).toBeLessThan(20000); // Should complete within 20 seconds
      expect(results).toHaveLength(100);

      // Verify results structure
      results.forEach(result => {
        expect(result).toHaveProperty('totalPendingRewards');
        expect(result).toHaveProperty('positionRewards');
        expect(typeof result.totalPendingRewards).toBe('number');
      });
    });

    test('should handle batch reward processing efficiently', async () => {
      const startTime = Date.now();
      
      // Get eligible positions
      const eligiblePositions = await StakingPosition.findEligibleForRewards();
      
      // Process in batches of 50
      const batchSize = 50;
      const batches = [];
      for (let i = 0; i < eligiblePositions.length; i += batchSize) {
        batches.push(eligiblePositions.slice(i, i + batchSize));
      }

      let totalProcessed = 0;
      for (const batch of batches) {
        const batchPromises = batch.map(position => 
          stakingRewardDistributionService.processPositionReward(position)
        );
        
        const batchResults = await Promise.all(batchPromises);
        totalProcessed += batchResults.filter(r => r.success).length;
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`Processed ${totalProcessed} positions in batches in ${duration}ms`);
      expect(duration).toBeLessThan(45000); // Should complete within 45 seconds
      expect(totalProcessed).toBeGreaterThan(0);
    });
  });

  describe('Analytics and Aggregation Performance', () => {
    test('should generate staking analytics efficiently', async () => {
      const startTime = Date.now();
      
      const analytics = await stakingService.getStakingAnalytics(30);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`Generated staking analytics in ${duration}ms`);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(analytics).toHaveProperty('contracts');
      expect(analytics).toHaveProperty('positions');
      expect(analytics).toHaveProperty('rewards');
    });

    test('should generate leaderboards efficiently', async () => {
      const startTime = Date.now();
      
      const [totalStakedLeaderboard, rewardsLeaderboard, longTermLeaderboard] = await Promise.all([
        stakingIntegrationService.getStakingLeaderboard('total_staked', 100),
        stakingIntegrationService.getStakingLeaderboard('total_rewards', 100),
        stakingIntegrationService.getStakingLeaderboard('long_term_stakers', 100)
      ]);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`Generated 3 leaderboards in ${duration}ms`);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      expect(Array.isArray(totalStakedLeaderboard)).toBe(true);
      expect(Array.isArray(rewardsLeaderboard)).toBe(true);
      expect(Array.isArray(longTermLeaderboard)).toBe(true);
    });

    test('should handle complex aggregation queries efficiently', async () => {
      const startTime = Date.now();
      
      // Complex aggregation: Get top stakers by blockchain with reward stats
      const complexAggregation = await StakingPosition.aggregate([
        {
          $match: { status: 'active' }
        },
        {
          $group: {
            _id: {
              userId: '$userId',
              blockchain: '$blockchain'
            },
            totalStaked: { $sum: 1 },
            totalRewards: { $sum: '$totalRewardsEarned' },
            averageDuration: { $avg: '$stakingDuration' },
            positions: { $push: '$nftTokenId' }
          }
        },
        {
          $group: {
            _id: '$_id.userId',
            blockchains: {
              $push: {
                blockchain: '$_id.blockchain',
                totalStaked: '$totalStaked',
                totalRewards: '$totalRewards',
                averageDuration: '$averageDuration'
              }
            },
            overallStaked: { $sum: '$totalStaked' },
            overallRewards: { $sum: '$totalRewards' }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $project: {
            username: '$user.username',
            blockchains: 1,
            overallStaked: 1,
            overallRewards: 1,
            blockchainCount: { $size: '$blockchains' }
          }
        },
        { $sort: { overallStaked: -1, overallRewards: -1 } },
        { $limit: 50 }
      ]);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`Complex aggregation completed in ${duration}ms`);
      expect(duration).toBeLessThan(8000); // Should complete within 8 seconds
      expect(Array.isArray(complexAggregation)).toBe(true);
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should handle large dataset queries without memory issues', async () => {
      const initialMemory = process.memoryUsage();
      
      // Query large dataset multiple times
      for (let i = 0; i < 10; i++) {
        const positions = await StakingPosition.find({})
          .populate('stakingContractId')
          .populate('userId')
          .limit(1000);
        
        // Process the data to simulate real usage
        const summary = positions.reduce((acc, pos) => {
          acc.totalRewards += pos.totalRewardsEarned;
          acc.count++;
          return acc;
        }, { totalRewards: 0, count: 0 });
        
        expect(summary.count).toBeGreaterThan(0);
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
      
      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });

    test('should efficiently handle streaming large datasets', async () => {
      const startTime = Date.now();
      let processedCount = 0;
      
      // Use cursor for streaming large dataset
      const cursor = StakingPosition.find({}).cursor();
      
      for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        // Simulate processing
        processedCount++;
        
        // Process in chunks to avoid blocking
        if (processedCount % 100 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`Streamed ${processedCount} documents in ${duration}ms`);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      expect(processedCount).toBeGreaterThan(0);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent staking operations safely', async () => {
      const startTime = Date.now();
      const promises = [];
      
      // Simulate 100 concurrent staking operations
      for (let i = 0; i < 100; i++) {
        const user = testUsers[i % testUsers.length];
        const contract = testContracts[i % testContracts.length];
        
        promises.push(
          stakingIntegrationService.awardStakingPoints(
            user._id,
            stakingIntegrationService.stakingActivityTypes.STAKE_NFT,
            {
              stakingDuration: [6, 12, 36][i % 3],
              contractId: contract._id.toString(),
              concurrent: true
            }
          )
        );
      }
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`Processed 100 concurrent staking operations in ${duration}ms`);
      expect(duration).toBeLessThan(20000); // Should complete within 20 seconds
      expect(results).toHaveLength(100);
      
      // Verify all operations succeeded
      const successfulResults = results.filter(r => r && r.pointsAwarded > 0);
      expect(successfulResults.length).toBe(100);
    });

    test('should handle concurrent reward distributions safely', async () => {
      const startTime = Date.now();
      const promises = [];
      
      // Simulate 50 concurrent reward distributions
      for (let i = 0; i < 50; i++) {
        const user = testUsers[i % testUsers.length];
        
        promises.push(
          stakingIntegrationService.processStakingRewardDistribution(
            user._id,
            {
              openEntryTickets: Math.floor(Math.random() * 20) + 5,
              bonusMultiplier: 1.0 + (Math.random() * 0.5),
              positionId: new mongoose.Types.ObjectId()
            }
          )
        );
      }
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`Processed 50 concurrent reward distributions in ${duration}ms`);
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      expect(results).toHaveLength(50);
      
      // Verify all operations succeeded
      const successfulResults = results.filter(r => r && r.pointsAwarded);
      expect(successfulResults.length).toBe(50);
    });
  });

  describe('Database Index Performance', () => {
    test('should efficiently query positions by user', async () => {
      const user = testUsers[0];
      const startTime = Date.now();
      
      const positions = await StakingPosition.find({ userId: user._id });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`User position query completed in ${duration}ms`);
      expect(duration).toBeLessThan(100); // Should be very fast with proper indexing
    });

    test('should efficiently query positions by contract', async () => {
      const contract = testContracts[0];
      const startTime = Date.now();
      
      const positions = await StakingPosition.find({ stakingContractId: contract._id });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`Contract position query completed in ${duration}ms`);
      expect(duration).toBeLessThan(100); // Should be very fast with proper indexing
    });

    test('should efficiently query positions by status and unlock date', async () => {
      const startTime = Date.now();
      
      const positions = await StakingPosition.find({
        status: 'active',
        unstakeAt: { $lte: new Date() }
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`Status and date query completed in ${duration}ms`);
      expect(duration).toBeLessThan(200); // Should be fast with compound indexing
    });

    test('should efficiently find eligible positions for rewards', async () => {
      const startTime = Date.now();
      
      const positions = await StakingPosition.findEligibleForRewards();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`Eligible positions query completed in ${duration}ms`);
      expect(duration).toBeLessThan(500); // Should be reasonably fast
      expect(Array.isArray(positions)).toBe(true);
    });
  });

  describe('Stress Testing', () => {
    test('should handle rapid successive operations', async () => {
      const user = testUsers[0];
      const startTime = Date.now();
      
      // Perform 1000 rapid successive operations
      for (let i = 0; i < 1000; i++) {
        await stakingIntegrationService.awardStakingPoints(
          user._id,
          stakingIntegrationService.stakingActivityTypes.REWARD_DISTRIBUTION,
          { rapid: i }
        );
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`1000 rapid operations completed in ${duration}ms`);
      expect(duration).toBeLessThan(60000); // Should complete within 60 seconds
    });

    test('should maintain performance under high load', async () => {
      const startTime = Date.now();
      const operations = [];
      
      // Create a mix of different operations
      for (let i = 0; i < 500; i++) {
        const user = testUsers[i % testUsers.length];
        
        if (i % 4 === 0) {
          operations.push(
            stakingIntegrationService.getUserStakingData(user._id)
          );
        } else if (i % 4 === 1) {
          operations.push(
            stakingIntegrationService.awardStakingPoints(
              user._id,
              stakingIntegrationService.stakingActivityTypes.STAKE_NFT,
              { stakingDuration: 12 }
            )
          );
        } else if (i % 4 === 2) {
          operations.push(
            stakingService.getUserStakingPortfolio(user._id)
          );
        } else {
          operations.push(
            stakingIntegrationService.calculateStakingSummary(user._id)
          );
        }
      }
      
      const results = await Promise.all(operations);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`500 mixed operations completed in ${duration}ms`);
      expect(duration).toBeLessThan(45000); // Should complete within 45 seconds
      expect(results).toHaveLength(500);
      
      // Verify no operations failed
      const failedResults = results.filter(r => !r);
      expect(failedResults.length).toBe(0);
    });
  });
});