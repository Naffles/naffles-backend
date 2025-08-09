const socketService = require('./socketService');
const raffleAnalyticsService = require('./raffleAnalyticsService');

/**
 * Integration service for raffle real-time updates
 */
class RaffleSocketIntegration {
  /**
   * Handle ticket purchase event
   * @param {string} raffleId - Raffle ID
   * @param {Object} ticketData - Ticket purchase data
   * @param {Object} raffleData - Updated raffle data
   */
  async handleTicketPurchase(raffleId, ticketData, raffleData) {
    try {
      // Emit ticket purchase update
      socketService.emitTicketPurchase(raffleId, {
        ticketNumber: ticketData.ticketNumber,
        purchasedBy: ticketData.purchasedBy,
        ticketPrice: ticketData.ticketPrice,
        timestamp: new Date().toISOString()
      });
      
      // Emit updated raffle status
      await socketService.emitRaffleStatus(raffleId, {
        status: raffleData.status,
        ticketsSold: raffleData.ticketsSold,
        ticketsAvailable: raffleData.ticketsAvailable,
        endTime: raffleData.raffleEndDate
      });
      
      // Send personal notification to buyer
      socketService.emitUserNotification(ticketData.purchasedBy, 'ticketPurchased', {
        raffleId,
        ticketNumber: ticketData.ticketNumber,
        message: `You purchased ticket #${ticketData.ticketNumber}`
      });
      
      // Check if raffle is sold out
      if (raffleData.ticketsAvailable === 0) {
        socketService.emitGlobalAnnouncement(
          `Raffle ${raffleData.eventId} is now sold out!`,
          'success'
        );
      }
      
      console.log(`Socket integration: Ticket purchase processed for raffle ${raffleId}`);\n      
    } catch (error) {
      console.error('Error in ticket purchase socket integration:', error);
    }
  }
  
  /**
   * Handle raffle winner selection
   * @param {string} raffleId - Raffle ID
   * @param {Object} winnerData - Winner data
   */
  async handleWinnerSelection(raffleId, winnerData) {
    try {
      // Emit winner announcement
      socketService.emitWinnerAnnouncement(raffleId, {
        userId: winnerData.user,
        username: winnerData.username,
        ticketNumber: winnerData.winningTicket.ticketNumber,
        prizeDescription: winnerData.prizeDescription,
        timestamp: new Date().toISOString()
      });
      
      // Send personal notification to winner
      socketService.emitUserNotification(winnerData.user, 'raffleWon', {
        raffleId,
        ticketNumber: winnerData.winningTicket.ticketNumber,
        prizeDescription: winnerData.prizeDescription,
        message: `Congratulations! You won the raffle with ticket #${winnerData.winningTicket.ticketNumber}`
      });
      
      // Emit global announcement
      socketService.emitGlobalAnnouncement(
        `${winnerData.username} won raffle ${winnerData.eventId} with ticket #${winnerData.winningTicket.ticketNumber}!`,
        'success'
      );
      
      console.log(`Socket integration: Winner announced for raffle ${raffleId}`);\n      
    } catch (error) {
      console.error('Error in winner selection socket integration:', error);
    }
  }
  
