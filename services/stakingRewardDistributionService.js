const StakingPosition = require('../models/staking/stakingPosition');
const StakingContract = require('../models/staking/stakingContract');
const StakingRewardHistory = require('../models/staking/stakingRewardHistory');
const RaffleTicket = require('../models/raffle/raffleTicket');
const Raffle = require('../models/raffle/raffle');
const User = require('../models/user/user');
const sequenceUtil = require('../utils/sequenceUtil');
const SequenceConstants = require('../utils/constants/SequenceConstants');
const stakingNotificationService = require('./stakingNotificationService');

class StakingRewardDistributionService {
  constructor() {
    this.isDistributing = false;
    this.lastDistribution = null;
    this.distributionStats = {
      totalDistributed: 0,
      totalPositionsProcessed: 0,
      totalErrors: 0
    };
  }

  /**
   * Main method to distribute monthly rewards to all eligible staking positions
   */
  async distributeMonthlyRewards() {
    if (this.isDistributing) {
      throw new Error('Reward distribution is already in progress');
    }

    this.isDistributing = true;
    const distributionStartTime = new Date();
    
    try {
      console.log('Starting monthly staking reward distribution...');
      
      // Get all eligible positions for rewards
      const eligiblePositions = await this.getEligiblePositions();
      
      if (eligiblePositions.length === 0) {
        console.log('No eligible positions found for reward distribution');
        return {
          success: true,
          message: 'No eligible positions found',
          totalProcessed: 0,
          successful: 0,
          failed: 0,
          results: []
        };
      }

      console.log(`Found ${eligiblePositions.length} eligible positions for reward distribution`);

      const distributionResults = [];
      let successfulDistributions = 0;
      let failedDistributions = 0;

      // Process each eligible position
      for (const position of eligiblePositions) {
        try {
          const result = await this.distributeRewardsToPosition(position);
          distributionResults.push(result);
          
          if (result.success) {
            successfulDistributions++;
          } else {
            failedDistributions++;
          }
        } catch (error) {
          console.error(`Error distributing rewards to position ${position._id}:`, error);
          distributionResults.push({
            positionId: position._id,
            userId: position.userId,
            success: false,
            error: error.message,
            ticketsDistributed: 0
          });
          failedDistributions++;
        }
      }

      // Update distribution statistics
      this.distributionStats.totalDistributed += successfulDistributions;
      this.distributionStats.totalPositionsProcessed += eligiblePositions.length;
      this.distributionStats.totalErrors += failedDistributions;
      this.lastDistribution = distributionStartTime;

      const summary = {
        success: true,
        distributionDate: distributionStartTime,
        totalProcessed: eligiblePositions.length,
        successful: successfulDistributions,
        failed: failedDistributions,
        results: distributionResults,
        executionTime: Date.now() - distributionStartTime.getTime()
      };

      console.log('Monthly reward distribution completed:', summary);
      return summary;

    } catch (error) {
      console.error('Error in monthly reward distribution:', error);
      throw error;
    } finally {
      this.isDistributing = false;
    }
  }

  /**
   * Get all staking positions eligible for monthly rewards
   */
  async getEligiblePositions() {
    const now = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    return await StakingPosition.find({
      status: 'active',
      unstakeAt: { $gt: now }, // Position hasn't expired
      $or: [
        { lastRewardDistribution: { $lt: oneMonthAgo } },
        { lastRewardDistribution: { $exists: false } }
      ]
    }).populate('stakingContractId userId');
  }

