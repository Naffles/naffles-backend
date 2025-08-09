const PromotionService = require('./promotionService');
const UserPromotion = require('../../models/promotions/userPromotion');

class FeeCalculationEngine {
  constructor() {
    this.promotionService = new PromotionService();
  }

  /**
   * Calculate fee with promotion discounts applied
   */
  async calculateFeeWithPromotions(userId, feeCalculationData) {
    try {
      const {
        originalFee,
        feeType,
        transactionId,
        transactionData = {}
      } = feeCalculationData;
      
      // Validate input
      if (!originalFee || originalFee <= 0) {
        throw new Error('Invalid original fee amount');
      }
      
      if (!this.isValidFeeType(feeType)) {
        throw new Error('Invalid fee type');
      }
      
      // Get best promotion for this user and fee type
      const bestPromotion = await this.promotionService.getBestPromotionForUser(
        userId,
        'fee_calculation',
        { originalFee, feeType, ...transactionData }
      );
      
      let finalFee = originalFee;
      let discountAmount = 0;
      let appliedPromotion = null;
      
      if (bestPromotion && bestPromotion.savings > 0) {
        discountAmount = bestPromotion.savings;
        finalFee = Math.max(0, originalFee - discountAmount);
        appliedPromotion = bestPromotion;
        
        // Record the usage
        if (transactionId) {
          await this.recordPromotionUsage(
            bestPromotion.userPromotion,
            {
              transactionId,
              usageType: 'fee_discount',
              originalAmount: originalFee,
              discountAmount,
              feeType,
              details: transactionData
            }
          );
        }
      }
      
      return {
        originalFee,
        finalFee,
        discountAmount,
        discountPercentage: originalFee > 0 ? (discountAmount / originalFee) * 100 : 0,
        appliedPromotion: appliedPromotion ? {
          promotionId: appliedPromotion.promotion._id,
          promotionName: appliedPromotion.promotion.name,
          userPromotionId: appliedPromotion.userPromotion._id,
          discountPercentage: appliedPromotion.promotion.feeDiscountConfig.discountPercentage
        } : null,
        calculatedAt: new Date()
      };
    } catch (error) {
      console.error('Error calculating fee with promotions:', error);
      throw error;
    }
  }

  /**
   * Calculate multiple fees with promotions (batch processing)
   */
  async calculateMultipleFeesWithPromotions(userId, feeCalculations) {
    try {
      const results = [];
      
      // Get all user's active fee discount promotions once
      const userPromotions = await this.promotionService.getUserPromotions(userId, 'fee_discount');
      
      for (const feeCalc of feeCalculations) {
        try {
          // Find best promotion for this specific fee
          let bestPromotion = null;
          let bestSavings = 0;
          
          for (const userPromotion of userPromotions) {
            const promotion = userPromotion.promotionId;
            
            if (!userPromotion.canUse(promotion)) {
              continue;
            }
            
            const savings = promotion.calculateFeeDiscount(feeCalc.originalFee, feeCalc.feeType);
            
            if (savings > bestSavings || (savings === bestSavings && promotion.priority > (bestPromotion?.promotion.priority || 0))) {
              bestPromotion = { userPromotion, promotion, savings };
              bestSavings = savings;
            }
          }
          
          let finalFee = feeCalc.originalFee;
          let discountAmount = 0;
          let appliedPromotion = null;
          
          if (bestPromotion && bestPromotion.savings > 0) {
            discountAmount = bestPromotion.savings;
            finalFee = Math.max(0, feeCalc.originalFee - discountAmount);
            appliedPromotion = bestPromotion;
          }
          
          results.push({
            feeType: feeCalc.feeType,
            originalFee: feeCalc.originalFee,
            finalFee,
            discountAmount,
            discountPercentage: feeCalc.originalFee > 0 ? (discountAmount / feeCalc.originalFee) * 100 : 0,
            appliedPromotion: appliedPromotion ? {
              promotionId: appliedPromotion.promotion._id,
              promotionName: appliedPromotion.promotion.name,
              userPromotionId: appliedPromotion.userPromotion._id,
              discountPercentage: appliedPromotion.promotion.feeDiscountConfig.discountPercentage
            } : null
          });
        } catch (error) {
          console.error(`Error calculating fee for ${feeCalc.feeType}:`, error);
          results.push({
            feeType: feeCalc.feeType,
            originalFee: feeCalc.originalFee,
            finalFee: feeCalc.originalFee,
            discountAmount: 0,
            discountPercentage: 0,
            appliedPromotion: null,
            error: error.message
          });
        }
      }
      
      return {
        userId,
        calculations: results,
        totalOriginalFees: results.reduce((sum, r) => sum + r.originalFee, 0),
        totalFinalFees: results.reduce((sum, r) => sum + r.finalFee, 0),
        totalSavings: results.reduce((sum, r) => sum + r.discountAmount, 0),
        calculatedAt: new Date()
      };
    } catch (error) {
      console.error('Error calculating multiple fees with promotions:', error);
      throw error;
    }
  }

