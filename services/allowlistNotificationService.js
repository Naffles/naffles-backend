const User = require('../models/user/user');
const Allowlist = require('../models/allowlist/allowlist');
const AllowlistWinner = require('../models/allowlist/allowlistWinner');
const ActionItem = require('../models/user/actionItem');

class AllowlistNotificationService {
  /**
   * Send entry confirmation notification
   */
  async sendEntryConfirmation(userId, allowlistId) {
    try {
      const user = await User.findById(userId);
      const allowlist = await Allowlist.findById(allowlistId);
      
      if (!user || !allowlist) {
        throw new Error('User or allowlist not found');
      }
      
      // Send bell notification
      await this.sendBellNotification(userId, {
        title: 'Allowlist Entry Confirmed',
        message: `Your entry for "${allowlist.title}" has been confirmed. Good luck!`,
        type: 'success',
        actionUrl: `/allowlists/${allowlistId}`
      });
      
      // Send email if user has email
      if (user.email) {
        await this.sendEmailNotification(userId, 'entry_confirmed', {
          allowlistTitle: allowlist.title,
          allowlistId: allowlistId
        });
      }
      
      console.log(`Entry confirmation sent to user ${userId} for allowlist ${allowlistId}`);
    } catch (error) {
      console.error('Error sending entry confirmation:', error);
    }
  }
  
  /**
   * Send winner notification
   */
  async sendWinnerNotification(userId, allowlistId, winnerData) {
    try {
      const user = await User.findById(userId);
      const allowlist = await Allowlist.findById(allowlistId);
      
      if (!user || !allowlist) {
        throw new Error('User or allowlist not found');
      }
      
      // Create action page item for claiming
      const actionItem = await this.createActionPageItem(userId, allowlistId, 'claim_winner', {
        title: `🎉 You Won: ${allowlist.title}`,
        description: `Congratulations! You won position #${winnerData.winnerPosition} in the allowlist. Click to view details.`,
        actionUrl: `/allowlists/${allowlistId}/claim`,
        expiresAt: winnerData.claimExpiresAt
      });
      
      // Update winner record with action item ID
      await AllowlistWinner.findByIdAndUpdate(winnerData._id, {
        actionItemId: actionItem._id,
        notificationSent: true
      });
      
      // Send bell notification
      await this.sendBellNotification(userId, {
        title: '🎉 Allowlist Winner!',
        message: `Congratulations! You won position #${winnerData.winnerPosition} in "${allowlist.title}"`,
        type: 'success',
        actionUrl: `/allowlists/${allowlistId}/claim`
      });
      
      // Send email notification
      if (user.email) {
        await this.sendEmailNotification(userId, 'winner', {
          allowlistTitle: allowlist.title,
          winnerPosition: winnerData.winnerPosition,
          claimUrl: `/allowlists/${allowlistId}/claim`,
          expiresAt: winnerData.claimExpiresAt
        });
        
        await AllowlistWinner.findByIdAndUpdate(winnerData._id, {
          emailSent: true
        });
      }
      
      console.log(`Winner notification sent to user ${userId} for allowlist ${allowlistId}, position ${winnerData.winnerPosition}`);
    } catch (error) {
      console.error('Error sending winner notification:', error);
    }
  }
  
  /**
   * Send refund notification
   */
  async sendRefundNotification(userId, allowlistId, refundAmount) {
    try {
      const user = await User.findById(userId);
      const allowlist = await Allowlist.findById(allowlistId);
      
      if (!user || !allowlist) {
        throw new Error('User or allowlist not found');
      }
      
      const hasTicketRefund = parseFloat(refundAmount.ticketRefund.amount) > 0;
      const hasProfitBonus = parseFloat(refundAmount.profitBonus.amount) > 0;
      
      let message = `Your entry for "${allowlist.title}" has been processed.`;
      let title = 'Allowlist Entry Processed';
      
      if (hasTicketRefund && hasProfitBonus) {
        message = `You received a full refund plus profit bonus of ${refundAmount.totalRefund.amount} ${refundAmount.totalRefund.tokenType} for "${allowlist.title}"`;
        title = 'Refund + Profit Bonus Received';
      } else if (hasTicketRefund) {
        message = `You received a refund of ${refundAmount.ticketRefund.amount} ${refundAmount.ticketRefund.tokenType} for "${allowlist.title}"`;
        title = 'Refund Processed';
      } else if (hasProfitBonus) {
        message = `You received a profit bonus of ${refundAmount.profitBonus.amount} ${refundAmount.profitBonus.tokenType} for "${allowlist.title}"`;
        title = 'Profit Bonus Received';
      }
      
      // Send bell notification
      await this.sendBellNotification(userId, {
        title,
        message,
        type: 'info',
        actionUrl: `/allowlists/${allowlistId}`
      });
      
      // Send email notification
      if (user.email) {
        await this.sendEmailNotification(userId, 'refund', {
          allowlistTitle: allowlist.title,
          refundAmount: refundAmount,
          hasTicketRefund,
          hasProfitBonus
        });
      }
      
      console.log(`Refund notification sent to user ${userId} for allowlist ${allowlistId}`);
    } catch (error) {
      console.error('Error sending refund notification:', error);
    }
  }
  
