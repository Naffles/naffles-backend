const BonusCreditsBalance = require('../../models/promotions/bonusCreditsBalance');
const UserPromotion = require('../../models/promotions/userPromotion');
const PromotionService = require('./promotionService');

class BonusCreditsEngine {
  constructor() {
    this.promotionService = new PromotionService();
  }

  /**
   * Award bonus credits to user for deposit
   */
  async awardDepositBonus(userId, depositData) {
    try {
      const {
        depositAmount,
        tokenInfo,
        transactionId
      } = depositData;
      
      // Get best deposit bonus promotion for user
      const bestPromotion = await this.promotionService.getBestPromotionForUser(
        userId,
        'deposit',
        { depositAmount, tokenInfo }
      );
      
      if (!bestPromotion || bestPromotion.savings <= 0) {
        return {
          bonusAwarded: false,
          bonusAmount: 0,
          message: 'No deposit bonus promotion available'
        };
      }
      
      const bonusAmount = bestPromotion.savings;
      const promotion = bestPromotion.promotion;
      const userPromotion = bestPromotion.userPromotion;
      
      // Calculate expiry date
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + promotion.depositBonusConfig.expiryDays);
      
      // Get or create bonus credits balance
      let bonusBalance = await BonusCreditsBalance.findOne({ userId });
      if (!bonusBalance) {
        bonusBalance = new BonusCreditsBalance({ userId });
      }
      
      // Add bonus credits
      await bonusBalance.addCredits(
        tokenInfo,
        bonusAmount,
        expiryDate,
        promotion._id
      );
      
      // Record promotion usage
      await userPromotion.recordUsage({
        transactionId,
        usageType: 'deposit_bonus',
        originalAmount: depositAmount,
        bonusAmount,
        details: {
          tokenInfo,
          expiryDate,
          bonusPercentage: promotion.depositBonusConfig.bonusPercentage
        }
      });
      
      // Update promotion statistics
      promotion.totalUsages += 1;
      promotion.totalBonusAwarded += bonusAmount;
      await promotion.save();
      
      console.log(`Awarded ${bonusAmount} bonus credits to user ${userId} for deposit of ${depositAmount}`);
      
      return {
        bonusAwarded: true,
        bonusAmount,
        expiryDate,
        promotionName: promotion.name,
        promotionId: promotion._id,
        tokenInfo,
        message: `${bonusAmount} ${tokenInfo.tokenSymbol} bonus credits awarded! Expires on ${expiryDate.toDateString()}`
      };
    } catch (error) {
      console.error('Error awarding deposit bonus:', error);
      throw error;
    }
  }

  /**
   * Use bonus credits for gambling transaction
   */
  async useBonusCreditsForGambling(userId, usageData) {
    try {
      const {
        tokenContract,
        blockchain,
        amount,
        transactionId,
        gameType,
        description
      } = usageData;
      
      // Validate amount
      if (!amount || amount <= 0) {
        throw new Error('Invalid usage amount');
      }
      
      // Get user's bonus credits balance
      const bonusBalance = await BonusCreditsBalance.findOne({ userId });
      if (!bonusBalance) {
        throw new Error('No bonus credits balance found');
      }
      
      // Check available balance
      const availableBalance = bonusBalance.getTokenBalance(tokenContract, blockchain);
      if (availableBalance < amount) {
        throw new Error(`Insufficient bonus credits. Available: ${availableBalance}, Requested: ${amount}`);
      }
      
      // Use bonus credits (FIFO)
      await bonusBalance.useCredits(
        tokenContract,
        blockchain,
        amount,
        {
          transactionId,
          usageType: 'gambling',
          description: description || `${gameType} gaming`
        }
      );
      
      console.log(`Used ${amount} bonus credits for gambling by user ${userId}`);
      
      return {
        success: true,
        amountUsed: amount,
        remainingBalance: bonusBalance.getTokenBalance(tokenContract, blockchain),
        transactionId,
        message: `${amount} bonus credits used for ${gameType || 'gaming'}`
      };
    } catch (error) {
      console.error('Error using bonus credits for gambling:', error);
      throw error;
    }
  }

  /**
   * Use bonus credits for raffle purchase
   */
  async useBonusCreditsForRaffle(userId, usageData) {
    try {
      const {
        tokenContract,
        blockchain,
        amount,
        transactionId,
        raffleId,
        ticketCount
      } = usageData;
      
      // Validate amount
      if (!amount || amount <= 0) {
        throw new Error('Invalid usage amount');
      }
      
      // Get user's bonus credits balance
      const bonusBalance = await BonusCreditsBalance.findOne({ userId });
      if (!bonusBalance) {
        throw new Error('No bonus credits balance found');
      }
      
      // Check available balance
      const availableBalance = bonusBalance.getTokenBalance(tokenContract, blockchain);
      if (availableBalance < amount) {
        throw new Error(`Insufficient bonus credits. Available: ${availableBalance}, Requested: ${amount}`);
      }
      
      // Use bonus credits (FIFO)
      await bonusBalance.useCredits(
        tokenContract,
        blockchain,
        amount,
        {
          transactionId,
          usageType: 'raffle_purchase',
          description: `Raffle tickets purchase (${ticketCount} tickets)`
        }
      );
      
      console.log(`Used ${amount} bonus credits for raffle purchase by user ${userId}`);
      
      return {
        success: true,
        amountUsed: amount,
        remainingBalance: bonusBalance.getTokenBalance(tokenContract, blockchain),
        raffleId,
        ticketCount,
        transactionId,
        message: `${amount} bonus credits used for ${ticketCount} raffle tickets`
      };
    } catch (error) {
      console.error('Error using bonus credits for raffle:', error);
      throw error;
    }
  }

  /**
   * Use bonus credits for community product purchase
   */
  async useBonusCreditsForCommunityProduct(userId, usageData) {
    try {
      const {
        tokenContract,
        blockchain,
        amount,
        transactionId,
        productId,
        communityId
      } = usageData;
      
      // Validate amount
      if (!amount || amount <= 0) {
        throw new Error('Invalid usage amount');
      }
      
      // Get user's bonus credits balance
      const bonusBalance = await BonusCreditsBalance.findOne({ userId });
      if (!bonusBalance) {
        throw new Error('No bonus credits balance found');
      }
      
      // Check available balance
      const availableBalance = bonusBalance.getTokenBalance(tokenContract, blockchain);
      if (availableBalance < amount) {
        throw new Error(`Insufficient bonus credits. Available: ${availableBalance}, Requested: ${amount}`);
      }
      
      // Use bonus credits (FIFO)
      await bonusBalance.useCredits(
        tokenContract,
        blockchain,
        amount,
        {
          transactionId,
          usageType: 'community_product',
          description: `Community product purchase`
        }
      );
      
      console.log(`Used ${amount} bonus credits for community product by user ${userId}`);
      
      return {
        success: true,
        amountUsed: amount,
        remainingBalance: bonusBalance.getTokenBalance(tokenContract, blockchain),
        productId,
        communityId,
        transactionId,
        message: `${amount} bonus credits used for community product`
      };
    } catch (error) {
      console.error('Error using bonus credits for community product:', error);
      throw error;
    }
  }

  /**
   * Get user's bonus credits balance
   */
  async getUserBonusCreditsBalance(userId) {
    try {
      let bonusBalance = await BonusCreditsBalance.findOne({ userId });
      
      if (!bonusBalance) {
        // Create empty balance if doesn't exist
        bonusBalance = new BonusCreditsBalance({ userId });
        await bonusBalance.save();
      }
      
      // Clean up expired credits
      await bonusBalance.expireOldCredits();
      
      return {
        userId,
        totalBalance: bonusBalance.totalBalance,
        hasCredits: bonusBalance.hasCredits,
        balances: bonusBalance.balances.map(balance => ({
          tokenContract: balance.tokenContract,
          tokenSymbol: balance.tokenSymbol,
          blockchain: balance.blockchain,
          balance: balance.balance,
          totalAwarded: balance.totalAwarded,
          totalUsed: balance.totalUsed,
          totalExpired: balance.totalExpired,
          lastUpdated: balance.lastUpdated
        })),
        expiringCredits: this.getExpiringCredits(bonusBalance),
        recentUsage: bonusBalance.usageHistory
          .slice(-5)
          .reverse()
          .map(usage => ({
            amount: usage.amount,
            usageType: usage.usageType,
            description: usage.description,
            usedAt: usage.usedAt,
            remainingBalance: usage.remainingBalance
          }))
      };
    } catch (error) {
      console.error('Error getting user bonus credits balance:', error);
      throw error;
    }
  }

  /**
   * Get expiring credits for user
   */
  getExpiringCredits(bonusBalance, days = 7) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    
    const expiringEntries = bonusBalance.expiryEntries.filter(entry => 
      entry.status === 'active' && 
      entry.expiresAt <= expiryDate &&
      entry.expiresAt > new Date()
    );
    
    const expiringByToken = {};
    
    for (const entry of expiringEntries) {
      const key = `${entry.tokenContract}_${entry.blockchain}`;
      if (!expiringByToken[key]) {
        expiringByToken[key] = {
          tokenContract: entry.tokenContract,
          tokenSymbol: entry.tokenSymbol,
          blockchain: entry.blockchain,
          totalAmount: 0,
          earliestExpiry: entry.expiresAt,
          entries: []
        };
      }
      
      expiringByToken[key].totalAmount += entry.amount;
      expiringByToken[key].entries.push({
        amount: entry.amount,
        expiresAt: entry.expiresAt,
        promotionId: entry.promotionId
      });
      
      if (entry.expiresAt < expiringByToken[key].earliestExpiry) {
        expiringByToken[key].earliestExpiry = entry.expiresAt;
      }
    }
    
    return Object.values(expiringByToken);
  }

  /**
   * Create withdrawal warning for user
   */
  async createWithdrawalWarning(userId) {
    try {
      const bonusBalance = await BonusCreditsBalance.findOne({ userId });
      
      if (!bonusBalance || !bonusBalance.hasCredits) {
        return {
          warningCreated: false,
          message: 'No bonus credits to warn about'
        };
      }
      
      await bonusBalance.createWithdrawalWarning();
      
      return {
        warningCreated: true,
        totalCredits: bonusBalance.totalBalance,
        balances: bonusBalance.balances.filter(b => b.balance > 0),
        message: 'Withdrawal warning created - user has been notified about bonus credits reset'
      };
    } catch (error) {
      console.error('Error creating withdrawal warning:', error);
      throw error;
    }
  }

  /**
   * Reset all bonus credits (for withdrawals)
   */
  async resetBonusCreditsForWithdrawal(userId, reason = 'withdrawal') {
    try {
      const bonusBalance = await BonusCreditsBalance.findOne({ userId });
      
      if (!bonusBalance || !bonusBalance.hasCredits) {
        return {
          creditsReset: false,
          resetAmount: 0,
          message: 'No bonus credits to reset'
        };
      }
      
      const resetAmount = bonusBalance.totalBalance;
      const resetBalances = bonusBalance.balances
        .filter(b => b.balance > 0)
        .map(b => ({
          tokenSymbol: b.tokenSymbol,
          blockchain: b.blockchain,
          amount: b.balance
        }));
      
      await bonusBalance.resetAllCredits();
      
      console.log(`Reset ${resetAmount} bonus credits for user ${userId} due to ${reason}`);
      
      return {
        creditsReset: true,
        resetAmount,
        resetBalances,
        reason,
        message: `All bonus credits (${resetAmount} total) have been reset due to ${reason}`
      };
    } catch (error) {
      console.error('Error resetting bonus credits:', error);
      throw error;
    }
  }

  /**
   * Process expiry warnings for users
   */
  async processExpiryWarnings(days = 7) {
    try {
      const usersWithExpiringCredits = await BonusCreditsBalance.findUsersWithExpiringCredits(days);
      
      let warningsCreated = 0;
      
      for (const bonusBalance of usersWithExpiringCredits) {
        try {
          await bonusBalance.checkExpiryWarnings();
          warningsCreated++;
        } catch (error) {
          console.error(`Error creating expiry warning for user ${bonusBalance.userId}:`, error);
        }
      }
      
      console.log(`Created ${warningsCreated} expiry warnings for users with credits expiring in ${days} days`);
      
      return {
        usersChecked: usersWithExpiringCredits.length,
        warningsCreated,
        daysBeforeExpiry: days
      };
    } catch (error) {
      console.error('Error processing expiry warnings:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired bonus credits
   */
  async cleanupExpiredCredits() {
    try {
      const cleanupResults = await BonusCreditsBalance.cleanupExpiredCredits();
      
      console.log(`Cleaned up expired bonus credits for ${cleanupResults.length} users`);
      
      return {
        usersProcessed: cleanupResults.length,
        message: 'Expired bonus credits cleanup completed'
      };
    } catch (error) {
      console.error('Error cleaning up expired credits:', error);
      throw error;
    }
  }

  /**
   * Get bonus credits analytics
   */
  async getBonusCreditsAnalytics(options = {}) {
    try {
      const {
        startDate,
        endDate,
        tokenContract,
        blockchain
      } = options;
      
      // Build aggregation pipeline
      const pipeline = [];
      
      // Match stage for date range
      if (startDate || endDate) {
        const matchStage = {};
        if (startDate) matchStage.createdAt = { $gte: new Date(startDate) };
        if (endDate) matchStage.createdAt = { ...matchStage.createdAt, $lte: new Date(endDate) };
        pipeline.push({ $match: matchStage });
      }
      
      // Unwind balances
      pipeline.push({ $unwind: '$balances' });
      
      // Filter by token if specified
      if (tokenContract || blockchain) {
        const tokenMatch = {};
        if (tokenContract) tokenMatch['balances.tokenContract'] = tokenContract;
        if (blockchain) tokenMatch['balances.blockchain'] = blockchain;
        pipeline.push({ $match: tokenMatch });
      }
      
      // Group and calculate statistics
      pipeline.push({
        $group: {
          _id: {
            tokenContract: '$balances.tokenContract',
            tokenSymbol: '$balances.tokenSymbol',
            blockchain: '$balances.blockchain'
          },
          totalUsers: { $sum: 1 },
          totalBalance: { $sum: '$balances.balance' },
          totalAwarded: { $sum: '$balances.totalAwarded' },
          totalUsed: { $sum: '$balances.totalUsed' },
          totalExpired: { $sum: '$balances.totalExpired' },
          averageBalance: { $avg: '$balances.balance' },
          usersWithBalance: {
            $sum: {
              $cond: [{ $gt: ['$balances.balance', 0] }, 1, 0]
            }
          }
        }
      });
      
      // Add calculated fields
      pipeline.push({
        $addFields: {
          utilizationRate: {
            $cond: {
              if: { $gt: ['$totalAwarded', 0] },
              then: { $multiply: [{ $divide: ['$totalUsed', '$totalAwarded'] }, 100] },
              else: 0
            }
          },
          expiryRate: {
            $cond: {
              if: { $gt: ['$totalAwarded', 0] },
              then: { $multiply: [{ $divide: ['$totalExpired', '$totalAwarded'] }, 100] },
              else: 0
            }
          },
          activeUserRate: {
            $cond: {
              if: { $gt: ['$totalUsers', 0] },
              then: { $multiply: [{ $divide: ['$usersWithBalance', '$totalUsers'] }, 100] },
              else: 0
            }
          }
        }
      });
      
      const results = await BonusCreditsBalance.aggregate(pipeline);
      
      // Get overall statistics
      const overallStats = await BonusCreditsBalance.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            usersWithCredits: {
              $sum: {
                $cond: [
                  { $gt: [{ $size: { $filter: { input: '$balances', cond: { $gt: ['$$this.balance', 0] } } } }, 0] },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);
      
      return {
        tokenBreakdown: results,
        overallStats: overallStats[0] || { totalUsers: 0, usersWithCredits: 0 },
        calculatedAt: new Date()
      };
    } catch (error) {
      console.error('Error getting bonus credits analytics:', error);
      throw error;
    }
  }

  /**
   * Validate bonus credits usage
   */
  async validateBonusCreditsUsage(userId, usageData) {
    try {
      const {
        tokenContract,
        blockchain,
        amount,
        usageType
      } = usageData;
      
      // Get user's bonus credits balance
      const bonusBalance = await BonusCreditsBalance.findOne({ userId });
      if (!bonusBalance) {
        return {
          valid: false,
          reason: 'No bonus credits balance found'
        };
      }
      
      // Check available balance
      const availableBalance = bonusBalance.getTokenBalance(tokenContract, blockchain);
      if (availableBalance < amount) {
        return {
          valid: false,
          reason: `Insufficient bonus credits. Available: ${availableBalance}, Requested: ${amount}`
        };
      }
      
      // Check for expired credits
      await bonusBalance.expireOldCredits();
      const updatedBalance = bonusBalance.getTokenBalance(tokenContract, blockchain);
      if (updatedBalance < amount) {
        return {
          valid: false,
          reason: `Insufficient bonus credits after expiry cleanup. Available: ${updatedBalance}, Requested: ${amount}`
        };
      }
      
      // Validate usage type
      const validUsageTypes = ['gambling', 'raffle_purchase', 'community_product'];
      if (!validUsageTypes.includes(usageType)) {
        return {
          valid: false,
          reason: `Invalid usage type: ${usageType}`
        };
      }
      
      return {
        valid: true,
        availableBalance: updatedBalance,
        remainingAfterUsage: updatedBalance - amount
      };
    } catch (error) {
      console.error('Error validating bonus credits usage:', error);
      return {
        valid: false,
        reason: 'Error validating usage'
      };
    }
  }
}

module.exports = BonusCreditsEngine;