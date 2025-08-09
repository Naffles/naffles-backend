const EventEmitter = require('events');
const Promotion = require('../../models/promotions/promotion');
const UserPromotion = require('../../models/promotions/userPromotion');
const BonusCreditsBalance = require('../../models/promotions/bonusCreditsBalance');
const FraudPreventionService = require('./fraudPreventionService');

class PromotionMonitoringService extends EventEmitter {
  constructor() {
    super();
    this.fraudPreventionService = new FraudPreventionService();
    this.metrics = {
      promotionUsage: new Map(),
      fraudAlerts: new Map(),
      systemHealth: {
        lastCheck: null,
        status: 'unknown',
        issues: []
      }
    };
    
    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Start monitoring services
   */
  startMonitoring() {
    console.log('Starting promotion system monitoring...');

    // Monitor promotion usage every 5 minutes
    setInterval(() => {
      this.monitorPromotionUsage();
    }, 5 * 60 * 1000);

    // Monitor fraud patterns every 10 minutes
    setInterval(() => {
      this.monitorFraudPatterns();
    }, 10 * 60 * 1000);

    // Monitor system health every minute
    setInterval(() => {
      this.monitorSystemHealth();
    }, 60 * 1000);

    // Monitor bonus credits every 15 minutes
    setInterval(() => {
      this.monitorBonusCredits();
    }, 15 * 60 * 1000);

    console.log('Promotion system monitoring started');
  }

  /**
   * Monitor promotion usage patterns
   */
  async monitorPromotionUsage() {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Get recent promotion usage
      const recentUsage = await UserPromotion.aggregate([
        {
          $match: {
            'usageHistory.usedAt': { $gte: oneHourAgo }
          }
        },
        { $unwind: '$usageHistory' },
        {
          $match: {
            'usageHistory.usedAt': { $gte: oneHourAgo }
          }
        },
        {
          $group: {
            _id: '$promotionId',
            usageCount: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userId' },
            totalSavings: { $sum: '$usageHistory.discountAmount' },
            totalBonus: { $sum: '$usageHistory.bonusAmount' }
          }
        },
        {
          $lookup: {
            from: 'promotions',
            localField: '_id',
            foreignField: '_id',
            as: 'promotion'
          }
        },
        { $unwind: '$promotion' }
      ]);

      // Check for unusual usage patterns
      for (const usage of recentUsage) {
        const promotionId = usage._id.toString();
        const previousUsage = this.metrics.promotionUsage.get(promotionId) || { usageCount: 0 };
        
        // Alert if usage increased by more than 500% in one hour
        if (usage.usageCount > previousUsage.usageCount * 5 && previousUsage.usageCount > 0) {
          this.createAlert({
            type: 'unusual_usage_spike',
            severity: 'high',
            promotionId,
            promotionName: usage.promotion.name,
            message: `Promotion usage spiked from ${previousUsage.usageCount} to ${usage.usageCount} in the last hour`,
            data: {
              previousUsage: previousUsage.usageCount,
              currentUsage: usage.usageCount,
              uniqueUsers: usage.uniqueUsers.length,
              totalSavings: usage.totalSavings,
              totalBonus: usage.totalBonus
            }
          });
        }

        // Alert if too many unique users (possible bot attack)
        if (usage.uniqueUsers.length > 100) {
          this.createAlert({
            type: 'high_user_volume',
            severity: 'medium',
            promotionId,
            promotionName: usage.promotion.name,
            message: `${usage.uniqueUsers.length} unique users used promotion in the last hour`,
            data: {
              uniqueUsers: usage.uniqueUsers.length,
              usageCount: usage.usageCount,
              averageUsagePerUser: usage.usageCount / usage.uniqueUsers.length
            }
          });
        }

        // Update metrics
        this.metrics.promotionUsage.set(promotionId, {
          usageCount: usage.usageCount,
          uniqueUsers: usage.uniqueUsers.length,
          totalSavings: usage.totalSavings,
          totalBonus: usage.totalBonus,
          lastUpdated: now
        });
      }

      this.emit('usage_monitoring_complete', { recentUsage, timestamp: now });
    } catch (error) {
      console.error('Error monitoring promotion usage:', error);
      this.createAlert({
        type: 'monitoring_error',
        severity: 'high',
        message: 'Failed to monitor promotion usage',
        error: error.message
      });
    }
  }

