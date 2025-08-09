const Affiliate = require('../models/affiliate/affiliate');
const AffiliateReferral = require('../models/affiliate/affiliateReferral');
const User = require('../models/user/user');
const crypto = require('crypto');

class AffiliateService {
  
  /**
   * Generate affiliate URL with tracking code
   */
  static generateAffiliateUrl(affiliateCode, baseUrl = 'https://naffles.com', path = '') {
    const url = new URL(path, baseUrl);
    url.searchParams.set('ref', affiliateCode);
    return url.toString();
  }
  
  /**
   * Process affiliate click and create/update referral tracking
   */
  static async processAffiliateClick(affiliateCode, userId, userAgent, ipAddress, source = 'direct') {
    try {
      // Find the affiliate by code
      const affiliate = await Affiliate.findByCode(affiliateCode);
      if (!affiliate) {
        throw new Error('Invalid affiliate code');
      }
      
      // Check if user already has an active referral with this affiliate
      let referral = await AffiliateReferral.findActiveReferral(userId, affiliate._id);
      
      if (referral) {
        // Update existing referral with new click
        await referral.recordClick(userAgent, ipAddress, source);
        await Affiliate.findByIdAndUpdate(affiliate._id, { 
          $inc: { totalClicks: 1 } 
        });
      } else {
        // Check if user has any active referral with another affiliate (first-click attribution)
        const existingReferral = await AffiliateReferral.findUserReferral(userId);
        
        if (!existingReferral) {
          // Create new referral (first-click attribution)
          const referralId = crypto.randomBytes(16).toString('hex');
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + affiliate.attributionWindow);
          
          referral = new AffiliateReferral({
            referralId,
            affiliateId: affiliate._id,
            userId,
            firstClickDate: new Date(),
            lastClickDate: new Date(),
            totalClicks: 1,
            userAgent,
            ipAddress,
            referralSource: source,
            expiresAt
          });
          
          await referral.save();
          
          // Update affiliate stats
          await Affiliate.findByIdAndUpdate(affiliate._id, { 
            $inc: { totalClicks: 1 } 
          });
        } else {
          // User already attributed to another affiliate, just count the click
          await Affiliate.findByIdAndUpdate(affiliate._id, { 
            $inc: { totalClicks: 1 } 
          });
        }
      }
      
      return {
        success: true,
        referral,
        affiliate: affiliate.name
      };
      
    } catch (error) {
      console.error('Error processing affiliate click:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Record affiliate commission for user activity
   */
  static async recordCommission(userId, activityType, amount, transactionId = null) {
    try {
      // Find active referral for user
      const referral = await AffiliateReferral.findUserReferral(userId);
      
      if (!referral || !referral.isValid()) {
        return { success: false, message: 'No active referral found' };
      }
      
      const affiliate = referral.affiliateId;
      
      // Check if affiliate can earn commission for this activity
      if (!affiliate.canEarnCommission(activityType)) {
        return { success: false, message: 'Affiliate not eligible for this activity type' };
      }
      
      // Calculate commission
      const commissionAmount = affiliate.calculateCommission(amount, activityType);
      
      if (commissionAmount <= 0) {
        return { success: false, message: 'No commission applicable' };
      }
      
      // Record the conversion
      await referral.recordConversion(activityType, amount, commissionAmount, transactionId);
      
      // Update affiliate stats
      await Affiliate.findByIdAndUpdate(affiliate._id, {
        $inc: {
          totalConversions: 1,
          totalCommissionEarned: commissionAmount
        }
      });
      
      return {
        success: true,
        commissionAmount,
        affiliate: affiliate.name,
        activityType
      };
      
    } catch (error) {
      console.error('Error recording commission:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get affiliate performance analytics
   */
  static async getAffiliateAnalytics(affiliateId, startDate = null, endDate = null) {
    try {
      const affiliate = await Affiliate.findById(affiliateId);
      if (!affiliate) {
        throw new Error('Affiliate not found');
      }
      
      // Get performance data
      const performanceData = await AffiliateReferral.getAffiliatePerformance(
        affiliateId, 
        startDate, 
        endDate
      );
      
      const performance = performanceData[0] || {
        totalReferrals: 0,
        totalClicks: 0,
        totalConversions: 0,
        totalCommissionEarned: 0,
        totalCommissionPaid: 0,
        activeReferrals: 0
      };
      
      // Calculate additional metrics
      const conversionRate = performance.totalClicks > 0 
        ? (performance.totalConversions / performance.totalClicks * 100).toFixed(2)
        : 0;
      
      const pendingCommission = performance.totalCommissionEarned - performance.totalCommissionPaid;
      
      return {
        affiliate: {
          id: affiliate._id,
          name: affiliate.name,
          code: affiliate.affiliateCode,
          commissionRate: affiliate.commissionRate,
          status: affiliate.status
        },
        performance: {
          ...performance,
          conversionRate: parseFloat(conversionRate),
          pendingCommission
        }
      };
      
    } catch (error) {
      console.error('Error getting affiliate analytics:', error);
      throw error;
    }
  }
  
  /**
   * Get user's referral information
   */
  static async getUserReferralInfo(userId) {
    try {
      const referral = await AffiliateReferral.findUserReferral(userId);
      
      if (!referral) {
        return { hasReferral: false };
      }
      
      return {
        hasReferral: true,
        affiliate: {
          name: referral.affiliateId.name,
          code: referral.affiliateId.affiliateCode
        },
        referralDate: referral.firstClickDate,
        totalCommissionEarned: referral.totalCommissionEarned,
        totalActivities: referral.activities.length,
        isValid: referral.isValid()
      };
      
    } catch (error) {
      console.error('Error getting user referral info:', error);
      throw error;
    }
  }
  
  /**
   * Create new affiliate
   */
  static async createAffiliate(affiliateData) {
    try {
      // Generate unique affiliate code
      let affiliateCode;
      let isUnique = false;
      let attempts = 0;
      
      while (!isUnique && attempts < 10) {
        affiliateCode = this.generateAffiliateCode(affiliateData.name);
        const existing = await Affiliate.findOne({ affiliateCode });
        if (!existing) {
          isUnique = true;
        }
        attempts++;
      }
      
      if (!isUnique) {
        throw new Error('Unable to generate unique affiliate code');
      }
      
      const affiliate = new Affiliate({
        ...affiliateData,
        affiliateId: crypto.randomBytes(16).toString('hex'),
        affiliateCode
      });
      
      await affiliate.save();
      return affiliate;
      
    } catch (error) {
      console.error('Error creating affiliate:', error);
      throw error;
    }
  }
  
  /**
   * Generate affiliate code from name
   */
  static generateAffiliateCode(name) {
    const cleanName = name.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 8);
    
    const randomSuffix = crypto.randomBytes(2).toString('hex');
    return `${cleanName}${randomSuffix}`;
  }
  
  /**
   * Process commission payouts
   */
  static async processCommissionPayouts(affiliateId, amount) {
    try {
      const affiliate = await Affiliate.findById(affiliateId);
      if (!affiliate) {
        throw new Error('Affiliate not found');
      }
      
      // Get all referrals with pending commission
      const referrals = await AffiliateReferral.find({
        affiliateId,
        $expr: { $gt: ['$totalCommissionEarned', '$totalCommissionPaid'] }
      });
      
      let totalPaid = 0;
      let remainingAmount = amount;
      
      for (const referral of referrals) {
        const pendingCommission = referral.totalCommissionEarned - referral.totalCommissionPaid;
        const payoutAmount = Math.min(pendingCommission, remainingAmount);
        
        if (payoutAmount > 0) {
          await referral.markCommissionPaid(payoutAmount);
          totalPaid += payoutAmount;
          remainingAmount -= payoutAmount;
        }
        
        if (remainingAmount <= 0) break;
      }
      
      // Update affiliate payout tracking
      await Affiliate.findByIdAndUpdate(affiliateId, {
        $inc: { totalCommissionPaid: totalPaid },
        lastPayoutAt: new Date()
      });
      
      return {
        success: true,
        totalPaid,
        referralsUpdated: referrals.length
      };
      
    } catch (error) {
      console.error('Error processing commission payouts:', error);
      throw error;
    }
  }
  
  /**
   * Get affiliate leaderboard
   */
  static async getAffiliateLeaderboard(limit = 10, sortBy = 'totalCommissionEarned') {
    try {
      const affiliates = await Affiliate.find({ 
        status: 'active',
        isActive: true 
      })
      .sort({ [sortBy]: -1 })
      .limit(limit)
      .select('name affiliateCode totalClicks totalConversions totalCommissionEarned');
      
      return affiliates.map(affiliate => ({
        name: affiliate.name,
        code: affiliate.affiliateCode,
        totalClicks: affiliate.totalClicks,
        totalConversions: affiliate.totalConversions,
        totalCommissionEarned: affiliate.totalCommissionEarned,
        conversionRate: affiliate.conversionRate
      }));
      
    } catch (error) {
      console.error('Error getting affiliate leaderboard:', error);
      throw error;
    }
  }
}

module.exports = AffiliateService;