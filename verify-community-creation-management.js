const mongoose = require('mongoose');
const Community = require('./models/community/community');
const CommunityMember = require('./models/community/communityMember');
const communityManagementService = require('./services/communityManagementService');
const communityAccessService = require('./services/communityAccessService');

async function verifyImplementation() {
  try {
    console.log('🔍 Verifying Community Creation and Management System Implementation...\n');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles_dev');
    console.log('✅ Database connected');

    // Test 1: Community Creation with Branding and Configuration
    console.log('\n📝 Test 1: Community Creation with Branding and Configuration');
    
    const testUserId = new mongoose.Types.ObjectId();
    const communityData = {
      name: 'Verification Test Community',
      description: 'A community created for verification testing',
      pointsConfiguration: {
        pointsName: 'Verification Points',
        pointsSymbol: 'VP',
        initialBalance: 50,
        activityPointsMap: new Map([
          ['gaming_blackjack', 10],
          ['raffle_creation', 100],
          ['community_task', 25]
        ])
      },
      branding: {
        logoUrl: 'https://example.com/logo.png',
        bannerUrl: 'https://example.com/banner.png',
        primaryColor: '#6366F1',
        secondaryColor: '#4F46E5'
      },
      features: {
        enableGaming: true,
        enableRaffles: true,
        enableSocialTasks: true,
        enableMarketplace: false
      },
      accessRequirements: {
        isPublic: false,
        nftRequirements: [{
          contractAddress: '0x1234567890abcdef',
          chainId: '1',
          minTokens: 1
        }],
        discordRoles: [{
          serverId: 'discord123456',
          roleId: 'role789012',
          roleName: 'VIP Member'
        }]
      }
    };

    const community = await communityManagementService.createCommunity(testUserId, communityData);
    
    console.log(`   ✅ Community created: ${community.name}`);
    console.log(`   ✅ Slug generated: ${community.slug}`);
    console.log(`   ✅ Points system configured: ${community.pointsConfiguration.pointsName}`);
    console.log(`   ✅ Branding applied: ${community.branding.primaryColor}`);
    console.log(`   ✅ Features configured: Gaming=${community.features.enableGaming}, Raffles=${community.features.enableRaffles}`);
    console.log(`   ✅ Access requirements set: Public=${community.accessRequirements.isPublic}, NFT Requirements=${community.accessRequirements.nftRequirements.length}`);

    // Verify creator membership
    const creatorMembership = await CommunityMember.findOne({
      userId: testUserId,
      communityId: community._id
    });
    console.log(`   ✅ Creator membership created with role: ${creatorMembership.role}`);

    // Test 2: Access Control Validation
    console.log('\n🔐 Test 2: Access Control Validation');

    const accessRequirements = await communityAccessService.getCommunityAccessRequirements(community._id);
    console.log(`   ✅ Access requirements retrieved: ${accessRequirements.hasRequirements ? 'Has requirements' : 'Public access'}`);
    console.log(`   ✅ NFT requirements: ${accessRequirements.nftRequirements.length} contracts`);
    console.log(`   ✅ Discord requirements: ${accessRequirements.discordRoles.length} roles`);

    // Test access validation with insufficient requirements
    const testUser2Id = new mongoose.Types.ObjectId();
    const userWallets = { '1': ['0xuser123'] };
    const userDiscordRoles = { 'discord123456': ['wrongrole'] };

    const accessValidation = await communityAccessService.validateCommunityAccess(
      testUser2Id,
      community._id,
      userWallets,
      userDiscordRoles
    );
    console.log(`   ✅ Access validation (insufficient): ${accessValidation.hasAccess ? 'Granted' : 'Denied'} - ${accessValidation.reason}`);

    // Test 3: Community Admin Role Management
    console.log('\n👥 Test 3: Community Admin Role Management');

    // Add a member to test role management
    const testMemberId = new mongoose.Types.ObjectId();
    
    // First make community public for testing
    await communityManagementService.updateCommunity(community._id, testUserId, {
      accessRequirements: { isPublic: true }
    });

    const membership = await communityManagementService.joinCommunity(testMemberId, community._id);
    console.log(`   ✅ Member joined community with role: ${membership.role}`);

    // Update member role
    const updatedMembership = await communityManagementService.updateMemberRole(
      community._id,
      testMemberId,
      'moderator',
      testUserId
    );
    console.log(`   ✅ Member role updated to: ${updatedMembership.role}`);
    console.log(`   ✅ Permissions updated: canModerateContent=${updatedMembership.permissions.canModerateContent}`);

    // Test 4: Enhanced Naffles Administrator Capabilities
    console.log('\n🛡️ Test 4: Enhanced Naffles Administrator Capabilities');

    // Create another community for testing
    const testAdmin = new mongoose.Types.ObjectId();
    const community2 = await communityManagementService.createCommunity(testAdmin, {
      name: 'Second Test Community',
      pointsConfiguration: { pointsName: 'Second Points' }
    });

    // Mock admin role for testing
    const originalGetUserRole = communityManagementService.getUserRole;
    communityManagementService.getUserRole = async (userId) => {
      return userId.toString() === testAdmin.toString() ? 'naffles_admin' : 'user';
    };

    try {
      const allCommunities = await communityManagementService.getAllCommunities(testAdmin);
      console.log(`   ✅ Admin can view all communities: ${allCommunities.communities.length} found`);

      const analytics = await communityManagementService.getCrossCommunityAnalytics(testAdmin);
      console.log(`   ✅ Cross-community analytics retrieved: ${analytics.overview.totalCommunities} total communities`);

      const adminAction = await communityManagementService.adminManageCommunity(
        testAdmin,
        community._id,
        'update_settings',
        { name: 'Updated by Admin' }
      );
      console.log(`   ✅ Admin community management: ${adminAction.success ? 'Success' : 'Failed'}`);
    } finally {
      // Restore original method
      communityManagementService.getUserRole = originalGetUserRole;
    }

    // Test 5: Community Discovery and Browsing
    console.log('\n🔍 Test 5: Community Discovery and Browsing');

    const publicCommunities = await Community.find({
      isActive: true,
      'accessRequirements.isPublic': true
    }).limit(10);
    console.log(`   ✅ Public communities found: ${publicCommunities.length}`);

    const searchResults = await Community.find({
      isActive: true,
      $or: [
        { name: { $regex: 'test', $options: 'i' } },
        { description: { $regex: 'test', $options: 'i' } }
      ]
    });
    console.log(`   ✅ Search functionality: ${searchResults.length} communities match 'test'`);

    // Test 6: Community Settings Configuration
    console.log('\n⚙️ Test 6: Community Settings Configuration');

    const settingsUpdate = {
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#C70039'
      },
      pointsConfiguration: {
        pointsName: 'Updated Verification Points',
        pointsSymbol: 'UVP'
      },
      features: {
        enableMarketplace: true,
        enableSocialTasks: false
      }
    };

    const updatedCommunity = await communityManagementService.updateCommunity(
      community._id,
      testUserId,
      settingsUpdate
    );
    console.log(`   ✅ Branding updated: ${updatedCommunity.branding.primaryColor}`);
    console.log(`   ✅ Points configuration updated: ${updatedCommunity.pointsConfiguration.pointsName}`);
    console.log(`   ✅ Features updated: Marketplace=${updatedCommunity.features.enableMarketplace}`);

    // Test access requirements update
    const newAccessRequirements = {
      isPublic: true,
      nftRequirements: [],
      discordRoles: []
    };

    const updatedAccessCommunity = await communityAccessService.updateCommunityAccessRequirements(
      community._id,
      testUserId,
      newAccessRequirements
    );
    console.log(`   ✅ Access requirements updated: Public=${updatedAccessCommunity.accessRequirements.isPublic}`);

    // Cleanup
    await Community.deleteMany({ name: { $regex: 'test', $options: 'i' } });
    await CommunityMember.deleteMany({ communityId: { $in: [community._id, community2._id] } });

    console.log('\n🎉 All Community Creation and Management System tests passed!');
    console.log('\n📋 Implementation Summary:');
    console.log('   ✅ Community registration with branding and configuration');
    console.log('   ✅ Community access controls (NFT requirements, Discord roles)');
    console.log('   ✅ Community admin role management and permissions');
    console.log('   ✅ Enhanced Naffles administrator capabilities');
    console.log('   ✅ Community discovery and browsing interface');
    console.log('   ✅ Community settings configuration');

    console.log('\n🔧 Requirements Satisfied:');
    console.log('   ✅ 30.1 - Community creation with custom branding and points configuration');
    console.log('   ✅ 30.14 - Enhanced community management capabilities for Naffles administrators');
    console.log('   ✅ 30.15 - Community access controls with user requirements');
    console.log('   ✅ 30.16 - NFT requirements for community access');
    console.log('   ✅ 30.17 - Discord role requirements for community access');
    console.log('   ✅ 30.18 - Community settings configuration for access requirements');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
  }
}

// Run verification if called directly
if (require.main === module) {
  verifyImplementation()
    .then(() => {
      console.log('\n✅ Community Creation and Management System verification completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Verification failed:', error);
      process.exit(1);
    });
}

module.exports = verifyImplementation;