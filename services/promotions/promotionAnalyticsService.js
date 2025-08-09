const Promotion = require('../../models/promotions/promotion');
const UserPromotion = require('../../models/promotions/userPromotion');
const BonusCreditsBalance = require('../../models/promotions/bonusCreditsBalance');
const ActivityTracker = require('../../models/promotions/activityTracker');

class PromotionAnalyticsService {
  /**
   * Get comprehensive promotion performance analytics
   */
  async getPromotionPerformanceAnalytics(options = {}) {
    try {
      const {
        startDate,
        endDate,
        promotionId,
        promotionType,
        groupBy = 'day'
      } = options;
      
      // Build date filter
      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);
      
      // Build promotion filter
      const promotionFilter = {};
      if (promotionId) promotionFilter._id = promotionId;
      if (promotionType) promotionFilter.type = promotionType;
      if (Object.keys(dateFilter).length > 0) {
        promotionFilter.createdAt = dateFilter;
      }
      
      // Get promotion performance data
      const performanceData = await this.getPromotionUsageAnalytics(promotionFilter, dateFilter, groupBy);
      const conversionData = await this.getPromotionConversionAnalytics(promotionFilter, dateFilter);
      const revenueImpact = await this.getRevenueImpactAnalytics(promotionFilter, dateFilter);
      const userEngagement = await this.getUserEngagementAnalytics(promotionFilter, dateFilter);
      
      return {
        performance: performanceData,
        conversion: conversionData,
        revenueImpact,
        userEngagement,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('Error getting promotion performance analytics:', error);
      throw error;
    }
  }

  /**
   * Get promotion usage analytics with time series data
   */
  async getPromotionUsageAnalytics(promotionFilter, dateFilter, groupBy) {
    try {
      // Define grouping format based on groupBy parameter
      let groupFormat;
      switch (groupBy) {
        case 'hour':
          groupFormat = { $dateToString: { format: "%Y-%m-%d %H:00", date: "$usageHistory.usedAt" } };
          break;
        case 'day':
          groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$usageHistory.usedAt" } };
          break;
        case 'week':
          groupFormat = { $dateToString: { format: "%Y-W%U", date: "$usageHistory.usedAt" } };
          break;
        case 'month':
          groupFormat = { $dateToString: { format: "%Y-%m", date: "$usageHistory.usedAt" } };
          break;
        default:
          groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$usageHistory.usedAt" } };
      }
      
      const pipeline = [
        { $match: promotionFilter },
        {
          $lookup: {
            from: 'userpromotions',
            localField: '_id',
            foreignField: 'promotionId',
            as: 'userPromotions'
          }
        },
        { $unwind: '$userPromotions' },
        { $unwind: '$userPromotions.usageHistory' },
        ...(Object.keys(dateFilter).length > 0 ? [{ $match: { 'userPromotions.usageHistory.usedAt': dateFilter } }] : []),
        {
          $group: {
            _id: {
              period: groupFormat,
              promotionId: '$_id',
              promotionName: '$name',
              promotionType: '$type'
            },
            usageCount: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userPromotions.userId' },
            totalSavings: { $sum: '$userPromotions.usageHistory.discountAmount' },
            totalBonusAwarded: { $sum: '$userPromotions.usageHistory.bonusAmount' },
            averageUsageValue: { $avg: '$userPromotions.usageHistory.originalAmount' }
          }
        },
        {
          $addFields: {
            uniqueUserCount: { $size: '$uniqueUsers' }
          }
        },
        { $sort: { '_id.period': 1 } }
      ];
      
      const results = await Promotion.aggregate(pipeline);
      
      // Process results into time series format
      const timeSeriesData = {};
      const promotionSummary = {};
      
      for (const result of results) {
        const period = result._id.period;
        const promotionId = result._id.promotionId.toString();
        
        if (!timeSeriesData[period]) {
          timeSeriesData[period] = {
            period,
            totalUsage: 0,
            totalUsers: 0,
            totalSavings: 0,
            totalBonusAwarded: 0,
            promotions: {}
          };
        }
        
        timeSeriesData[period].totalUsage += result.usageCount;
        timeSeriesData[period].totalUsers += result.uniqueUserCount;
        timeSeriesData[period].totalSavings += result.totalSavings || 0;
        timeSeriesData[period].totalBonusAwarded += result.totalBonusAwarded || 0;
        timeSeriesData[period].promotions[promotionId] = {
          name: result._id.promotionName,
          type: result._id.promotionType,
          usage: result.usageCount,
          users: result.uniqueUserCount,
          savings: result.totalSavings || 0,
          bonusAwarded: result.totalBonusAwarded || 0
        };
        
        // Build promotion summary
        if (!promotionSummary[promotionId]) {
          promotionSummary[promotionId] = {
            name: result._id.promotionName,
            type: result._id.promotionType,
            totalUsage: 0,
            totalUsers: new Set(),
            totalSavings: 0,
            totalBonusAwarded: 0
          };
        }
        
        promotionSummary[promotionId].totalUsage += result.usageCount;
        result.uniqueUsers.forEach(userId => promotionSummary[promotionId].totalUsers.add(userId.toString()));
        promotionSummary[promotionId].totalSavings += result.totalSavings || 0;
        promotionSummary[promotionId].totalBonusAwarded += result.totalBonusAwarded || 0;
      }
      
      // Convert sets to counts
      Object.keys(promotionSummary).forEach(promotionId => {
        promotionSummary[promotionId].totalUsers = promotionSummary[promotionId].totalUsers.size;
      });
      
      return {
        timeSeries: Object.values(timeSeriesData),
        promotionSummary: Object.values(promotionSummary),
        totalPeriods: Object.keys(timeSeriesData).length
      };
    } catch (error) {
      console.error('Error getting promotion usage analytics:', error);
      throw error;
    }
  }

