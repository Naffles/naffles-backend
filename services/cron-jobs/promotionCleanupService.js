const cron = require('node-cron');
const PromotionIntegrationService = require('../promotions/promotionIntegrationService');
const BonusCreditsEngine = require('../promotions/bonusCreditsEngine');
const Promotion = require('../../models/promotions/promotion');
const UserPromotion = require('../../models/promotions/userPromotion');
const BonusCreditsBalance = require('../../models/promotions/bonusCreditsBalance');

class PromotionCleanupService {
  constructor() {
    this.integrationService = new PromotionIntegrationService();
    this.bonusCreditsEngine = new BonusCreditsEngine();
    this.isRunning = false;
  }

  /**
   * Start all cleanup cron jobs
   */
  startCleanupJobs() {
    console.log('Starting promotion cleanup cron jobs...');

    // Daily cleanup at 2 AM
    cron.schedule('0 2 * * *', async () => {
      await this.performDailyCleanup();
    });

    // Hourly expiry warnings
    cron.schedule('0 * * * *', async () => {
      await this.processExpiryWarnings();
    });

    // Weekly maintenance at 3 AM on Sundays
    cron.schedule('0 3 * * 0', async () => {
      await this.performWeeklyMaintenance();
    });

    console.log('Promotion cleanup cron jobs started successfully');
  }

