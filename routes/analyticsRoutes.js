const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorization');
const raffleAnalyticsService = require('../services/raffleAnalyticsService');
const socketService = require('../services/socketService');
const { validateObjectId } = require('../utils/validation/raffleValidation');

/**
 * Get analytics for a specific raffle
 * GET /api/analytics/raffles/:raffleId
 */
router.get('/raffles/:raffleId', authenticate, async (req, res) => {
  try {
    const { raffleId } = req.params;
    
    // Validate raffle ID
    if (!validateObjectId(raffleId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid raffle ID format'
      });
    }
    
    const analytics = await raffleAnalyticsService.getRaffleAnalytics(raffleId);
    
    res.json({
      success: true,
      data: analytics
    });
    
  } catch (error) {
    console.error('Error getting raffle analytics:', error);
    
    if (error.message === 'Raffle not found') {
      return res.status(404).json({
        success: false,
        error: 'Raffle not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to get raffle analytics'
    });
  }
});

/**
 * Get platform-wide statistics
 * GET /api/analytics/platform
 */
router.get('/platform', authenticate, requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    const filters = {};
    
    // Parse query parameters
    if (req.query.startDate) {
      filters.startDate = req.query.startDate;
    }
    
    if (req.query.endDate) {
      filters.endDate = req.query.endDate;
    }
    
    if (req.query.lotteryType) {
      filters.lotteryType = req.query.lotteryType.toUpperCase();
    }
    
    if (req.query.raffleType) {
      filters.raffleType = req.query.raffleType.toUpperCase();
    }
    
    const statistics = await raffleAnalyticsService.getPlatformStatistics(filters);
    
    res.json({
      success: true,
      data: statistics
    });
    
  } catch (error) {
    console.error('Error getting platform statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get platform statistics'
    });
  }
});

/**
 * Get user participation analytics
 * GET /api/analytics/users/:userId
 */
router.get('/users/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Users can only view their own analytics unless they're admin
    if (req.user._id.toString() !== userId && !req.user.roles.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Validate user ID
    if (!validateObjectId(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }
    
    const analytics = await raffleAnalyticsService.getUserParticipationAnalytics(userId);
    
    res.json({
      success: true,
      data: analytics
    });
    
  } catch (error) {
    console.error('Error getting user analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user analytics'
    });
  }
});

/**
 * Get current user's participation analytics
 * GET /api/analytics/me
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const analytics = await raffleAnalyticsService.getUserParticipationAnalytics(req.user._id);
    
    res.json({
      success: true,
      data: analytics
    });
    
  } catch (error) {
    console.error('Error getting current user analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user analytics'
    });
  }
});

/**
 * Get leaderboard
 * GET /api/analytics/leaderboard
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const options = {};
    
    // Parse query parameters
    if (req.query.limit) {
      const limit = parseInt(req.query.limit);
      if (limit > 0 && limit <= 100) {
        options.limit = limit;
      }
    }
    
    if (req.query.sortBy && ['tickets', 'raffles', 'spent', 'wins'].includes(req.query.sortBy)) {
      options.sortBy = req.query.sortBy;
    }
    
    if (req.query.timeframe && ['day', 'week', 'month', 'year'].includes(req.query.timeframe)) {
      options.timeframe = req.query.timeframe;
    }
    
    const leaderboard = await raffleAnalyticsService.getLeaderboard(options);
    
    res.json({
      success: true,
      data: leaderboard
    });
    
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard'
    });
  }
});

/**
 * Get real-time connection statistics
 * GET /api/analytics/connections
 */
router.get('/connections', authenticate, requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    const stats = await socketService.getConnectionStats();
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('Error getting connection stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get connection statistics'
    });
  }
});

/**
 * Get raffle performance metrics
 * GET /api/analytics/raffles/:raffleId/performance
 */
router.get('/raffles/:raffleId/performance', authenticate, async (req, res) => {
  try {
    const { raffleId } = req.params;
    
    // Validate raffle ID
    if (!validateObjectId(raffleId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid raffle ID format'
      });
    }
    
    const analytics = await raffleAnalyticsService.getRaffleAnalytics(raffleId);
    
    // Calculate performance metrics
    const performance = {
      raffleId,
      sellThroughRate: analytics.tickets.sellThroughRate,
      participationRate: analytics.participants.uniqueBuyers / (analytics.tickets.sold || 1),
      averageTicketsPerUser: analytics.participants.averageTicketsPerBuyer,
      timeToSellOut: null, // Calculate if sold out
      peakPurchaseTime: null, // Analyze timeline for peak
      conversionMetrics: {
        totalViews: null, // Would need view tracking
        purchaseConversion: null // Would need view data
      }
    };
    
    // Calculate time to sell out if applicable
    if (analytics.tickets.available === 0 && analytics.timeline.length > 0) {
      const firstSale = new Date(analytics.timeline[0].date);
      const lastSale = new Date(analytics.timeline[analytics.timeline.length - 1].date);
      performance.timeToSellOut = Math.ceil((lastSale - firstSale) / (1000 * 60 * 60 * 24)); // Days
    }
    
    // Find peak purchase day
    if (analytics.timeline.length > 0) {
      const peakDay = analytics.timeline.reduce((max, day) => 
        day.tickets > max.tickets ? day : max
      );
      performance.peakPurchaseTime = peakDay.date;
    }
    
    res.json({
      success: true,
      data: performance
    });
    
  } catch (error) {
    console.error('Error getting raffle performance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get raffle performance metrics'
    });
  }
});

/**
 * Export analytics data (CSV format)
 * GET /api/analytics/export/:type
 */
router.get('/export/:type', authenticate, requireRole(['admin']), async (req, res) => {
  try {
    const { type } = req.params;
    
    if (!['raffles', 'tickets', 'users'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid export type. Must be: raffles, tickets, or users'
      });
    }
    
    // This would implement CSV export functionality
    // For now, return JSON data that can be converted to CSV
    let data;
    
    switch (type) {
      case 'raffles':
        data = await raffleAnalyticsService.getPlatformStatistics();
        break;
      case 'tickets':
        // Would implement ticket export
        data = { message: 'Ticket export not yet implemented' };
        break;
      case 'users':
        data = await raffleAnalyticsService.getLeaderboard({ limit: 1000 });
        break;
    }
    
    res.json({
      success: true,
      data,
      exportType: type,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export analytics data'
    });
  }
});

module.exports = router;