  /**
   * Validate fee discount before applying
   */
  async validateFeeDiscount(userId, promotionId, feeCalculationData) {
    try {
      const userPromotion = await UserPromotion.findOne({
        userId,
        promotionId,
        status: 'active'
      }).populate('promotionId');
      
      if (!userPromotion) {
        return {
          valid: false,
          reason: 'User promotion not found or inactive'
        };
      }
      
      const promotion = userPromotion.promotionId;
      
      if (promotion.type !== 'fee_discount') {
        return {
          valid: false,
          reason: 'Promotion is not a fee discount type'
        };
      }
      
      if (!promotion.isActive) {
        return {
          valid: false,
          reason: 'Promotion is not currently active'
        };
      }
      
      if (!userPromotion.canUse(promotion)) {
        return {
          valid: false,
          reason: 'User has exceeded usage limits or is in cooldown period'
        };
      }
      
      const { feeType, originalFee } = feeCalculationData;
      
      if (!promotion.feeDiscountConfig.applicableFeeTypes.includes(feeType)) {
        return {
          valid: false,
          reason: `Fee type ${feeType} is not applicable for this promotion`
        };
      }
      
      const discountAmount = promotion.calculateFeeDiscount(originalFee, feeType);
      
      if (discountAmount <= 0) {
        return {
          valid: false,
          reason: 'No discount applicable for this fee amount'
        };
      }
      
      return {
        valid: true,
        discountAmount,
        discountPercentage: promotion.feeDiscountConfig.discountPercentage,
        finalFee: Math.max(0, originalFee - discountAmount)
      };
    } catch (error) {
      console.error('Error validating fee discount:', error);
      return {
        valid: false,
        reason: 'Error validating discount'
      };
    }
  }

  /**
   * Record promotion usage for fee discount
   */
  async recordPromotionUsage(userPromotion, usageData) {
    try {
      await userPromotion.recordUsage(usageData);
      
      // Update promotion statistics
      const promotion = await userPromotion.populate('promotionId');
      promotion.promotionId.totalUsages += 1;
      promotion.promotionId.totalSavings += usageData.discountAmount;
      await promotion.promotionId.save();
      
      console.log(`Recorded fee discount usage: ${usageData.discountAmount} saved on ${usageData.feeType}`);
      
      return true;
    } catch (error) {
      console.error('Error recording promotion usage:', error);
      throw error;
    }
  }

  /**
   * Get fee discount history for user
   */
  async getUserFeeDiscountHistory(userId, options = {}) {
    try {
      const {
        startDate,
        endDate,
        feeType,
        page = 1,
        limit = 20
      } = options;
      
      // Build query for user promotions with fee discount usage
      const query = {
        userId,
        'usageHistory.usageType': 'fee_discount'
      };
      
      const userPromotions = await UserPromotion.find(query)
        .populate('promotionId', 'name type')
        .lean();
      
      // Extract and filter usage history
      let allUsages = [];
      
      for (const userPromotion of userPromotions) {
        const feeDiscountUsages = userPromotion.usageHistory
          .filter(usage => usage.usageType === 'fee_discount')
          .map(usage => ({
            ...usage,
            promotionName: userPromotion.promotionId.name,
            promotionId: userPromotion.promotionId._id,
            userPromotionId: userPromotion._id
          }));
        
        allUsages = allUsages.concat(feeDiscountUsages);
      }
      
      // Apply filters
      if (startDate) {
        allUsages = allUsages.filter(usage => usage.usedAt >= new Date(startDate));
      }
      
      if (endDate) {
        allUsages = allUsages.filter(usage => usage.usedAt <= new Date(endDate));
      }
      
      if (feeType) {
        allUsages = allUsages.filter(usage => usage.feeType === feeType);
      }
      
      // Sort by date (newest first)
      allUsages.sort((a, b) => b.usedAt - a.usedAt);
      
      // Apply pagination
      const total = allUsages.length;
      const startIndex = (page - 1) * limit;
      const paginatedUsages = allUsages.slice(startIndex, startIndex + limit);
      
      // Calculate summary statistics
      const totalSavings = allUsages.reduce((sum, usage) => sum + usage.discountAmount, 0);
      const totalOriginalFees = allUsages.reduce((sum, usage) => sum + usage.originalAmount, 0);
      const averageDiscount = allUsages.length > 0 ? totalSavings / allUsages.length : 0;
      
      return {
        usages: paginatedUsages,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        summary: {
          totalUsages: allUsages.length,
          totalSavings,
          totalOriginalFees,
          averageDiscount,
          savingsPercentage: totalOriginalFees > 0 ? (totalSavings / totalOriginalFees) * 100 : 0
        }
      };
    } catch (error) {
      console.error('Error getting user fee discount history:', error);
      throw error;
    }
  }