  /**
   * Monitor fraud patterns
   */
  async monitorFraudPatterns() {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Get recent fraud flags
      const recentFraudFlags = await UserPromotion.aggregate([
        {
          $match: {
            'fraudFlags.flaggedAt': { $gte: oneHourAgo }
          }
        },
        { $unwind: '$fraudFlags' },
        {
          $match: {
            'fraudFlags.flaggedAt': { $gte: oneHourAgo }
          }
        },
        {
          $group: {
            _id: '$fraudFlags.flagType',
            count: { $sum: 1 },
            users: { $addToSet: '$userId' }
          }
        }
      ]);

      // Check for fraud pattern spikes
      for (const fraudData of recentFraudFlags) {
        const flagType = fraudData._id;
        const previousCount = this.metrics.fraudAlerts.get(flagType) || 0;

        // Alert if fraud flags increased significantly
        if (fraudData.count > previousCount * 3 && previousCount > 0) {
          this.createAlert({
            type: 'fraud_pattern_spike',
            severity: 'high',
            message: `${flagType} fraud flags increased from ${previousCount} to ${fraudData.count} in the last hour`,
            data: {
              flagType,
              previousCount,
              currentCount: fraudData.count,
              affectedUsers: fraudData.users.length
            }
          });
        }

        // Alert if too many users flagged for same issue
        if (fraudData.users.length > 10) {
          this.createAlert({
            type: 'widespread_fraud_pattern',
            severity: 'high',
            message: `${fraudData.users.length} users flagged for ${flagType} in the last hour`,
            data: {
              flagType,
              affectedUsers: fraudData.users.length,
              totalFlags: fraudData.count
            }
          });
        }

        this.metrics.fraudAlerts.set(flagType, fraudData.count);
      }

      this.emit('fraud_monitoring_complete', { recentFraudFlags, timestamp: now });
    } catch (error) {
      console.error('Error monitoring fraud patterns:', error);
      this.createAlert({
        type: 'monitoring_error',
        severity: 'high',
        message: 'Failed to monitor fraud patterns',
        error: error.message
      });
    }
  }

  /**
   * Monitor system health
   */
  async monitorSystemHealth() {
    try {
      const now = new Date();
      const issues = [];

      // Check database connectivity
      try {
        await Promotion.findOne().limit(1);
      } catch (error) {
        issues.push({
          type: 'database_connectivity',
          severity: 'critical',
          message: 'Cannot connect to promotions database',
          error: error.message
        });
      }

      // Check for stuck promotions (active but past end date)
      const stuckPromotions = await Promotion.countDocuments({
        status: 'active',
        endDate: { $lt: now }
      });

      if (stuckPromotions > 0) {
        issues.push({
          type: 'stuck_promotions',
          severity: 'medium',
          message: `${stuckPromotions} promotions are active but past their end date`,
          count: stuckPromotions
        });
      }

      // Check for promotions with no assignments
      const unassignedPromotions = await Promotion.aggregate([
        { $match: { status: 'active' } },
        {
          $lookup: {
            from: 'userpromotions',
            localField: '_id',
            foreignField: 'promotionId',
            as: 'assignments'
          }
        },
        {
          $match: {
            assignments: { $size: 0 }
          }
        },
        { $count: 'count' }
      ]);

      const unassignedCount = unassignedPromotions[0]?.count || 0;
      if (unassignedCount > 5) {
        issues.push({
          type: 'unassigned_promotions',
          severity: 'low',
          message: `${unassignedCount} active promotions have no user assignments`,
          count: unassignedCount
        });
      }

      // Check bonus credits balance integrity
      const bonusCreditsIssues = await this.checkBonusCreditsIntegrity();
      issues.push(...bonusCreditsIssues);

      // Update system health
      this.metrics.systemHealth = {
        lastCheck: now,
        status: issues.length === 0 ? 'healthy' : 
                issues.some(i => i.severity === 'critical') ? 'critical' :
                issues.some(i => i.severity === 'high') ? 'degraded' : 'warning',
        issues
      };

      // Create alerts for critical issues
      for (const issue of issues) {
        if (issue.severity === 'critical' || issue.severity === 'high') {
          this.createAlert({
            type: 'system_health_issue',
            severity: issue.severity,
            message: issue.message,
            data: issue
          });
        }
      }

      this.emit('health_monitoring_complete', this.metrics.systemHealth);
    } catch (error) {
      console.error('Error monitoring system health:', error);
      this.metrics.systemHealth = {
        lastCheck: new Date(),
        status: 'critical',
        issues: [{
          type: 'monitoring_failure',
          severity: 'critical',
          message: 'Health monitoring system failed',
          error: error.message
        }]
      };
    }
  }

  /**
   * Monitor bonus credits
   */
  async monitorBonusCredits() {
    try {
      const now = new Date();
      const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Check for credits expiring soon
      const expiringCredits = await BonusCreditsBalance.aggregate([
        {
          $match: {
            'expiryEntries.status': 'active',
            'expiryEntries.expiresAt': { $lte: oneDayFromNow, $gt: now }
          }
        },
        { $unwind: '$expiryEntries' },
        {
          $match: {
            'expiryEntries.status': 'active',
            'expiryEntries.expiresAt': { $lte: oneDayFromNow, $gt: now }
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$expiryEntries.amount' },
            affectedUsers: { $addToSet: '$userId' },
            entries: { $push: '$expiryEntries' }
          }
        }
      ]);

      if (expiringCredits.length > 0) {
        const expiring = expiringCredits[0];
        
        if (expiring.totalAmount > 10000) { // Alert if more than $10k expiring
          this.createAlert({
            type: 'large_bonus_credits_expiring',
            severity: 'medium',
            message: `$${expiring.totalAmount.toFixed(2)} in bonus credits expiring within 24 hours`,
            data: {
              totalAmount: expiring.totalAmount,
              affectedUsers: expiring.affectedUsers.length,
              entriesCount: expiring.entries.length
            }
          });
        }
      }

      // Check for negative balances (should never happen)
      const negativeBalances = await BonusCreditsBalance.countDocuments({
        'balances.balance': { $lt: 0 }
      });

      if (negativeBalances > 0) {
        this.createAlert({
          type: 'negative_bonus_balances',
          severity: 'critical',
          message: `${negativeBalances} users have negative bonus credit balances`,
          data: { affectedUsers: negativeBalances }
        });
      }

      this.emit('bonus_credits_monitoring_complete', { 
        expiringCredits: expiringCredits[0] || null,
        negativeBalances,
        timestamp: now 
      });
    } catch (error) {
      console.error('Error monitoring bonus credits:', error);
      this.createAlert({
        type: 'monitoring_error',
        severity: 'high',
        message: 'Failed to monitor bonus credits',
        error: error.message
      });
    }
  }

  /**
   * Check bonus credits balance integrity
   */
  async checkBonusCreditsIntegrity() {
    const issues = [];

    try {
      // Check for inconsistent balance calculations
      const inconsistentBalances = await BonusCreditsBalance.aggregate([
        { $unwind: '$balances' },
        {
          $addFields: {
            calculatedBalance: {
              $subtract: [
                '$balances.totalAwarded',
                { $add: ['$balances.totalUsed', '$balances.totalExpired'] }
              ]
            }
          }
        },
        {
          $match: {
            $expr: {
              $ne: ['$balances.balance', '$calculatedBalance']
            }
          }
        },
        { $count: 'count' }
      ]);

      const inconsistentCount = inconsistentBalances[0]?.count || 0;
      if (inconsistentCount > 0) {
        issues.push({
          type: 'bonus_balance_inconsistency',
          severity: 'high',
          message: `${inconsistentCount} bonus credit balances are inconsistent`,
          count: inconsistentCount
        });
      }
    } catch (error) {
      issues.push({
        type: 'bonus_integrity_check_failed',
        severity: 'medium',
        message: 'Failed to check bonus credits integrity',
        error: error.message
      });
    }

    return issues;
  }

  /**
   * Create alert
   */
  createAlert(alertData) {
    const alert = {
      id: this.generateAlertId(),
      timestamp: new Date(),
      ...alertData
    };

    console.warn('PROMOTION SYSTEM ALERT:', alert);

    // Emit alert event
    this.emit('alert', alert);

    // In production, you would send this to your alerting system
    // (e.g., Slack, PagerDuty, email, etc.)
    this.sendAlert(alert);

    return alert;
  }

  /**
   * Send alert to external systems
   */
  async sendAlert(alert) {
    try {
      // This would integrate with your alerting system
      // For now, just log to console
      
      if (alert.severity === 'critical') {
        console.error('🚨 CRITICAL PROMOTION ALERT:', alert.message);
      } else if (alert.severity === 'high') {
        console.warn('⚠️  HIGH PRIORITY PROMOTION ALERT:', alert.message);
      } else {
        console.info('ℹ️  PROMOTION ALERT:', alert.message);
      }

      // Example integrations:
      // await this.sendSlackAlert(alert);
      // await this.sendEmailAlert(alert);
      // await this.sendPagerDutyAlert(alert);
    } catch (error) {
      console.error('Error sending alert:', error);
    }
  }

  /**
   * Generate unique alert ID
   */
  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics() {
    return {
      promotionUsage: Object.fromEntries(this.metrics.promotionUsage),
      fraudAlerts: Object.fromEntries(this.metrics.fraudAlerts),
      systemHealth: this.metrics.systemHealth,
      lastUpdated: new Date()
    };
  }

  /**
   * Get system status
   */
  getSystemStatus() {
    return {
      status: this.metrics.systemHealth.status,
      lastCheck: this.metrics.systemHealth.lastCheck,
      issueCount: this.metrics.systemHealth.issues.length,
      criticalIssues: this.metrics.systemHealth.issues.filter(i => i.severity === 'critical').length,
      monitoringActive: true
    };
  }

  /**
   * Force health check
   */
  async forceHealthCheck() {
    await this.monitorSystemHealth();
    await this.monitorPromotionUsage();
    await this.monitorFraudPatterns();
    await this.monitorBonusCredits();

    return this.getCurrentMetrics();
  }

  /**
   * Set alert thresholds
   */
  setAlertThresholds(thresholds) {
    this.alertThresholds = {
      ...this.alertThresholds,
      ...thresholds
    };
  }

  /**
   * Get alert history (last 24 hours)
   */
  getAlertHistory() {
    // In production, this would query a persistent alert store
    // For now, return empty array as alerts are only logged
    return [];
  }
}

module.exports = PromotionMonitoringService;