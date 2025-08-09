const io = require('../../config/socket');
const Raffle = require('../../models/raffle/raffle');
const User = require('../../models/user/user');
const PointsBalance = require('../../models/points/pointsBalance');
const Leaderboard = require('../../models/points/leaderboard');
const { getAsync, setAsync } = require('../../config/redisClient');

class RealTimeService {
  constructor() {
    this.activeRaffles = new Map();
    this.leaderboardCache = null;
    this.lastLeaderboardUpdate = null;
  }

  /**
   * Initialize real-time raffle tracking
   */
  async initializeRaffleTracking() {
    try {
      const activeRaffles = await Raffle.find({
        status: 'active',
        endTime: { $gt: new Date() }
      }).populate('creator', 'username');

      for (const raffle of activeRaffles) {
        this.startRaffleCountdown(raffle);
      }

      console.log(`Initialized tracking for ${activeRaffles.length} active raffles`);
    } catch (error) {
      console.error('Error initializing raffle tracking:', error);
    }
  }

  /**
   * Start countdown for a specific raffle
   */
  startRaffleCountdown(raffle) {
    const raffleId = raffle._id.toString();
    
    // Clear existing interval if any
    if (this.activeRaffles.has(raffleId)) {
      clearInterval(this.activeRaffles.get(raffleId));
    }

    const interval = setInterval(async () => {
      try {
        const updatedRaffle = await Raffle.findById(raffleId)
          .populate('creator', 'username')
          .populate('entries.user', 'username');

        if (!updatedRaffle || updatedRaffle.status !== 'active') {
          this.stopRaffleCountdown(raffleId);
          return;
        }

        const now = new Date();
        const timeRemaining = updatedRaffle.endTime - now;

        if (timeRemaining <= 0) {
          // Raffle has ended
          await this.handleRaffleEnd(updatedRaffle);
          this.stopRaffleCountdown(raffleId);
          return;
        }

        // Emit real-time updates
        const raffleUpdate = {
          raffleId: raffleId,
          timeRemaining: timeRemaining,
          totalEntries: updatedRaffle.entries.length,
          ticketsSold: updatedRaffle.ticketsSold || 0,
          maxTickets: updatedRaffle.maxTickets,
          currentOdds: this.calculateOdds(updatedRaffle),
          status: updatedRaffle.status
        };

        // Emit to raffle room
        io.to(`raffle:${raffleId}`).emit('raffleUpdate', raffleUpdate);

        // Emit to global raffle list
        io.to('raffleList').emit('raffleListUpdate', {
          type: 'update',
          raffle: raffleUpdate
        });

        // Send notifications at specific intervals
        if (timeRemaining <= 60000 && timeRemaining > 59000) { // 1 minute warning
          this.sendRaffleNotification(updatedRaffle, '1 minute remaining!');
        } else if (timeRemaining <= 300000 && timeRemaining > 299000) { // 5 minute warning
          this.sendRaffleNotification(updatedRaffle, '5 minutes remaining!');
        }

      } catch (error) {
        console.error(`Error updating raffle ${raffleId}:`, error);
      }
    }, 1000); // Update every second

    this.activeRaffles.set(raffleId, interval);
  }

  /**
   * Stop countdown for a specific raffle
   */
  stopRaffleCountdown(raffleId) {
    if (this.activeRaffles.has(raffleId)) {
      clearInterval(this.activeRaffles.get(raffleId));
      this.activeRaffles.delete(raffleId);
    }
  }

  /**
   * Calculate current odds for a raffle
   */
  calculateOdds(raffle) {
    if (!raffle.entries || raffle.entries.length === 0) {
      return { individual: '0%', total: '0%' };
    }

    const totalEntries = raffle.entries.length;
    const individualOdds = ((1 / totalEntries) * 100).toFixed(2);
    
    return {
      individual: `${individualOdds}%`,
      total: `${totalEntries} entries`
    };
  }

  /**
   * Handle raffle end
   */
  async handleRaffleEnd(raffle) {
    try {
      // Update raffle status
      await Raffle.findByIdAndUpdate(raffle._id, { status: 'ended' });

      // Emit raffle ended event
      io.to(`raffle:${raffle._id}`).emit('raffleEnded', {
        raffleId: raffle._id.toString(),
        message: 'Raffle has ended! Winner selection in progress...'
      });

      // Emit to global list
      io.to('raffleList').emit('raffleListUpdate', {
        type: 'ended',
        raffleId: raffle._id.toString()
      });

      console.log(`Raffle ${raffle._id} has ended`);
    } catch (error) {
      console.error(`Error handling raffle end for ${raffle._id}:`, error);
    }
  }

  /**
   * Send raffle notification to participants
   */
  async sendRaffleNotification(raffle, message) {
    try {
      const notification = {
        type: 'raffle_warning',
        raffleId: raffle._id.toString(),
        title: raffle.title,
        message: message,
        timestamp: new Date()
      };

      // Send to all raffle participants
      for (const entry of raffle.entries) {
        io.to(`user:${entry.user._id || entry.user}`).emit('notification', notification);
      }

      // Send to raffle room
      io.to(`raffle:${raffle._id}`).emit('raffleNotification', notification);

    } catch (error) {
      console.error('Error sending raffle notification:', error);
    }
  }