  /**
   * Distribute rewards to a specific staking position
   */
  async distributeRewardsToPosition(position) {
    try {
      const stakingContract = position.stakingContractId;
      const user = position.userId;

      if (!stakingContract || !stakingContract.isActive) {
        throw new Error('Staking contract is not active');
      }

      // Get reward structure for this position's duration
      const rewardStructure = stakingContract.getRewardStructure(position.stakingDuration);
      const monthlyTickets = rewardStructure.openEntryTicketsPerMonth;
      const bonusMultiplier = rewardStructure.bonusMultiplier;

      if (monthlyTickets <= 0) {
        return {
          positionId: position._id,
          userId: position.userId,
          success: true,
          message: 'No tickets to distribute',
          ticketsDistributed: 0,
          bonusMultiplier
        };
      }

      // Create open-entry raffle tickets for the user
      const ticketsCreated = await this.createOpenEntryTickets(user._id, monthlyTickets);

      // Create reward history record
      const rewardHistory = new StakingRewardHistory({
        userId: user._id,
        stakingPositionId: position._id,
        stakingContractId: stakingContract._id,
        distributionDate: new Date(),
        openEntryTickets: monthlyTickets,
        bonusMultiplier,
        distributionType: 'monthly',
        nftTokenId: position.nftTokenId,
        nftContractAddress: position.nftContractAddress,
        blockchain: position.blockchain,
        stakingDuration: position.stakingDuration,
        stakingStartDate: position.stakedAt,
        stakingEndDate: position.unstakeAt,
        raffleTicketsCreated: ticketsCreated.map(ticket => ({
          ticketId: ticket._id,
          raffleId: ticket.raffle,
          naffleTicketId: ticket.naffleTicketId
        })),
        status: 'distributed',
        distributionSource: 'scheduler'
      });

      await rewardHistory.save();

      // Update position with reward distribution record
      position.addRewardDistribution(monthlyTickets, bonusMultiplier);
      await position.save();

      // Update contract statistics
      await StakingContract.findByIdAndUpdate(stakingContract._id, {
        $inc: { totalRewardsDistributed: monthlyTickets }
      });

      // Send notification to user
      await stakingNotificationService.sendRewardNotification(user, {
        ticketsReceived: monthlyTickets,
        contractName: stakingContract.contractName,
        nftId: position.nftId,
        bonusMultiplier,
        rewardHistoryId: rewardHistory._id
      });

      return {
        positionId: position._id,
        userId: position.userId,
        success: true,
        ticketsDistributed: monthlyTickets,
        bonusMultiplier,
        ticketsCreated: ticketsCreated.length
      };

    } catch (error) {
      return {
        positionId: position._id,
        userId: position.userId,
        success: false,
        error: error.message,
        ticketsDistributed: 0
      };
    }
  }

  /**
   * Create open-entry raffle tickets for a user
   */
  async createOpenEntryTickets(userId, ticketCount) {
    const tickets = [];
    
    try {
      // Find or create an open-entry raffle for this month
      const openEntryRaffle = await this.getOrCreateOpenEntryRaffle();
      
      for (let i = 0; i < ticketCount; i++) {
        const ticketId = await sequenceUtil.generateId(null, {
          prefix: 'STAKE-',
          name: 'staking_reward_ticket'
        });

        const ticket = new RaffleTicket({
          purchasedBy: userId,
          raffle: openEntryRaffle._id,
          naffleTicketId: ticketId,
          isFree: true,
          isOpenEntry: true
        });

        await ticket.save();
        tickets.push(ticket);
      }

      // Update raffle ticket counts
      await Raffle.findByIdAndUpdate(openEntryRaffle._id, {
        $inc: { 
          ticketsAvailableOpenEntry: ticketCount,
          ticketsSold: ticketCount
        }
      });

      return tickets;
    } catch (error) {
      console.error('Error creating open-entry tickets:', error);
      throw new Error(`Failed to create open-entry tickets: ${error.message}`);
    }
  }

  /**
   * Get or create the monthly open-entry raffle for staking rewards
   */
  async getOrCreateOpenEntryRaffle() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Look for existing open-entry raffle for this month
    let openEntryRaffle = await Raffle.findOne({
      lotteryTypeEnum: 'OPEN_ENTRY',
      'status.isActive': true,
      createdAt: {
        $gte: monthStart,
        $lte: monthEnd
      }
    });

    if (!openEntryRaffle) {
      // Create new open-entry raffle for this month
      const eventId = await sequenceUtil.generateId(null, {
        prefix: SequenceConstants.RAFFLE_EVENT_PREFIX,
        name: SequenceConstants.RAFFLE_EVENT_ID
      });

      // Create a system user for open-entry raffles if it doesn't exist
      const systemUser = await this.getOrCreateSystemUser();

      openEntryRaffle = new Raffle({
        eventId,
        lotteryTypeEnum: 'OPEN_ENTRY',
        raffleTypeEnum: 'UNLIMITED',
        coinType: 'nafflings',
        raffleDurationDays: 30, // Monthly raffle
        perTicketPrice: '0',
        ticketsAvailable: 0,
        ticketsAvailableOpenEntry: 0,
        createdBy: systemUser._id,
        status: {
          isActive: true
        }
      });

      await openEntryRaffle.save();
      console.log(`Created new open-entry raffle for ${now.getFullYear()}-${now.getMonth() + 1}: ${openEntryRaffle.eventId}`);
    }