  /**
   * Get promotion conversion analytics
   */
  async getPromotionConversionAnalytics(promotionFilter, dateFilter) {
    try {
      const pipeline = [
        { $match: promotionFilter },
        {
          $lookup: {
            from: 'userpromotions',
            localField: '_id',
            foreignField: 'promotionId',
            as: 'userPromotions'
          }
        },
        {
          $project: {
            name: 1,
            type: 1,
            totalAssignments: { $size: '$userPromotions' },
            usedPromotions: {
              $size: {
                $filter: {
                  input: '$userPromotions',
                  cond: { $gt: ['$$this.usageCount', 0] }
                }
              }
            },
            activePromotions: {
              $size: {
                $filter: {
                  input: '$userPromotions',
                  cond: { $eq: ['$$this.status', 'active'] }
                }
              }
            },
            totalUsages: {
              $sum: '$userPromotions.usageCount'
            },
            averageUsagePerUser: {
              $cond: {
                if: { $gt: [{ $size: '$userPromotions' }, 0] },
                then: {
                  $divide: [
                    { $sum: '$userPromotions.usageCount' },
                    { $size: '$userPromotions' }
                  ]
                },
                else: 0
              }
            }
          }
        },
        {
          $addFields: {
            conversionRate: {
              $cond: {
                if: { $gt: ['$totalAssignments', 0] },
                then: {
                  $multiply: [
                    { $divide: ['$usedPromotions', '$totalAssignments'] },
                    100
                  ]
                },
                else: 0
              }
            },
            activationRate: {
              $cond: {
                if: { $gt: ['$totalAssignments', 0] },
                then: {
                  $multiply: [
                    { $divide: ['$activePromotions', '$totalAssignments'] },
                    100
                  ]
                },
                else: 0
              }
            }
          }
        }
      ];
      
      const results = await Promotion.aggregate(pipeline);
      
      // Calculate overall conversion metrics
      const overallMetrics = results.reduce((acc, promotion) => {
        acc.totalAssignments += promotion.totalAssignments;
        acc.totalUsedPromotions += promotion.usedPromotions;
        acc.totalActivePromotions += promotion.activePromotions;
        acc.totalUsages += promotion.totalUsages;
        return acc;
      }, {
        totalAssignments: 0,
        totalUsedPromotions: 0,
        totalActivePromotions: 0,
        totalUsages: 0
      });
      
      overallMetrics.overallConversionRate = overallMetrics.totalAssignments > 0 
        ? (overallMetrics.totalUsedPromotions / overallMetrics.totalAssignments) * 100 
        : 0;
      
      overallMetrics.overallActivationRate = overallMetrics.totalAssignments > 0 
        ? (overallMetrics.totalActivePromotions / overallMetrics.totalAssignments) * 100 
        : 0;
      
      overallMetrics.averageUsagesPerAssignment = overallMetrics.totalAssignments > 0 
        ? overallMetrics.totalUsages / overallMetrics.totalAssignments 
        : 0;
      
      return {
        byPromotion: results,
        overall: overallMetrics
      };
    } catch (error) {
      console.error('Error getting promotion conversion analytics:', error);
      throw error;
    }
  }