  /**
   * Handle raffle cancellation
   * @param {string} raffleId - Raffle ID
   * @param {Object} cancellationData - Cancellation data
   */\n  async handleRaffleCancellation(raffleId, cancellationData) {\n    try {\n      // Emit raffle status update\n      await socketService.emitRaffleStatus(raffleId, {\n        status: { isCancelled: true, isActive: false },\n        reason: cancellationData.reason,\n        timestamp: new Date().toISOString()\n      });\n      \n      // Notify all participants\n      if (cancellationData.participants && cancellationData.participants.length > 0) {\n        cancellationData.participants.forEach(userId => {\n          socketService.emitUserNotification(userId, 'raffleCancelled', {\n            raffleId,\n            reason: cancellationData.reason,\n            refundStatus: 'processing',\n            message: `Raffle ${cancellationData.eventId} has been cancelled. Refunds are being processed.`\n          });\n        });\n      }\n      \n      // Emit global announcement\n      socketService.emitGlobalAnnouncement(\n        `Raffle ${cancellationData.eventId} has been cancelled`,\n        'warning'\n      );\n      \n      console.log(`Socket integration: Raffle cancellation processed for ${raffleId}`);\n      \n    } catch (error) {\n      console.error('Error in raffle cancellation socket integration:', error);\n    }\n  }\n  \n  /**\n   * Handle raffle countdown updates\n   * @param {string} raffleId - Raffle ID\n   * @param {Object} countdownData - Countdown data\n   */\n  async handleCountdownUpdate(raffleId, countdownData) {\n    try {\n      socketService.emitCountdownUpdate(raffleId, {\n        timeRemaining: countdownData.timeRemaining,\n        endTime: countdownData.endTime,\n        isExpiring: countdownData.timeRemaining < 3600000, // Less than 1 hour\n        timestamp: new Date().toISOString()\n      });\n      \n      // Send expiration warnings\n      if (countdownData.timeRemaining < 3600000 && countdownData.timeRemaining > 3540000) { // 59-60 minutes\n        socketService.emitGlobalAnnouncement(\n          `Raffle ${countdownData.eventId} ends in less than 1 hour!`,\n          'warning'\n        );\n      }\n      \n    } catch (error) {\n      console.error('Error in countdown update socket integration:', error);\n    }\n  }\n  \n  /**\n   * Handle raffle creation\n   * @param {string} raffleId - Raffle ID\n   * @param {Object} raffleData - Raffle data\n   */\n  async handleRaffleCreation(raffleId, raffleData) {\n    try {\n      // Emit global announcement for new raffle\n      socketService.emitGlobalAnnouncement(\n        `New ${raffleData.lotteryTypeEnum} raffle created: ${raffleData.eventId}`,\n        'info'\n      );\n      \n      // Send notification to raffle creator\n      socketService.emitUserNotification(raffleData.createdBy, 'raffleCreated', {\n        raffleId,\n        eventId: raffleData.eventId,\n        message: `Your raffle ${raffleData.eventId} has been created successfully`\n      });\n      \n      console.log(`Socket integration: Raffle creation announced for ${raffleId}`);\n      \n    } catch (error) {\n      console.error('Error in raffle creation socket integration:', error);\n    }\n  }\n  \n  /**\n   * Send periodic analytics updates to admin users\n   * @param {Array} adminUserIds - Array of admin user IDs\n   */\n  async sendPeriodicAnalyticsUpdate(adminUserIds) {\n    try {\n      const statistics = await raffleAnalyticsService.getPlatformStatistics();\n      const connectionStats = await socketService.getConnectionStats();\n      \n      const analyticsUpdate = {\n        platform: {\n          totalRaffles: statistics.raffles.total,\n          activeRaffles: statistics.raffles.active,\n          totalTicketsSold: statistics.tickets.total,\n          totalRevenue: statistics.revenue.total\n        },\n        realTime: {\n          connectedUsers: connectionStats.total,\n          authenticatedUsers: connectionStats.authenticated,\n          activeRooms: Object.keys(connectionStats.rooms).length\n        },\n        timestamp: new Date().toISOString()\n      };\n      \n      // Send to all admin users\n      adminUserIds.forEach(adminId => {\n        socketService.emitUserNotification(adminId, 'analyticsUpdate', analyticsUpdate);\n      });\n      \n    } catch (error) {\n      console.error('Error sending periodic analytics update:', error);\n    }\n  }\n  \n  /**\n   * Handle raffle status changes\n   * @param {string} raffleId - Raffle ID\n   * @param {Object} statusChange - Status change data\n   */\n  async handleStatusChange(raffleId, statusChange) {\n    try {\n      await socketService.emitRaffleStatus(raffleId, {\n        status: statusChange.newStatus,\n        previousStatus: statusChange.previousStatus,\n        reason: statusChange.reason,\n        timestamp: new Date().toISOString()\n      });\n      \n      // Handle specific status changes\n      if (statusChange.newStatus.isCompleted && !statusChange.previousStatus.isCompleted) {\n        socketService.emitGlobalAnnouncement(\n          `Raffle ${statusChange.eventId} has ended`,\n          'info'\n        );\n      }\n      \n      if (statusChange.newStatus.isActive && !statusChange.previousStatus.isActive) {\n        socketService.emitGlobalAnnouncement(\n          `Raffle ${statusChange.eventId} is now active`,\n          'success'\n        );\n      }\n      \n    } catch (error) {\n      console.error('Error in status change socket integration:', error);\n    }\n  }\n  \n  /**\n   * Handle bulk ticket purchases\n   * @param {string} raffleId - Raffle ID\n   * @param {Array} ticketsData - Array of ticket data\n   * @param {Object} raffleData - Updated raffle data\n   */\n  async handleBulkTicketPurchase(raffleId, ticketsData, raffleData) {\n    try {\n      const totalTickets = ticketsData.length;\n      const userId = ticketsData[0].purchasedBy;\n      \n      // Emit bulk purchase update\n      socketService.emitTicketPurchase(raffleId, {\n        bulkPurchase: true,\n        ticketCount: totalTickets,\n        ticketNumbers: ticketsData.map(t => t.ticketNumber),\n        purchasedBy: userId,\n        totalPrice: ticketsData.reduce((sum, t) => sum + parseFloat(t.ticketPrice), 0),\n        timestamp: new Date().toISOString()\n      });\n      \n      // Emit updated raffle status\n      await socketService.emitRaffleStatus(raffleId, {\n        status: raffleData.status,\n        ticketsSold: raffleData.ticketsSold,\n        ticketsAvailable: raffleData.ticketsAvailable,\n        endTime: raffleData.raffleEndDate\n      });\n      \n      // Send personal notification\n      socketService.emitUserNotification(userId, 'bulkTicketsPurchased', {\n        raffleId,\n        ticketCount: totalTickets,\n        ticketNumbers: ticketsData.map(t => t.ticketNumber),\n        message: `You purchased ${totalTickets} tickets`\n      });\n      \n      console.log(`Socket integration: Bulk ticket purchase processed for raffle ${raffleId}`);\n      \n    } catch (error) {\n      console.error('Error in bulk ticket purchase socket integration:', error);\n    }\n  }\n}\n\nmodule.exports = new RaffleSocketIntegration();