const PromotionService = require('./promotionService');
const FeeCalculationEngine = require('./feeCalculationEngine');
const BonusCreditsEngine = require('./bonusCreditsEngine');
const FraudPreventionService = require('./fraudPreventionService');

// Import existing platform services
const FoundersKeyService = require('../foundersKeyService');
const TokenBalance = require('../../models/user/tokenBalance');
const User = require('../../models/user/user');

class PromotionIntegrationService {
  constructor() {
    this.promotionService = new PromotionService();
    this.feeCalculationEngine = new FeeCalculationEngine();
    this.bonusCreditsEngine = new BonusCreditsEngine();
    this.fraudPreventionService = new FraudPreventionService();
    this.foundersKeyService = new FoundersKeyService();
  }

  /**
   * Enhanced balance display with bonus credits
   */
  async getEnhancedUserBalance(userId) {
    try {
      // Get regular token balances
      const tokenBalances = await TokenBalance.find({ userId }).lean();
      
      // Get bonus credits balance
      const bonusCreditsBalance = await this.bonusCreditsEngine.getUserBonusCreditsBalance(userId);
      
      // Combine balances for display
      const enhancedBalances = tokenBalances.map(balance => {
        // Find matching bonus credits
        const matchingBonusBalance = bonusCreditsBalance.balances.find(bonus =>
          bonus.tokenContract.toLowerCase() === balance.tokenContract.toLowerCase() &&
          bonus.blockchain === balance.blockchain
        );
        
        return {
          ...balance,
          regularBalance: balance.balance,
          bonusCredits: matchingBonusBalance ? matchingBonusBalance.balance : 0,
          totalAvailable: balance.balance + (matchingBonusBalance ? matchingBonusBalance.balance : 0),
          hasBonusCredits: matchingBonusBalance && matchingBonusBalance.balance > 0,
          bonusCreditsExpiring: matchingBonusBalance ? 
            bonusCreditsBalance.expiringCredits.find(exp => 
              exp.tokenContract.toLowerCase() === balance.tokenContract.toLowerCase() &&
              exp.blockchain === balance.blockchain
            ) : null
        };
      });
      
      // Add bonus-only balances (tokens that only exist as bonus credits)
      for (const bonusBalance of bonusCreditsBalance.balances) {
        const existsInRegular = enhancedBalances.some(balance =>
          balance.tokenContract.toLowerCase() === bonusBalance.tokenContract.toLowerCase() &&
          balance.blockchain === bonusBalance.blockchain
        );
        
        if (!existsInRegular && bonusBalance.balance > 0) {
          enhancedBalances.push({
            tokenContract: bonusBalance.tokenContract,
            tokenSymbol: bonusBalance.tokenSymbol,
            blockchain: bonusBalance.blockchain,
            regularBalance: 0,
            bonusCredits: bonusBalance.balance,
            totalAvailable: bonusBalance.balance,
            hasBonusCredits: true,
            bonusCreditsExpiring: bonusCreditsBalance.expiringCredits.find(exp => 
              exp.tokenContract.toLowerCase() === bonusBalance.tokenContract.toLowerCase() &&
              exp.blockchain === bonusBalance.blockchain
            ),
            bonusOnly: true
          });
        }
      }
      
      return {
        userId,
        balances: enhancedBalances,
        bonusCreditsInfo: {
          totalBonusCredits: bonusCreditsBalance.totalBalance,
          hasAnyBonusCredits: bonusCreditsBalance.hasCredits,
          expiringCredits: bonusCreditsBalance.expiringCredits,
          recentUsage: bonusCreditsBalance.recentUsage
        },
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('Error getting enhanced user balance:', error);
      throw error;
    }
  }

  /**
   * Process transaction with promotion benefits
   */
  async processTransactionWithPromotions(userId, transactionData) {
    try {
      const {
        transactionType,
        amount,
        tokenInfo,
        feeType,
        originalFee,
        transactionId
      } = transactionData;
      
      const result = {
        transactionId,
        userId,
        transactionType,
        originalAmount: amount,
        finalAmount: amount,
        originalFee,
        finalFee: originalFee,
        promotionsApplied: [],
        bonusCreditsUsed: 0,
        totalSavings: 0
      };
      
      // Apply fee discounts if applicable
      if (originalFee && originalFee > 0) {
        const feeCalculation = await this.feeCalculationEngine.calculateFeeWithPromotions(
          userId,
          {
            originalFee,
            feeType,
            transactionId,
            transactionData
          }
        );
        
        result.finalFee = feeCalculation.finalFee;
        result.totalSavings += feeCalculation.discountAmount;
        
        if (feeCalculation.appliedPromotion) {
          result.promotionsApplied.push({
            type: 'fee_discount',
            promotionId: feeCalculation.appliedPromotion.promotionId,
            promotionName: feeCalculation.appliedPromotion.promotionName,
            savings: feeCalculation.discountAmount,
            discountPercentage: feeCalculation.appliedPromotion.discountPercentage
          });
        }
      }
      
      // Handle deposit bonuses
      if (transactionType === 'deposit') {
        const bonusResult = await this.bonusCreditsEngine.awardDepositBonus(
          userId,
          {
            depositAmount: amount,
            tokenInfo,
            transactionId
          }
        );
        
        if (bonusResult.bonusAwarded) {
          result.promotionsApplied.push({
            type: 'deposit_bonus',
            promotionId: bonusResult.promotionId,
            promotionName: bonusResult.promotionName,
            bonusAmount: bonusResult.bonusAmount,
            expiryDate: bonusResult.expiryDate
          });
        }
      }
      
      // Check for fraud indicators
      await this.fraudPreventionService.analyzePromotionUsage(userId);
      
      return result;
    } catch (error) {
      console.error('Error processing transaction with promotions:', error);
      throw error;
    }
  }

  /**
   * Enhanced withdrawal processing with bonus credits warning
   */
  async processWithdrawalWithPromotions(userId, withdrawalData) {
    try {
      const {
        amount,
        tokenInfo,
        withdrawalId
      } = withdrawalData;
      
      // Create withdrawal warning if user has bonus credits
      const warningResult = await this.bonusCreditsEngine.createWithdrawalWarning(userId);
      
      const result = {
        withdrawalId,
        userId,
        amount,
        tokenInfo,
        bonusCreditsWarning: warningResult.warningCreated,
        bonusCreditsToReset: warningResult.totalCredits || 0,
        affectedBalances: warningResult.balances || [],
        warningMessage: warningResult.message,
        requiresConfirmation: warningResult.warningCreated
      };
      
      return result;
    } catch (error) {
      console.error('Error processing withdrawal with promotions:', error);
      throw error;
    }
  }

  /**
   * Confirm withdrawal and reset bonus credits
   */
  async confirmWithdrawalAndResetBonusCredits(userId, withdrawalId) {
    try {
      // Reset bonus credits
      const resetResult = await this.bonusCreditsEngine.resetBonusCreditsForWithdrawal(
        userId,
        'withdrawal_confirmed'
      );
      
      return {
        withdrawalId,
        userId,
        bonusCreditsReset: resetResult.creditsReset,
        resetAmount: resetResult.resetAmount,
        resetBalances: resetResult.resetBalances,
        message: resetResult.message
      };
    } catch (error) {
      console.error('Error confirming withdrawal and resetting bonus credits:', error);
      throw error;
    }
  }

  /**
   * Integrate with NFT benefits system for combined calculations
   */
  async getCombinedUserBenefits(userId) {
    try {
      // Get Founders Key benefits
      const foundersKeyBenefits = await this.foundersKeyService.getUserBenefits(userId);
      
      // Get active promotions
      const activePromotions = await this.promotionService.getUserPromotions(userId);
      
      // Get bonus credits
      const bonusCreditsBalance = await this.bonusCreditsEngine.getUserBonusCreditsBalance(userId);
      
      // Calculate combined benefits
      const combinedBenefits = {
        userId,
        foundersKeyBenefits: {
          tier: foundersKeyBenefits.tier,
          feeDiscount: foundersKeyBenefits.feeDiscount,
          stakingMultiplier: foundersKeyBenefits.stakingMultiplier,
          openEntryTickets: foundersKeyBenefits.openEntryTickets
        },
        activePromotions: activePromotions.map(up => ({
          promotionId: up.promotionId._id,
          promotionName: up.promotionId.name,
          type: up.promotionId.type,
          usageCount: up.usageCount,
          totalSavings: up.totalSavings,
          expiresAt: up.expiresAt
        })),
        bonusCredits: {
          totalBalance: bonusCreditsBalance.totalBalance,
          hasCredits: bonusCreditsBalance.hasCredits,
          balancesByToken: bonusCreditsBalance.balances,
          expiringCredits: bonusCreditsBalance.expiringCredits
        },
        combinedFeeDiscount: this.calculateCombinedFeeDiscount(
          foundersKeyBenefits.feeDiscount,
          activePromotions
        ),
        totalValue: this.calculateTotalBenefitValue(
          foundersKeyBenefits,
          activePromotions,
          bonusCreditsBalance
        )
      };
      
      return combinedBenefits;
    } catch (error) {
      console.error('Error getting combined user benefits:', error);
      throw error;
    }
  }

  /**
   * Calculate combined fee discount from multiple sources
   */
  calculateCombinedFeeDiscount(foundersKeyDiscount, activePromotions) {
    // Find best fee discount promotion
    let bestPromotionDiscount = 0;
    
    for (const userPromotion of activePromotions) {
      const promotion = userPromotion.promotionId;
      if (promotion.type === 'fee_discount' && promotion.feeDiscountConfig) {
        bestPromotionDiscount = Math.max(
          bestPromotionDiscount,
          promotion.feeDiscountConfig.discountPercentage
        );
      }
    }
    
    // Use the better of Founders Key or promotion discount (don't stack)
    return Math.max(foundersKeyDiscount || 0, bestPromotionDiscount);
  }

  /**
   * Calculate total benefit value
   */
  calculateTotalBenefitValue(foundersKeyBenefits, activePromotions, bonusCreditsBalance) {
    let totalValue = 0;
    
    // Add bonus credits value
    totalValue += bonusCreditsBalance.totalBalance || 0;
    
    // Add estimated savings from fee discounts (based on average usage)
    const feeDiscount = this.calculateCombinedFeeDiscount(
      foundersKeyBenefits.feeDiscount,
      activePromotions
    );
    
    if (feeDiscount > 0) {
      // Estimate monthly fee savings (this would be based on user's historical data)
      const estimatedMonthlySavings = 50 * (feeDiscount / 100); // Assume $50 monthly fees
      totalValue += estimatedMonthlySavings;
    }
    
    // Add open entry tickets value
    if (foundersKeyBenefits.openEntryTickets) {
      totalValue += foundersKeyBenefits.openEntryTickets * 5; // Assume $5 per ticket
    }
    
    return totalValue;
  }

  /**
   * Create open-entry ticket distribution for promotions
   */
  async distributeOpenEntryTickets(userId, ticketCount, reason = 'promotion') {
    try {
      // This would integrate with the existing open-entry ticket system
      // For now, we'll create a placeholder implementation
      
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      
      // Add tickets to user's allocation (this would integrate with existing system)
      const distribution = {
        userId,
        ticketCount,
        reason,
        distributedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: 'active'
      };
      
      console.log(`Distributed ${ticketCount} open-entry tickets to user ${userId} for ${reason}`);
      
      return distribution;
    } catch (error) {
      console.error('Error distributing open-entry tickets:', error);
      throw error;
    }
  }

  /**
   * Process gaming transaction with bonus credits
   */
  async processGamingTransactionWithBonusCredits(userId, gamingData) {
    try {
      const {
        gameType,
        betAmount,
        tokenInfo,
        transactionId,
        useRegularBalance = true,
        useBonusCredits = true
      } = gamingData;
      
      let regularBalanceUsed = 0;
      let bonusCreditsUsed = 0;
      let remainingAmount = betAmount;
      
      // Get user's balances
      const enhancedBalance = await this.getEnhancedUserBalance(userId);
      const userBalance = enhancedBalance.balances.find(b =>
        b.tokenContract.toLowerCase() === tokenInfo.tokenContract.toLowerCase() &&
        b.blockchain === tokenInfo.blockchain
      );
      
      if (!userBalance) {
        throw new Error('Token balance not found');
      }
      
      // Use regular balance first if preferred
      if (useRegularBalance && userBalance.regularBalance > 0) {
        regularBalanceUsed = Math.min(remainingAmount, userBalance.regularBalance);
        remainingAmount -= regularBalanceUsed;
      }
      
      // Use bonus credits for remaining amount
      if (useBonusCredits && remainingAmount > 0 && userBalance.bonusCredits > 0) {
        bonusCreditsUsed = Math.min(remainingAmount, userBalance.bonusCredits);
        
        if (bonusCreditsUsed > 0) {
          await this.bonusCreditsEngine.useBonusCreditsForGambling(userId, {
            tokenContract: tokenInfo.tokenContract,
            blockchain: tokenInfo.blockchain,
            amount: bonusCreditsUsed,
            transactionId,
            gameType,
            description: `${gameType} gaming bet`
          });
        }
        
        remainingAmount -= bonusCreditsUsed;
      }
      
      if (remainingAmount > 0) {
        throw new Error(`Insufficient balance. Required: ${betAmount}, Available: ${regularBalanceUsed + bonusCreditsUsed}`);
      }
      
      return {
        transactionId,
        userId,
        gameType,
        totalBetAmount: betAmount,
        regularBalanceUsed,
        bonusCreditsUsed,
        paymentBreakdown: {
          regularBalance: regularBalanceUsed,
          bonusCredits: bonusCreditsUsed
        },
        success: true
      };
    } catch (error) {
      console.error('Error processing gaming transaction with bonus credits:', error);
      throw error;
    }
  }

  /**
   * Get user promotion notifications
   */
  async getUserPromotionNotifications(userId) {
    try {
      const notifications = [];
      
      // Get bonus credits balance with warnings
      const bonusCreditsBalance = await this.bonusCreditsEngine.getUserBonusCreditsBalance(userId);
      
      // Add expiry warnings
      for (const expiringCredit of bonusCreditsBalance.expiringCredits) {
        notifications.push({
          type: 'bonus_credits_expiring',
          priority: 'medium',
          title: 'Bonus Credits Expiring Soon',
          message: `${expiringCredit.totalAmount} ${expiringCredit.tokenSymbol} bonus credits will expire on ${expiringCredit.earliestExpiry.toDateString()}`,
          actionRequired: false,
          data: expiringCredit
        });
      }
      
      // Get active promotions with usage opportunities
      const activePromotions = await this.promotionService.getUserPromotions(userId);
      
      for (const userPromotion of activePromotions) {
        const promotion = userPromotion.promotionId;
        
        if (userPromotion.usageCount === 0) {
          notifications.push({
            type: 'unused_promotion',
            priority: 'low',
            title: 'Unused Promotion Available',
            message: `You have an unused ${promotion.name} promotion that expires on ${userPromotion.expiresAt?.toDateString() || 'never'}`,
            actionRequired: false,
            data: {
              promotionId: promotion._id,
              promotionName: promotion.name,
              type: promotion.type,
              expiresAt: userPromotion.expiresAt
            }
          });
        }
      }
      
      return {
        userId,
        notifications,
        totalCount: notifications.length,
        unreadCount: notifications.length, // All are considered unread for now
        lastChecked: new Date()
      };
    } catch (error) {
      console.error('Error getting user promotion notifications:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired promotions and bonus credits
   */
  async performMaintenanceCleanup() {
    try {
      console.log('Starting promotional system maintenance cleanup...');
      
      // Cleanup expired promotions
      const expiredPromotions = await this.promotionService.cleanupExpiredPromotions();
      
      // Cleanup expired bonus credits
      const expiredCredits = await this.bonusCreditsEngine.cleanupExpiredCredits();
      
      // Process expiry warnings
      const expiryWarnings = await this.bonusCreditsEngine.processExpiryWarnings();
      
      const summary = {
        expiredPromotions: expiredPromotions.expiredPromotions,
        expiredUserPromotions: expiredPromotions.expiredUserPromotions,
        expiredCreditsUsers: expiredCredits.usersProcessed,
        expiryWarnings: expiryWarnings.warningsCreated,
        cleanupDate: new Date()
      };
      
      console.log('Promotional system maintenance cleanup completed:', summary);
      
      return summary;
    } catch (error) {
      console.error('Error performing maintenance cleanup:', error);
      throw error;
    }
  }
}

module.exports = PromotionIntegrationService;