const stakingAnalyticsService = require('../services/stakingAnalyticsService');

class StakingAnalyticsController {
  /**
   * Get dashboard metrics for admin overview
   */
  async getDashboardMetrics(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { timeRange = 30 } = req.query;
      const metrics = await stakingAnalyticsService.getDashboardMetrics(parseInt(timeRange));

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get contract performance analytics
   */
  async getContractPerformance(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { contractId } = req.params;
      const { timeRange = 30 } = req.query;

      const performance = await stakingAnalyticsService.getContractPerformance(
        contractId || null,
        parseInt(timeRange)
      );

      res.json({
        success: true,
        data: performance
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get specific contract analytics
   */
  async getContractAnalytics(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { contractId } = req.params;
      const { timeRange = 30 } = req.query;

      if (!contractId) {
        return res.status(400).json({
          success: false,
          message: 'Contract ID is required'
        });
      }

      const analytics = await stakingAnalyticsService.getContractPerformance(
        contractId,
        parseInt(timeRange)
      );

      if (!analytics.contracts || analytics.contracts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Contract not found'
        });
      }

      res.json({
        success: true,
        data: analytics.contracts[0]
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get user behavior analysis
   */
  async getUserBehaviorAnalysis(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { timeRange = 90 } = req.query;
      const analysis = await stakingAnalyticsService.getUserBehaviorAnalysis(parseInt(timeRange));

      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get reward distribution analytics
   */
  async getRewardDistributionAnalytics(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { timeRange = 30 } = req.query;
      const analytics = await stakingAnalyticsService.getRewardDistributionAnalytics(parseInt(timeRange));

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get real-time analytics
   */
  async getRealTimeAnalytics(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const analytics = await stakingAnalyticsService.getRealTimeAnalytics();

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Generate comprehensive staking report
   */
  async generateReport(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const {
        timeRange = 30,
        includeUserData = false,
        includeContractDetails = true,
        format = 'json'
      } = req.query;

      const options = {
        timeRange: parseInt(timeRange),
        includeUserData: includeUserData === 'true',
        includeContractDetails: includeContractDetails === 'true',
        format
      };

      const report = await stakingAnalyticsService.generateStakingReport(options);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="staking-report-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(report);
      } else {
        res.json({
          success: true,
          data: report
        });
      }
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Clear analytics cache
   */
  async clearCache(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      stakingAnalyticsService.clearCache();

      res.json({
        success: true,
        message: 'Analytics cache cleared successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get staking trends over time
   */
  async getStakingTrends(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { timeRange = 30, granularity = 'daily' } = req.query;

      // This would be implemented in the analytics service
      const trends = await stakingAnalyticsService.getStakingTrends(
        parseInt(timeRange),
        granularity
      );

      res.json({
        success: true,
        data: trends
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get user engagement metrics
   */
  async getUserEngagementMetrics(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { timeRange = 30 } = req.query;

      const engagement = await stakingAnalyticsService.getUserEngagementMetrics(
        parseInt(timeRange)
      );

      res.json({
        success: true,
        data: engagement
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get reward efficiency analysis
   */
  async getRewardEfficiencyAnalysis(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { contractId, timeRange = 30 } = req.query;

      const efficiency = await stakingAnalyticsService.getRewardEfficiencyAnalysis(
        contractId || null,
        parseInt(timeRange)
      );

      res.json({
        success: true,
        data: efficiency
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get comparative contract analysis
   */
  async getComparativeAnalysis(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { contractIds, timeRange = 30 } = req.query;

      if (!contractIds) {
        return res.status(400).json({
          success: false,
          message: 'Contract IDs are required for comparison'
        });
      }

      const contractIdArray = contractIds.split(',').map(id => id.trim());
      
      const comparison = await stakingAnalyticsService.getComparativeAnalysis(
        contractIdArray,
        parseInt(timeRange)
      );

      res.json({
        success: true,
        data: comparison
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get predictive analytics
   */
  async getPredictiveAnalytics(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { timeRange = 90, predictionPeriod = 30 } = req.query;

      const predictions = await stakingAnalyticsService.getPredictiveAnalytics(
        parseInt(timeRange),
        parseInt(predictionPeriod)
      );

      res.json({
        success: true,
        data: predictions
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const {
        type = 'dashboard',
        format = 'json',
        timeRange = 30,
        contractId
      } = req.query;

      let data;
      let filename;

      switch (type) {
        case 'dashboard':
          data = await stakingAnalyticsService.getDashboardMetrics(parseInt(timeRange));
          filename = `dashboard-metrics-${new Date().toISOString().split('T')[0]}`;
          break;
        case 'contracts':
          data = await stakingAnalyticsService.getContractPerformance(contractId, parseInt(timeRange));
          filename = `contract-performance-${new Date().toISOString().split('T')[0]}`;
          break;
        case 'rewards':
          data = await stakingAnalyticsService.getRewardDistributionAnalytics(parseInt(timeRange));
          filename = `reward-analytics-${new Date().toISOString().split('T')[0]}`;
          break;
        case 'users':
          data = await stakingAnalyticsService.getUserBehaviorAnalysis(parseInt(timeRange));
          filename = `user-behavior-${new Date().toISOString().split('T')[0]}`;
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid export type'
          });
      }

      if (format === 'csv') {
        const csv = await stakingAnalyticsService.convertToCSV(data, type);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send(csv);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.json(data);
      }
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new StakingAnalyticsController();