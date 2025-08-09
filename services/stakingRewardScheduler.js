const cron = require('node-cron');
const stakingService = require('./stakingService');
const stakingRewardDistributionService = require('./stakingRewardDistributionService');

class StakingRewardScheduler {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.nextRun = null;
  }

  start() {
    if (this.isRunning) {
      console.log('Staking reward scheduler is already running');
      return;
    }

    // Run monthly reward distribution on the 1st of each month at 2 AM
    this.monthlyRewardJob = cron.schedule('0 2 1 * *', async () => {
      await this.distributeMonthlyRewards();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Run daily check for any missed distributions at 3 AM
    this.dailyCheckJob = cron.schedule('0 3 * * *', async () => {
      await this.checkMissedDistributions();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.monthlyRewardJob.start();
    this.dailyCheckJob.start();
    
    this.isRunning = true;
    console.log('Staking reward scheduler started');
    
    // Calculate next run time
    this.updateNextRunTime();
  }

  stop() {
    if (!this.isRunning) {
      console.log('Staking reward scheduler is not running');
      return;
    }

    if (this.monthlyRewardJob) {
      this.monthlyRewardJob.stop();
    }
    
    if (this.dailyCheckJob) {
      this.dailyCheckJob.stop();
    }

    this.isRunning = false;
    console.log('Staking reward scheduler stopped');
  }

  async distributeMonthlyRewards() {
    try {
      console.log('Starting monthly staking reward distribution...');
      this.lastRun = new Date();
      
      const results = await stakingRewardDistributionService.distributeMonthlyRewards();
      
      console.log(`Monthly reward distribution completed:`, {
        totalProcessed: results.totalProcessed,
        successful: results.successful,
        failed: results.failed,
        timestamp: this.lastRun
      });

      // Log any failures for investigation
      if (results.failed > 0) {
        const failedResults = results.results.filter(r => !r.success);
        console.error('Failed reward distributions:', failedResults);
      }

      this.updateNextRunTime();
      return results;
    } catch (error) {
      console.error('Error in monthly reward distribution:', error);
      throw error;
    }
  }

  async checkMissedDistributions() {
    try {
      console.log('Checking for missed reward distributions...');
      const results = await stakingRewardDistributionService.checkAndProcessMissedDistributions();
      
      console.log('Missed distribution check completed:', {
        processedPositions: results.processedPositions,
        successful: results.successful,
        failed: results.failed
      });
      
      return results;
    } catch (error) {
      console.error('Error checking missed distributions:', error);
    }
  }

  updateNextRunTime() {
    // Calculate next first of month at 2 AM UTC
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 2, 0, 0, 0);
    this.nextRun = nextMonth;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      uptime: this.isRunning ? Date.now() - (this.lastRun?.getTime() || Date.now()) : 0
    };
  }

  // Manual trigger for testing or admin use
  async manualDistribution(positionIds = null) {
    if (!this.isRunning) {
      throw new Error('Scheduler is not running');
    }
    
    console.log('Manual reward distribution triggered');
    return await stakingRewardDistributionService.manualDistribution(positionIds);
  }

  // Get distribution statistics
  getDistributionStats() {
    return {
      scheduler: this.getStatus(),
      distribution: stakingRewardDistributionService.getDistributionStats()
    };
  }
}

module.exports = new StakingRewardScheduler();