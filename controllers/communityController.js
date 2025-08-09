const communityManagementService = require('../services/communityManagementService');
const communityPointsService = require('../services/communityPointsService');
const Community = require('../models/community/community');

class CommunityController {
  // Create new community
  async createCommunity(req, res) {
    try {
      const creatorId = req.user.id;
      const communityData = req.body;

      // Validate required fields
      if (!communityData.name || !communityData.pointsConfiguration?.pointsName) {
        return res.status(400).json({
          success: false,
          message: 'Community name and points name are required'
        });
      }

      const community = await communityManagementService.createCommunity(creatorId, communityData);

      res.status(201).json({
        success: true,
        message: 'Community created successfully',
        data: community
      });
    } catch (error) {
      console.error('Error creating community:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create community',
        error: error.message
      });
    }
  }

  // Get community details
  async getCommunity(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user?.id;

      const community = await Community.findById(communityId);
      if (!community) {
        return res.status(404).json({
          success: false,
          message: 'Community not found'
        });
      }

      // Check if user can view this community
      if (!await communityManagementService.canUserViewCommunity(userId, communityId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this community'
        });
      }

      res.json({
        success: true,
        data: community
      });
    } catch (error) {
      console.error('Error getting community:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get community',
        error: error.message
      });
    }
  }

  // Update community
  async updateCommunity(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;
      const updates = req.body;

      const community = await communityManagementService.updateCommunity(
        communityId, 
        userId, 
        updates
      );

      res.json({
        success: true,
        message: 'Community updated successfully',
        data: community
      });
    } catch (error) {
      console.error('Error updating community:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update community',
        error: error.message
      });
    }
  }

  // Join community
  async joinCommunity(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;
      const { userWallets, userDiscordRoles } = req.body;

      const membership = await communityManagementService.joinCommunity(
        userId, 
        communityId,
        userWallets,
        userDiscordRoles
      );

      res.json({
        success: true,
        message: 'Successfully joined community',
        data: membership
      });
    } catch (error) {
      console.error('Error joining community:', error);
      const statusCode = error.message.includes('Access denied') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to join community',
        error: error.message
      });
    }
  }

  // Leave community
  async leaveCommunity(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;

      await communityManagementService.leaveCommunity(userId, communityId);

      res.json({
        success: true,
        message: 'Successfully left community'
      });
    } catch (error) {
      console.error('Error leaving community:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to leave community',
        error: error.message
      });
    }
  }

  // Get user's communities
  async getUserCommunities(req, res) {
    try {
      const userId = req.user.id;
      const communities = await communityManagementService.getUserCommunities(userId);

      res.json({
        success: true,
        data: communities
      });
    } catch (error) {
      console.error('Error getting user communities:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user communities',
        error: error.message
      });
    }
  }

  // Get community members
  async getCommunityMembers(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;
      const options = {
        limit: parseInt(req.query.limit) || 50,
        skip: parseInt(req.query.skip) || 0,
        role: req.query.role
      };

      const members = await communityManagementService.getCommunityMembers(
        communityId, 
        userId, 
        options
      );

      res.json({
        success: true,
        data: members
      });
    } catch (error) {
      console.error('Error getting community members:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get community members',
        error: error.message
      });
    }
  }

  // Update member role
  async updateMemberRole(req, res) {
    try {
      const { communityId, userId: targetUserId } = req.params;
      const { role } = req.body;
      const adminUserId = req.user.id;

      if (!role || !['member', 'moderator', 'admin'].includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Valid role is required'
        });
      }

      const membership = await communityManagementService.updateMemberRole(
        communityId,
        targetUserId,
        role,
        adminUserId
      );

      res.json({
        success: true,
        message: 'Member role updated successfully',
        data: membership
      });
    } catch (error) {
      console.error('Error updating member role:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update member role',
        error: error.message
      });
    }
  }

  // Award points in community
  async awardCommunityPoints(req, res) {
    try {
      const { communityId } = req.params;
      const { userId, activity, metadata } = req.body;

      if (!userId || !activity) {
        return res.status(400).json({
          success: false,
          message: 'User ID and activity are required'
        });
      }

      const result = await communityPointsService.awardCommunityPoints(
        userId,
        communityId,
        activity,
        metadata
      );

      res.json({
        success: true,
        message: 'Points awarded successfully',
        data: result
      });
    } catch (error) {
      console.error('Error awarding community points:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to award points',
        error: error.message
      });
    }
  }

  // Deduct points in community
  async deductCommunityPoints(req, res) {
    try {
      const { communityId } = req.params;
      const { userId, amount, reason } = req.body;
      const adminId = req.user.id;

      if (!userId || !amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid user ID and amount are required'
        });
      }

      const result = await communityPointsService.deductCommunityPoints(
        userId,
        communityId,
        amount,
        reason,
        adminId
      );

      res.json({
        success: true,
        message: 'Points deducted successfully',
        data: result
      });
    } catch (error) {
      console.error('Error deducting community points:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to deduct points',
        error: error.message
      });
    }
  }

  // Get user's points in community
  async getUserCommunityPoints(req, res) {
    try {
      const { communityId, userId } = req.params;
      const requesterId = req.user.id;

      // Users can only view their own points unless they're community admin
      if (userId !== requesterId) {
        const canManage = await communityManagementService.canUserManageCommunity(
          requesterId, 
          communityId
        );
        if (!canManage) {
          return res.status(403).json({
            success: false,
            message: 'Access denied'
          });
        }
      }

      const pointsInfo = await communityPointsService.getUserCommunityPointsInfo(
        userId,
        communityId
      );

      res.json({
        success: true,
        data: pointsInfo
      });
    } catch (error) {
      console.error('Error getting user community points:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user points',
        error: error.message
      });
    }
  }

  // Get user's points across all communities
  async getUserAllCommunityPoints(req, res) {
    try {
      const userId = req.user.id;
      const pointsSummary = await communityPointsService.getUserAllCommunityPoints(userId);

      res.json({
        success: true,
        data: pointsSummary
      });
    } catch (error) {
      console.error('Error getting user all community points:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user points',
        error: error.message
      });
    }
  }

  // Get community leaderboard
  async getCommunityLeaderboard(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;
      const limit = parseInt(req.query.limit) || 100;

      // Check if user can view community
      if (!await communityManagementService.canUserViewCommunity(userId, communityId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this community'
        });
      }

      const leaderboard = await communityPointsService.getCommunityLeaderboard(
        communityId,
        limit
      );

      res.json({
        success: true,
        data: leaderboard
      });
    } catch (error) {
      console.error('Error getting community leaderboard:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get leaderboard',
        error: error.message
      });
    }
  }

  // Get community analytics
  async getCommunityAnalytics(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;
      const timeframe = req.query.timeframe || '30d';

      const analytics = await communityManagementService.getCommunityAnalytics(
        communityId,
        userId,
        timeframe
      );

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Error getting community analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get analytics',
        error: error.message
      });
    }
  }

  // Browse public communities
  async browseCommunities(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const query = { 
        isActive: true,
        'accessRequirements.isPublic': true
      };

      if (req.query.search) {
        query.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { description: { $regex: req.query.search, $options: 'i' } }
        ];
      }

      const communities = await Community.find(query)
        .sort({ 'stats.memberCount': -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('creatorId', 'username');

      const total = await Community.countDocuments(query);

      res.json({
        success: true,
        data: {
          communities,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error browsing communities:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to browse communities',
        error: error.message
      });
    }
  }

  // Get community access requirements
  async getCommunityAccessRequirements(req, res) {
    try {
      const { communityId } = req.params;
      
      const requirements = await communityManagementService.getCommunityAccessRequirements(communityId);

      res.json({
        success: true,
        data: requirements
      });
    } catch (error) {
      console.error('Error getting community access requirements:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get access requirements',
        error: error.message
      });
    }
  }

  // Update community access requirements
  async updateCommunityAccessRequirements(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;
      const accessRequirements = req.body;

      const community = await communityManagementService.updateCommunityAccessRequirements(
        communityId,
        userId,
        accessRequirements
      );

      res.json({
        success: true,
        message: 'Access requirements updated successfully',
        data: community.accessRequirements
      });
    } catch (error) {
      console.error('Error updating community access requirements:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update access requirements',
        error: error.message
      });
    }
  }

  // Admin: Get all communities (Naffles admin only)
  async adminGetAllCommunities(req, res) {
    try {
      const userId = req.user.id;
      const options = {
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        isActive: req.query.isActive,
        isNafflesCommunity: req.query.isNafflesCommunity
      };

      const result = await communityManagementService.getAllCommunities(userId, options);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error getting all communities:', error);
      const statusCode = error.message.includes('Insufficient permissions') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to get communities',
        error: error.message
      });
    }
  }

  // Admin: Get cross-community analytics (Naffles admin only)
  async adminGetCrossCommunityAnalytics(req, res) {
    try {
      const userId = req.user.id;
      const timeframe = req.query.timeframe || '30d';

      const analytics = await communityManagementService.getCrossCommunityAnalytics(userId, timeframe);

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Error getting cross-community analytics:', error);
      const statusCode = error.message.includes('Insufficient permissions') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to get analytics',
        error: error.message
      });
    }
  }

  // Admin: Manage any community (Naffles admin only)
  async adminManageCommunity(req, res) {
    try {
      const { communityId } = req.params;
      const { action } = req.body;
      const adminUserId = req.user.id;
      const data = req.body.data || {};

      const result = await communityManagementService.adminManageCommunity(
        adminUserId,
        communityId,
        action,
        data
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error in admin community management:', error);
      const statusCode = error.message.includes('Insufficient permissions') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to manage community',
        error: error.message
      });
    }
  }
}

module.exports = new CommunityController();