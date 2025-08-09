const allowlistService = require('../services/allowlistService');
const socialTasksService = require('../services/socialTasksService');
const Allowlist = require('../models/allowlist/allowlist');
const AllowlistParticipation = require('../models/allowlist/allowlistParticipation');
const AllowlistWinner = require('../models/allowlist/allowlistWinner');
const AllowlistConfiguration = require('../models/allowlist/allowlistConfiguration');

class AllowlistController {
  /**
   * Create a new allowlist
   */
  async createAllowlist(req, res) {
    try {
      const userId = req.user.id;
      const allowlistData = req.body;
      
      // Validate required fields
      if (!allowlistData.title || !allowlistData.description || !allowlistData.winnerCount || !allowlistData.duration) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: title, description, winnerCount, duration'
        });
      }
      
      // Validate winner count
      if (allowlistData.winnerCount !== 'everyone' && 
          (typeof allowlistData.winnerCount !== 'number' || 
           allowlistData.winnerCount < 1 || 
           allowlistData.winnerCount > 100000)) {
        return res.status(400).json({
          success: false,
          message: 'Winner count must be "everyone" or a number between 1 and 100,000'
        });
      }
      
      // Set default entry price if not provided
      if (!allowlistData.entryPrice) {
        allowlistData.entryPrice = {
          tokenType: 'points',
          amount: '0'
        };
      }
      
      const allowlist = await allowlistService.createAllowlist(userId, allowlistData);
      
      res.status(201).json({
        success: true,
        message: 'Allowlist created successfully',
        data: allowlist
      });
    } catch (error) {
      console.error('Error creating allowlist:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create allowlist'
      });
    }
  }
  
  /**
   * Get allowlist details
   */
  async getAllowlist(req, res) {
    try {
      const { allowlistId } = req.params;
      
      const allowlist = await Allowlist.findById(allowlistId)
        .populate('creatorId', 'username profileData')
        .populate('communityId', 'name description');
      
      if (!allowlist) {
        return res.status(404).json({
          success: false,
          message: 'Allowlist not found'
        });
      }
      
      // Get participation statistics
      const stats = await AllowlistParticipation.getParticipationStats(allowlistId);
      
      res.json({
        success: true,
        data: {
          ...allowlist.toObject(),
          statistics: stats
        }
      });
    } catch (error) {
      console.error('Error getting allowlist:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get allowlist details'
      });
    }
  }
  
  /**
   * Get allowlists for a community
   */
  async getCommunityAllowlists(req, res) {
    try {
      const { communityId } = req.params;
      const { status = 'active', page = 1, limit = 20 } = req.query;
      
      const query = { communityId };
      if (status !== 'all') {
        query.status = status;
      }
      
      const allowlists = await Allowlist.find(query)
        .populate('creatorId', 'username profileData')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
      
      const total = await Allowlist.countDocuments(query);
      
      res.json({
        success: true,
        data: {
          allowlists,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error getting community allowlists:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get community allowlists'
      });
    }
  }
  
  /**
   * Enter an allowlist
   */
  async enterAllowlist(req, res) {
    try {
      const userId = req.user.id;
      const { allowlistId } = req.params;
      const entryData = req.body;
      
      // Validate required fields
      if (!entryData.walletAddress) {
        return res.status(400).json({
          success: false,
          message: 'Wallet address is required'
        });
      }
      
      const participation = await allowlistService.enterAllowlist(allowlistId, userId, entryData);
      
      res.status(201).json({
        success: true,
        message: 'Successfully entered allowlist',
        data: participation
      });
    } catch (error) {
      console.error('Error entering allowlist:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to enter allowlist'
      });
    }
  }
  
  /**
   * Get user's allowlist participation
   */
  async getUserParticipation(req, res) {
    try {
      const userId = req.user.id;
      const { allowlistId } = req.params;
      
      const participation = await AllowlistParticipation.findOne({
        allowlistId,
        userId
      }).populate('allowlistId', 'title status endTime');
      
      if (!participation) {
        return res.status(404).json({
          success: false,
          message: 'No participation found for this allowlist'
        });
      }
      
      res.json({
        success: true,
        data: participation
      });
    } catch (error) {
      console.error('Error getting user participation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get participation details'
      });
    }
  }
  
  /**
   * Execute allowlist draw (creator only)
   */
  async executeAllowlistDraw(req, res) {
    try {
      const userId = req.user.id;
      const { allowlistId } = req.params;
      
      // Verify user is the creator
      const allowlist = await Allowlist.findById(allowlistId);
      if (!allowlist) {
        return res.status(404).json({
          success: false,
          message: 'Allowlist not found'
        });
      }
      
      if (allowlist.creatorId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Only the allowlist creator can execute the draw'
        });
      }
      
      if (allowlist.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Allowlist is not active'
        });
      }
      
      const result = await allowlistService.executeAllowlistDraw(allowlistId);
      
      res.json({
        success: true,
        message: 'Allowlist draw executed successfully',
        data: result
      });
    } catch (error) {
      console.error('Error executing allowlist draw:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to execute allowlist draw'
      });
    }
  }
  
  /**
   * Get allowlist results
   */
  async getAllowlistResults(req, res) {
    try {
      const { allowlistId } = req.params;
      
      const allowlist = await Allowlist.findById(allowlistId);
      if (!allowlist) {
        return res.status(404).json({
          success: false,
          message: 'Allowlist not found'
        });
      }
      
      if (allowlist.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Allowlist has not been completed yet'
        });
      }
      
      const winners = await AllowlistWinner.find({ allowlistId })
        .populate('userId', 'username profileData')
        .sort({ winnerPosition: 1 });
      
      const stats = await AllowlistParticipation.getParticipationStats(allowlistId);
      
      res.json({
        success: true,
        data: {
          allowlist,
          winners,
          statistics: stats,
          payoutSummary: allowlist.payoutSummary
        }
      });
    } catch (error) {
      console.error('Error getting allowlist results:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get allowlist results'
      });
    }
  }
  
  /**
   * Export winner data (creator only)
   */
  async exportWinnerData(req, res) {
    try {
      const userId = req.user.id;
      const { allowlistId } = req.params;
      const { format = 'json' } = req.query;
      
      // Verify user is the creator
      const allowlist = await Allowlist.findById(allowlistId);
      if (!allowlist) {
        return res.status(404).json({
          success: false,
          message: 'Allowlist not found'
        });
      }
      
      if (allowlist.creatorId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Only the allowlist creator can export winner data'
        });
      }
      
      const exportData = await allowlistService.exportWinnerData(allowlistId, format);
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="allowlist-${allowlistId}-winners.csv"`);
        res.send(exportData.data);
      } else {
        res.json({
          success: true,
          data: exportData
        });
      }
    } catch (error) {
      console.error('Error exporting winner data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export winner data'
      });
    }
  }
  
  /**
   * Get community allowlist limits
   */
  async getCommunityLimits(req, res) {
    try {
      const { communityId } = req.params;
      
      const limits = await allowlistService.getCommunityAllowlistLimits(communityId);
      
      res.json({
        success: true,
        data: limits
      });
    } catch (error) {
      console.error('Error getting community limits:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get community limits'
      });
    }
  }
  
  /**
   * Claim winner status (winner only)
   */
  async claimWinner(req, res) {
    try {
      const userId = req.user.id;
      const { allowlistId } = req.params;
      
      const winner = await AllowlistWinner.findOne({
        allowlistId,
        userId,
        claimStatus: 'pending'
      });
      
      if (!winner) {
        return res.status(404).json({
          success: false,
          message: 'No pending winner claim found'
        });
      }
      
      if (winner.isClaimExpired()) {
        await AllowlistWinner.findByIdAndUpdate(winner._id, {
          claimStatus: 'expired'
        });
        
        return res.status(400).json({
          success: false,
          message: 'Winner claim has expired'
        });
      }
      
      await AllowlistWinner.findByIdAndUpdate(winner._id, {
        claimStatus: 'claimed',
        claimedAt: new Date()
      });
      
      // Mark action item as completed if it exists
      if (winner.actionItemId) {
        await ActionItem.findByIdAndUpdate(winner.actionItemId, {
          completed: true,
          completedAt: new Date()
        });
      }
      
      res.json({
        success: true,
        message: 'Winner status claimed successfully',
        data: {
          winnerPosition: winner.winnerPosition,
          claimedAt: new Date()
        }
      });
    } catch (error) {
      console.error('Error claiming winner status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to claim winner status'
      });
    }
  }
  
  /**
   * Get user's allowlist history
   */
  async getUserAllowlistHistory(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, status = 'all' } = req.query;
      
      const query = { userId };
      if (status !== 'all') {
        // This would need to be adjusted based on how we want to filter
        // For now, we'll get all participations
      }
      
      const participations = await AllowlistParticipation.find(query)
        .populate('allowlistId', 'title status endTime completedAt')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
      
      const total = await AllowlistParticipation.countDocuments(query);
      
      res.json({
        success: true,
        data: {
          participations,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error getting user allowlist history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get allowlist history'
      });
    }
  }
}

module.exports = new AllowlistController();