  /**
   * Broadcast winner announcement
   */
  async broadcastWinnerAnnouncement(raffle, winner) {
    try {
      const announcement = {
        type: 'winner_announcement',
        raffleId: raffle._id.toString(),
        raffleTitle: raffle.title,
        winner: {
          id: winner._id,
          username: winner.username
        },
        prize: raffle.prize,
        timestamp: new Date()
      };

      // Broadcast to all connected users
      io.emit('winnerAnnouncement', announcement);

      // Send specific notification to winner
      io.to(`user:${winner._id}`).emit('notification', {
        type: 'raffle_win',
        title: 'Congratulations!',
        message: `You won the raffle: ${raffle.title}`,
        raffleId: raffle._id.toString(),
        timestamp: new Date()
      });

      // Send to raffle participants
      io.to(`raffle:${raffle._id}`).emit('raffleResult', {
        winner: announcement.winner,
        prize: raffle.prize,
        raffleId: raffle._id.toString()
      });

      console.log(`Winner announcement broadcasted for raffle ${raffle._id}`);
    } catch (error) {
      console.error('Error broadcasting winner announcement:', error);
    }
  }

  /**
   * Update and broadcast leaderboard
   */
  async updateLeaderboard() {
    try {
      const now = new Date();
      
      // Check if we need to update (every 30 seconds)
      if (this.lastLeaderboardUpdate && (now - this.lastLeaderboardUpdate) < 30000) {
        return this.leaderboardCache;
      }

      // Get top users by points
      const topUsers = await PointsBalance.find({})
        .populate('userId', 'username profileImage')
        .sort({ balance: -1 })
        .limit(10);

      // Get recent activity
      const recentActivity = await this.getRecentActivity();

      const leaderboard = {
        topUsers: topUsers.map((user, index) => ({
          rank: index + 1,
          userId: user.userId._id,
          username: user.userId.username,
          profileImage: user.userId.profileImage,
          points: user.balance,
          change: user.dailyChange || 0
        })),
        recentActivity: recentActivity,
        lastUpdated: now
      };

      this.leaderboardCache = leaderboard;
      this.lastLeaderboardUpdate = now;

      // Broadcast to all leaderboard subscribers
      io.to('leaderboard').emit('leaderboardUpdate', leaderboard);

      return leaderboard;
    } catch (error) {
      console.error('Error updating leaderboard:', error);
      return this.leaderboardCache || { topUsers: [], recentActivity: [], lastUpdated: new Date() };
    }
  }

  /**
   * Get recent platform activity
   */
  async getRecentActivity() {
    try {
      // This would typically come from an activity log
      // For now, return mock data structure
      return [
        {
          type: 'raffle_created',
          user: 'User123',
          message: 'created a new raffle',
          timestamp: new Date(Date.now() - 60000)
        },
        {
          type: 'game_win',
          user: 'Player456',
          message: 'won 100 tokens in Blackjack',
          timestamp: new Date(Date.now() - 120000)
        }
      ];
    } catch (error) {
      console.error('Error getting recent activity:', error);
      return [];
    }
  }

  /**
   * Send notification to specific user
   */
  async sendUserNotification(userId, notification) {
    try {
      const fullNotification = {
        ...notification,
        id: Date.now().toString(),
        timestamp: new Date(),
        read: false
      };

      // Store notification in Redis for persistence
      const userNotifications = await getAsync(`notifications:${userId}`) || '[]';
      const notifications = JSON.parse(userNotifications);
      notifications.unshift(fullNotification);
      
      // Keep only last 50 notifications
      if (notifications.length > 50) {
        notifications.splice(50);
      }

      await setAsync(`notifications:${userId}`, JSON.stringify(notifications));

      // Send real-time notification
      io.to(`user:${userId}`).emit('notification', fullNotification);

      return fullNotification;
    } catch (error) {
      console.error('Error sending user notification:', error);
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId, limit = 20) {
    try {
      const userNotifications = await getAsync(`notifications:${userId}`) || '[]';
      const notifications = JSON.parse(userNotifications);
      
      return notifications.slice(0, limit);
    } catch (error) {
      console.error('Error getting user notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationRead(userId, notificationId) {
    try {
      const userNotifications = await getAsync(`notifications:${userId}`) || '[]';
      const notifications = JSON.parse(userNotifications);
      
      const notification = notifications.find(n => n.id === notificationId);
      if (notification) {
        notification.read = true;
        await setAsync(`notifications:${userId}`, JSON.stringify(notifications));
        
        // Emit update to user
        io.to(`user:${userId}`).emit('notificationRead', { notificationId });
      }

      return notification;
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  /**
   * Join user to their personal room
   */
  joinUserRoom(socket, userId) {
    socket.join(`user:${userId}`);
  }

  /**
   * Join raffle room
   */
  joinRaffleRoom(socket, raffleId) {
    socket.join(`raffle:${raffleId}`);
  }

  /**
   * Join raffle list room
   */
  joinRaffleListRoom(socket) {
    socket.join('raffleList');
  }

  /**
   * Join leaderboard room
   */
  joinLeaderboardRoom(socket) {
    socket.join('leaderboard');
  }

  /**
   * Leave raffle room
   */
  leaveRaffleRoom(socket, raffleId) {
    socket.leave(`raffle:${raffleId}`);
  }

  /**
   * Clean up on service shutdown
   */
  cleanup() {
    for (const [raffleId, interval] of this.activeRaffles) {
      clearInterval(interval);
    }
    this.activeRaffles.clear();
  }
}

module.exports = new RealTimeService();