  /**
   * Get revenue impact analytics
   */
  async getRevenueImpactAnalytics(promotionFilter, dateFilter) {
    try {
      const pipeline = [
        { $match: promotionFilter },
        {
          $lookup: {
            from: 'userpromotions',
            localField: '_id',
            foreignField: 'promotionId',
            as: 'userPromotions'
          }
        },
        { $unwind: '$userPromotions' },
        {
          $group: {
            _id: {
              promotionId: '$_id',
              promotionName: '$name',
              promotionType: '$type'
            },
            totalSavingsGiven: { $sum: '$userPromotions.totalSavings' },
            totalBonusAwarded: { $sum: '$userPromotions.totalBonusReceived' },
            totalUsers: { $addToSet: '$userPromotions.userId' },
            totalUsages: { $sum: '$userPromotions.usageCount' }
          }
        },
        {
          $addFields: {
            uniqueUserCount: { $size: '$totalUsers' },
            averageSavingsPerUser: {
              $cond: {
                if: { $gt: [{ $size: '$totalUsers' }, 0] },
                then: { $divide: ['$totalSavingsGiven', { $size: '$totalUsers' }] },
                else: 0
              }
            },
            averageBonusPerUser: {
              $cond: {
                if: { $gt: [{ $size: '$totalUsers' }, 0] },
                then: { $divide: ['$totalBonusAwarded', { $size: '$totalUsers' }] },
                else: 0
              }
            },
            totalCost: { $add: ['$totalSavingsGiven', '$totalBonusAwarded'] }
          }
        }
      ];
      
      const results = await Promotion.aggregate(pipeline);
      
      // Calculate ROI estimates (this would need additional revenue tracking)
      const revenueImpact = results.map(result => ({
        ...result,
        estimatedROI: this.calculateEstimatedROI(result),
        costPerUser: result.uniqueUserCount > 0 ? result.totalCost / result.uniqueUserCount : 0,
        costPerUsage: result.totalUsages > 0 ? result.totalCost / result.totalUsages : 0
      }));
      
      // Calculate totals
      const totals = revenueImpact.reduce((acc, item) => {
        acc.totalCost += item.totalCost;
        acc.totalSavingsGiven += item.totalSavingsGiven;
        acc.totalBonusAwarded += item.totalBonusAwarded;
        acc.totalUsers += item.uniqueUserCount;
        acc.totalUsages += item.totalUsages;
        return acc;
      }, {
        totalCost: 0,
        totalSavingsGiven: 0,
        totalBonusAwarded: 0,
        totalUsers: 0,
        totalUsages: 0
      });
      
      return {
        byPromotion: revenueImpact,
        totals,
        averageCostPerUser: totals.totalUsers > 0 ? totals.totalCost / totals.totalUsers : 0,
        averageCostPerUsage: totals.totalUsages > 0 ? totals.totalCost / totals.totalUsages : 0
      };
    } catch (error) {
      console.error('Error getting revenue impact analytics:', error);
      throw error;
    }
  }

  /**
   * Get user engagement analytics
   */
  async getUserEngagementAnalytics(promotionFilter, dateFilter) {
    try {
      // Get user engagement patterns
      const engagementPipeline = [
        { $match: promotionFilter },
        {
          $lookup: {
            from: 'userpromotions',
            localField: '_id',
            foreignField: 'promotionId',
            as: 'userPromotions'
          }
        },
        { $unwind: '$userPromotions' },
        {
          $group: {
            _id: '$userPromotions.userId',
            promotionsUsed: { $sum: 1 },
            totalUsages: { $sum: '$userPromotions.usageCount' },
            totalSavings: { $sum: '$userPromotions.totalSavings' },
            totalBonusReceived: { $sum: '$userPromotions.totalBonusReceived' },
            firstUsage: { $min: '$userPromotions.assignedAt' },
            lastUsage: { $max: '$userPromotions.lastUsedAt' },
            promotionTypes: { $addToSet: '$type' }
          }
        },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            averagePromotionsPerUser: { $avg: '$promotionsUsed' },
            averageUsagesPerUser: { $avg: '$totalUsages' },
            averageSavingsPerUser: { $avg: '$totalSavings' },
            averageBonusPerUser: { $avg: '$totalBonusReceived' },
            userEngagementDistribution: {
              $push: {
                userId: '$_id',
                promotionsUsed: '$promotionsUsed',
                totalUsages: '$totalUsages',
                totalValue: { $add: ['$totalSavings', '$totalBonusReceived'] }
              }
            }
          }
        }
      ];
      
      const engagementResults = await Promotion.aggregate(engagementPipeline);
      const engagement = engagementResults[0] || {
        totalUsers: 0,
        averagePromotionsPerUser: 0,
        averageUsagesPerUser: 0,
        averageSavingsPerUser: 0,
        averageBonusPerUser: 0,
        userEngagementDistribution: []
      };
      
      // Categorize users by engagement level
      const engagementLevels = {
        high: 0, // 5+ promotions used
        medium: 0, // 2-4 promotions used
        low: 0 // 1 promotion used
      };
      
      engagement.userEngagementDistribution.forEach(user => {
        if (user.promotionsUsed >= 5) {
          engagementLevels.high++;
        } else if (user.promotionsUsed >= 2) {
          engagementLevels.medium++;
        } else {
          engagementLevels.low++;
        }
      });
      
      // Get retention analytics
      const retentionData = await this.getPromotionRetentionAnalytics(promotionFilter, dateFilter);
      
      return {
        engagement,
        engagementLevels,
        retention: retentionData
      };
    } catch (error) {
      console.error('Error getting user engagement analytics:', error);
      throw error;
    }
  }

  /**
   * Get promotion retention analytics
   */
  async getPromotionRetentionAnalytics(promotionFilter, dateFilter) {
    try {
      // This would analyze user retention after promotion usage
      // For now, return a simplified version
      const pipeline = [
        { $match: promotionFilter },
        {
          $lookup: {
            from: 'userpromotions',
            localField: '_id',
            foreignField: 'promotionId',
            as: 'userPromotions'
          }
        },
        { $unwind: '$userPromotions' },
        {
          $match: {
            'userPromotions.usageCount': { $gt: 0 }
          }
        },
        {
          $group: {
            _id: '$userPromotions.userId',
            firstUsage: { $min: '$userPromotions.assignedAt' },
            lastUsage: { $max: '$userPromotions.lastUsedAt' },
            totalPromotionsUsed: { $sum: 1 }
          }
        },
        {
          $addFields: {
            daysSinceFirstUsage: {
              $divide: [
                { $subtract: [new Date(), '$firstUsage'] },
                1000 * 60 * 60 * 24
              ]
            },
            daysSinceLastUsage: {
              $divide: [
                { $subtract: [new Date(), '$lastUsage'] },
                1000 * 60 * 60 * 24
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers7d: {
              $sum: {
                $cond: [{ $lte: ['$daysSinceLastUsage', 7] }, 1, 0]
              }
            },
            activeUsers30d: {
              $sum: {
                $cond: [{ $lte: ['$daysSinceLastUsage', 30] }, 1, 0]
              }
            },
            averageDaysSinceFirstUsage: { $avg: '$daysSinceFirstUsage' },
            averageDaysSinceLastUsage: { $avg: '$daysSinceLastUsage' }
          }
        }
      ];
      
      const results = await Promotion.aggregate(pipeline);
      const retention = results[0] || {
        totalUsers: 0,
        activeUsers7d: 0,
        activeUsers30d: 0,
        averageDaysSinceFirstUsage: 0,
        averageDaysSinceLastUsage: 0
      };
      
      // Calculate retention rates
      retention.retention7d = retention.totalUsers > 0 ? (retention.activeUsers7d / retention.totalUsers) * 100 : 0;
      retention.retention30d = retention.totalUsers > 0 ? (retention.activeUsers30d / retention.totalUsers) * 100 : 0;
      
      return retention;
    } catch (error) {
      console.error('Error getting promotion retention analytics:', error);
      throw error;
    }
  }

  /**
   * Calculate estimated ROI for a promotion
   */
  calculateEstimatedROI(promotionData) {
    // This is a simplified ROI calculation
    // In practice, you'd need to track actual revenue generated by users who used promotions
    
    const totalCost = promotionData.totalCost;
    const userCount = promotionData.uniqueUserCount;
    
    // Estimate revenue based on user engagement
    // This is a placeholder - you'd want to integrate with actual revenue tracking
    const estimatedRevenuePerUser = 100; // $100 average revenue per engaged user
    const estimatedTotalRevenue = userCount * estimatedRevenuePerUser;
    
    if (totalCost === 0) return 0;
    
    const roi = ((estimatedTotalRevenue - totalCost) / totalCost) * 100;
    return Math.round(roi * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Generate comprehensive promotion report
   */
  async generatePromotionReport(options = {}) {
    try {
      const {
        startDate,
        endDate,
        promotionIds,
        format = 'json'
      } = options;
      
      const analytics = await this.getPromotionPerformanceAnalytics({
        startDate,
        endDate,
        promotionId: promotionIds ? { $in: promotionIds } : undefined
      });
      
      const report = {
        reportMetadata: {
          generatedAt: new Date(),
          dateRange: { startDate, endDate },
          promotionIds,
          format
        },
        executiveSummary: this.generateExecutiveSummary(analytics),
        detailedAnalytics: analytics,
        recommendations: this.generateRecommendations(analytics)
      };
      
      if (format === 'csv') {
        return this.convertReportToCSV(report);
      }
      
      return report;
    } catch (error) {
      console.error('Error generating promotion report:', error);
      throw error;
    }
  }

  /**
   * Generate executive summary
   */
  generateExecutiveSummary(analytics) {
    const { performance, conversion, revenueImpact, userEngagement } = analytics;
    
    const totalPromotions = performance.promotionSummary.length;
    const totalUsers = userEngagement.engagement.totalUsers;
    const totalCost = revenueImpact.totals.totalCost;
    const averageConversionRate = conversion.overall.overallConversionRate;
    
    return {
      totalPromotions,
      totalUsers,
      totalCost,
      averageConversionRate,
      keyInsights: [
        `${totalPromotions} promotions analyzed with ${totalUsers} participating users`,
        `Overall conversion rate of ${averageConversionRate.toFixed(1)}%`,
        `Total promotional cost of $${totalCost.toFixed(2)}`,
        `Average cost per user: $${revenueImpact.averageCostPerUser.toFixed(2)}`
      ]
    };
  }

  /**
   * Generate recommendations based on analytics
   */
  generateRecommendations(analytics) {
    const recommendations = [];
    const { conversion, revenueImpact, userEngagement } = analytics;
    
    // Conversion rate recommendations
    if (conversion.overall.overallConversionRate < 50) {
      recommendations.push({
        type: 'conversion',
        priority: 'high',
        title: 'Improve Promotion Conversion Rate',
        description: `Current conversion rate of ${conversion.overall.overallConversionRate.toFixed(1)}% is below optimal. Consider improving targeting or promotion value.`
      });
    }
    
    // Cost efficiency recommendations
    if (revenueImpact.averageCostPerUser > 50) {
      recommendations.push({
        type: 'cost',
        priority: 'medium',
        title: 'Optimize Cost Per User',
        description: `Average cost per user of $${revenueImpact.averageCostPerUser.toFixed(2)} may be high. Review promotion structures for efficiency.`
      });
    }
    
    // Engagement recommendations
    if (userEngagement.engagementLevels.high < userEngagement.engagement.totalUsers * 0.2) {
      recommendations.push({
        type: 'engagement',
        priority: 'medium',
        title: 'Increase User Engagement',
        description: 'Less than 20% of users are highly engaged. Consider creating promotion sequences or loyalty programs.'
      });
    }
    
    return recommendations;
  }

  /**
   * Convert report to CSV format
   */
  convertReportToCSV(report) {
    // This would convert the report data to CSV format
    // Implementation would depend on specific requirements
    const csvData = [
      ['Metric', 'Value'],
      ['Total Promotions', report.executiveSummary.totalPromotions],
      ['Total Users', report.executiveSummary.totalUsers],
      ['Total Cost', report.executiveSummary.totalCost],
      ['Average Conversion Rate', report.executiveSummary.averageConversionRate + '%']
    ];
    
    return csvData.map(row => row.join(',')).join('\n');
  }
}

module.exports = PromotionAnalyticsService;