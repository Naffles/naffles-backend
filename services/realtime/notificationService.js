const io = require('../../config/socket');
const User = require('../../models/user/user');
const { getAsync, setAsync } = require('../../config/redisClient');

class NotificationService {
  constructor() {
    this.notificationTypes = {
      RAFFLE_WIN: 'raffle_win',
      RAFFLE_ENTRY: 'raffle_entry',
      RAFFLE_WARNING: 'raffle_warning',
      GAME_WIN: 'game_win',
      GAME_LOSS: 'game_loss',
      POINTS_EARNED: 'points_earned',
      ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',
      COMMUNITY_INVITE: 'community_invite',
      SYSTEM_ANNOUNCEMENT: 'system_announcement',
      FRIEND_REQUEST: 'friend_request',
      CHAT_MENTION: 'chat_mention'
    };
  }

  /**
   * Send notification to a specific user
   */
  async sendNotification(userId, notification) {
    try {
      const fullNotification = {
        id: this.generateNotificationId(),
        userId: userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data || {},
        read: false,
        timestamp: new Date(),
        expiresAt: notification.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      };

      // Store notification
      await this.storeNotification(userId, fullNotification);

      // Send real-time notification
      io.to(`user:${userId}`).emit('notification', fullNotification);

      // Update notification count
      await this.updateNotificationCount(userId);

      return fullNotification;
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  /**
   * Send notification to multiple users
   */
  async sendBulkNotifications(userIds, notification) {
    try {
      const results = [];
      
      for (const userId of userIds) {
        try {
          const result = await this.sendNotification(userId, notification);
          results.push({ userId, success: true, notification: result });
        } catch (error) {
          results.push({ userId, success: false, error: error.message });
        }
      }

      return results;
    } catch (error) {
      console.error('Error sending bulk notifications:', error);
      throw error;
    }
  }

  /**
   * Send system-wide announcement
   */
  async sendSystemAnnouncement(announcement) {
    try {
      const notification = {
        type: this.notificationTypes.SYSTEM_ANNOUNCEMENT,
        title: announcement.title,
        message: announcement.message,
        data: announcement.data || {}
      };

      // Broadcast to all connected users
      io.emit('systemAnnouncement', {
        id: this.generateNotificationId(),
        ...notification,
        timestamp: new Date()
      });

      // Optionally store for offline users
      if (announcement.persistent) {
        const users = await User.find({}).select('_id');
        const userIds = users.map(user => user._id.toString());
        await this.sendBulkNotifications(userIds, notification);
      }

      return true;
    } catch (error) {
      console.error('Error sending system announcement:', error);
      throw error;
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId, options = {}) {
    try {
      const { limit = 20, offset = 0, unreadOnly = false } = options;
      
      const notificationsKey = `notifications:${userId}`;
      const notificationsData = await getAsync(notificationsKey) || '[]';
      let notifications = JSON.parse(notificationsData);

      // Filter by read status if requested
      if (unreadOnly) {
        notifications = notifications.filter(n => !n.read);
      }

      // Remove expired notifications
      const now = new Date();
      notifications = notifications.filter(n => new Date(n.expiresAt) > now);

      // Sort by timestamp (newest first)
      notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Apply pagination
      const paginatedNotifications = notifications.slice(offset, offset + limit);

      return {
        notifications: paginatedNotifications,
        total: notifications.length,
        unreadCount: notifications.filter(n => !n.read).length
      };
    } catch (error) {
      console.error('Error getting user notifications:', error);
      return { notifications: [], total: 0, unreadCount: 0 };
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(userId, notificationId) {
    try {
      const notificationsKey = `notifications:${userId}`;
      const notificationsData = await getAsync(notificationsKey) || '[]';
      const notifications = JSON.parse(notificationsData);

      const notification = notifications.find(n => n.id === notificationId);
      if (notification && !notification.read) {
        notification.read = true;
        notification.readAt = new Date();

        await setAsync(notificationsKey, JSON.stringify(notifications));
        await this.updateNotificationCount(userId);

        // Emit update to user
        io.to(`user:${userId}`).emit('notificationRead', {
          notificationId,
          readAt: notification.readAt
        });

        return notification;
      }

      return null;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId) {
    try {
      const notificationsKey = `notifications:${userId}`;
      const notificationsData = await getAsync(notificationsKey) || '[]';
      const notifications = JSON.parse(notificationsData);

      const readAt = new Date();
      let updatedCount = 0;

      notifications.forEach(notification => {
        if (!notification.read) {
          notification.read = true;
          notification.readAt = readAt;
          updatedCount++;
        }
      });

      if (updatedCount > 0) {
        await setAsync(notificationsKey, JSON.stringify(notifications));
        await this.updateNotificationCount(userId);

        // Emit update to user
        io.to(`user:${userId}`).emit('allNotificationsRead', {
          readAt,
          count: updatedCount
        });
      }

      return updatedCount;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(userId, notificationId) {
    try {
      const notificationsKey = `notifications:${userId}`;
      const notificationsData = await getAsync(notificationsKey) || '[]';
      let notifications = JSON.parse(notificationsData);

      const initialLength = notifications.length;
      notifications = notifications.filter(n => n.id !== notificationId);

      if (notifications.length < initialLength) {
        await setAsync(notificationsKey, JSON.stringify(notifications));
        await this.updateNotificationCount(userId);

        // Emit update to user
        io.to(`user:${userId}`).emit('notificationDeleted', { notificationId });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Clear all notifications for user
   */
  async clearAllNotifications(userId) {
    try {
      const notificationsKey = `notifications:${userId}`;
      await setAsync(notificationsKey, '[]');
      await this.updateNotificationCount(userId);

      // Emit update to user
      io.to(`user:${userId}`).emit('allNotificationsCleared');

      return true;
    } catch (error) {
      console.error('Error clearing all notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification count for user
   */
  async getNotificationCount(userId) {
    try {
      const countKey = `notification_count:${userId}`;
      const count = await getAsync(countKey) || '0';
      return parseInt(count);
    } catch (error) {
      console.error('Error getting notification count:', error);
      return 0;
    }
  }

  /**
   * Store notification
   */
  async storeNotification(userId, notification) {
    try {
      const notificationsKey = `notifications:${userId}`;
      const notificationsData = await getAsync(notificationsKey) || '[]';
      const notifications = JSON.parse(notificationsData);

      notifications.unshift(notification);

      // Keep only recent notifications (max 100)
      if (notifications.length > 100) {
        notifications.splice(100);
      }

      await setAsync(notificationsKey, JSON.stringify(notifications));
    } catch (error) {
      console.error('Error storing notification:', error);
      throw error;
    }
  }

  /**
   * Update notification count
   */
  async updateNotificationCount(userId) {
    try {
      const notificationsKey = `notifications:${userId}`;
      const notificationsData = await getAsync(notificationsKey) || '[]';
      const notifications = JSON.parse(notificationsData);

      const unreadCount = notifications.filter(n => !n.read).length;
      const countKey = `notification_count:${userId}`;
      
      await setAsync(countKey, unreadCount.toString());

      // Emit count update to user
      io.to(`user:${userId}`).emit('notificationCountUpdate', { count: unreadCount });

      return unreadCount;
    } catch (error) {
      console.error('Error updating notification count:', error);
    }
  }

  /**
   * Generate unique notification ID
   */
  generateNotificationId() {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpiredNotifications() {
    try {
      // This would typically be run as a cron job
      const users = await User.find({}).select('_id');
      const now = new Date();
      let cleanedCount = 0;

      for (const user of users) {
        const userId = user._id.toString();
        const notificationsKey = `notifications:${userId}`;
        const notificationsData = await getAsync(notificationsKey) || '[]';
        let notifications = JSON.parse(notificationsData);

        const initialLength = notifications.length;
        notifications = notifications.filter(n => new Date(n.expiresAt) > now);

        if (notifications.length < initialLength) {
          await setAsync(notificationsKey, JSON.stringify(notifications));
          await this.updateNotificationCount(userId);
          cleanedCount += (initialLength - notifications.length);
        }
      }

      console.log(`Cleaned up ${cleanedCount} expired notifications`);
      return cleanedCount;
    } catch (error) {
      console.error('Error cleaning up expired notifications:', error);
      return 0;
    }
  }

  /**
   * Send raffle-specific notifications
   */
  async sendRaffleNotification(raffleId, type, data) {
    try {
      const Raffle = require('../../models/raffle/raffle');
      const raffle = await Raffle.findById(raffleId).populate('entries.user', '_id username');

      if (!raffle) {
        throw new Error('Raffle not found');
      }

      let notification;
      let recipients = [];

      switch (type) {
        case 'raffle_ending_soon':
          notification = {
            type: this.notificationTypes.RAFFLE_WARNING,
            title: 'Raffle Ending Soon!',
            message: `The raffle "${raffle.title}" ends in ${data.timeRemaining}`,
            data: { raffleId, timeRemaining: data.timeRemaining }
          };
          recipients = raffle.entries.map(entry => entry.user._id.toString());
          break;

        case 'raffle_winner':
          notification = {
            type: this.notificationTypes.RAFFLE_WIN,
            title: 'Congratulations! You Won!',
            message: `You won the raffle: ${raffle.title}`,
            data: { raffleId, prize: raffle.prize }
          };
          recipients = [data.winnerId];
          break;

        case 'raffle_entry_confirmed':
          notification = {
            type: this.notificationTypes.RAFFLE_ENTRY,
            title: 'Raffle Entry Confirmed',
            message: `Your entry for "${raffle.title}" has been confirmed`,
            data: { raffleId }
          };
          recipients = [data.userId];
          break;

        default:
          throw new Error('Unknown raffle notification type');
      }

      return await this.sendBulkNotifications(recipients, notification);
    } catch (error) {
      console.error('Error sending raffle notification:', error);
      throw error;
    }
  }

  /**
   * Send game-specific notifications
   */
  async sendGameNotification(userId, type, data) {
    try {
      let notification;

      switch (type) {
        case 'game_win':
          notification = {
            type: this.notificationTypes.GAME_WIN,
            title: 'You Won!',
            message: `You won ${data.amount} ${data.currency} in ${data.game}`,
            data: data
          };
          break;

        case 'game_loss':
          notification = {
            type: this.notificationTypes.GAME_LOSS,
            title: 'Game Result',
            message: `You lost ${data.amount} ${data.currency} in ${data.game}`,
            data: data
          };
          break;

        case 'achievement_unlocked':
          notification = {
            type: this.notificationTypes.ACHIEVEMENT_UNLOCKED,
            title: 'Achievement Unlocked!',
            message: `You unlocked: ${data.achievementName}`,
            data: data
          };
          break;

        default:
          throw new Error('Unknown game notification type');
      }

      return await this.sendNotification(userId, notification);
    } catch (error) {
      console.error('Error sending game notification:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService();