const PromotionService = require('../../services/promotions/promotionService');
const FeeCalculationEngine = require('../../services/promotions/feeCalculationEngine');
const BonusCreditsEngine = require('../../services/promotions/bonusCreditsEngine');
const FraudPreventionService = require('../../services/promotions/fraudPreventionService');
const PromotionIntegrationService = require('../../services/promotions/promotionIntegrationService');

class PromotionAdminController {
  constructor() {
    this.promotionService = new PromotionService();
    this.feeCalculationEngine = new FeeCalculationEngine();
    this.bonusCreditsEngine = new BonusCreditsEngine();
    this.fraudPreventionService = new FraudPreventionService();
    this.integrationService = new PromotionIntegrationService();
  }

  /**
   * Get promotions dashboard data
   */
  async getDashboard(req, res) {
    try {
      const { timeRange = '30d' } = req.query;
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      
      switch (timeRange) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 30);
      }
      
      // Get dashboard metrics
      const [
        promotionsList,
        feeDiscountAnalytics,
        bonusCreditsAnalytics,
        fraudStatistics
      ] = await Promise.all([
        this.promotionService.listPromotions({}, { limit: 10, sortBy: 'createdAt', sortOrder: 'desc' }),
        this.feeCalculationEngine.getFeeDiscountAnalytics({ startDate, endDate }),
        this.bonusCreditsEngine.getBonusCreditsAnalytics({ startDate, endDate }),
        this.fraudPreventionService.getFraudStatistics({ startDate, endDate })
      ]);
      
      // Calculate summary metrics
      const totalPromotions = promotionsList.pagination.total;
      const activePromotions = promotionsList.promotions.filter(p => p.status === 'active').length;
      
      const dashboardData = {
        summary: {
          totalPromotions,
          activePromotions,
          totalSavings: feeDiscountAnalytics.totalSavings + (bonusCreditsAnalytics.overallStats?.totalAwarded || 0),
          totalUsers: Math.max(
            feeDiscountAnalytics.uniqueUserCount || 0,
            bonusCreditsAnalytics.overallStats?.usersWithCredits || 0
          ),
          fraudFlags: fraudStatistics.fraudFlags.totalFlags
        },
        recentPromotions: promotionsList.promotions,
        analytics: {
          feeDiscounts: feeDiscountAnalytics,
          bonusCredits: bonusCreditsAnalytics,
          fraud: fraudStatistics
        },
        timeRange,
        generatedAt: new Date()
      };
      
