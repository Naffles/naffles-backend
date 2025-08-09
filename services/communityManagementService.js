const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const CommunityAchievement = require('../models/points/communityAchievement');
const CommunityPointsBalance = require('../models/points/communityPointsBalance');
const CommunityPointsTransaction = require('../models/points/communityPointsTransaction');
const communityAccessService = require('./communityAccessService');

class CommunityManagementService {
  // Create new community
  async createCommunity(creatorId, communityData) {
    try {
      // Generate unique slug
      const baseSlug = communityData.name.toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      
      let slug = baseSlug;
      let counter = 1;
      
      while (await Community.findOne({ slug })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      const community = new Community({
        ...communityData,
        slug,
        creatorId,
        isNafflesCommunity: false // User communities are never Naffles communities
      });

      await community.save();

      // Add creator as community member with creator role
      const creatorMembership = new CommunityMember({
        userId: creatorId,
        communityId: community._id,
        role: 'creator',
        permissions: {
          canManagePoints: true,
          canManageAchievements: true,
          canManageMembers: true,
          canModerateContent: true,
          canViewAnalytics: true
        }
      });

      await creatorMembership.save();

      // Create default achievements for the community
      await CommunityAchievement.createDefaultAchievements(community._id);

      // Initialize creator's points balance
      await CommunityPointsBalance.initializeUserPoints(creatorId, community._id);

      return community;
    } catch (error) {
      console.error('Error creating community:', error);
      throw error;
    }
  }

  // Update community settings
  async updateCommunity(communityId, userId, updates) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      // Check permissions
      if (!await this.canUserManageCommunity(userId, communityId)) {
        throw new Error('Insufficient permissions to manage this community');
      }

      // Prevent changing critical fields
      const allowedUpdates = [
        'name', 'description', 'pointsConfiguration', 'features', 
        'accessRequirements', 'branding'
      ];
      
      const filteredUpdates = {};
      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      });

      // Prevent enabling Naffles-exclusive features
      if (filteredUpdates.features && !community.isNafflesCommunity) {
        filteredUpdates.features.enableJackpot = false;
        filteredUpdates.features.enableSystemWideEarning = false;
      }

      Object.assign(community, filteredUpdates);
      await community.save();

      return community;
    } catch (error) {
      console.error('Error updating community:', error);
      throw error;
    }
  }

  // Join community
  async joinCommunity(userId, communityId, userWallets = {}, userDiscordRoles = {}) {
    try {
      const community = await Community.findById(communityId);
      if (!community || !community.isActive) {
        throw new Error('Community not found or inactive');
      }

      // Check if user is already a member
      const existingMembership = await CommunityMember.findOne({ userId, communityId });
      if (existingMembership) {
        if (existingMembership.isActive) {
          throw new Error('User is already a member of this community');
        } else {
          // Reactivate membership - still need to check access requirements
          const accessValidation = await communityAccessService.validateCommunityAccess(
            userId, 
            communityId, 
            userWallets, 
            userDiscordRoles
          );

          if (!accessValidation.hasAccess) {
            throw new Error(`Access denied: ${accessValidation.reason}`);
          }

          existingMembership.isActive = true;
          existingMembership.joinedAt = new Date();
          await existingMembership.save();
          return existingMembership;
        }
      }

      // Validate access requirements
      const accessValidation = await communityAccessService.validateCommunityAccess(
        userId, 
        communityId, 
        userWallets, 
        userDiscordRoles
      );

      if (!accessValidation.hasAccess) {
        throw new Error(`Access denied: ${accessValidation.reason}`);
      }

      // Create membership
      const membership = new CommunityMember({
        userId,
        communityId,
        role: 'member'
      });

      await membership.save();

      // Initialize user's points balance
      await CommunityPointsBalance.initializeUserPoints(userId, communityId);

      // Update community member count
      community.stats.memberCount += 1;
      await community.save();

      return membership;
    } catch (error) {
      console.error('Error joining community:', error);
      throw error;
    }
  }

  // Leave community
  async leaveCommunity(userId, communityId) {
    try {
      const membership = await CommunityMember.findOne({ userId, communityId, isActive: true });
      if (!membership) {
        throw new Error('User is not a member of this community');
      }

      // Prevent creator from leaving their own community
      if (membership.role === 'creator') {
        throw new Error('Community creator cannot leave their own community');
      }

      membership.isActive = false;
      await membership.save();

      // Update community member count
      const community = await Community.findById(communityId);
      if (community) {
        community.stats.memberCount = Math.max(0, community.stats.memberCount - 1);
        await community.save();
      }

      return { success: true };
    } catch (error) {
      console.error('Error leaving community:', error);
      throw error;
    }
  }

  // Get user's communities
  async getUserCommunities(userId) {
    try {
      const memberships = await CommunityMember.getUserCommunities(userId);
      return memberships.map(membership => ({
        community: membership.communityId,
        role: membership.role,
        joinedAt: membership.joinedAt,
        permissions: membership.permissions
      }));
    } catch (error) {
      console.error('Error getting user communities:', error);
      throw error;
    }
  }

  // Get community members
  async getCommunityMembers(communityId, userId, options = {}) {
    try {
      // Check if user can view members
      if (!await this.canUserViewCommunity(userId, communityId)) {
        throw new Error('Insufficient permissions to view community members');
      }

      return await CommunityMember.getCommunityMembers(communityId, options);
    } catch (error) {
      console.error('Error getting community members:', error);
      throw error;
    }
  }

  // Update member role/permissions
  async updateMemberRole(communityId, targetUserId, newRole, adminUserId) {
    try {
      // Check admin permissions
      if (!await this.canUserManageCommunity(adminUserId, communityId)) {
        throw new Error('Insufficient permissions to manage community members');
      }

      const membership = await CommunityMember.findOne({ 
        userId: targetUserId, 
        communityId, 
        isActive: true 
      });
      
      if (!membership) {
        throw new Error('User is not a member of this community');
      }

      // Prevent changing creator role
      if (membership.role === 'creator') {
        throw new Error('Cannot change creator role');
      }

      membership.role = newRole;
      
      // Set permissions based on role
      switch (newRole) {
        case 'admin':
          membership.permissions = {
            canManagePoints: true,
            canManageAchievements: true,
            canManageMembers: true,
            canModerateContent: true,
            canViewAnalytics: true
          };
          break;
        case 'moderator':
          membership.permissions = {
            canManagePoints: false,
            canManageAchievements: false,
            canManageMembers: false,
            canModerateContent: true,
            canViewAnalytics: true
          };
          break;
        default:
          membership.permissions = {
            canManagePoints: false,
            canManageAchievements: false,
            canManageMembers: false,
            canModerateContent: false,
            canViewAnalytics: false
          };
      }

      await membership.save();
      return membership;
    } catch (error) {
      console.error('Error updating member role:', error);
      throw error;
    }
  }

  // Get community analytics
  async getCommunityAnalytics(communityId, userId, timeframe = '30d') {
    try {
      // Check permissions
      if (!await this.canUserViewCommunityAnalytics(userId, communityId)) {
        throw new Error('Insufficient permissions to view community analytics');
      }

      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      // Get transaction analytics
      const transactionAnalytics = await CommunityPointsTransaction.getCommunityAnalytics(
        communityId, 
        timeframe
      );

      // Get member statistics
      const memberStats = await CommunityMember.aggregate([
        { $match: { communityId: community._id, isActive: true } },
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get points distribution
      const pointsDistribution = await CommunityPointsBalance.aggregate([
        { $match: { communityId: community._id } },
        {
          $group: {
            _id: '$tier',
            count: { $sum: 1 },
            totalPoints: { $sum: '$balance' },
            avgPoints: { $avg: '$balance' }
          }
        }
      ]);

      return {
        community: {
          name: community.name,
          memberCount: community.stats.memberCount,
          totalPointsIssued: community.stats.totalPointsIssued,
          totalActivities: community.stats.totalActivities
        },
        transactions: transactionAnalytics,
        members: memberStats,
        pointsDistribution
      };
    } catch (error) {
      console.error('Error getting community analytics:', error);
      throw error;
    }
  }

  // Permission checking methods
  async canUserManageCommunity(userId, communityId) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        return false;
      }

      // Check if user is Naffles admin (can manage any community)
      // This would integrate with user role system
      const userRole = await this.getUserRole(userId);
      if (userRole === 'naffles_admin' || userRole === 'super_admin') {
        return true;
      }

      // Check if user is community creator or admin
      const membership = await CommunityMember.findOne({ 
        userId, 
        communityId, 
        isActive: true 
      });
      
      return membership && (membership.role === 'creator' || membership.role === 'admin');
    } catch (error) {
      console.error('Error checking community management permissions:', error);
      return false;
    }
  }

  async canUserViewCommunity(userId, communityId) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        return false;
      }

      // Public communities can be viewed by anyone
      if (community.accessRequirements.isPublic) {
        return true;
      }

      // Check membership for private communities
      const membership = await CommunityMember.findOne({ 
        userId, 
        communityId, 
        isActive: true 
      });
      
      return !!membership;
    } catch (error) {
      console.error('Error checking community view permissions:', error);
      return false;
    }
  }

  async canUserViewCommunityAnalytics(userId, communityId) {
    try {
      const membership = await CommunityMember.findOne({ 
        userId, 
        communityId, 
        isActive: true 
      });
      
      if (!membership) {
        // Check if user is Naffles admin
        const userRole = await this.getUserRole(userId);
        return userRole === 'naffles_admin' || userRole === 'super_admin';
      }

      return membership.hasPermission('canViewAnalytics');
    } catch (error) {
      console.error('Error checking analytics permissions:', error);
      return false;
    }
  }

  // Get all communities (Naffles admin only)
  async getAllCommunities(userId, options = {}) {
    try {
      // Check if user is Naffles admin
      const userRole = await this.getUserRole(userId);
      if (userRole !== 'naffles_admin' && userRole !== 'super_admin') {
        throw new Error('Insufficient permissions - Naffles admin access required');
      }

      const page = parseInt(options.page) || 1;
      const limit = parseInt(options.limit) || 20;
      const skip = (page - 1) * limit;

      const query = {};
      
      if (options.search) {
        query.$or = [
          { name: { $regex: options.search, $options: 'i' } },
          { description: { $regex: options.search, $options: 'i' } }
        ];
      }

      if (options.isActive !== undefined) {
        query.isActive = options.isActive;
      }

      if (options.isNafflesCommunity !== undefined) {
        query.isNafflesCommunity = options.isNafflesCommunity;
      }

      const communities = await Community.find(query)
        .populate('creatorId', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Community.countDocuments(query);

      return {
        communities,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error getting all communities:', error);
      throw error;
    }
  }

  // Get cross-community analytics (Naffles admin only)
  async getCrossCommunityAnalytics(userId, timeframe = '30d') {
    try {
      // Check if user is Naffles admin
      const userRole = await this.getUserRole(userId);
      if (userRole !== 'naffles_admin' && userRole !== 'super_admin') {
        throw new Error('Insufficient permissions - Naffles admin access required');
      }

      // Get overall platform statistics
      const totalCommunities = await Community.countDocuments({ isActive: true });
      const totalMembers = await CommunityMember.countDocuments({ isActive: true });
      
      // Get community distribution
      const communityStats = await Community.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: '$isNafflesCommunity',
            count: { $sum: 1 },
            totalMembers: { $sum: '$stats.memberCount' },
            totalPointsIssued: { $sum: '$stats.totalPointsIssued' }
          }
        }
      ]);

      // Get top communities by member count
      const topCommunities = await Community.find({ isActive: true })
        .sort({ 'stats.memberCount': -1 })
        .limit(10)
        .select('name stats.memberCount stats.totalPointsIssued createdAt');

      // Get recent community activity
      const recentActivity = await CommunityPointsTransaction.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(Date.now() - this.getTimeframeMs(timeframe))
            }
          }
        },
        {
          $group: {
            _id: {
              communityId: '$communityId',
              activity: '$activity'
            },
            count: { $sum: 1 },
            totalPoints: { $sum: '$amount' }
          }
        },
        {
          $lookup: {
            from: 'communities',
            localField: '_id.communityId',
            foreignField: '_id',
            as: 'community'
          }
        },
        { $unwind: '$community' },
        {
          $group: {
            _id: '$_id.communityId',
            communityName: { $first: '$community.name' },
            activities: {
              $push: {
                activity: '$_id.activity',
                count: '$count',
                totalPoints: '$totalPoints'
              }
            },
            totalTransactions: { $sum: '$count' },
            totalPointsAwarded: { $sum: '$totalPoints' }
          }
        },
        { $sort: { totalTransactions: -1 } },
        { $limit: 20 }
      ]);

      return {
        overview: {
          totalCommunities,
          totalMembers,
          communityDistribution: communityStats
        },
        topCommunities,
        recentActivity,
        timeframe
      };
    } catch (error) {
      console.error('Error getting cross-community analytics:', error);
      throw error;
    }
  }

  // Manage any community (Naffles admin only)
  async adminManageCommunity(adminUserId, communityId, action, data = {}) {
    try {
      // Check if user is Naffles admin
      const userRole = await this.getUserRole(adminUserId);
      if (userRole !== 'naffles_admin' && userRole !== 'super_admin') {
        throw new Error('Insufficient permissions - Naffles admin access required');
      }

      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      switch (action) {
        case 'activate':
          community.isActive = true;
          await community.save();
          return { success: true, message: 'Community activated' };

        case 'deactivate':
          community.isActive = false;
          await community.save();
          return { success: true, message: 'Community deactivated' };

        case 'update_settings':
          // Allow admin to update any community settings
          const allowedUpdates = [
            'name', 'description', 'pointsConfiguration', 'features', 
            'accessRequirements', 'branding'
          ];
          
          const filteredUpdates = {};
          allowedUpdates.forEach(field => {
            if (data[field] !== undefined) {
              filteredUpdates[field] = data[field];
            }
          });

          Object.assign(community, filteredUpdates);
          await community.save();
          return { success: true, message: 'Community updated', data: community };

        case 'transfer_ownership':
          if (!data.newOwnerId) {
            throw new Error('New owner ID is required');
          }
          
          // Update creator
          community.creatorId = data.newOwnerId;
          await community.save();

          // Update membership roles
          await CommunityMember.updateMany(
            { communityId, role: 'creator' },
            { role: 'admin' }
          );

          const newOwnerMembership = await CommunityMember.findOne({
            userId: data.newOwnerId,
            communityId
          });

          if (newOwnerMembership) {
            newOwnerMembership.role = 'creator';
            await newOwnerMembership.save();
          } else {
            // Create membership for new owner
            await new CommunityMember({
              userId: data.newOwnerId,
              communityId,
              role: 'creator',
              permissions: {
                canManagePoints: true,
                canManageAchievements: true,
                canManageMembers: true,
                canModerateContent: true,
                canViewAnalytics: true
              }
            }).save();
          }

          return { success: true, message: 'Ownership transferred' };

        default:
          throw new Error('Invalid admin action');
      }
    } catch (error) {
      console.error('Error in admin community management:', error);
      throw error;
    }
  }

  // Get community access requirements
  async getCommunityAccessRequirements(communityId) {
    return await communityAccessService.getCommunityAccessRequirements(communityId);
  }

  // Update community access requirements
  async updateCommunityAccessRequirements(communityId, userId, accessRequirements) {
    return await communityAccessService.updateCommunityAccessRequirements(
      communityId, 
      userId, 
      accessRequirements
    );
  }

  // Helper method to convert timeframe to milliseconds
  getTimeframeMs(timeframe) {
    const timeframes = {
      '1d': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    };
    return timeframes[timeframe] || timeframes['30d'];
  }

  // Helper method to get user role (would integrate with existing user system)
  async getUserRole(userId) {
    // This would integrate with the existing user role system
    // For now, return 'user' as default
    // TODO: Integrate with actual user role system
    return 'user';
  }
}

module.exports = new CommunityManagementService();