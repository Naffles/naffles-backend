const allowlistService = require('../services/allowlistService');
const Allowlist = require('../models/allowlist/allowlist');
const AllowlistParticipation = require('../models/allowlist/allowlistParticipation');
const AllowlistWinner = require('../models/allowlist/allowlistWinner');
const AllowlistConfiguration = require('../models/allowlist/allowlistConfiguration');
const User = require('../models/user/user');
const Community = require('../models/community/community');

describe('Allowlist System', () => {
  let testUser;
  let testCommunity;
  let testAllowlist;

  beforeEach(async () => {
    // Clear all collections
    await Promise.all([
      Allowlist.deleteMany({}),
      AllowlistParticipation.deleteMany({}),
      AllowlistWinner.deleteMany({}),
      AllowlistConfiguration.deleteMany({}),
      User.deleteMany({}),
      Community.deleteMany({})
    ]);

    // Create test user
    testUser = await User.create({
      walletAddresses: ['0x1234567890123456789012345678901234567890'],
      username: 'testuser',
      profileData: {
        displayName: 'Test User'
      }
    });

    // Create test community
    testCommunity = await Community.create({
      name: 'Test Community',
      description: 'A test community',
      creatorId: testUser._id,
      pointsSystemName: 'Test Points'
    });
  });

  describe('Allowlist Creation', () => {
    test('should create a basic allowlist successfully', async () => {
      const allowlistData = {
        title: 'Test Allowlist',
        description: 'A test allowlist for NFT project',
        communityId: testCommunity._id,
        entryPrice: {
          tokenType: 'points',
          amount: '0'
        },
        winnerCount: 10,
        duration: 24, // 24 hours
        socialTasks: []
      };

      const allowlist = await allowlistService.createAllowlist(testUser._id, allowlistData);

      expect(allowlist).toBeDefined();
      expect(allowlist.title).toBe(allowlistData.title);
      expect(allowlist.winnerCount).toBe(10);
      expect(allowlist.status).toBe('active');
      expect(allowlist.endTime).toBeInstanceOf(Date);
    });

    test('should create allowlist with profit guarantee', async () => {
      const allowlistData = {
        title: 'Paid Allowlist',
        description: 'A paid allowlist with profit guarantee',
        communityId: testCommunity._id,
        entryPrice: {
          tokenType: 'USDC',
          amount: '10'
        },
        winnerCount: 5,
        profitGuaranteePercentage: 20, // 20% profit guarantee
        duration: 48
      };

      const allowlist = await allowlistService.createAllowlist(testUser._id, allowlistData);

      expect(allowlist.profitGuaranteePercentage).toBe(20);
      expect(allowlist.entryPrice.amount).toBe('10');
      expect(allowlist.entryPrice.tokenType).toBe('USDC');
    });

    test('should enforce community limits', async () => {
      // Create 5 active allowlists (default limit)
      for (let i = 0; i < 5; i++) {
        await allowlistService.createAllowlist(testUser._id, {
          title: `Allowlist ${i + 1}`,
          description: 'Test allowlist',
          communityId: testCommunity._id,
          entryPrice: { tokenType: 'points', amount: '0' },
          winnerCount: 10,
          duration: 24
        });
      }

      // Attempt to create 6th allowlist should fail
      await expect(
        allowlistService.createAllowlist(testUser._id, {
          title: 'Sixth Allowlist',
          description: 'Should fail',
          communityId: testCommunity._id,
          entryPrice: { tokenType: 'points', amount: '0' },
          winnerCount: 10,
          duration: 24
        })
      ).rejects.toThrow('Community has reached maximum of 5 live allowlists');
    });

    test('should create allowlist with everyone wins', async () => {
      const allowlistData = {
        title: 'Everyone Wins Allowlist',
        description: 'Everyone who enters wins',
        communityId: testCommunity._id,
        entryPrice: { tokenType: 'points', amount: '0' },
        winnerCount: 'everyone',
        duration: 24
      };

      const allowlist = await allowlistService.createAllowlist(testUser._id, allowlistData);

      expect(allowlist.winnerCount).toBe('everyone');
    });
  });

  describe('Allowlist Entry', () => {
    beforeEach(async () => {
      testAllowlist = await allowlistService.createAllowlist(testUser._id, {
        title: 'Test Entry Allowlist',
        description: 'For testing entries',
        communityId: testCommunity._id,
        entryPrice: { tokenType: 'points', amount: '0' },
        winnerCount: 5,
        duration: 24,
        socialTasks: [
          {
            taskId: 'twitter_follow_1',
            taskType: 'twitter_follow',
            required: true,
            verificationData: {
              twitter: {
                username: 'testnft',
                action: 'follow'
              }
            }
          }
        ]
      });
    });

    test('should allow user to enter allowlist', async () => {
      const entryData = {
        walletAddress: '0x1234567890123456789012345678901234567890',
        socialData: {
          twitterHandle: '@testuser',
          email: 'test@example.com'
        },
        completedTasks: [
          {
            taskId: 'twitter_follow_1',
            completed: true,
            verifiedAt: new Date()
          }
        ]
      };

      const participation = await allowlistService.enterAllowlist(
        testAllowlist._id,
        testUser._id,
        entryData
      );

      expect(participation).toBeDefined();
      expect(participation.walletAddress).toBe(entryData.walletAddress.toLowerCase());
      expect(participation.paymentStatus).toBe('completed');
      expect(participation.socialData.twitterHandle).toBe('@testuser');
    });

    test('should prevent duplicate entries from same user', async () => {
      const entryData = {
        walletAddress: '0x1234567890123456789012345678901234567890',
        socialData: { twitterHandle: '@testuser' }
      };

      // First entry should succeed
      await allowlistService.enterAllowlist(testAllowlist._id, testUser._id, entryData);

      // Second entry should fail
      await expect(
        allowlistService.enterAllowlist(testAllowlist._id, testUser._id, entryData)
      ).rejects.toThrow('User has already entered this allowlist');
    });

    test('should prevent duplicate wallet addresses when not allowed', async () => {
      // Create another user
      const secondUser = await User.create({
        walletAddresses: ['0x2234567890123456789012345678901234567890'],
        username: 'testuser2'
      });

      const sameWallet = '0x1234567890123456789012345678901234567890';

      // First user enters
      await allowlistService.enterAllowlist(testAllowlist._id, testUser._id, {
        walletAddress: sameWallet,
        socialData: { twitterHandle: '@testuser1' }
      });

      // Second user with same wallet should fail
      await expect(
        allowlistService.enterAllowlist(testAllowlist._id, secondUser._id, {
          walletAddress: sameWallet,
          socialData: { twitterHandle: '@testuser2' }
        })
      ).rejects.toThrow('This wallet address has already entered the allowlist');
    });
  });

  describe('Allowlist Draw Execution', () => {
    let participants;

    beforeEach(async () => {
      // Create allowlist
      testAllowlist = await allowlistService.createAllowlist(testUser._id, {
        title: 'Draw Test Allowlist',
        description: 'For testing draws',
        communityId: testCommunity._id,
        entryPrice: { tokenType: 'USDC', amount: '5' },
        winnerCount: 3,
        profitGuaranteePercentage: 25,
        duration: 24
      });

      // Create multiple participants
      participants = [];
      for (let i = 0; i < 10; i++) {
        const user = await User.create({
          walletAddresses: [`0x${i.toString().padStart(40, '0')}`],
          username: `user${i}`
        });

        const participation = await allowlistService.enterAllowlist(
          testAllowlist._id,
          user._id,
          {
            walletAddress: `0x${i.toString().padStart(40, '0')}`,
            socialData: { twitterHandle: `@user${i}` }
          }
        );

        participants.push({ user, participation });
      }
    });

    test('should execute draw and select winners', async () => {
      const result = await allowlistService.executeAllowlistDraw(testAllowlist._id);

      expect(result).toBeDefined();
      expect(result.winners).toHaveLength(3);
      expect(result.totalEntries).toBe(10);
      expect(result.winnerCount).toBe(3);
      expect(['vrf', 'failsafe']).toContain(result.winnerSelectionMethod);

      // Check that winners were created
      const winners = await AllowlistWinner.find({ allowlistId: testAllowlist._id });
      expect(winners).toHaveLength(3);

      // Check that allowlist status was updated
      const updatedAllowlist = await Allowlist.findById(testAllowlist._id);
      expect(updatedAllowlist.status).toBe('completed');
      expect(updatedAllowlist.completedAt).toBeInstanceOf(Date);
    });

    test('should handle everyone wins scenario', async () => {
      // Update allowlist to everyone wins
      await Allowlist.findByIdAndUpdate(testAllowlist._id, {
        winnerCount: 'everyone'
      });

      const result = await allowlistService.executeAllowlistDraw(testAllowlist._id);

      expect(result.winners).toHaveLength(10); // All participants win
      expect(result.winnerCount).toBe(10);
    });

    test('should process profit guarantee correctly', async () => {
      const result = await allowlistService.executeAllowlistDraw(testAllowlist._id);

      // Check payout summary
      const updatedAllowlist = await Allowlist.findById(testAllowlist._id);
      expect(updatedAllowlist.payoutProcessed).toBe(true);
      expect(updatedAllowlist.payoutSummary).toBeDefined();

      const payoutSummary = updatedAllowlist.payoutSummary;
      
      // With 3 winners and 7 losers, 25% profit guarantee:
      // Winner sales: 3 * $5 = $15
      // Profit guarantee pool: $15 * 0.25 = $3.75
      // Profit per loser: $3.75 / 7 ≈ $0.536
      expect(parseFloat(payoutSummary.profitPerLoser.amount)).toBeCloseTo(0.536, 2);
    });
  });

  describe('Winner Data Export', () => {
    beforeEach(async () => {
      // Create and complete an allowlist with winners
      testAllowlist = await allowlistService.createAllowlist(testUser._id, {
        title: 'Export Test Allowlist',
        description: 'For testing exports',
        communityId: testCommunity._id,
        entryPrice: { tokenType: 'points', amount: '0' },
        winnerCount: 2,
        duration: 24
      });

      // Add participants
      for (let i = 0; i < 5; i++) {
        const user = await User.create({
          walletAddresses: [`0x${i.toString().padStart(40, '0')}`],
          username: `user${i}`
        });

        await allowlistService.enterAllowlist(testAllowlist._id, user._id, {
          walletAddress: `0x${i.toString().padStart(40, '0')}`,
          socialData: {
            twitterHandle: `@user${i}`,
            discordUsername: `user${i}#1234`,
            email: `user${i}@example.com`
          }
        });
      }

      // Execute draw
      await allowlistService.executeAllowlistDraw(testAllowlist._id);
    });

    test('should export winner data in JSON format', async () => {
      const exportData = await allowlistService.exportWinnerData(testAllowlist._id, 'json');

      expect(exportData).toBeDefined();
      expect(exportData.format).toBe('json');
      expect(Array.isArray(exportData.data)).toBe(true);
      expect(exportData.data).toHaveLength(2);

      const winner = exportData.data[0];
      expect(winner).toHaveProperty('walletAddress');
      expect(winner).toHaveProperty('winnerPosition');
      expect(winner).toHaveProperty('twitterHandle');
      expect(winner).toHaveProperty('discordUsername');
      expect(winner).toHaveProperty('email');
    });

    test('should export winner data in CSV format', async () => {
      const exportData = await allowlistService.exportWinnerData(testAllowlist._id, 'csv');

      expect(exportData).toBeDefined();
      expect(exportData.format).toBe('csv');
      expect(typeof exportData.data).toBe('string');
      expect(exportData.data).toContain('walletAddress,winnerPosition,twitterHandle');
      expect(exportData.data.split('\n')).toHaveLength(4); // Header + 2 winners + empty line
    });
  });

  describe('Community Limits and Admin Controls', () => {
    test('should check community allowlist limits', async () => {
      const limits = await allowlistService.getCommunityAllowlistLimits(testCommunity._id);

      expect(limits).toBeDefined();
      expect(limits.canCreate).toBe(true);
      expect(limits.currentCount).toBe(0);
      expect(limits.maxAllowed).toBe(5);
    });

    test('should update platform fee percentage', async () => {
      const newFeePercentage = 7.5;
      const configuration = await allowlistService.updatePlatformFeePercentage(
        newFeePercentage,
        testUser._id
      );

      expect(configuration.platformFeePercentage).toBe(newFeePercentage);
      expect(configuration.updatedBy.toString()).toBe(testUser._id.toString());
    });

    test('should disable allowlist restrictions for community', async () => {
      const configuration = await allowlistService.disableAllowlistRestrictions(
        testCommunity._id,
        testUser._id
      );

      const settings = configuration.getEffectiveSettings(testCommunity._id);
      expect(settings.restrictionsDisabled).toBe(true);
    });
  });

  describe('Profit Guarantee Calculations', () => {
    test('should calculate profit guarantee correctly', async () => {
      const allowlist = new Allowlist({
        title: 'Test',
        description: 'Test',
        creatorId: testUser._id,
        entryPrice: { tokenType: 'USDC', amount: '10' },
        winnerCount: 5,
        profitGuaranteePercentage: 30,
        duration: 24,
        endTime: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      // Test calculation: 5 winners * $10 = $50 winner sales
      // 30% profit guarantee = $15 total
      // With 10 losers: $15 / 10 = $1.50 per loser
      const profitPerLoser = allowlist.calculateProfitGuarantee(5, 10);
      expect(parseFloat(profitPerLoser)).toBe(1.5);
    });

    test('should return zero profit guarantee when percentage is zero', async () => {
      const allowlist = new Allowlist({
        title: 'Test',
        description: 'Test',
        creatorId: testUser._id,
        entryPrice: { tokenType: 'USDC', amount: '10' },
        winnerCount: 5,
        profitGuaranteePercentage: 0, // No profit guarantee
        duration: 24,
        endTime: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      const profitPerLoser = allowlist.calculateProfitGuarantee(5, 10);
      expect(parseFloat(profitPerLoser)).toBe(0);
    });
  });

  describe('Social Task Integration', () => {
    test('should validate required social tasks completion', async () => {
      const participation = new AllowlistParticipation({
        allowlistId: testAllowlist._id,
        userId: testUser._id,
        walletAddress: '0x1234567890123456789012345678901234567890',
        taskCompletionStatus: [
          { taskId: 'twitter_follow', completed: true },
          { taskId: 'discord_join', completed: false }
        ]
      });

      const requiredTasks = ['twitter_follow', 'discord_join'];
      const allCompleted = participation.areRequiredTasksCompleted(requiredTasks);
      expect(allCompleted).toBe(false);

      const partialRequired = ['twitter_follow'];
      const partialCompleted = participation.areRequiredTasksCompleted(partialRequired);
      expect(partialCompleted).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid winner count', async () => {
      await expect(
        allowlistService.createAllowlist(testUser._id, {
          title: 'Invalid Allowlist',
          description: 'Invalid winner count',
          communityId: testCommunity._id,
          entryPrice: { tokenType: 'points', amount: '0' },
          winnerCount: 0, // Invalid
          duration: 24
        })
      ).rejects.toThrow();
    });

    test('should handle expired allowlist entry attempts', async () => {
      // Create expired allowlist
      const expiredAllowlist = await Allowlist.create({
        title: 'Expired Allowlist',
        description: 'Already expired',
        creatorId: testUser._id,
        communityId: testCommunity._id,
        entryPrice: { tokenType: 'points', amount: '0' },
        winnerCount: 5,
        duration: 1,
        endTime: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        status: 'active'
      });

      await expect(
        allowlistService.enterAllowlist(expiredAllowlist._id, testUser._id, {
          walletAddress: '0x1234567890123456789012345678901234567890',
          socialData: {}
        })
      ).rejects.toThrow('Allowlist is no longer active');
    });

    test('should handle draw execution on non-existent allowlist', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      await expect(
        allowlistService.executeAllowlistDraw(fakeId)
      ).rejects.toThrow('Allowlist not found');
    });
  });
});

module.exports = {
  testSuite: 'Allowlist System',
  description: 'Comprehensive tests for enhanced allowlist raffle functionality with profit guarantee system'
};