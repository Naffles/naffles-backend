const Allowlist = require('../models/allowlist/allowlist');
const AllowlistParticipation = require('../models/allowlist/allowlistParticipation');
const AllowlistWinner = require('../models/allowlist/allowlistWinner');
const AllowlistConfiguration = require('../models/allowlist/allowlistConfiguration');
const vrfWrapper = require('./vrfWrapper');
const socialTasksService = require('./socialTasksService');
const communityPointsService = require('./communityPointsService');
const allowlistNotificationService = require('./allowlistNotificationService');
const crypto = require('crypto');

class AllowlistService {
  /**
   * Create a new allowlist
   */
  async createAllowlist(creatorId, config) {
    try {
      // Validate community limits if community-specific
      if (config.communityId) {
        const configuration = await AllowlistConfiguration.getConfiguration();
        const canCreate = await configuration.canCommunityCreateAllowlist(config.communityId);
        
        if (!canCreate.canCreate) {
          throw new Error(canCreate.reason);
        }
      }
      
      // Calculate end time
      const endTime = new Date(Date.now() + (config.duration * 60 * 60 * 1000));
      
      // Create allowlist
      const allowlist = new Allowlist({
        title: config.title,
        description: config.description,
        communityId: config.communityId,
        creatorId,
        entryPrice: config.entryPrice,
        winnerCount: config.winnerCount,
        profitGuaranteePercentage: config.profitGuaranteePercentage || 0,
        duration: config.duration,
        endTime,
        socialTasks: config.socialTasks || [],
        accessRequirements: config.accessRequirements || [],
        maxEntries: config.maxEntries,
        allowDuplicateWallets: config.allowDuplicateWallets || false
      });
      
      await allowlist.save();
      
      return allowlist;
    } catch (error) {
      console.error('Error creating allowlist:', error);
      throw error;
    }
  }
  
  /**
   * Enter an allowlist
   */
  async enterAllowlist(allowlistId, userId, entryData) {
    try {
      const allowlist = await Allowlist.findById(allowlistId);
      if (!allowlist) {
        throw new Error('Allowlist not found');
      }
      
      // Check if allowlist is still active
      if (allowlist.status !== 'active' || new Date() > allowlist.endTime) {
        throw new Error('Allowlist is no longer active');
      }
      
      // Check for existing participation
      const existingParticipation = await AllowlistParticipation.findOne({
        allowlistId,
        userId
      });
      
      if (existingParticipation) {
        throw new Error('User has already entered this allowlist');
      }
      
      // Check wallet duplicate restrictions
      if (!allowlist.allowDuplicateWallets) {
        const existingWallet = await AllowlistParticipation.findOne({
          allowlistId,
          walletAddress: entryData.walletAddress.toLowerCase()
        });
        
        if (existingWallet) {
          throw new Error('This wallet address has already entered the allowlist');
        }
      }
      
      // Check entry limits
      if (allowlist.maxEntries) {
        const currentEntries = await AllowlistParticipation.countDocuments({ allowlistId });
        if (currentEntries >= allowlist.maxEntries) {
          throw new Error('Allowlist has reached maximum entries');
        }
      }
      
      // Process payment if required
      let paymentStatus = 'completed';
      if (parseFloat(allowlist.entryPrice.amount) > 0) {
        await this.processEntryPayment(userId, allowlist.entryPrice);
      }
      
      // Create participation record
      const participation = new AllowlistParticipation({
        allowlistId,
        userId,
        walletAddress: entryData.walletAddress.toLowerCase(),
        socialData: entryData.socialData,
        paymentStatus,
        paymentAmount: allowlist.entryPrice,
        taskCompletionStatus: entryData.completedTasks || []
      });
      
      await participation.save();
      
      // Update allowlist statistics
      await Allowlist.findByIdAndUpdate(allowlistId, {
        $inc: { totalEntries: 1 },
        $set: {
          'totalTicketSales.tokenType': allowlist.entryPrice.tokenType,
          'totalTicketSales.amount': (
            parseFloat(allowlist.totalTicketSales?.amount || '0') + 
            parseFloat(allowlist.entryPrice.amount)
          ).toString()
        }
      });
      
      // Send entry confirmation notification
      await allowlistNotificationService.sendEntryConfirmation(userId, allowlistId);
      
      return participation;
    } catch (error) {
      console.error('Error entering allowlist:', error);
      throw error;
    }
  }
  
