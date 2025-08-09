const allowlistService = require('../../services/allowlistService');
const AllowlistConfiguration = require('../../models/allowlist/allowlistConfiguration');
const Allowlist = require('../../models/allowlist/allowlist');
const AllowlistParticipation = require('../../models/allowlist/allowlistParticipation');
const Community = require('../../models/community/community');

class AllowlistAdminController {
  /**
   * Get allowlist configuration
   */
  async getConfiguration(req, res) {
    try {
      const configuration = await AllowlistConfiguration.getConfiguration();
      
      res.json({
        success: true,
        data: configuration
      });
    } catch (error) {
      console.error('Error getting allowlist configuration:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get allowlist configuration'
      });
    }
  }
  
  /**
   * Update platform fee percentage
   */
  async updatePlatformFee(req, res) {
    try {
      const adminUserId = req.user.id;
      const { platformFeePercentage } = req.body;
      
      if (typeof platformFeePercentage !== 'number' || platformFeePercentage < 0 || platformFeePercentage > 50) {
        return res.status(400).json({
          success: false,
          message: 'Platform fee percentage must be a number between 0 and 50'
        });
      }
      
      const configuration = await allowlistService.updatePlatformFeePercentage(platformFeePercentage, adminUserId);
      
      res.json({
        success: true,
        message: 'Platform fee percentage updated successfully',
        data: {
          platformFeePercentage: configuration.platformFeePercentage,
          lastUpdated: configuration.lastUpdated
        }
      });
    } catch (error) {
      console.error('Error updating platform fee:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update platform fee percentage'
      });
    }
  }
  
  /**
   * Update global allowlist settings
   */
  async updateGlobalSettings(req, res) {
    try {
      const adminUserId = req.user.id;
      const { 
        globallyEnabled, 
        maxAllowlistsPerCommunity, 
        requiresApproval, 
        minimumCommunityAge 
      } = req.body;
      
      const configuration = await AllowlistConfiguration.getConfiguration();
      
      if (typeof globallyEnabled === 'boolean') {
        configuration.globallyEnabled = globallyEnabled;
      }
      
      if (typeof maxAllowlistsPerCommunity === 'number' && maxAllowlistsPerCommunity >= 1 && maxAllowlistsPerCommunity <= 50) {
        configuration.maxAllowlistsPerCommunity = maxAllowlistsPerCommunity;
      }
      
      if (typeof requiresApproval === 'boolean') {
        configuration.requiresApproval = requiresApproval;
      }
      
      if (typeof minimumCommunityAge === 'number' && minimumCommunityAge >= 0) {
        configuration.minimumCommunityAge = minimumCommunityAge;
      }
      
      configuration.lastUpdated = new Date();
      configuration.updatedBy = adminUserId;
      
      await configuration.save();
      
      res.json({
        success: true,
        message: 'Global allowlist settings updated successfully',
        data: configuration
      });
    } catch (error) {
      console.error('Error updating global settings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update global settings'
      });
    }
  }
  
  /**
   * Disable allowlist restrictions for a community
   */
  async disableRestrictionsForCommunity(req, res) {
    try {
      const adminUserId = req.user.id;
      const { communityId } = req.params;
      
      // Verify community exists
      const community = await Community.findById(communityId);
      if (!community) {
        return res.status(404).json({
          success: false,
          message: 'Community not found'
        });
      }
      
      const configuration = await allowlistService.disableAllowlistRestrictions(communityId, adminUserId);
      
      res.json({
        success: true,
        message: `Allowlist restrictions disabled for community "${community.name}"`,
        data: {
          communityId,
          communityName: community.name,
          restrictionsDisabled: true
        }
      });
    } catch (error) {
      console.error('Error disabling restrictions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to disable allowlist restrictions'
      });
    }
  }
  
  /**
   * Enable allowlist restrictions for a community
   */
  async enableRestrictionsForCommunity(req, res) {
    try {
      const adminUserId = req.user.id;
      const { communityId } = req.params;
      
      // Verify community exists
      const community = await Community.findById(communityId);
      if (!community) {
        return res.status(404).json({
          success: false,
          message: 'Community not found'
        });
      }
      
      const configuration = await AllowlistConfiguration.getConfiguration();
      
      // Remove or update the community override
      const overrideIndex = configuration.communityOverrides.findIndex(
        o => o.communityId.toString() === communityId.toString()
      );
      
      if (overrideIndex !== -1) {
        configuration.communityOverrides[overrideIndex].restrictionsDisabled = false;
        configuration.communityOverrides[overrideIndex].updatedBy = adminUserId;
        configuration.communityOverrides[overrideIndex].updatedAt = new Date();
      }
      
      configuration.lastUpdated = new Date();
      configuration.updatedBy = adminUserId;
      
      await configuration.save();
      
      res.json({
        success: true,
        message: `Allowlist restrictions enabled for community "${community.name}"`,
        data: {
          communityId,
          communityName: community.name,
          restrictionsDisabled: false
        }
      });
    } catch (error) {
      console.error('Error enabling restrictions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to enable allowlist restrictions'
      });
    }
  }
  
  /**
   * Get community allowlist statistics
   */
  async getCommunityAllowlistStats(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      
      // Get communities with their allowlist counts
      const communities = await Community.find({})
        .select('name description createdAt')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
      
      const communityStats = await Promise.all(communities.map(async (community) => {
        const liveAllowlists = await Allowlist.countDocuments({
          communityId: community._id,
          status: 'active',
          endTime: { $gt: new Date() }
        });
        
        const totalAllowlists = await Allowlist.countDocuments({
          communityId: community._id
        });
        
        const totalParticipants = await AllowlistParticipation.countDocuments({
          allowlistId: { $in: await Allowlist.find({ communityId: community._id }).distinct('_id') }
        });
        
        const configuration = await AllowlistConfiguration.getConfiguration();
        const settings = configuration.getEffectiveSettings(community._id);
        
        return {
          communityId: community._id,
          communityName: community.name,
          liveAllowlists,
          totalAllowlists,
          totalParticipants,
          maxAllowed: settings.maxAllowlists,
          restrictionsEnabled: settings.enabled,
          restrictionsDisabled: settings.restrictionsDisabled,
          createdAt: community.createdAt
        };
      }));
      
      const total = await Community.countDocuments();
      
      res.json({
        success: true,
        data: {
          communities: communityStats,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error getting community allowlist stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get community allowlist statistics'
      });
    }
  }
  
  /**
   * Get platform allowlist analytics
   */
  async getPlatformAnalytics(req, res) {
    try {
      const { timeRange = '30d' } = req.query;
      
      // Calculate date range
      let startDate;
      switch (timeRange) {
        case '7d':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }
      
      // Get analytics data
      const [
        totalAllowlists,
        activeAllowlists,
        completedAllowlists,
        totalParticipants,
        totalWinners,
        recentAllowlists
      ] = await Promise.all([
        Allowlist.countDocuments({ createdAt: { $gte: startDate } }),
        Allowlist.countDocuments({ 
          status: 'active', 
          endTime: { $gt: new Date() },
          createdAt: { $gte: startDate }
        }),
        Allowlist.countDocuments({ 
          status: 'completed',
          createdAt: { $gte: startDate }
        }),
        AllowlistParticipation.countDocuments({
          createdAt: { $gte: startDate }
        }),
        AllowlistParticipation.countDocuments({
          isWinner: true,
          createdAt: { $gte: startDate }
        }),
        Allowlist.find({ createdAt: { $gte: startDate } })
          .populate('creatorId', 'username')
          .populate('communityId', 'name')
          .sort({ createdAt: -1 })
          .limit(10)
      ]);
      
      // Calculate platform revenue (simplified)
      const configuration = await AllowlistConfiguration.getConfiguration();
      const platformFeePercentage = configuration.platformFeePercentage;
      
      res.json({
        success: true,
        data: {
          timeRange,
          summary: {
            totalAllowlists,
            activeAllowlists,
            completedAllowlists,
            totalParticipants,
            totalWinners,
            platformFeePercentage
          },
          recentAllowlists,
          configuration: {
            globallyEnabled: configuration.globallyEnabled,
            maxAllowlistsPerCommunity: configuration.maxAllowlistsPerCommunity,
            requiresApproval: configuration.requiresApproval,
            platformFeePercentage: configuration.platformFeePercentage
          }
        }
      });
    } catch (error) {
      console.error('Error getting platform analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get platform analytics'
      });
    }
  }
  
  /**
   * Restrict community from creating allowlists
   */
  async restrictCommunity(req, res) {
    try {
      const adminUserId = req.user.id;
      const { communityId } = req.params;
      const { reason } = req.body;
      
      // Verify community exists
      const community = await Community.findById(communityId);
      if (!community) {
        return res.status(404).json({
          success: false,
          message: 'Community not found'
        });
      }
      
      const configuration = await AllowlistConfiguration.getConfiguration();
      
      // Check if already restricted
      const existingRestriction = configuration.restrictedCommunities.find(
        r => r.communityId.toString() === communityId.toString()
      );
      
      if (existingRestriction) {
        return res.status(400).json({
          success: false,
          message: 'Community is already restricted'
        });
      }
      
      // Add restriction
      configuration.restrictedCommunities.push({
        communityId,
        reason: reason || 'Administrative restriction',
        restrictedAt: new Date(),
        restrictedBy: adminUserId
      });
      
      configuration.lastUpdated = new Date();
      configuration.updatedBy = adminUserId;
      
      await configuration.save();
      
      res.json({
        success: true,
        message: `Community "${community.name}" has been restricted from creating allowlists`,
        data: {
          communityId,
          communityName: community.name,
          reason: reason || 'Administrative restriction'
        }
      });
    } catch (error) {
      console.error('Error restricting community:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to restrict community'
      });
    }
  }
  
  /**
   * Remove restriction from community
   */
  async unrestrictCommunity(req, res) {
    try {
      const adminUserId = req.user.id;
      const { communityId } = req.params;
      
      // Verify community exists
      const community = await Community.findById(communityId);
      if (!community) {
        return res.status(404).json({
          success: false,
          message: 'Community not found'
        });
      }
      
      const configuration = await AllowlistConfiguration.getConfiguration();
      
      // Remove restriction
      configuration.restrictedCommunities = configuration.restrictedCommunities.filter(
        r => r.communityId.toString() !== communityId.toString()
      );
      
      configuration.lastUpdated = new Date();
      configuration.updatedBy = adminUserId;
      
      await configuration.save();
      
      res.json({
        success: true,
        message: `Restriction removed from community "${community.name}"`,
        data: {
          communityId,
          communityName: community.name
        }
      });
    } catch (error) {
      console.error('Error unrestricting community:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove community restriction'
      });
    }
  }
}

module.exports = new AllowlistAdminController();