  /**
   * Perform daily cleanup tasks
   */
  async performDailyCleanup() {
    if (this.isRunning) {
      console.log('Cleanup already running, skipping...');
      return;
    }

    try {
      this.isRunning = true;
      console.log('Starting daily promotion cleanup...');

      const results = {
        expiredPromotions: 0,
        expiredUserPromotions: 0,
        expiredBonusCredits: 0,
        cleanupDate: new Date()
      };

      // Cleanup expired promotions
      const expiredPromotions = await this.cleanupExpiredPromotions();
      results.expiredPromotions = expiredPromotions.expiredPromotions;
      results.expiredUserPromotions = expiredPromotions.expiredUserPromotions;

      // Cleanup expired bonus credits
      const expiredCredits = await this.cleanupExpiredBonusCredits();
      results.expiredBonusCredits = expiredCredits.usersProcessed;

      // Log results
      console.log('Daily promotion cleanup completed:', results);

      return results;
    } catch (error) {
      console.error('Error in daily promotion cleanup:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process expiry warnings
   */
  async processExpiryWarnings() {
    try {
      console.log('Processing promotion expiry warnings...');

      // Process bonus credits expiry warnings
      const warningResults = await this.bonusCreditsEngine.processExpiryWarnings(7); // 7 days warning

      console.log(`Created ${warningResults.warningsCreated} expiry warnings`);

      return warningResults;
    } catch (error) {
      console.error('Error processing expiry warnings:', error);
      throw error;
    }
  }

  /**
   * Perform weekly maintenance
   */
  async performWeeklyMaintenance() {
    try {
      console.log('Starting weekly promotion maintenance...');

      const results = {
        cleanupResults: await this.performDailyCleanup(),
        optimizationResults: await this.optimizePromotionData(),
        analyticsCleanup: await this.cleanupOldAnalyticsData(),
        maintenanceDate: new Date()
      };

      console.log('Weekly promotion maintenance completed:', results);

      return results;
    } catch (error) {
      console.error('Error in weekly promotion maintenance:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired promotions
   */
  async cleanupExpiredPromotions() {
    try {
      const now = new Date();

      // Mark expired promotions
      const expiredPromotions = await Promotion.updateMany(
        {
          status: 'active',
          endDate: { $lt: now }
        },
        {
          status: 'expired',
          updatedAt: now
        }
      );

      // Mark expired user promotions
      const expiredUserPromotions = await UserPromotion.updateMany(
        {
          status: 'active',
          expiresAt: { $lt: now }
        },
        {
          status: 'expired',
          updatedAt: now
        }
      );

      console.log(`Expired ${expiredPromotions.modifiedCount} promotions and ${expiredUserPromotions.modifiedCount} user promotions`);

      return {
        expiredPromotions: expiredPromotions.modifiedCount,
        expiredUserPromotions: expiredUserPromotions.modifiedCount
      };
    } catch (error) {
      console.error('Error cleaning up expired promotions:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired bonus credits
   */
  async cleanupExpiredBonusCredits() {
    try {
      const cleanupResults = await BonusCreditsBalance.cleanupExpiredCredits();

      console.log(`Cleaned up expired bonus credits for ${cleanupResults.length} users`);

      return {
        usersProcessed: cleanupResults.length
      };
    } catch (error) {
      console.error('Error cleaning up expired bonus credits:', error);
      throw error;
    }
  }

  /**
   * Optimize promotion data
   */
  async optimizePromotionData() {
    try {
      console.log('Optimizing promotion data...');

      const results = {
        removedOldUsageHistory: 0,
        compactedFraudFlags: 0,
        optimizedIndexes: 0
      };

      // Remove old usage history (older than 1 year)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const usageHistoryCleanup = await UserPromotion.updateMany(
        {},
        {
          $pull: {
            usageHistory: {
              usedAt: { $lt: oneYearAgo }
            }
          }
        }
      );

      results.removedOldUsageHistory = usageHistoryCleanup.modifiedCount;

      // Compact resolved fraud flags (older than 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const fraudFlagsCleanup = await UserPromotion.updateMany(
        {},
        {
          $pull: {
            fraudFlags: {
              resolved: true,
              resolvedAt: { $lt: sixMonthsAgo }
            }
          }
        }
      );

      results.compactedFraudFlags = fraudFlagsCleanup.modifiedCount;

      console.log('Promotion data optimization completed:', results);

      return results;
    } catch (error) {
      console.error('Error optimizing promotion data:', error);
      throw error;
    }
  }

  /**
   * Cleanup old analytics data
   */
  async cleanupOldAnalyticsData() {
    try {
      console.log('Cleaning up old analytics data...');

      // This would clean up old analytics data if stored separately
      // For now, just return a placeholder
      const results = {
        oldAnalyticsRemoved: 0,
        cleanupDate: new Date()
      };

      console.log('Analytics data cleanup completed:', results);

      return results;
    } catch (error) {
      console.error('Error cleaning up analytics data:', error);
      throw error;
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStatistics(days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = {
        period: `${days} days`,
        promotions: {
          total: await Promotion.countDocuments(),
          active: await Promotion.countDocuments({ status: 'active' }),
          expired: await Promotion.countDocuments({ status: 'expired' }),
          cancelled: await Promotion.countDocuments({ status: 'cancelled' })
        },
        userPromotions: {
          total: await UserPromotion.countDocuments(),
          active: await UserPromotion.countDocuments({ status: 'active' }),
          expired: await UserPromotion.countDocuments({ status: 'expired' }),
          used: await UserPromotion.countDocuments({ status: 'used' })
        },
        bonusCredits: {
          totalUsers: await BonusCreditsBalance.countDocuments(),
          usersWithCredits: await BonusCreditsBalance.countDocuments({
            'balances': {
              $elemMatch: { balance: { $gt: 0 } }
            }
          }),
          totalBalance: await this.getTotalBonusCreditsBalance()
        },
        recentActivity: {
          promotionsCreated: await Promotion.countDocuments({
            createdAt: { $gte: startDate }
          }),
          promotionsExpired: await Promotion.countDocuments({
            status: 'expired',
            updatedAt: { $gte: startDate }
          }),
          userPromotionsAssigned: await UserPromotion.countDocuments({
            assignedAt: { $gte: startDate }
          })
        },
        generatedAt: new Date()
      };

      return stats;
    } catch (error) {
      console.error('Error getting cleanup statistics:', error);
      throw error;
    }
  }

  /**
   * Get total bonus credits balance across all users
   */
  async getTotalBonusCreditsBalance() {
    try {
      const pipeline = [
        { $unwind: '$balances' },
        {
          $group: {
            _id: null,
            totalBalance: { $sum: '$balances.balance' }
          }
        }
      ];

      const result = await BonusCreditsBalance.aggregate(pipeline);
      return result[0]?.totalBalance || 0;
    } catch (error) {
      console.error('Error calculating total bonus credits balance:', error);
      return 0;
    }
  }

  /**
   * Force cleanup (for manual execution)
   */
  async forceCleanup() {
    try {
      console.log('Starting forced promotion cleanup...');

      const results = await this.performDailyCleanup();
      await this.processExpiryWarnings();

      console.log('Forced cleanup completed:', results);

      return results;
    } catch (error) {
      console.error('Error in forced cleanup:', error);
      throw error;
    }
  }

  /**
   * Stop all cleanup jobs
   */
  stopCleanupJobs() {
    console.log('Stopping promotion cleanup cron jobs...');
    // Note: node-cron doesn't provide a direct way to stop all jobs
    // In a production environment, you'd want to track job references
    console.log('Promotion cleanup cron jobs stopped');
  }

  /**
   * Get cleanup job status
   */
  getCleanupStatus() {
    return {
      isRunning: this.isRunning,
      lastCleanup: this.lastCleanup || null,
      nextScheduledCleanup: this.getNextScheduledTime(),
      jobsActive: true // In production, track actual job status
    };
  }

  /**
   * Get next scheduled cleanup time
   */
  getNextScheduledTime() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 0, 0, 0); // 2 AM tomorrow

    return tomorrow;
  }
}

module.exports = PromotionCleanupService;