  /**
   * Execute allowlist draw using VRF
   */
  async executeAllowlistDraw(allowlistId) {
    try {
      const allowlist = await Allowlist.findById(allowlistId);
      if (!allowlist) {
        throw new Error('Allowlist not found');
      }
      
      if (allowlist.status !== 'active') {
        throw new Error('Allowlist is not active');
      }
      
      // Get all valid participants
      const participants = await AllowlistParticipation.find({
        allowlistId,
        paymentStatus: 'completed'
      });
      
      if (participants.length === 0) {
        throw new Error('No valid participants found');
      }
      
      let winners = [];
      let winnerSelectionMethod = 'vrf';
      let randomness = '';
      
      // Determine winner count
      const actualWinnerCount = allowlist.winnerCount === 'everyone' 
        ? participants.length 
        : Math.min(allowlist.winnerCount, participants.length);
      
      if (actualWinnerCount === participants.length) {
        // Everyone wins - no randomness needed
        winners = participants.map((participant, index) => ({
          participationId: participant._id,
          userId: participant.userId,
          walletAddress: participant.walletAddress,
          socialData: participant.socialData,
          winnerPosition: index + 1
        }));
        winnerSelectionMethod = 'everyone_wins';
        randomness = 'not_applicable';
      } else {
        // Use VRF for random selection
        try {
          const vrfResult = await vrfWrapper.getRandomInt(0, 999999999);
          randomness = vrfResult.toString();
          
          // Use randomness to select winners
          const shuffledParticipants = this.shuffleArray(participants, parseInt(randomness));
          winners = shuffledParticipants.slice(0, actualWinnerCount).map((participant, index) => ({
            participationId: participant._id,
            userId: participant.userId,
            walletAddress: participant.walletAddress,
            socialData: participant.socialData,
            winnerPosition: index + 1
          }));
        } catch (vrfError) {
          console.warn('VRF failed, using failsafe randomness:', vrfError);
          
          // Failsafe randomness
          const failsafeRandom = crypto.randomBytes(32).toString('hex');
          randomness = failsafeRandom;
          winnerSelectionMethod = 'failsafe';
          
          const shuffledParticipants = this.shuffleArray(participants, parseInt(failsafeRandom.slice(0, 8), 16));
          winners = shuffledParticipants.slice(0, actualWinnerCount).map((participant, index) => ({
            participationId: participant._id,
            userId: participant.userId,
            walletAddress: participant.walletAddress,
            socialData: participant.socialData,
            winnerPosition: index + 1
          }));
        }
      }
      
      // Create winner records
      const winnerRecords = await Promise.all(winners.map(async (winner) => {
        const winnerRecord = new AllowlistWinner({
          allowlistId,
          participationId: winner.participationId,
          userId: winner.userId,
          walletAddress: winner.walletAddress,
          winnerPosition: winner.winnerPosition,
          socialData: winner.socialData
        });
        
        await winnerRecord.save();
        return winnerRecord;
      }));
      
      // Update participation records
      await Promise.all(winners.map(async (winner) => {
        await AllowlistParticipation.findByIdAndUpdate(winner.participationId, {
          isWinner: true,
          winnerPosition: winner.winnerPosition,
          claimStatus: 'pending'
        });
      }));
      
      // Update allowlist status
      await Allowlist.findByIdAndUpdate(allowlistId, {
        status: 'completed',
        completedAt: new Date(),
        randomness,
        winnerSelectionMethod
      });
      
      // Process payouts
      await this.processAllowlistPayouts(allowlistId, winnerRecords, participants);
      
      return {
        allowlistId,
        winners: winnerRecords,
        totalEntries: participants.length,
        winnerCount: actualWinnerCount,
        winnerSelectionMethod,
        randomness
      };
    } catch (error) {
      console.error('Error executing allowlist draw:', error);
      throw error;
    }
  }
  
  /**
   * Process allowlist payouts including refunds and profit guarantees
   */
  async processAllowlistPayouts(allowlistId, winners, allParticipants) {
    try {
      const allowlist = await Allowlist.findById(allowlistId);
      const losers = allParticipants.filter(p => !winners.some(w => w.participationId.toString() === p._id.toString()));
      
      const winnerCount = winners.length;
      const loserCount = losers.length;
      const ticketPrice = parseFloat(allowlist.entryPrice.amount);
      
      // Calculate profit guarantee per loser
      const profitPerLoser = allowlist.calculateProfitGuarantee(winnerCount, loserCount);
      
      // Process refunds for losers
      const refundResults = await Promise.all(losers.map(async (loser) => {
        const refundAmount = loser.calculateTotalRefund(
          allowlist.entryPrice.amount, // Ticket refund
          profitPerLoser // Profit bonus
        );
        
        // Process the actual refund
        await this.processRefund(loser.userId, refundAmount.totalRefund);
        
        // Update participation record
        await AllowlistParticipation.findByIdAndUpdate(loser._id, {
          refundStatus: 'processed',
          refundAmount,
          refundProcessedAt: new Date()
        });
        
        return {
          userId: loser.userId,
          walletAddress: loser.walletAddress,
          refundAmount
        };
      }));
      
      // Calculate creator payout
      const totalSales = winnerCount * ticketPrice + loserCount * ticketPrice;
      const totalRefunds = loserCount * ticketPrice;
      const totalProfitGuarantee = loserCount * parseFloat(profitPerLoser);
      
      const configuration = await AllowlistConfiguration.getConfiguration();
      const platformFeePercentage = configuration.platformFeePercentage;
      
      const grossProfit = totalSales - totalRefunds - totalProfitGuarantee;
      const platformFee = grossProfit * (platformFeePercentage / 100);
      const creatorProfit = grossProfit - platformFee;
      
      // Process creator payout
      await this.processCreatorPayout(allowlist.creatorId, {
        tokenType: allowlist.entryPrice.tokenType,
        amount: creatorProfit.toString()
      });
      
      // Update allowlist with payout summary
      await Allowlist.findByIdAndUpdate(allowlistId, {
        payoutProcessed: true,
        payoutSummary: {
          totalRefunds: {
            tokenType: allowlist.entryPrice.tokenType,
            amount: totalRefunds.toString()
          },
          totalProfitGuarantee: {
            tokenType: allowlist.entryPrice.tokenType,
            amount: totalProfitGuarantee.toString()
          },
          creatorProfit: {
            tokenType: allowlist.entryPrice.tokenType,
            amount: creatorProfit.toString()
          },
          platformFee: {
            tokenType: allowlist.entryPrice.tokenType,
            amount: platformFee.toString()
          },
          profitPerLoser: {
            tokenType: allowlist.entryPrice.tokenType,
            amount: profitPerLoser
          }
        }
      });
      
      // Send notifications
      await this.sendAllowlistNotifications(allowlistId, winners, refundResults);
      
      return {
        winnersNotified: winners.length,
        losersRefunded: refundResults.length,
        creatorPayout: creatorProfit,
        platformFee
      };
    } catch (error) {
      console.error('Error processing allowlist payouts:', error);
      throw error;
    }
  }
  
