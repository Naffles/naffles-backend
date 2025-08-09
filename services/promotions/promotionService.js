const Promotion = require('../../models/promotions/promotion');
const UserPromotion = require('../../models/promotions/userPromotion');
const BonusCreditsBalance = require('../../models/promotions/bonusCreditsBalance');
const ActivityTracker = require('../../models/promotions/activityTracker');
const UserTargetingService = require('./userTargetingService');

class PromotionService {
  constructor() {
    this.userTargetingService = new UserTargetingService();
  }

  /**
   * Create a new promotion
   */
  async createPromotion(promotionData, createdBy) {
    try {
      // Validate promotion configuration
      this.validatePromotionConfig(promotionData);
      
      const promotion = new Promotion({
        ...promotionData,
        createdBy,
        status: 'draft'
      });
      
      await promotion.save();
      
      // Log creation
      console.log(`Promotion created: ${promotion.name} (${promotion._id})`);
      
      return promotion;
    } catch (error) {
      console.error('Error creating promotion:', error);
      throw error;
    }
  }

  /**
   * Update an existing promotion
   */
  async updatePromotion(promotionId, updateData, updatedBy) {
    try {
      const promotion = await Promotion.findById(promotionId);
      if (!promotion) {
        throw new Error('Promotion not found');
      }
      
      // Prevent updates to active promotions that would affect existing assignments
      if (promotion.status === 'active' && this.isBreakingChange(updateData)) {
        throw new Error('Cannot make breaking changes to active promotion');
      }
      
      // Validate updated configuration
      const updatedPromotion = { ...promotion.toObject(), ...updateData };
      this.validatePromotionConfig(updatedPromotion);
      
      Object.assign(promotion, updateData);
      await promotion.save();
      
      console.log(`Promotion updated: ${promotion.name} (${promotion._id})`);
      
      return promotion;
    } catch (error) {
      console.error('Error updating promotion:', error);
      throw error;
    }
  }

  /**
   * Activate a promotion
   */
  async activatePromotion(promotionId) {
    try {
      const promotion = await Promotion.findById(promotionId);
      if (!promotion) {
        throw new Error('Promotion not found');
      }
      
      if (promotion.status !== 'draft' && promotion.status !== 'paused') {
        throw new Error('Can only activate draft or paused promotions');
      }
      
      // Validate dates
      const now = new Date();
      if (promotion.endDate <= now) {
        throw new Error('Cannot activate expired promotion');
      }
      
      promotion.status = 'active';
      await promotion.save();
      
      // Auto-assign to eligible users if configured
      if (promotion.targetingCriteria.userType !== 'specific_users') {
        await this.autoAssignPromotion(promotion);
      }
      
      console.log(`Promotion activated: ${promotion.name} (${promotion._id})`);
      
      return promotion;
    } catch (error) {
      console.error('Error activating promotion:', error);
      throw error;
    }
  }

  /**
   * Deactivate a promotion
   */
  async deactivatePromotion(promotionId, reason = 'manual') {
    try {
      const promotion = await Promotion.findById(promotionId);
      if (!promotion) {
        throw new Error('Promotion not found');
      }
      
      const oldStatus = promotion.status;
      promotion.status = reason === 'expired' ? 'expired' : 'cancelled';
      await promotion.save();
      
      console.log(`Promotion deactivated: ${promotion.name} (${promotion._id}) - ${reason}`);
      
      return promotion;
    } catch (error) {
      console.error('Error deactivating promotion:', error);
      throw error;
    }
  }

  /**
   * Get promotion by ID with full details
   */
  async getPromotionById(promotionId) {
    try {
      const promotion = await Promotion.findById(promotionId)
        .populate('createdBy', 'username email');
      
      if (!promotion) {
        throw new Error('Promotion not found');
      }
      
      // Get usage statistics
      const stats = await this.getPromotionStats(promotionId);
      
      return {
        ...promotion.toObject(),
        stats
      };
    } catch (error) {
      console.error('Error getting promotion:', error);
      throw error;
    }
  }

  /**
   * List promotions with filtering and pagination
   */
  async listPromotions(filters = {}, options = {}) {
    try {
      const {
        status,
        type,
        createdBy,
        startDate,
        endDate,
        search
      } = filters;
      
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;
      
      // Build query
      const query = {};
      
      if (status) query.status = status;
      if (type) query.type = type;
      if (createdBy) query.createdBy = createdBy;
      
      if (startDate || endDate) {
        query.startDate = {};
        if (startDate) query.startDate.$gte = new Date(startDate);
        if (endDate) query.startDate.$lte = new Date(endDate);
      }
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }
      
      // Execute query
      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
      
      const [promotions, total] = await Promise.all([
        Promotion.find(query)
          .populate('createdBy', 'username email')
          .sort(sort)
          .skip(skip)
          .limit(limit),
        Promotion.countDocuments(query)
      ]);
      
      return {
        promotions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error listing promotions:', error);
      throw error;
    }
  }

