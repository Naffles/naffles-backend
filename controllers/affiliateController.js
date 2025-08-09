const AffiliateService = require('../services/affiliateService');
const Affiliate = require('../models/affiliate/affiliate');
const AffiliateReferral = require('../models/affiliate/affiliateReferral');

class AffiliateController {
  
  /**
   * Process affiliate referral click
   */
  static async processClick(req, res) {
    try {
      const { ref } = req.query;
      const userId = req.user?.id;
      const userAgent = req.get('User-Agent');
      const ipAddress = req.ip || req.connection.remoteAddress;
      const source = req.get('Referer') || 'direct';
      
      if (!ref) {
        return res.status(400).json({
          success: false,
          message: 'Affiliate code is required'
        });
      }
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User must be authenticated'
        });
      }
      
      const result = await AffiliateService.processAffiliateClick(
        ref, 
        userId, 
        userAgent, 
        ipAddress, 
        source
      );
      
      res.json(result);
      
    } catch (error) {
      console.error('Error in processClick:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Get user's referral information
   */
  static async getUserReferralInfo(req, res) {
    try {
      const userId = req.user.id;
      
      const referralInfo = await AffiliateService.getUserReferralInfo(userId);
      
      res.json({
        success: true,
        data: referralInfo
      });
      
    } catch (error) {
      console.error('Error in getUserReferralInfo:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Get affiliate analytics (for affiliate users)
   */
  static async getAffiliateAnalytics(req, res) {
    try {
      const { affiliateId } = req.params;
      const { startDate, endDate } = req.query;
      
      // Verify user has access to this affiliate data
      const affiliate = await Affiliate.findById(affiliateId);
      if (!affiliate) {
        return res.status(404).json({
          success: false,
          message: 'Affiliate not found'
        });
      }
      
      // Add authorization check here if needed
      // For now, assuming any authenticated user can view analytics
      
      const analytics = await AffiliateService.getAffiliateAnalytics(
        affiliateId,
        startDate ? new Date(startDate) : null,
        endDate ? new Date(endDate) : null
      );
      
      res.json({
        success: true,
        data: analytics
      });
      
    } catch (error) {
      console.error('Error in getAffiliateAnalytics:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Generate affiliate URL
   */
  static async generateAffiliateUrl(req, res) {
    try {
      const { affiliateCode, path } = req.body;
      const baseUrl = process.env.BASE_URL || 'https://naffles.com';
      
      if (!affiliateCode) {
        return res.status(400).json({
          success: false,
          message: 'Affiliate code is required'
        });
      }
      
      // Verify affiliate code exists
      const affiliate = await Affiliate.findByCode(affiliateCode);
      if (!affiliate) {
        return res.status(404).json({
          success: false,
          message: 'Invalid affiliate code'
        });
      }
      
      const affiliateUrl = AffiliateService.generateAffiliateUrl(
        affiliateCode,
        baseUrl,
        path || ''
      );
      
      res.json({
        success: true,
        data: {
          affiliateUrl,
          affiliateCode,
          affiliateName: affiliate.name
        }
      });
      
    } catch (error) {
      console.error('Error in generateAffiliateUrl:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Get affiliate leaderboard
   */
  static async getLeaderboard(req, res) {
    try {
      const { limit = 10, sortBy = 'totalCommissionEarned' } = req.query;
      
      const leaderboard = await AffiliateService.getAffiliateLeaderboard(
        parseInt(limit),
        sortBy
      );
      
      res.json({
        success: true,
        data: leaderboard
      });
      
    } catch (error) {
      console.error('Error in getLeaderboard:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Apply to become an affiliate
   */
  static async applyAffiliate(req, res) {
    try {
      const {
        name,
        email,
        paymentMethod,
        paymentDetails,
        notes
      } = req.body;
      
      if (!name || !email) {
        return res.status(400).json({
          success: false,
          message: 'Name and email are required'
        });
      }
      
      // Check if email already exists
      const existingAffiliate = await Affiliate.findOne({ email });
      if (existingAffiliate) {
        return res.status(409).json({
          success: false,
          message: 'Email already registered as affiliate'
        });
      }
      
      const affiliateData = {
        name,
        email,
        paymentMethod: paymentMethod || 'crypto',
        paymentDetails: paymentDetails || {},
        notes,
        status: 'pending'
      };
      
      const affiliate = await AffiliateService.createAffiliate(affiliateData);
      
      res.status(201).json({
        success: true,
        message: 'Affiliate application submitted successfully',
        data: {
          affiliateId: affiliate._id,
          name: affiliate.name,
          code: affiliate.affiliateCode,
          status: affiliate.status
        }
      });
      
    } catch (error) {
      console.error('Error in applyAffiliate:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Get affiliate by code (public endpoint for verification)
   */
  static async getAffiliateByCode(req, res) {
    try {
      const { code } = req.params;
      
      const affiliate = await Affiliate.findByCode(code);
      if (!affiliate) {
        return res.status(404).json({
          success: false,
          message: 'Affiliate not found'
        });
      }
      
      res.json({
        success: true,
        data: {
          name: affiliate.name,
          code: affiliate.affiliateCode,
          isActive: affiliate.isActive && affiliate.status === 'active'
        }
      });
      
    } catch (error) {
      console.error('Error in getAffiliateByCode:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = AffiliateController;