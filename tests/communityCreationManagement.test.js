const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index'); // Assuming main app file
const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const CommunityPointsBalance = require('../models/points/communityPointsBalance');
const communityManagementService = require('../services/communityManagementService');
const communityAccessService = require('../services/communityAccessService');

describe('Community Creation and Management System', () => {
  let testUser, testAdmin, testCommunity, authToken, adminToken;

  beforeAll(async () => {
    // Setup test database connection
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/naffles_test');
    }
  });

  beforeEach(async () => {
    // Clean up test data
    await Community.deleteMany({});
    await CommunityMember.deleteMany({});
    await CommunityPointsBalance.deleteMany({});

    // Create test users
    testUser = {
      id: new mongoose.Types.ObjectId(),
      username: 'testuser',
      email: 'test@example.com',
      walletAddresses: ['0x123...']
    };

    testAdmin = {
      id: new mongoose.Types.ObjectId(),
      username: 'testadmin',
      email: 'admin@example.com',
      role: 'naffles_admin'
    };

    // Mock auth tokens (in real implementation, these would be JWT tokens)
    authToken = 'mock-auth-token';
    adminToken = 'mock-admin-token';
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Community Creation', () => {
    test('should create a new community with branding and configuration', async () => {
      const communityData = {
        name: 'Test Community',
        description: 'A test community for unit testing',
        pointsConfiguration: {
          pointsName: 'Test Points',
          pointsSymbol: 'TP',
          initialBalance: 100
        },
        branding: {
          primaryColor: '#FF5733',
          secondaryColor: '#C70039',
          logoUrl: 'https://example.com/logo.png'
        },
        features: {
          enableGaming: true,
          enableRaffles: true,
          enableSocialTasks: true
        }
      };

      const community = await communityManagementService.createCommunity(
        testUser.id,
        communityData
      );

      expect(community).toBeDefined();
      expect(community.name).toBe('Test Community');
      expect(community.slug).toBe('test-community');
      expect(community.creatorId.toString()).toBe(testUser.id.toString());
      expect(community.pointsConfiguration.pointsName).toBe('Test Points');
      expect(community.branding.primaryColor).toBe('#FF5733');
      expect(community.isNafflesCommunity).toBe(false);

      // Verify creator membership was created
      const membership = await CommunityMember.findOne({
        userId: testUser.id,
        communityId: community._id
      });
      expect(membership).toBeDefined();
      expect(membership.role).toBe('creator');
      expect(membership.permissions.canManagePoints).toBe(true);
    });

    test('should generate unique slug for communities with similar names', async () => {
      const communityData1 = {
        name: 'Test Community',
        pointsConfiguration: { pointsName: 'Points 1' }
      };

      const communityData2 = {
        name: 'Test Community',
        pointsConfiguration: { pointsName: 'Points 2' }
      };

      const community1 = await communityManagementService.createCommunity(
        testUser.id,
        communityData1
      );

      const community2 = await communityManagementService.createCommunity(
        testAdmin.id,
        communityData2
      );

      expect(community1.slug).toBe('test-community');
      expect(community2.slug).toBe('test-community-1');
    });

    test('should prevent enabling Naffles-exclusive features in user communities', async () => {
      const communityData = {
        name: 'User Community',
        pointsConfiguration: { pointsName: 'User Points' },
        features: {
          enableJackpot: true, // Should be forced to false
          enableSystemWideEarning: true // Should be forced to false
        }
      };

      const community = await communityManagementService.createCommunity(
        testUser.id,
        communityData
      );

      expect(community.features.enableJackpot).toBe(false);
      expect(community.features.enableSystemWideEarning).toBe(false);
    });
  });

  describe('Access Control System', () => {
    beforeEach(async () => {
      testCommunity = await communityManagementService.createCommunity(testUser.id, {
        name: 'Access Test Community',
        pointsConfiguration: { pointsName: 'Access Points' },
        accessRequirements: {
          isPublic: false,
          nftRequirements: [{
            contractAddress: '0xabc123',
            chainId: '1',
            minTokens: 1
          }],
          discordRoles: [{
            serverId: 'discord123',
            roleId: 'role456',
            roleName: 'VIP Member'
          }]
        }
      });
    });

    test('should validate NFT requirements for community access', async () => {
      const userWallets = {
        '1': ['0xuser123'] // Ethereum mainnet wallet
      };

      // Mock NFT ownership check to return 0 tokens
      jest.spyOn(communityAccessService, 'checkNFTOwnership').mockResolvedValue(0);

      const validation = await communityAccessService.validateCommunityAccess(
        testUser.id,
        testCommunity._id,
        userWallets
      );

      expect(validation.hasAccess).toBe(false);
      expect(validation.reason).toBe('NFT requirements not met');
    });

    test('should validate Discord role requirements for community access', async () => {
      const userDiscordRoles = {
        'discord123': ['role789'] // Different role than required
      };

      const validation = await communityAccessService.validateCommunityAccess(
        testUser.id,
        testCommunity._id,
        {},
        userDiscordRoles
      );

      expect(validation.hasAccess).toBe(false);
      expect(validation.reason).toBe('Discord role requirements not met');
    });

    test('should allow access when all requirements are met', async () => {
      const userWallets = { '1': ['0xuser123'] };
      const userDiscordRoles = { 'discord123': ['role456'] };

      // Mock NFT ownership check to return 1 token
      jest.spyOn(communityAccessService, 'checkNFTOwnership').mockResolvedValue(1);

      const validation = await communityAccessService.validateCommunityAccess(
        testUser.id,
        testCommunity._id,
        userWallets,
        userDiscordRoles
      );

      expect(validation.hasAccess).toBe(true);
      expect(validation.reason).toBe('All requirements met');
    });

    test('should update community access requirements', async () => {
      const newRequirements = {
        isPublic: true,
        nftRequirements: [],
        discordRoles: []
      };

      const updatedCommunity = await communityAccessService.updateCommunityAccessRequirements(
        testCommunity._id,
        testUser.id,
        newRequirements
      );

      expect(updatedCommunity.accessRequirements.isPublic).toBe(true);
      expect(updatedCommunity.accessRequirements.nftRequirements).toHaveLength(0);
      expect(updatedCommunity.accessRequirements.discordRoles).toHaveLength(0);
    });
  });

  describe('Community Admin Role Management', () => {
    beforeEach(async () => {
      testCommunity = await communityManagementService.createCommunity(testUser.id, {
        name: 'Admin Test Community',
        pointsConfiguration: { pointsName: 'Admin Points' }
      });

      // Add a regular member
      await communityManagementService.joinCommunity(testAdmin.id, testCommunity._id);
    });

    test('should update member role and permissions', async () => {
      const updatedMembership = await communityManagementService.updateMemberRole(
        testCommunity._id,
        testAdmin.id,
        'admin',
        testUser.id
      );

      expect(updatedMembership.role).toBe('admin');
      expect(updatedMembership.permissions.canManagePoints).toBe(true);
      expect(updatedMembership.permissions.canManageMembers).toBe(true);
    });

    test('should prevent non-admin from updating member roles', async () => {
      const regularUser = new mongoose.Types.ObjectId();
      
      await expect(
        communityManagementService.updateMemberRole(
          testCommunity._id,
          testAdmin.id,
          'admin',
          regularUser
        )
      ).rejects.toThrow('Insufficient permissions');
    });

    test('should prevent changing creator role', async () => {
      await expect(
        communityManagementService.updateMemberRole(
          testCommunity._id,
          testUser.id, // Creator
          'admin',
          testAdmin.id
        )
      ).rejects.toThrow('Cannot change creator role');
    });
  });

  describe('Enhanced Naffles Administrator Capabilities', () => {
    test('should allow Naffles admin to view all communities', async () => {
      // Create multiple communities
      await communityManagementService.createCommunity(testUser.id, {
        name: 'Community 1',
        pointsConfiguration: { pointsName: 'Points 1' }
      });

      await communityManagementService.createCommunity(testAdmin.id, {
        name: 'Community 2',
        pointsConfiguration: { pointsName: 'Points 2' }
      });

      // Mock admin role
      jest.spyOn(communityManagementService, 'getUserRole').mockResolvedValue('naffles_admin');

      const result = await communityManagementService.getAllCommunities(testAdmin.id);

      expect(result.communities).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    test('should allow Naffles admin to get cross-community analytics', async () => {
      // Mock admin role
      jest.spyOn(communityManagementService, 'getUserRole').mockResolvedValue('naffles_admin');

      const analytics = await communityManagementService.getCrossCommunityAnalytics(testAdmin.id);

      expect(analytics).toHaveProperty('overview');
      expect(analytics).toHaveProperty('topCommunities');
      expect(analytics).toHaveProperty('recentActivity');
    });

    test('should allow Naffles admin to manage any community', async () => {
      const community = await communityManagementService.createCommunity(testUser.id, {
        name: 'Test Community',
        pointsConfiguration: { pointsName: 'Test Points' }
      });

      // Mock admin role
      jest.spyOn(communityManagementService, 'getUserRole').mockResolvedValue('naffles_admin');

      const result = await communityManagementService.adminManageCommunity(
        testAdmin.id,
        community._id,
        'deactivate'
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Community deactivated');

      const updatedCommunity = await Community.findById(community._id);
      expect(updatedCommunity.isActive).toBe(false);
    });

    test('should prevent regular users from accessing admin functions', async () => {
      // Mock regular user role
      jest.spyOn(communityManagementService, 'getUserRole').mockResolvedValue('user');

      await expect(
        communityManagementService.getAllCommunities(testUser.id)
      ).rejects.toThrow('Insufficient permissions - Naffles admin access required');

      await expect(
        communityManagementService.getCrossCommunityAnalytics(testUser.id)
      ).rejects.toThrow('Insufficient permissions - Naffles admin access required');
    });
  });

  describe('Community Discovery and Browsing', () => {
    beforeEach(async () => {
      // Create public communities
      await communityManagementService.createCommunity(testUser.id, {
        name: 'Public Gaming Community',
        description: 'A community for gaming enthusiasts',
        pointsConfiguration: { pointsName: 'Gaming Points' },
        accessRequirements: { isPublic: true }
      });

      await communityManagementService.createCommunity(testAdmin.id, {
        name: 'Public Art Community',
        description: 'A community for digital artists',
        pointsConfiguration: { pointsName: 'Art Points' },
        accessRequirements: { isPublic: true }
      });

      // Create private community
      await communityManagementService.createCommunity(testUser.id, {
        name: 'Private VIP Community',
        description: 'Exclusive VIP community',
        pointsConfiguration: { pointsName: 'VIP Points' },
        accessRequirements: { isPublic: false }
      });
    });

    test('should browse public communities only', async () => {
      const publicCommunities = await Community.find({
        isActive: true,
        'accessRequirements.isPublic': true
      });

      expect(publicCommunities).toHaveLength(2);
      expect(publicCommunities.map(c => c.name)).toContain('Public Gaming Community');
      expect(publicCommunities.map(c => c.name)).toContain('Public Art Community');
      expect(publicCommunities.map(c => c.name)).not.toContain('Private VIP Community');
    });

    test('should search communities by name and description', async () => {
      const searchResults = await Community.find({
        isActive: true,
        'accessRequirements.isPublic': true,
        $or: [
          { name: { $regex: 'gaming', $options: 'i' } },
          { description: { $regex: 'gaming', $options: 'i' } }
        ]
      });

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].name).toBe('Public Gaming Community');
    });
  });

  describe('Community Settings Configuration', () => {
    test('should update community branding settings', async () => {
      const community = await communityManagementService.createCommunity(testUser.id, {
        name: 'Branding Test Community',
        pointsConfiguration: { pointsName: 'Brand Points' }
      });

      const brandingUpdates = {
        branding: {
          logoUrl: 'https://example.com/new-logo.png',
          bannerUrl: 'https://example.com/banner.png',
          primaryColor: '#00FF00',
          secondaryColor: '#0000FF'
        }
      };

      const updatedCommunity = await communityManagementService.updateCommunity(
        community._id,
        testUser.id,
        brandingUpdates
      );

      expect(updatedCommunity.branding.logoUrl).toBe('https://example.com/new-logo.png');
      expect(updatedCommunity.branding.primaryColor).toBe('#00FF00');
    });

    test('should update points configuration', async () => {
      const community = await communityManagementService.createCommunity(testUser.id, {
        name: 'Points Test Community',
        pointsConfiguration: { pointsName: 'Original Points' }
      });

      const pointsUpdates = {
        pointsConfiguration: {
          pointsName: 'Updated Points',
          pointsSymbol: 'UP',
          activityPointsMap: new Map([
            ['gaming_blackjack', 10],
            ['raffle_creation', 100]
          ])
        }
      };

      const updatedCommunity = await communityManagementService.updateCommunity(
        community._id,
        testUser.id,
        pointsUpdates
      );

      expect(updatedCommunity.pointsConfiguration.pointsName).toBe('Updated Points');
      expect(updatedCommunity.pointsConfiguration.pointsSymbol).toBe('UP');
    });

    test('should update feature toggles', async () => {
      const community = await communityManagementService.createCommunity(testUser.id, {
        name: 'Features Test Community',
        pointsConfiguration: { pointsName: 'Feature Points' }
      });

      const featureUpdates = {
        features: {
          enableGaming: false,
          enableRaffles: true,
          enableMarketplace: true,
          enableSocialTasks: false
        }
      };

      const updatedCommunity = await communityManagementService.updateCommunity(
        community._id,
        testUser.id,
        featureUpdates
      );

      expect(updatedCommunity.features.enableGaming).toBe(false);
      expect(updatedCommunity.features.enableMarketplace).toBe(true);
      expect(updatedCommunity.features.enableSocialTasks).toBe(false);
    });
  });
});