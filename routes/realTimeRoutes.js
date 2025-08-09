const express = require('express');
const router = express.Router();
const realTimeService = require('../services/realtime/realTimeService');
const chatService = require('../services/realtime/chatService');
const notificationService = require('../services/realtime/notificationService');
const { authenticate } = require('../middleware/authenticate');

// Notification routes
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit, offset, unreadOnly } = req.query;
    
    const options = {
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0,
      unreadOnly: unreadOnly === 'true'
    };

    const result = await notificationService.getUserNotifications(userId, options);
    res.json(result);
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

router.post('/notifications/:notificationId/read', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const { notificationId } = req.params;

    const notification = await notificationService.markAsRead(userId, notificationId);
    if (notification) {
      res.json({ success: true, notification });
    } else {
      res.status(404).json({ error: 'Notification not found' });
    }
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.post('/notifications/read-all', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await notificationService.markAllAsRead(userId);
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

router.delete('/notifications/:notificationId', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const { notificationId } = req.params;

    const success = await notificationService.deleteNotification(userId, notificationId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Notification not found' });
    }
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

router.delete('/notifications', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    await notificationService.clearAllNotifications(userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing all notifications:', error);
    res.status(500).json({ error: 'Failed to clear all notifications' });
  }
});

router.get('/notifications/count', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await notificationService.getNotificationCount(userId);
    res.json({ count });
  } catch (error) {
    console.error('Error getting notification count:', error);
    res.status(500).json({ error: 'Failed to get notification count' });
  }
});

// Chat routes
router.get('/chat/:room/history', authenticate, async (req, res) => {
  try {
    const { room } = req.params;
    const { limit } = req.query;
    
    const history = await chatService.getChatHistory(room, parseInt(limit) || 50);
    res.json({ messages: history });
  } catch (error) {
    console.error('Error getting chat history:', error);
    res.status(500).json({ error: 'Failed to get chat history' });
  }
});

router.get('/chat/:room/users', authenticate, async (req, res) => {
  try {
    const { room } = req.params;
    const users = await chatService.getOnlineUsers(room);
    res.json({ users });
  } catch (error) {
    console.error('Error getting online users:', error);
    res.status(500).json({ error: 'Failed to get online users' });
  }
});

// Leaderboard routes
router.get('/leaderboard', async (req, res) => {
  try {
    const leaderboard = await realTimeService.updateLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// System announcement route (admin only)
router.post('/announcements', authenticate, async (req, res) => {
  try {
    // Check if user is admin (you'll need to implement this check)
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { title, message, persistent, data } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    await notificationService.sendSystemAnnouncement({
      title,
      message,
      persistent: persistent || false,
      data: data || {}
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error sending system announcement:', error);
    res.status(500).json({ error: 'Failed to send system announcement' });
  }
});

// Test notification route (for development)
router.post('/test-notification', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const { type, title, message, data } = req.body;

    const notification = await notificationService.sendNotification(userId, {
      type: type || 'system_announcement',
      title: title || 'Test Notification',
      message: message || 'This is a test notification',
      data: data || {}
    });

    res.json({ success: true, notification });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

module.exports = router;