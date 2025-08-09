const AffiliateService = require('../services/affiliateService');

/**
 * Middleware to automatically track affiliate commissions for user activities
 */
class AffiliateTrackingMiddleware {
  
  /**
   * Track commission for raffle ticket purchases
   */
  static async trackRaffleTicketCommission(userId, amount, transactionId) {
    try {
      const result = await AffiliateService.recordCommission(
        userId,
        'raffle_ticket',
        amount,
        transactionId
      );
      
      if (result.success) {
        console.log(`Affiliate commission recorded: ${result.commissionAmount} for ${result.affiliate}`);
      }
      
      return result;
    } catch (error) {
      console.error('Error tracking raffle ticket commission:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Track commission for gaming activities
   */
  static async trackGamingCommission(userId, amount, transactionId) {
    try {
      const result = await AffiliateService.recordCommission(
        userId,
        'gaming',
        amount,
        transactionId
      );
      
      if (result.success) {
        console.log(`Gaming commission recorded: ${result.commissionAmount} for ${result.affiliate}`);
      }
      
      return result;
    } catch (error) {
      console.error('Error tracking gaming commission:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Track commission for deposits
   */
  static async trackDepositCommission(userId, amount, transactionId) {
    try {
      const result = await AffiliateService.recordCommission(
        userId,
        'deposits',
        amount,
        transactionId
      );
      
      if (result.success) {
        console.log(`Deposit commission recorded: ${result.commissionAmount} for ${result.affiliate}`);
      }
      
      return result;
    } catch (error) {
      console.error('Error tracking deposit commission:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Track commission for staking activities
   */
  static async trackStakingCommission(userId, amount, transactionId) {
    try {
      const result = await AffiliateService.recordCommission(
        userId,
        'staking',
        amount,
        transactionId
      );
      
      if (result.success) {
        console.log(`Staking commission recorded: ${result.commissionAmount} for ${result.affiliate}`);
      }
      
      return result;
    } catch (error) {
      console.error('Error tracking staking commission:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Express middleware to process affiliate referral on page load
   */
  static processReferralMiddleware() {
    return async (req, res, next) => {
      try {
        const { ref } = req.query;
        const userId = req.user?.id;
        
        // Only process if we have both referral code and authenticated user
        if (ref && userId) {
          const userAgent = req.get('User-Agent');
          const ipAddress = req.ip || req.connection.remoteAddress;
          const source = req.get('Referer') || 'direct';
          
          // Process the affiliate click asynchronously
          AffiliateService.processAffiliateClick(
            ref,
            userId,
            userAgent,
            ipAddress,
            source
          ).catch(error => {
            console.error('Error processing affiliate referral:', error);
          });
        }
        
        next();
      } catch (error) {
        console.error('Error in affiliate referral middleware:', error);
        next(); // Continue even if affiliate tracking fails
      }
    };
  }
  
  /**
   * Helper function to be called after successful transactions
   */
  static async trackCommissionForActivity(activityType, userId, amount, transactionId) {
    switch (activityType) {
      case 'raffle_ticket':
        return await this.trackRaffleTicketCommission(userId, amount, transactionId);
      case 'gaming':
        return await this.trackGamingCommission(userId, amount, transactionId);
      case 'deposits':
        return await this.trackDepositCommission(userId, amount, transactionId);
      case 'staking':
        return await this.trackStakingCommission(userId, amount, transactionId);
      default:
        console.warn(`Unknown activity type for affiliate tracking: ${activityType}`);
        return { success: false, message: 'Unknown activity type' };
    }
  }
}

module.exports = AffiliateTrackingMiddleware;