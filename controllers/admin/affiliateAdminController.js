const AffiliateService = require('../../services/affiliateService');
const Affiliate = require('../../models/affiliate/affiliate');
const AffiliateReferral = require('../../models/affiliate/affiliateReferral');

class AffiliateAdminController {
  
  /**
   * Get all affiliates with pagination and filtering
   */
  static async getAllAffiliates(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;
      
      const query = {};
      
      // Filter by status
      if (status) {
        query.status = status;
      }
      
      // Search by name or email
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { affiliateCode: { $regex: search, $options: 'i' } }
        ];
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
      
      const [affiliates, total] = await Promise.all([
        Affiliate.find(query)
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .select('-paymentDetails'), // Exclude sensitive payment info
        Affiliate.countDocuments(query)
      ]);
      
      res.json({
        success: true,
        data: {
          affiliates,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
      
    } catch (error) {
      console.error('Error in getAllAffiliates:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Get affiliate details by ID
   */
  static async getAffiliateById(req, res) {
    try {
      const { id } = req.params;
      
      const affiliate = await Affiliate.findById(id);
      if (!affiliate) {
        return res.status(404).json({
          success: false,
          message: 'Affiliate not found'
        });
      }
      
      // Get affiliate analytics
      const analytics = await AffiliateService.getAffiliateAnalytics(id);
      
      res.json({
        success: true,
        data: {
          affiliate,
          analytics: analytics.performance
        }
      });
      
    } catch (error) {
      console.error('Error in getAffiliateById:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Update affiliate
   */
  static async updateAffiliate(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Remove sensitive fields that shouldn't be updated via this endpoint
      delete updateData.affiliateId;
      delete updateData.affiliateCode;
      delete updateData.totalClicks;
      delete updateData.totalConversions;
      delete updateData.totalCommissionEarned;
      delete updateData.totalCommissionPaid;
      
      const affiliate = await Affiliate.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );
      
      if (!affiliate) {
        return res.status(404).json({
          success: false,
          message: 'Affiliate not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Affiliate updated successfully',
        data: affiliate
      });
      
    } catch (error) {
      console.error('Error in updateAffiliate:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Approve affiliate application
   */
  static async approveAffiliate(req, res) {
    try {
      const { id } = req.params;
      
      const affiliate = await Affiliate.findByIdAndUpdate(
        id,
        {
          status: 'active',
          isActive: true,
          approvedAt: new Date()
        },
        { new: true }
      );
      
      if (!affiliate) {
        return res.status(404).json({
          success: false,
          message: 'Affiliate not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Affiliate approved successfully',
        data: affiliate
      });
      
    } catch (error) {
      console.error('Error in approveAffiliate:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Suspend affiliate
   */
  static async suspendAffiliate(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      const affiliate = await Affiliate.findByIdAndUpdate(
        id,
        {
          status: 'suspended',
          isActive: false,
          notes: reason ? `Suspended: ${reason}` : 'Suspended by admin'
        },
        { new: true }
      );
      
      if (!affiliate) {
        return res.status(404).json({
          success: false,
          message: 'Affiliate not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Affiliate suspended successfully',
        data: affiliate
      });
      
    } catch (error) {
      console.error('Error in suspendAffiliate:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Process commission payout
   */
  static async processCommissionPayout(req, res) {
    try {
      const { id } = req.params;
      const { amount, notes } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid payout amount is required'
        });
      }
      
      const result = await AffiliateService.processCommissionPayouts(id, amount);
      
      if (!result.success) {
        return res.status(400).json(result);
      }
      
      // Update affiliate with payout notes
      if (notes) {
        await Affiliate.findByIdAndUpdate(id, {
          $push: {
            payoutHistory: {
              amount: result.totalPaid,
              date: new Date(),
              notes
            }
          }
        });
      }
      
      res.json({
        success: true,
        message: 'Commission payout processed successfully',
        data: result
      });
      
    } catch (error) {
      console.error('Error in processCommissionPayout:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Get affiliate referrals
   */
  static async getAffiliateReferrals(req, res) {
    try {
      const { id } = req.params;
      const {
        page = 1,
        limit = 20,
        status,
        hasConverted
      } = req.query;
      
      const query = { affiliateId: id };
      
      if (status) {
        query.status = status;
      }
      
      if (hasConverted !== undefined) {
        query.hasConverted = hasConverted === 'true';
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const [referrals, total] = await Promise.all([
        AffiliateReferral.find(query)
          .populate('userId', 'username email walletAddress')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        AffiliateReferral.countDocuments(query)
      ]);
      
      res.json({
        success: true,
        data: {
          referrals,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
      
    } catch (error) {
      console.error('Error in getAffiliateReferrals:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Get platform affiliate statistics
   */
  static async getPlatformStats(req, res) {
    try {
      const { startDate, endDate } = req.query;
      
      const matchStage = {};
      if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) matchStage.createdAt.$gte = new Date(startDate);
        if (endDate) matchStage.createdAt.$lte = new Date(endDate);
      }
      
      const [affiliateStats, referralStats] = await Promise.all([
        Affiliate.aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: null,
              totalAffiliates: { $sum: 1 },
              activeAffiliates: {
                $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
              },
              pendingAffiliates: {
                $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
              },
              totalClicks: { $sum: '$totalClicks' },
              totalConversions: { $sum: '$totalConversions' },
              totalCommissionEarned: { $sum: '$totalCommissionEarned' },
              totalCommissionPaid: { $sum: '$totalCommissionPaid' }
            }
          }
        ]),
        AffiliateReferral.aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: null,
              totalReferrals: { $sum: 1 },
              activeReferrals: {
                $sum: {
                  $cond: [
                    { $and: [
                      { $eq: ['$status', 'active'] },
                      { $gt: ['$expiresAt', new Date()] }
                    ]},
                    1,
                    0
                  ]
                }
              },
              convertedReferrals: {
                $sum: { $cond: ['$hasConverted', 1, 0] }
              }
            }
          }
        ])
      ]);
      
      const stats = {
        affiliates: affiliateStats[0] || {
          totalAffiliates: 0,
          activeAffiliates: 0,
          pendingAffiliates: 0,
          totalClicks: 0,
          totalConversions: 0,
          totalCommissionEarned: 0,
          totalCommissionPaid: 0
        },
        referrals: referralStats[0] || {
          totalReferrals: 0,
          activeReferrals: 0,
          convertedReferrals: 0
        }
      };
      
      // Calculate additional metrics
      stats.affiliates.pendingCommission = 
        stats.affiliates.totalCommissionEarned - stats.affiliates.totalCommissionPaid;
      
      stats.affiliates.conversionRate = stats.affiliates.totalClicks > 0
        ? (stats.affiliates.totalConversions / stats.affiliates.totalClicks * 100).toFixed(2)
        : 0;
      
      stats.referrals.conversionRate = stats.referrals.totalReferrals > 0
        ? (stats.referrals.convertedReferrals / stats.referrals.totalReferrals * 100).toFixed(2)
        : 0;
      
      res.json({
        success: true,
        data: stats
      });
      
    } catch (error) {
      console.error('Error in getPlatformStats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = AffiliateAdminController;