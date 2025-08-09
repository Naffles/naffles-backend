const PartnerToken = require('../../models/points/partnerToken');

class PartnerTokensController {
  // Get all partner tokens
  async getAllPartnerTokens(req, res) {
    try {
      const filters = {};
      
      if (req.query.isActive !== undefined) {
        filters.isActive = req.query.isActive === 'true';
      }
      
      if (req.query.chainId) {
        filters.chainId = req.query.chainId;
      }

      const partnerTokens = await PartnerToken.find(filters)
        .sort({ 'partnerInfo.name': 1, symbol: 1 });

      res.json({
        success: true,
        data: partnerTokens
      });
    } catch (error) {
      console.error('Error getting partner tokens:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get partner tokens',
        error: error.message
      });
    }
  }

  // Get active partner tokens
  async getActivePartnerTokens(req, res) {
    try {
      const activeTokens = await PartnerToken.getActiveTokens();

      res.json({
        success: true,
        data: activeTokens
      });
    } catch (error) {
      console.error('Error getting active partner tokens:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get active partner tokens',
        error: error.message
      });
    }
  }

  // Create new partner token
  async createPartnerToken(req, res) {
    try {
      const tokenData = req.body;
      
      // Validate required fields
      const requiredFields = ['name', 'symbol', 'contractAddress', 'chainId', 'multiplier', 'partnerInfo'];
      for (const field of requiredFields) {
        if (!tokenData[field]) {
          return res.status(400).json({
            success: false,
            message: `${field} is required`
          });
        }
      }

      // Validate partner info
      if (!tokenData.partnerInfo.name) {
        return res.status(400).json({
          success: false,
          message: 'Partner name is required'
        });
      }

      // Check for duplicate contract address on same chain
      const existing = await PartnerToken.findOne({
        contractAddress: tokenData.contractAddress.toLowerCase(),
        chainId: tokenData.chainId
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Partner token already exists for this contract address and chain'
        });
      }

      // Normalize contract address
      tokenData.contractAddress = tokenData.contractAddress.toLowerCase();

      const partnerToken = new PartnerToken(tokenData);
      await partnerToken.save();

      res.status(201).json({
        success: true,
        message: 'Partner token created successfully',
        data: partnerToken
      });
    } catch (error) {
      console.error('Error creating partner token:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create partner token',
        error: error.message
      });
    }
  }

  // Update partner token
  async updatePartnerToken(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      // If updating contract address, normalize it
      if (updates.contractAddress) {
        updates.contractAddress = updates.contractAddress.toLowerCase();
        
        // Check for duplicates if changing contract or chain
        const existing = await PartnerToken.findOne({
          _id: { $ne: id },
          contractAddress: updates.contractAddress,
          chainId: updates.chainId || undefined
        });

        if (existing) {
          return res.status(400).json({
            success: false,
            message: 'Another partner token already exists for this contract address and chain'
          });
        }
      }

      const partnerToken = await PartnerToken.findByIdAndUpdate(
        id,
        updates,
        { new: true, runValidators: true }
      );

      if (!partnerToken) {
        return res.status(404).json({
          success: false,
          message: 'Partner token not found'
        });
      }

      res.json({
        success: true,
        message: 'Partner token updated successfully',
        data: partnerToken
      });
    } catch (error) {
      console.error('Error updating partner token:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update partner token',
        error: error.message
      });
    }
  }

  // Delete partner token
  async deletePartnerToken(req, res) {
    try {
      const { id } = req.params;

      const partnerToken = await PartnerToken.findByIdAndDelete(id);

      if (!partnerToken) {
        return res.status(404).json({
          success: false,
          message: 'Partner token not found'
        });
      }

      res.json({
        success: true,
        message: 'Partner token deleted successfully',
        data: partnerToken
      });
    } catch (error) {
      console.error('Error deleting partner token:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete partner token',
        error: error.message
      });
    }
  }

  // Toggle partner token active status
  async toggleActiveStatus(req, res) {
    try {
      const { id } = req.params;

      const partnerToken = await PartnerToken.findById(id);

      if (!partnerToken) {
        return res.status(404).json({
          success: false,
          message: 'Partner token not found'
        });
      }

      partnerToken.isActive = !partnerToken.isActive;
      await partnerToken.save();

      res.json({
        success: true,
        message: `Partner token ${partnerToken.isActive ? 'activated' : 'deactivated'} successfully`,
        data: partnerToken
      });
    } catch (error) {
      console.error('Error toggling partner token status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to toggle partner token status',
        error: error.message
      });
    }
  }

  // Get partner token by contract address
  async getByContract(req, res) {
    try {
      const { contractAddress, chainId } = req.params;

      const partnerToken = await PartnerToken.findByContract(contractAddress, chainId);

      if (!partnerToken) {
        return res.status(404).json({
          success: false,
          message: 'Partner token not found'
        });
      }

      res.json({
        success: true,
        data: partnerToken
      });
    } catch (error) {
      console.error('Error getting partner token by contract:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get partner token',
        error: error.message
      });
    }
  }

  // Bulk upload partner tokens via CSV
  async bulkUpload(req, res) {
    try {
      const { tokens } = req.body;

      if (!Array.isArray(tokens) || tokens.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Tokens array is required'
        });
      }

      const results = [];
      const errors = [];

      for (const tokenData of tokens) {
        try {
          // Validate required fields
          if (!tokenData.name || !tokenData.symbol || !tokenData.contractAddress || !tokenData.chainId) {
            errors.push({
              token: tokenData,
              error: 'Missing required fields: name, symbol, contractAddress, chainId'
            });
            continue;
          }

          // Normalize contract address
          tokenData.contractAddress = tokenData.contractAddress.toLowerCase();

          // Check for existing token
          const existing = await PartnerToken.findOne({
            contractAddress: tokenData.contractAddress,
            chainId: tokenData.chainId
          });

          if (existing) {
            // Update existing token
            Object.assign(existing, tokenData);
            await existing.save();
            results.push({ action: 'updated', token: existing });
          } else {
            // Create new token
            const partnerToken = new PartnerToken({
              ...tokenData,
              partnerInfo: tokenData.partnerInfo || { name: tokenData.name }
            });
            await partnerToken.save();
            results.push({ action: 'created', token: partnerToken });
          }
        } catch (error) {
          errors.push({
            token: tokenData,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        message: `Processed ${results.length} tokens successfully`,
        data: {
          successful: results,
          failed: errors
        }
      });
    } catch (error) {
      console.error('Error bulk uploading partner tokens:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk upload partner tokens',
        error: error.message
      });
    }
  }

  // Get partner token statistics
  async getPartnerTokenStats(req, res) {
    try {
      const stats = await PartnerToken.aggregate([
        {
          $group: {
            _id: null,
            totalTokens: { $sum: 1 },
            activeTokens: {
              $sum: { $cond: ['$isActive', 1, 0] }
            },
            averageMultiplier: { $avg: '$multiplier' },
            chainDistribution: {
              $push: '$chainId'
            }
          }
        },
        {
          $project: {
            _id: 0,
            totalTokens: 1,
            activeTokens: 1,
            inactiveTokens: { $subtract: ['$totalTokens', '$activeTokens'] },
            averageMultiplier: { $round: ['$averageMultiplier', 2] },
            chainDistribution: 1
          }
        }
      ]);

      // Count tokens by chain
      const chainStats = await PartnerToken.aggregate([
        {
          $group: {
            _id: '$chainId',
            count: { $sum: 1 },
            activeCount: {
              $sum: { $cond: ['$isActive', 1, 0] }
            }
          }
        },
        { $sort: { count: -1 } }
      ]);

      const result = stats[0] || {
        totalTokens: 0,
        activeTokens: 0,
        inactiveTokens: 0,
        averageMultiplier: 0
      };

      result.chainStats = chainStats;

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error getting partner token stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get partner token statistics',
        error: error.message
      });
    }
  }
}

module.exports = new PartnerTokensController();