  /**
   * Send creator payout notification
   */
  async sendCreatorPayoutNotification(creatorId, allowlistId, payoutData) {
    try {
      const user = await User.findById(creatorId);
      const allowlist = await Allowlist.findById(allowlistId);
      
      if (!user || !allowlist) {
        throw new Error('User or allowlist not found');
      }
      
      // Send bell notification
      await this.sendBellNotification(creatorId, {
        title: 'Allowlist Payout Processed',
        message: `Your payout of ${payoutData.amount} ${payoutData.tokenType} for "${allowlist.title}" has been processed`,
        type: 'success',
        actionUrl: `/allowlists/${allowlistId}/results`
      });
      
      // Send email notification
      if (user.email) {
        await this.sendEmailNotification(creatorId, 'creator_payout', {
          allowlistTitle: allowlist.title,
          payoutAmount: payoutData,
          allowlistId
        });
      }
      
      console.log(`Creator payout notification sent to user ${creatorId} for allowlist ${allowlistId}`);
    } catch (error) {
      console.error('Error sending creator payout notification:', error);
    }
  }
  
  /**
   * Create action page item
   */
  async createActionPageItem(userId, allowlistId, actionType, itemData) {
    try {
      const actionItem = new ActionItem({
        userId,
        type: actionType,
        title: itemData.title,
        description: itemData.description,
        actionUrl: itemData.actionUrl,
        expiresAt: itemData.expiresAt,
        metadata: {
          allowlistId,
          actionType
        }
      });
      
      await actionItem.save();
      return actionItem;
    } catch (error) {
      console.error('Error creating action page item:', error);
      throw error;
    }
  }
  
  /**
   * Send bell notification (in-app notification)
   */
  async sendBellNotification(userId, notificationData) {
    try {
      // This would integrate with the existing notification system
      // For now, we'll log the notification
      console.log(`Bell notification for user ${userId}:`, notificationData);
      
      // In a real implementation, this would:
      // 1. Create a notification record in the database
      // 2. Send real-time notification via Socket.IO
      // 3. Update user's notification count
      
      return true;
    } catch (error) {
      console.error('Error sending bell notification:', error);
    }
  }
  
  /**
   * Send email notification
   */
  async sendEmailNotification(userId, type, templateData) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.email) {
        return false;
      }
      
      // This would integrate with the existing email service
      console.log(`Email notification (${type}) for user ${userId} (${user.email}):`, templateData);
      
      // In a real implementation, this would:
      // 1. Load the appropriate email template
      // 2. Render the template with the provided data
      // 3. Send the email via the configured email service (SendGrid, etc.)
      // 4. Track email delivery status
      
      return true;
    } catch (error) {
      console.error('Error sending email notification:', error);
      return false;
    }
  }
  
  /**
   * Send batch notifications for multiple users
   */
  async sendBatchNotifications(notifications) {
    try {
      const results = await Promise.allSettled(
        notifications.map(async (notification) => {
          switch (notification.type) {
            case 'winner':
              return await this.sendWinnerNotification(
                notification.userId,
                notification.allowlistId,
                notification.data
              );
            case 'refund':
              return await this.sendRefundNotification(
                notification.userId,
                notification.allowlistId,
                notification.data
              );
            case 'entry_confirmed':
              return await this.sendEntryConfirmation(
                notification.userId,
                notification.allowlistId
              );
            default:
              throw new Error(`Unknown notification type: ${notification.type}`);
          }
        })
      );
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      console.log(`Batch notifications completed: ${successful} successful, ${failed} failed`);
      
      return {
        successful,
        failed,
        results
      };
    } catch (error) {
      console.error('Error sending batch notifications:', error);
      throw error;
    }
  }
  
  /**
   * Clean up expired action items
   */
  async cleanupExpiredActionItems() {
    try {
      const expiredItems = await ActionItem.updateMany(
        {
          type: { $in: ['claim_winner'] },
          expiresAt: { $lt: new Date() },
          completed: false
        },
        {
          $set: { expired: true }
        }
      );
      
      console.log(`Cleaned up ${expiredItems.modifiedCount} expired action items`);
      return expiredItems.modifiedCount;
    } catch (error) {
      console.error('Error cleaning up expired action items:', error);
      throw error;
    }
  }
}

module.exports = new AllowlistNotificationService();