const cron = require('node-cron');
const notificationService = require('../realtime/notificationService');
const realTimeService = require('../realtime/realTimeService');

class RealTimeCleanup {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Start all real-time cleanup cron jobs
   */
  start() {
    if (this.isRunning) {
      console.log('Real-time cleanup jobs are already running');
      return;
    }

    console.log('Starting real-time cleanup cron jobs...');

    // Clean up expired notifications every hour
    this.notificationCleanupJob = cron.schedule('0 * * * *', async () => {
      try {
        console.log('Running notification cleanup...');
        const cleanedCount = await notificationService.cleanupExpiredNotifications();
        console.log(`Cleaned up ${cleanedCount} expired notifications`);
      } catch (error) {
        console.error('Error in notification cleanup job:', error);
      }
    }, {
      scheduled: false
    });

    // Update leaderboard every 5 minutes
    this.leaderboardUpdateJob = cron.schedule('*/5 * * * *', async () => {
      try {
        console.log('Updating leaderboard...');
        await realTimeService.updateLeaderboard();
        console.log('Leaderboard updated successfully');
      } catch (error) {
        console.error('Error in leaderboard update job:', error);
      }
    }, {
      scheduled: false
    });

    // Initialize raffle tracking every 10 minutes (in case of missed raffles)
    this.raffleTrackingJob = cron.schedule('*/10 * * * *', async () => {
      try {
        console.log('Reinitializing raffle tracking...');
        await realTimeService.initializeRaffleTracking();
        console.log('Raffle tracking reinitialized successfully');
      } catch (error) {
        console.error('Error in raffle tracking job:', error);
      }
    }, {
      scheduled: false
    });

    // Clean up old chat messages every day at 2 AM
    this.chatCleanupJob = cron.schedule('0 2 * * *', async () => {
      try {
        console.log('Running chat cleanup...');
        await this.cleanupOldChatMessages();
        console.log('Chat cleanup completed');
      } catch (error) {
        console.error('Error in chat cleanup job:', error);
      }
    }, {
      scheduled: false
    });

    // Start all jobs
    this.notificationCleanupJob.start();
    this.leaderboardUpdateJob.start();
    this.raffleTrackingJob.start();
    this.chatCleanupJob.start();

    this.isRunning = true;
    console.log('Real-time cleanup cron jobs started successfully');
  }

  /**
   * Stop all real-time cleanup cron jobs
   */
  stop() {
    if (!this.isRunning) {
      console.log('Real-time cleanup jobs are not running');
      return;
    }

    console.log('Stopping real-time cleanup cron jobs...');

    if (this.notificationCleanupJob) {
      this.notificationCleanupJob.stop();
    }

    if (this.leaderboardUpdateJob) {
      this.leaderboardUpdateJob.stop();
    }

    if (this.raffleTrackingJob) {
      this.raffleTrackingJob.stop();
    }

    if (this.chatCleanupJob) {
      this.chatCleanupJob.stop();
    }

    this.isRunning = false;
    console.log('Real-time cleanup cron jobs stopped');
  }

  /**
   * Clean up old chat messages (older than 30 days)
   */
  async cleanupOldChatMessages() {
    try {
      const { getAsync, setAsync, getAllKeys } = require('../../config/redisClient');
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      // Get all chat keys
      const keys = await getAllKeys('chat:*');
      let cleanedMessages = 0;

      for (const key of keys) {
        try {
          const chatData = await getAsync(key) || '[]';
          const messages = JSON.parse(chatData);
          
          const filteredMessages = messages.filter(message => {
            const messageDate = new Date(message.timestamp);
            return messageDate > thirtyDaysAgo;
          });

          if (filteredMessages.length < messages.length) {
            await setAsync(key, JSON.stringify(filteredMessages));
            cleanedMessages += (messages.length - filteredMessages.length);
          }
        } catch (error) {
          console.error(`Error cleaning chat key ${key}:`, error);
        }
      }

      return cleanedMessages;
    } catch (error) {
      console.error('Error in chat cleanup:', error);
      return 0;
    }
  }

  /**
   * Get status of all cleanup jobs
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobs: {
        notificationCleanup: this.notificationCleanupJob ? this.notificationCleanupJob.running : false,
        leaderboardUpdate: this.leaderboardUpdateJob ? this.leaderboardUpdateJob.running : false,
        raffleTracking: this.raffleTrackingJob ? this.raffleTrackingJob.running : false,
        chatCleanup: this.chatCleanupJob ? this.chatCleanupJob.running : false
      }
    };
  }

  /**
   * Run cleanup manually (for testing or immediate cleanup)
   */
  async runManualCleanup() {
    try {
      console.log('Running manual cleanup...');
      
      const [notificationCount, chatCount] = await Promise.all([
        notificationService.cleanupExpiredNotifications(),
        this.cleanupOldChatMessages()
      ]);

      await realTimeService.updateLeaderboard();
      await realTimeService.initializeRaffleTracking();

      console.log(`Manual cleanup completed: ${notificationCount} notifications, ${chatCount} chat messages`);
      
      return {
        success: true,
        notificationsCleared: notificationCount,
        chatMessagesCleared: chatCount
      };
    } catch (error) {
      console.error('Error in manual cleanup:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Create singleton instance
const realTimeCleanup = new RealTimeCleanup();

module.exports = realTimeCleanup;