      res.json({
        success: true,
        data: dashboardData
      });
    } catch (error) {
      console.error('Error getting promotions dashboard:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load dashboard data',
        error: error.message
      });
    }
  }

  /**
   * Create new promotion
   */
  async createPromotion(req, res) {
    try {
      const promotionData = req.body;
      const createdBy = req.user._id;
      
      // Validate required fields
      const requiredFields = ['name', 'description', 'type', 'startDate', 'endDate'];
      for (const field of requiredFields) {
        if (!promotionData[field]) {
          return res.status(400).json({
            success: false,
            message: `Missing required field: ${field}`
          });
        }
      }
      
      const promotion = await this.promotionService.createPromotion(promotionData, createdBy);
      
      res.status(201).json({
        success: true,
        message: 'Promotion created successfully',
        data: promotion
      });
    } catch (error) {
      console.error('Error creating promotion:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to create promotion',
        error: error.message
      });
    }
  }

  /**
   * Update existing promotion
   */
  async updatePromotion(req, res) {
    try {
      const { promotionId } = req.params;
      const updateData = req.body;
      const updatedBy = req.user._id;
      
      const promotion = await this.promotionService.updatePromotion(promotionId, updateData, updatedBy);
      
      res.json({
        success: true,
        message: 'Promotion updated successfully',
        data: promotion
      });
    } catch (error) {
      console.error('Error updating promotion:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to update promotion',
        error: error.message
      });
    }
  }

  /**
   * Get promotion details
   */
  async getPromotion(req, res) {
    try {
      const { promotionId } = req.params;
      
      const promotion = await this.promotionService.getPromotionById(promotionId);
      
      res.json({
        success: true,
        data: promotion
      });
    } catch (error) {
      console.error('Error getting promotion:', error);
      res.status(404).json({
        success: false,
        message: 'Promotion not found',
        error: error.message
      });
    }
  }

  /**
   * List promotions with filtering
   */
  async listPromotions(req, res) {
    try {
      const filters = {
        status: req.query.status,
        type: req.query.type,
        createdBy: req.query.createdBy,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        search: req.query.search
      };
      
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'desc'
      };
      
      const result = await this.promotionService.listPromotions(filters, options);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error listing promotions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to list promotions',
        error: error.message
      });
    }
  }

  /**
   * Activate promotion
   */
  async activatePromotion(req, res) {
    try {
      const { promotionId } = req.params;
      
      const promotion = await this.promotionService.activatePromotion(promotionId);
      
      res.json({
        success: true,
        message: 'Promotion activated successfully',
        data: promotion
      });
    } catch (error) {
      console.error('Error activating promotion:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to activate promotion',
        error: error.message
      });
    }
  }

  /**
   * Deactivate promotion
   */
  async deactivatePromotion(req, res) {
    try {
      const { promotionId } = req.params;
      const { reason = 'manual' } = req.body;
      
      const promotion = await this.promotionService.deactivatePromotion(promotionId, reason);
      
      res.json({
        success: true,
        message: 'Promotion deactivated successfully',
        data: promotion
      });
    } catch (error) {
      console.error('Error deactivating promotion:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to deactivate promotion',
        error: error.message
      });
    }
  }

  /**
   * Assign promotion to user
   */
  async assignPromotionToUser(req, res) {
    try {
      const { promotionId } = req.params;
      const { userId } = req.body;
      const assignedBy = req.user.username || 'admin';
      
      const userPromotion = await this.promotionService.assignPromotionToUser(
        promotionId,
        userId,
        assignedBy
      );
      
      res.json({
        success: true,
        message: 'Promotion assigned to user successfully',
        data: userPromotion
      });
    } catch (error) {
      console.error('Error assigning promotion to user:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to assign promotion to user',
        error: error.message
      });
    }
  }

  /**
   * Get promotion analytics
   */
  async getPromotionAnalytics(req, res) {
    try {
      const { promotionId } = req.params;
      const { startDate, endDate } = req.query;
      
      const [
        promotionStats,
        feeDiscountAnalytics,
        bonusCreditsAnalytics
      ] = await Promise.all([
        this.promotionService.getPromotionStats(promotionId),
        this.feeCalculationEngine.getFeeDiscountAnalytics({ promotionId, startDate, endDate }),
        this.bonusCreditsEngine.getBonusCreditsAnalytics({ startDate, endDate })
      ]);
      
      res.json({
        success: true,
        data: {
          promotionStats,
          feeDiscountAnalytics,
          bonusCreditsAnalytics,
          generatedAt: new Date()
        }
      });
    } catch (error) {
      console.error('Error getting promotion analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get promotion analytics',
        error: error.message
      });
    }
  }

  /**
   * Get user promotion management
   */
  async getUserPromotions(req, res) {
    try {
      const { userId } = req.params;
      const { type } = req.query;
      
      const [
        userPromotions,
        bonusCreditsBalance,
        combinedBenefits
      ] = await Promise.all([
        this.promotionService.getUserPromotions(userId, type),
        this.bonusCreditsEngine.getUserBonusCreditsBalance(userId),
        this.integrationService.getCombinedUserBenefits(userId)
      ]);
      
      res.json({
        success: true,
        data: {
          userPromotions,
          bonusCreditsBalance,
          combinedBenefits
        }
      });
    } catch (error) {
      console.error('Error getting user promotions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user promotions',
        error: error.message
      });
    }
  }

  /**
   * Manage user bonus credits
   */
  async manageBonusCredits(req, res) {
    try {
      const { userId } = req.params;
      const { action, amount, tokenInfo, reason } = req.body;
      
      let result;
      
      switch (action) {
        case 'reset':
          result = await this.bonusCreditsEngine.resetBonusCreditsForWithdrawal(userId, reason || 'admin_reset');
          break;
        case 'view':
          result = await this.bonusCreditsEngine.getUserBonusCreditsBalance(userId);
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid action. Supported actions: reset, view'
          });
      }
      
      res.json({
        success: true,
        message: `Bonus credits ${action} completed successfully`,
        data: result
      });
    } catch (error) {
      console.error('Error managing bonus credits:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to manage bonus credits',
        error: error.message
      });
    }
  }

  /**
   * Get fraud prevention dashboard
   */
  async getFraudDashboard(req, res) {
    try {
      const { startDate, endDate, riskLevel } = req.query;
      
      const fraudStatistics = await this.fraudPreventionService.getFraudStatistics({
        startDate,
        endDate,
        riskLevel
      });
      
      res.json({
        success: true,
        data: fraudStatistics
      });
    } catch (error) {
      console.error('Error getting fraud dashboard:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get fraud dashboard',
        error: error.message
      });
    }
  }

  /**
   * Analyze user for fraud
   */
  async analyzeUserForFraud(req, res) {
    try {
      const { userId } = req.params;
      const { promotionId } = req.query;
      
      const analysis = await this.fraudPreventionService.analyzePromotionUsage(userId, promotionId);
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      console.error('Error analyzing user for fraud:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to analyze user for fraud',
        error: error.message
      });
    }
  }

  /**
   * Flag user promotion for fraud
   */
  async flagUserPromotionForFraud(req, res) {
    try {
      const { userPromotionId } = req.params;
      const flagData = {
        ...req.body,
        flaggedBy: req.user.username || 'admin'
      };
      
      const result = await this.fraudPreventionService.flagUserPromotionForFraud(
        userPromotionId,
        flagData
      );
      
      res.json({
        success: true,
        message: 'User promotion flagged for fraud successfully',
        data: result
      });
    } catch (error) {
      console.error('Error flagging user promotion for fraud:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to flag user promotion for fraud',
        error: error.message
      });
    }
  }

  /**
   * Resolve fraud flag
   */
  async resolveFraudFlag(req, res) {
    try {
      const { userPromotionId, flagId } = req.params;
      const resolutionData = {
        ...req.body,
        resolvedBy: req.user.username || 'admin'
      };
      
      const result = await this.fraudPreventionService.resolveFraudFlag(
        userPromotionId,
        flagId,
        resolutionData
      );
      
      res.json({
        success: true,
        message: 'Fraud flag resolved successfully',
        data: result
      });
    } catch (error) {
      console.error('Error resolving fraud flag:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to resolve fraud flag',
        error: error.message
      });
    }
  }

  /**
   * Get available fee types
   */
  async getAvailableFeeTypes(req, res) {
    try {
      const feeTypes = this.feeCalculationEngine.getAvailableFeeTypes();
      
      res.json({
        success: true,
        data: feeTypes
      });
    } catch (error) {
      console.error('Error getting available fee types:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get available fee types',
        error: error.message
      });
    }
  }

  /**
   * Simulate promotion for testing
   */
  async simulatePromotion(req, res) {
    try {
      const { userId, promotionData, transactionData } = req.body;
      
      // This would create a temporary promotion for simulation
      const simulation = {
        userId,
        promotionData,
        transactionData,
        simulatedAt: new Date(),
        results: {
          eligible: true,
          estimatedSavings: 0,
          warnings: []
        }
      };
      
      // Simulate fee calculation if applicable
      if (promotionData.type === 'fee_discount' && transactionData.originalFee) {
        const feeCalculation = await this.feeCalculationEngine.simulateFeeCalculation(
          userId,
          transactionData
        );
        simulation.results.estimatedSavings = feeCalculation.discountAmount;
      }
      
      res.json({
        success: true,
        message: 'Promotion simulation completed',
        data: simulation
      });
    } catch (error) {
      console.error('Error simulating promotion:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to simulate promotion',
        error: error.message
      });
    }
  }

  /**
   * Export promotion data
   */
  async exportPromotionData(req, res) {
    try {
      const { promotionId } = req.params;
      const { format = 'json', startDate, endDate } = req.query;
      
      const [
        promotion,
        analytics,
        userPromotions
      ] = await Promise.all([
        this.promotionService.getPromotionById(promotionId),
        this.promotionService.getPromotionStats(promotionId),
        // Get user promotions for this promotion (simplified query)
        require('../../models/promotions/userPromotion').find({ promotionId }).populate('userId', 'username email')
      ]);
      
      const exportData = {
        promotion,
        analytics,
        userPromotions: userPromotions.map(up => ({
          userId: up.userId._id,
          username: up.userId.username,
          email: up.userId.email,
          assignedAt: up.assignedAt,
          usageCount: up.usageCount,
          totalSavings: up.totalSavings,
          status: up.status
        })),
        exportedAt: new Date(),
        exportedBy: req.user.username || 'admin'
      };
      
      if (format === 'csv') {
        // Convert to CSV format
        const csv = this.convertToCSV(exportData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="promotion-${promotionId}-export.csv"`);
        res.send(csv);
      } else {
        res.json({
          success: true,
          data: exportData
        });
      }
    } catch (error) {
      console.error('Error exporting promotion data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export promotion data',
        error: error.message
      });
    }
  }

  /**
   * Convert data to CSV format
   */
  convertToCSV(data) {
    const headers = ['User ID', 'Username', 'Email', 'Assigned At', 'Usage Count', 'Total Savings', 'Status'];
    const rows = data.userPromotions.map(up => [
      up.userId,
      up.username,
      up.email,
      up.assignedAt.toISOString(),
      up.usageCount,
      up.totalSavings,
      up.status
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
    
    return csvContent;
  }

  /**
   * Perform maintenance cleanup
   */
  async performMaintenance(req, res) {
    try {
      const result = await this.integrationService.performMaintenanceCleanup();
      
      res.json({
        success: true,
        message: 'Maintenance cleanup completed successfully',
        data: result
      });
    } catch (error) {
      console.error('Error performing maintenance:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to perform maintenance cleanup',
        error: error.message
      });
    }
  }
}

module.exports = new PromotionAdminController();