const communityManualPointsService = require('../services/communityManualPointsService');
const multer = require('multer');
const path = require('path');

// Configure multer for CSV file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

class CommunityManualPointsController {
  /**
   * Download sample CSV template
   */
  async downloadSampleCSV(req, res) {
    try {
      const csvContent = communityManualPointsService.generateSampleCSV();
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="points_credit_template.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error('Error generating sample CSV:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate sample CSV template',
        error: error.message
      });
    }
  }

  /**
   * Upload and process CSV for bulk points crediting
   */
  async uploadCSVForBulkCrediting(req, res) {
    try {
      const { communityId } = req.params;
      const adminId = req.user.id;
      const { reason } = req.body;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'CSV file is required'
        });
      }

      // Process the CSV file
      const csvContent = req.file.buffer.toString('utf-8');
      const results = await communityManualPointsService.processBulkPointsCrediting(
        communityId,
        csvContent,
        adminId,
        reason
      );

      res.json({
        success: true,
        message: 'CSV processing completed',
        data: results
      });
    } catch (error) {
      console.error('Error processing CSV for bulk crediting:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process CSV file',
        error: error.message
      });
    }
  }

  /**
   * Credit points to individual user
   */
  async creditPointsToIndividualUser(req, res) {
    try {
      const { communityId } = req.params;
      const adminId = req.user.id;
      const { identifierType, identifierValue, pointsAmount, reason } = req.body;

      // Validate required fields
      if (!identifierType || !identifierValue || !pointsAmount) {
        return res.status(400).json({
          success: false,
          message: 'Identifier type, identifier value, and points amount are required'
        });
      }

      // Validate points amount
      const points = parseInt(pointsAmount);
      if (isNaN(points) || points <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Points amount must be a positive number'
        });
      }

      const result = await communityManualPointsService.creditPointsToUserByIdentifier(
        communityId,
        identifierType,
        identifierValue,
        points,
        reason,
        adminId
      );

      res.json({
        success: true,
        message: 'Points credited successfully',
        data: result
      });
    } catch (error) {
      console.error('Error crediting points to individual user:', error);
      const statusCode = error.message.includes('not found') ? 404 : 
                         error.message.includes('permissions') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to credit points',
        error: error.message
      });
    }
  }

  /**
   * Get audit history for manual points crediting
   */
  async getAuditHistory(req, res) {
    try {
      const { communityId } = req.params;
      const adminId = req.user.id;
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        adminId: req.query.adminId
      };

      const history = await communityManualPointsService.getAuditHistory(
        communityId,
        adminId,
        options
      );

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Error getting audit history:', error);
      const statusCode = error.message.includes('permissions') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to get audit history',
        error: error.message
      });
    }
  }

  /**
   * Get community points crediting statistics
   */
  async getCommunityPointsCreditingStats(req, res) {
    try {
      const { communityId } = req.params;
      const adminId = req.user.id;
      const timeframe = req.query.timeframe || '30d';

      const stats = await communityManualPointsService.getCommunityPointsCreditingStats(
        communityId,
        adminId,
        timeframe
      );

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting community points crediting stats:', error);
      const statusCode = error.message.includes('permissions') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to get statistics',
        error: error.message
      });
    }
  }

  /**
   * Validate CSV format without processing
   */
  async validateCSV(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'CSV file is required'
        });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const parsedData = await communityManualPointsService.parseCSV(csvContent);
      const { validRows, errors } = await communityManualPointsService.validateCSVData(parsedData);

      res.json({
        success: true,
        message: 'CSV validation completed',
        data: {
          totalRows: parsedData.length,
          validRows: validRows.length,
          invalidRows: errors.length,
          errors: errors,
          preview: validRows.slice(0, 5) // Show first 5 valid rows as preview
        }
      });
    } catch (error) {
      console.error('Error validating CSV:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to validate CSV file',
        error: error.message
      });
    }
  }

  /**
   * Search for user by identifier (for individual crediting form)
   */
  async searchUserByIdentifier(req, res) {
    try {
      const { communityId } = req.params;
      const { identifierType, identifierValue } = req.query;
      const adminId = req.user.id;

      if (!identifierType || !identifierValue) {
        return res.status(400).json({
          success: false,
          message: 'Identifier type and value are required'
        });
      }

      // Check permissions
      const canManage = await communityManualPointsService.canUserManageCommunity(adminId, communityId);
      if (!canManage) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      // Validate identifier format
      const validationError = communityManualPointsService.validateIdentifierFormat(identifierType, identifierValue);
      if (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError
        });
      }

      // Find user
      const user = await communityManualPointsService.findUserByIdentifier(identifierType, identifierValue, communityId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found or not a member of this community'
        });
      }

      // Get user's current points balance
      const pointsInfo = await require('../services/communityPointsService').getUserCommunityPointsInfo(user._id, communityId);

      res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            username: user.username,
            profileImage: user.profileImage
          },
          currentBalance: pointsInfo.balance,
          totalEarned: pointsInfo.totalEarned,
          tier: pointsInfo.tier
        }
      });
    } catch (error) {
      console.error('Error searching user by identifier:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search for user',
        error: error.message
      });
    }
  }

  /**
   * Get supported identifier types and their formats
   */
  async getSupportedIdentifierTypes(req, res) {
    try {
      const identifierTypes = [
        {
          type: 'wallet_address',
          label: 'Wallet Address',
          description: 'Ethereum (0x...) or Solana wallet address',
          examples: [
            '0x1234567890123456789012345678901234567890',
            'DsVmA5hWGAnP2FADTLJYstfXndxvGPgqzrpoC9kKz1Cy'
          ]
        },
        {
          type: 'twitter_username',
          label: 'Twitter Username',
          description: 'Twitter username with or without @ symbol',
          examples: [
            '@example_user',
            'example_user'
          ]
        },
        {
          type: 'discord_username',
          label: 'Discord Username',
          description: 'Discord username with discriminator (#1234) or new format',
          examples: [
            'user#1234',
            'newusername'
          ]
        }
      ];

      res.json({
        success: true,
        data: identifierTypes
      });
    } catch (error) {
      console.error('Error getting supported identifier types:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get identifier types',
        error: error.message
      });
    }
  }
}

// Create controller instance and export with multer middleware
const controller = new CommunityManualPointsController();

module.exports = {
  controller,
  upload,
  // Export individual methods with proper binding
  downloadSampleCSV: controller.downloadSampleCSV.bind(controller),
  uploadCSVForBulkCrediting: [upload.single('csvFile'), controller.uploadCSVForBulkCrediting.bind(controller)],
  creditPointsToIndividualUser: controller.creditPointsToIndividualUser.bind(controller),
  getAuditHistory: controller.getAuditHistory.bind(controller),
  getCommunityPointsCreditingStats: controller.getCommunityPointsCreditingStats.bind(controller),
  validateCSV: [upload.single('csvFile'), controller.validateCSV.bind(controller)],
  searchUserByIdentifier: controller.searchUserByIdentifier.bind(controller),
  getSupportedIdentifierTypes: controller.getSupportedIdentifierTypes.bind(controller)
};