  /**
   * Auto-assign promotion to eligible users
   */
  async autoAssignPromotion(promotion) {
    try {
      const eligibleUsers = await this.userTargetingService.findEligibleUsers(promotion);
      
      let assignedCount = 0;
      const maxAssignments = promotion.targetingCriteria.maxAssignments;
      
      for (const user of eligibleUsers) {
        if (maxAssignments && assignedCount >= maxAssignments) {
          break;
        }
        
        try {
          await this.assignPromotionToUser(promotion._id, user._id, 'system');
          assignedCount++;
        } catch (error) {
          console.warn(`Failed to assign promotion ${promotion._id} to user ${user._id}:`, error.message);
        }
      }
      
      // Update promotion stats
      promotion.totalAssignments += assignedCount;
      await promotion.save();
      
      console.log(`Auto-assigned promotion ${promotion._id} to ${assignedCount} users`);
      
      return assignedCount;
    } catch (error) {
      console.error('Error auto-assigning promotion:', error);
      throw error;
    }
  }

  /**
   * Assign promotion to specific user
   */
  async assignPromotionToUser(promotionId, userId, assignedBy = 'admin') {
    try {
      const promotion = await Promotion.findById(promotionId);
      if (!promotion) {
        throw new Error('Promotion not found');
      }
      
      if (!promotion.isActive) {
        throw new Error('Cannot assign inactive promotion');
      }
      
      // Check if user already has this promotion
      const existingAssignment = await UserPromotion.findOne({
        userId,
        promotionId,
        status: 'active'
      });
      
      if (existingAssignment) {
        throw new Error('User already has this promotion assigned');
      }
      
      // Calculate expiry date
      let expiresAt = promotion.endDate;
      if (promotion.type === 'deposit_bonus' && promotion.depositBonusConfig.expiryDays) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + promotion.depositBonusConfig.expiryDays);
        expiresAt = expiryDate < promotion.endDate ? expiryDate : promotion.endDate;
      }
      
      // Create user promotion assignment
      const userPromotion = new UserPromotion({
        userId,
        promotionId,
        assignedBy,
        expiresAt,
        status: 'active'
      });
      
      // Set up activity tracking for free tokens promotions
      if (promotion.type === 'free_tokens' && promotion.freeTokensConfig.activityRequirements) {
        userPromotion.activityProgress = promotion.freeTokensConfig.activityRequirements.map(req => ({
          activityType: req.activityType,
          currentCount: 0,
          requiredCount: req.requiredCount,
          completed: false
        }));
      }
      
      await userPromotion.save();
      
      // Create activity tracker if needed
      if (promotion.type === 'free_tokens') {
        await this.createActivityTracker(userId, promotion);
      }
      
      console.log(`Promotion ${promotionId} assigned to user ${userId}`);
      