  /**
   * Get fee discount analytics
   */
  async getFeeDiscountAnalytics(options = {}) {
    try {
      const {
        startDate,
        endDate,
        promotionId,
        feeType
      } = options;
      
      // Build aggregation pipeline
      const pipeline = [];
      
      // Match stage
      const matchStage = {
        'usageHistory.usageType': 'fee_discount'
      };
      
      if (promotionId) {
        matchStage.promotionId = promotionId;
      }
      
      pipeline.push({ $match: matchStage });
      
      // Unwind usage history
      pipeline.push({ $unwind: '$usageHistory' });
      
      // Filter usage history
      const usageMatchStage = {
        'usageHistory.usageType': 'fee_discount'
      };
      
      if (startDate) {
        usageMatchStage['usageHistory.usedAt'] = { $gte: new Date(startDate) };
      }
      
      if (endDate) {
        usageMatchStage['usageHistory.usedAt'] = {
          ...usageMatchStage['usageHistory.usedAt'],
          $lte: new Date(endDate)
        };
      }
      
      if (feeType) {
        usageMatchStage['usageHistory.feeType'] = feeType;
      }
      
      pipeline.push({ $match: usageMatchStage });
      
      // Group and calculate statistics
      pipeline.push({
        $group: {
          _id: null,
          totalUsages: { $sum: 1 },
          totalSavings: { $sum: '$usageHistory.discountAmount' },
          totalOriginalFees: { $sum: '$usageHistory.originalAmount' },
          averageDiscount: { $avg: '$usageHistory.discountAmount' },
          uniqueUsers: { $addToSet: '$userId' },
          feeTypeBreakdown: {
            $push: {
              feeType: '$usageHistory.feeType',
              discountAmount: '$usageHistory.discountAmount',
              originalAmount: '$usageHistory.originalAmount'
            }
          }
        }
      });
      
      // Add calculated fields
      pipeline.push({
        $addFields: {
          uniqueUserCount: { $size: '$uniqueUsers' },
          savingsPercentage: {
            $cond: {
              if: { $gt: ['$totalOriginalFees', 0] },
              then: { $multiply: [{ $divide: ['$totalSavings', '$totalOriginalFees'] }, 100] },
              else: 0
            }
          }
        }
      });
      
      const results = await UserPromotion.aggregate(pipeline);
      const analytics = results[0] || {
        totalUsages: 0,
        totalSavings: 0,
        totalOriginalFees: 0,
        averageDiscount: 0,
        uniqueUserCount: 0,
        savingsPercentage: 0,
        feeTypeBreakdown: []
      };
      
      // Process fee type breakdown
      const feeTypeStats = {};
      for (const item of analytics.feeTypeBreakdown || []) {
        if (!feeTypeStats[item.feeType]) {
          feeTypeStats[item.feeType] = {
            count: 0,
            totalSavings: 0,
            totalOriginalFees: 0
          };
        }
        
        feeTypeStats[item.feeType].count += 1;
        feeTypeStats[item.feeType].totalSavings += item.discountAmount;
        feeTypeStats[item.feeType].totalOriginalFees += item.originalAmount;
      }
      
      // Calculate percentages for fee types
      Object.keys(feeTypeStats).forEach(feeType => {
        const stats = feeTypeStats[feeType];
        stats.savingsPercentage = stats.totalOriginalFees > 0 ? 
          (stats.totalSavings / stats.totalOriginalFees) * 100 : 0;
        stats.averageDiscount = stats.count > 0 ? stats.totalSavings / stats.count : 0;
      });
      
      return {
        ...analytics,
        feeTypeBreakdown: feeTypeStats,
        calculatedAt: new Date()
      };
    } catch (error) {
      console.error('Error getting fee discount analytics:', error);
      throw error;
    }
  }

  /**
   * Check if fee type is valid
   */
  isValidFeeType(feeType) {
    const validFeeTypes = [
      'raffle_fee',
      'house_fee',
      'community_product_fee',
      'withdrawal_fee'
    ];
    
    return validFeeTypes.includes(feeType);
  }

  /**
   * Get available fee types
   */
  getAvailableFeeTypes() {
    return [
      { value: 'raffle_fee', label: 'Raffle Creation Fee' },
      { value: 'house_fee', label: 'House Gaming Fee' },
      { value: 'community_product_fee', label: 'Community Product Fee' },
      { value: 'withdrawal_fee', label: 'Withdrawal Fee' }
    ];
  }

  /**
   * Simulate fee calculation (for testing/preview)
   */
  async simulateFeeCalculation(userId, feeCalculationData) {
    try {
      // Get calculation without recording usage
      const result = await this.calculateFeeWithPromotions(userId, {
        ...feeCalculationData,
        transactionId: null // Don't record usage for simulation
      });
      
      return {
        ...result,
        simulation: true,
        message: 'This is a simulation - no usage was recorded'
      };
    } catch (error) {
      console.error('Error simulating fee calculation:', error);
      throw error;
    }
  }
}

module.exports = FeeCalculationEngine;