  /**
   * Export winner data
   */
  async exportWinnerData(allowlistId, format = 'json') {
    try {
      const allowlist = await Allowlist.findById(allowlistId);
      if (!allowlist) {
        throw new Error('Allowlist not found');
      }
      
      const exportData = await AllowlistWinner.getWinnersForExport(allowlistId, format);
      
      return {
        allowlistId,
        allowlistTitle: allowlist.title,
        exportedAt: new Date(),
        format,
        data: exportData
      };
    } catch (error) {
      console.error('Error exporting winner data:', error);
      throw error;
    }
  }
  
  /**
   * Get community allowlist limits
   */
  async getCommunityAllowlistLimits(communityId) {
    try {
      const configuration = await AllowlistConfiguration.getConfiguration();
      return await configuration.canCommunityCreateAllowlist(communityId);
    } catch (error) {
      console.error('Error getting community allowlist limits:', error);
      throw error;
    }
  }
  
  /**
   * Admin: Update platform fee percentage
   */
  async updatePlatformFeePercentage(newPercentage, adminUserId) {
    try {
      const configuration = await AllowlistConfiguration.getConfiguration();
      await configuration.updatePlatformFee(newPercentage, adminUserId);
      return configuration;
    } catch (error) {
      console.error('Error updating platform fee:', error);
      throw error;
    }
  }
  
  /**
   * Admin: Disable allowlist restrictions for community
   */
  async disableAllowlistRestrictions(communityId, adminUserId) {
    try {
      const configuration = await AllowlistConfiguration.getConfiguration();
      await configuration.disableRestrictionsForCommunity(communityId, adminUserId);
      return configuration;
    } catch (error) {
      console.error('Error disabling allowlist restrictions:', error);
      throw error;
    }
  }
  
  // Helper methods
  
  /**
   * Shuffle array using seed for deterministic randomness
   */
  shuffleArray(array, seed) {
    const shuffled = [...array];
    let currentIndex = shuffled.length;
    
    // Use seed to create deterministic randomness
    let random = seed;
    
    while (currentIndex !== 0) {
      // Generate next random number using linear congruential generator
      random = (random * 1664525 + 1013904223) % Math.pow(2, 32);
      const randomIndex = Math.floor((random / Math.pow(2, 32)) * currentIndex);
      currentIndex--;
      
      [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
    }
    
    return shuffled;
  }
  
  /**
   * Process entry payment from user balance
   */
  async processEntryPayment(userId, paymentAmount) {
    // This would integrate with the existing balance management system
    // For now, we'll assume the payment is processed successfully
    console.log(`Processing payment for user ${userId}:`, paymentAmount);
    return true;
  }
  
  /**
   * Process refund to user balance
   */
  async processRefund(userId, refundAmount) {
    // This would integrate with the existing balance management system
    console.log(`Processing refund for user ${userId}:`, refundAmount);
    return true;
  }
  
  /**
   * Process creator payout
   */
  async processCreatorPayout(creatorId, payoutAmount) {
    // This would integrate with the existing balance management system
    console.log(`Processing creator payout for user ${creatorId}:`, payoutAmount);
    return true;
  }
  
  /**
   * Send all allowlist notifications
   */
  async sendAllowlistNotifications(allowlistId, winners, refundResults) {
    try {
      // Send winner notifications
      await Promise.all(winners.map(async (winner) => {
        await allowlistNotificationService.sendWinnerNotification(winner.userId, allowlistId, winner);
      }));
      
      // Send refund notifications
      await Promise.all(refundResults.map(async (refund) => {
        await allowlistNotificationService.sendRefundNotification(refund.userId, allowlistId, refund.refundAmount);
      }));
      
      console.log(`Sent notifications for allowlist ${allowlistId}: ${winners.length} winners, ${refundResults.length} refunds`);
    } catch (error) {
      console.error('Error sending allowlist notifications:', error);
    }
  }
}

module.exports = new AllowlistService();