      return userPromotion;
    } catch (error) {
      console.error('Error assigning promotion to user:', error);
      throw error;
    }
  }

  /**
   * Get user's active promotions
   */
  async getUserPromotions(userId, type = null) {
    try {
      const query = {
        userId,
        status: 'active',
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: { $gt: new Date() } }
        ]
      };
      
      const userPromotions = await UserPromotion.find(query)
        .populate({
          path: 'promotionId',
          match: type ? { type } : {}
        });
      
      // Filter out promotions that didn't match the type filter
      const validPromotions = userPromotions.filter(up => up.promotionId);
      
      return validPromotions;
    } catch (error) {
      console.error('Error getting user promotions:', error);
      throw error;
    }
  }

  /**
   * Get best promotion for user and transaction type
   */
  async getBestPromotionForUser(userId, transactionType, transactionData = {}) {
    try {
      const userPromotions = await this.getUserPromotions(userId);
      
      let bestPromotion = null;
      let bestSavings = 0;
      
      for (const userPromotion of userPromotions) {
        const promotion = userPromotion.promotionId;
        
        if (!userPromotion.canUse(promotion)) {
          continue;
        }
        
        let savings = 0;
        
        if (promotion.type === 'fee_discount' && transactionType === 'fee_calculation') {
          savings = promotion.calculateFeeDiscount(
            transactionData.originalFee,
            transactionData.feeType
          );
        } else if (promotion.type === 'deposit_bonus' && transactionType === 'deposit') {
          savings = promotion.calculateDepositBonus(
            transactionData.depositAmount,
            transactionData.tokenInfo
          );
        }
        
        if (savings > bestSavings || (savings === bestSavings && promotion.priority > (bestPromotion?.priority || 0))) {
          bestPromotion = { userPromotion, promotion, savings };
          bestSavings = savings;
        }
      }
      
      return bestPromotion;
    } catch (error) {
      console.error('Error getting best promotion for user:', error);
      throw error;
    }
  }

  /**
   * Get promotion statistics
   */
  async getPromotionStats(promotionId) {
    try {
      const [
        totalAssignments,
        activeAssignments,
        totalUsages,
        totalSavings,
        totalBonusAwarded
      ] = await Promise.all([
        UserPromotion.countDocuments({ promotionId }),
        UserPromotion.countDocuments({ promotionId, status: 'active' }),
        UserPromotion.aggregate([
          { $match: { promotionId } },
          { $group: { _id: null, total: { $sum: '$usageCount' } } }
        ]),
        UserPromotion.aggregate([
          { $match: { promotionId } },
          { $group: { _id: null, total: { $sum: '$totalSavings' } } }
        ]),
        UserPromotion.aggregate([
          { $match: { promotionId } },
          { $group: { _id: null, total: { $sum: '$totalBonusReceived' } } }
        ])
      ]);
      
      return {
        totalAssignments,
        activeAssignments,
        totalUsages: totalUsages[0]?.total || 0,
        totalSavings: totalSavings[0]?.total || 0,
        totalBonusAwarded: totalBonusAwarded[0]?.total || 0,
        conversionRate: totalAssignments > 0 ? (totalUsages[0]?.total || 0) / totalAssignments : 0
      };
    } catch (error) {
      console.error('Error getting promotion stats:', error);
      throw error;
    }
  }

  /**
   * Create activity tracker for free tokens promotion
   */
  async createActivityTracker(userId, promotion) {
    try {
      let tracker = await ActivityTracker.findOne({ userId });
      
      if (!tracker) {
        tracker = new ActivityTracker({ userId });
      }
      
      // Create tracking period based on distribution frequency
      const frequency = promotion.freeTokensConfig.distributionFrequency;
      await tracker.createTrackingPeriod(frequency === 'one_time' ? 'monthly' : frequency, [promotion]);
      
      return tracker;
    } catch (error) {
      console.error('Error creating activity tracker:', error);
      throw error;
    }
  }

  /**
   * Validate promotion configuration
   */
  validatePromotionConfig(promotionData) {
    const { type } = promotionData;
    
    if (type === 'fee_discount') {
      if (!promotionData.feeDiscountConfig) {
        throw new Error('Fee discount configuration is required');
      }
      
      const config = promotionData.feeDiscountConfig;
      if (!config.discountPercentage || config.discountPercentage <= 0 || config.discountPercentage > 100) {
        throw new Error('Invalid discount percentage');
      }
      
      if (!config.applicableFeeTypes || config.applicableFeeTypes.length === 0) {
        throw new Error('At least one applicable fee type is required');
      }
    }
    
    if (type === 'deposit_bonus') {
      if (!promotionData.depositBonusConfig) {
        throw new Error('Deposit bonus configuration is required');
      }
      
      const config = promotionData.depositBonusConfig;
      if (!config.bonusPercentage || config.bonusPercentage <= 0) {
        throw new Error('Invalid bonus percentage');
      }
      
      if (config.expiryDays && (config.expiryDays < 1 || config.expiryDays > 365)) {
        throw new Error('Expiry days must be between 1 and 365');
      }
    }
    
    if (type === 'free_tokens') {
      if (!promotionData.freeTokensConfig) {
        throw new Error('Free tokens configuration is required');
      }
      
      const config = promotionData.freeTokensConfig;
      if (!config.tokenAmount || config.tokenAmount <= 0) {
        throw new Error('Invalid token amount');
      }
      
      if (!config.distributionFrequency) {
        throw new Error('Distribution frequency is required');
      }
    }
    
    // Validate dates
    if (promotionData.startDate >= promotionData.endDate) {
      throw new Error('End date must be after start date');
    }
    
    return true;
  }

  /**
   * Check if update would be a breaking change
   */
  isBreakingChange(updateData) {
    const breakingFields = [
      'type',
      'feeDiscountConfig.discountPercentage',
      'feeDiscountConfig.applicableFeeTypes',
      'depositBonusConfig.bonusPercentage',
      'depositBonusConfig.maxBonusAmount',
      'freeTokensConfig.tokenAmount',
      'targetingCriteria'
    ];
    
    return breakingFields.some(field => {
      const keys = field.split('.');
      let value = updateData;
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Cleanup expired promotions
   */
  async cleanupExpiredPromotions() {
    try {
      const now = new Date();
      
      // Mark expired promotions
      const expiredPromotions = await Promotion.updateMany(
        {
          status: 'active',
          endDate: { $lt: now }
        },
        {
          status: 'expired'
        }
      );
      
      // Mark expired user promotions
      const expiredUserPromotions = await UserPromotion.updateMany(
        {
          status: 'active',
          expiresAt: { $lt: now }
        },
        {
          status: 'expired'
        }
      );
      
      console.log(`Cleaned up ${expiredPromotions.modifiedCount} expired promotions and ${expiredUserPromotions.modifiedCount} expired user promotions`);
      
      return {
        expiredPromotions: expiredPromotions.modifiedCount,
        expiredUserPromotions: expiredUserPromotions.modifiedCount
      };
    } catch (error) {
      console.error('Error cleaning up expired promotions:', error);
      throw error;
    }
  }
}

module.exports = PromotionService;