    return openEntryRaffle;
  }

  /**
   * Get or create system user for open-entry raffles
   */
  async getOrCreateSystemUser() {
    let systemUser = await User.findOne({ email: 'system@naffles.com' });
    
    if (!systemUser) {
      systemUser = new User({
        email: 'system@naffles.com',
        username: 'system',
        role: 'system',
        isVerified: true,
        walletAddresses: []
      });
      await systemUser.save();
      console.log('Created system user for open-entry raffles');
    }

    return systemUser;
  }



  /**
   * Calculate pending rewards for a specific user
   */
  async calculateUserPendingRewards(userId) {
    try {
      const activePositions = await StakingPosition.find({
        userId,
        status: 'active'
      }).populate('stakingContractId');

      let totalPendingTickets = 0;
      const positionRewards = [];

      for (const position of activePositions) {
        const pendingTickets = await this.calculatePositionPendingRewards(position);
        totalPendingTickets += pendingTickets;
        
        positionRewards.push({
          positionId: position._id,
          nftId: position.nftId,
          contractName: position.stakingContractId.contractName,
          pendingTickets,
          nextRewardDate: position.getNextRewardDate(),
          stakingDuration: position.stakingDuration
        });
      }

      return {
        userId,
        totalPendingTickets,
        positionRewards
      };
    } catch (error) {
      throw new Error(`Failed to calculate pending rewards: ${error.message}`);
    }
  }

  /**
   * Calculate pending rewards for a specific position
   */
  async calculatePositionPendingRewards(position) {
    if (!position.isEligibleForRewards()) {
      return 0;
    }

    const stakingContract = position.stakingContractId;
    if (!stakingContract) {
      return 0;
    }

    const rewardStructure = stakingContract.getRewardStructure(position.stakingDuration);
    const lastDistribution = position.lastRewardDistribution || position.stakedAt;
    const now = new Date();

    // Calculate complete months since last distribution
    const monthsDiff = (now.getFullYear() - lastDistribution.getFullYear()) * 12 + 
                      (now.getMonth() - lastDistribution.getMonth());

    return Math.max(0, monthsDiff * rewardStructure.openEntryTicketsPerMonth);
  }

  /**
   * Process reward claims for users
   */
  async processRewardClaims(userId, claimRequests) {
    try {
      const results = [];
      
      for (const claimRequest of claimRequests) {
        const { positionId, claimAmount } = claimRequest;
        
        const position = await StakingPosition.findOne({
          _id: positionId,
          userId,
          status: 'active'
        }).populate('stakingContractId');

        if (!position) {
          results.push({
            positionId,
            success: false,
            error: 'Position not found or not active'
          });
          continue;
        }

        const pendingRewards = await this.calculatePositionPendingRewards(position);
        
        if (claimAmount > pendingRewards) {
          results.push({
            positionId,
            success: false,
            error: 'Claim amount exceeds pending rewards'
          });
          continue;
        }

        // Create tickets for claimed rewards
        const tickets = await this.createOpenEntryTickets(userId, claimAmount);
        
        // Update position with partial reward distribution
        const stakingContract = position.stakingContractId;
        const rewardStructure = stakingContract.getRewardStructure(position.stakingDuration);
        
        position.addRewardDistribution(claimAmount, rewardStructure.bonusMultiplier);
        await position.save();

        results.push({
          positionId,
          success: true,
          ticketsClaimed: claimAmount,
          ticketsCreated: tickets.length
        });
      }

      return {
        userId,
        totalClaims: claimRequests.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };
    } catch (error) {
      throw new Error(`Failed to process reward claims: ${error.message}`);
    }
  }

  /**
   * Get reward distribution history for a user
   */
  async getUserRewardHistory(userId, options = {}) {
    try {
      const { page = 1, limit = 10 } = options;
      const skip = (page - 1) * limit;

      const [rewardHistory, total] = await Promise.all([
        StakingRewardHistory.find({ userId })
          .populate('stakingContractId', 'contractName contractAddress blockchain')
          .populate('stakingPositionId', 'nftTokenId nftContractAddress')
          .sort({ distributionDate: -1 })
          .skip(skip)
          .limit(limit),
        StakingRewardHistory.countDocuments({ userId })
      ]);

      const formattedHistory = rewardHistory.map(reward => ({
        id: reward._id,
        positionId: reward.stakingPositionId._id,
        nftId: reward.nftId,
        contractName: reward.stakingContractId.contractName,
        contractAddress: reward.stakingContractId.contractAddress,
        blockchain: reward.stakingContractId.blockchain,
        distributedAt: reward.distributionDate,
        openEntryTickets: reward.openEntryTickets,
        bonusMultiplier: reward.bonusMultiplier,
        effectiveValue: reward.effectiveValue,
        distributionType: reward.distributionType,
        distributionPeriod: reward.distributionPeriod,
        stakingDuration: reward.stakingDuration,
        status: reward.status,
        raffleTicketsCount: reward.raffleTicketsCreated.length
      }));

      return {
        userId,
        rewardHistory: formattedHistory,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new Error(`Failed to get reward history: ${error.message}`);
    }
  }

  /**
   * Get distribution statistics
   */
  getDistributionStats() {
    return {
      ...this.distributionStats,
      lastDistribution: this.lastDistribution,
      isCurrentlyDistributing: this.isDistributing
    };
  }

  /**
   * Manual reward distribution for testing or admin use
   */
  async manualDistribution(positionIds = null) {
    try {
      console.log('Manual reward distribution triggered');
      
      if (positionIds && positionIds.length > 0) {
        // Distribute rewards to specific positions
        const positions = await StakingPosition.find({
          _id: { $in: positionIds },
          status: 'active'
        }).populate('stakingContractId userId');

        const results = [];
        for (const position of positions) {
          const result = await this.distributeRewardsToPosition(position);
          results.push(result);
        }

        return {
          success: true,
          message: 'Manual distribution completed for specified positions',
          totalProcessed: positions.length,
          results
        };
      } else {
        // Distribute to all eligible positions
        return await this.distributeMonthlyRewards();
      }
    } catch (error) {
      throw new Error(`Manual distribution failed: ${error.message}`);
    }
  }

  /**
   * Check for missed distributions and process them
   */
  async checkAndProcessMissedDistributions() {
    try {
      const now = new Date();
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      // Find positions that haven't received rewards in over a month but should have
      const missedPositions = await StakingPosition.find({
        status: 'active',
        stakedAt: { $lt: twoMonthsAgo },
        $or: [
          { lastRewardDistribution: { $lt: twoMonthsAgo } },
          { lastRewardDistribution: { $exists: false } }
        ]
      }).populate('stakingContractId userId');

      if (missedPositions.length === 0) {
        return {
          success: true,
          message: 'No missed distributions found',
          processedPositions: 0
        };
      }

      console.log(`Found ${missedPositions.length} positions with missed rewards, processing...`);
      
      const results = [];
      for (const position of missedPositions) {
        try {
          const stakingContract = position.stakingContractId;
          const rewardStructure = stakingContract.getRewardStructure(position.stakingDuration);
          
          // Calculate how many months of rewards were missed
          const lastDistribution = position.lastRewardDistribution || position.stakedAt;
          const monthsMissed = Math.floor((now.getTime() - lastDistribution.getTime()) / (1000 * 60 * 60 * 24 * 30));
          
          if (monthsMissed > 0) {
            const totalTickets = monthsMissed * rewardStructure.openEntryTicketsPerMonth;
            
            // Create tickets for missed rewards
            const tickets = await this.createOpenEntryTickets(position.userId._id, totalTickets);
            
            // Add reward distribution record
            position.addRewardDistribution(totalTickets, rewardStructure.bonusMultiplier);
            await position.save();
            
            results.push({
              positionId: position._id,
              userId: position.userId._id,
              monthsMissed,
              ticketsDistributed: totalTickets,
              success: true
            });

            console.log(`Distributed ${totalTickets} tickets to position ${position._id} for ${monthsMissed} missed months`);
          }
        } catch (error) {
          console.error(`Error processing missed rewards for position ${position._id}:`, error);
          results.push({
            positionId: position._id,
            userId: position.userId._id,
            success: false,
            error: error.message
          });
        }
      }

      return {
        success: true,
        message: 'Missed distributions processed',
        processedPositions: missedPositions.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };
    } catch (error) {
      throw new Error(`Failed to check missed distributions: ${error.message}`);
    }
  }
}

module.exports = new StakingRewardDistributionService();