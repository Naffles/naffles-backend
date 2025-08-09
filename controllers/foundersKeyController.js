const User = require("../models/user/user");
const FoundersKeyStaking = require("../models/user/foundersKeyStaking");
const OpenEntryAllocation = require("../models/user/openEntryAllocation");
const foundersKeyService = require("../services/foundersKeyService");
const sendResponse = require("../utils/responseHandler");

// Founders Key Management
exports.getUserFoundersKeys = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return sendResponse(res, 404, "User not found");
    }

    const foundersKeys = user.foundersKeys.map(key => ({
      tokenId: key.tokenId,
      contractAddress: key.contractAddress,
      chainId: key.chainId,
      tier: key.tier,
      benefits: key.benefits,
      stakingPeriod: key.stakingPeriod,
      isStaking: key.stakingPeriod.isActive
    }));

    const totalBenefits = user.getFoundersKeyBenefits();

    return sendResponse(res, 200, "Founders Keys retrieved successfully", {
      foundersKeys,
      totalBenefits,
      tier: user.tier,
      hasFoundersKey: user.hasFoundersKey(),
      keyCount: foundersKeys.length
    });
  } catch (error) {
    console.error("Error retrieving Founders Keys:", error);
    return sendResponse(res, 500, "Failed to retrieve Founders Keys");
  }
};

exports.scanWalletForKeys = async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return sendResponse(res, 400, "Wallet address is required");
    }

    // Scan for Founders Keys
    const foundersKeys = await foundersKeyService.scanWalletForFoundersKeys(walletAddress);
    
    if (foundersKeys.length > 0) {
      // Update user's Founders Keys
      const user = await User.findById(req.user._id);
      if (!user) {
        return sendResponse(res, 404, "User not found");
      }

      // Merge new keys with existing ones (avoid duplicates)
      const existingTokenIds = user.foundersKeys.map(key => `${key.contractAddress}-${key.tokenId}`);
      const newKeys = foundersKeys.filter(key => 
        !existingTokenIds.includes(`${key.contractAddress}-${key.tokenId}`)
      );

      if (newKeys.length > 0) {
        user.foundersKeys.push(...newKeys);
        await user.save();
      }

      const benefits = user.getFoundersKeyBenefits();
      
      return sendResponse(res, 200, "Wallet scan completed", {
        foundersKeys: user.foundersKeys,
        newKeysFound: newKeys.length,
        totalBenefits: benefits,
        tier: user.tier
      });
    } else {
      return sendResponse(res, 200, "No Founders Keys found for this wallet", {
        foundersKeys: [],
        newKeysFound: 0
      });
    }
  } catch (error) {
    console.error("Error scanning wallet for keys:", error);
    return sendResponse(res, 500, "Failed to scan wallet");
  }
};

exports.getFoundersKeyBenefits = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return sendResponse(res, 404, "User not found");
    }

    const benefits = user.getFoundersKeyBenefits();
    
    // Get detailed breakdown
    const keyBreakdown = user.foundersKeys.map(key => ({
      tokenId: key.tokenId,
      contractAddress: key.contractAddress,
      tier: key.tier,
      benefits: key.benefits,
      isStaking: key.stakingPeriod.isActive,
      stakingEndDate: key.stakingPeriod.endDate
    }));

    return sendResponse(res, 200, "Benefits retrieved successfully", {
      totalBenefits: benefits,
      keyBreakdown,
      tier: user.tier,
      hasFoundersKey: user.hasFoundersKey()
    });
  } catch (error) {
    console.error("Error retrieving benefits:", error);
    return sendResponse(res, 500, "Failed to retrieve benefits");
  }
};

// Staking Management
exports.startStaking = async (req, res) => {
  try {
    const { tokenId, contractAddress, stakingDuration } = req.body;

    if (!tokenId || !contractAddress || !stakingDuration) {
      return sendResponse(res, 400, "Token ID, contract address, and staking duration are required");
    }

    if (stakingDuration < 30 || stakingDuration > 1095) { // 30 days to 3 years
      return sendResponse(res, 400, "Staking duration must be between 30 and 1095 days");
    }

    const result = await foundersKeyService.startStaking(
      req.user._id,
      tokenId,
      contractAddress,
      stakingDuration
    );

    return sendResponse(res, 200, "Staking started successfully", result);
  } catch (error) {
    console.error("Error starting staking:", error);
    return sendResponse(res, 500, error.message || "Failed to start staking");
  }
};

exports.endStaking = async (req, res) => {
  try {
    const { tokenId, contractAddress } = req.body;

    if (!tokenId || !contractAddress) {
      return sendResponse(res, 400, "Token ID and contract address are required");
    }

    const result = await foundersKeyService.endStaking(
      req.user._id,
      tokenId,
      contractAddress
    );

    return sendResponse(res, 200, "Staking ended successfully", result);
  } catch (error) {
    console.error("Error ending staking:", error);
    return sendResponse(res, 500, error.message || "Failed to end staking");
  }
};

exports.getUserStaking = async (req, res) => {
  try {
    const stakingRecords = await FoundersKeyStaking.getActiveStakingByUser(req.user._id);

    const stakingDetails = stakingRecords.map(record => ({
      id: record._id,
      tokenId: record.tokenId,
      contractAddress: record.contractAddress,
      stakingDuration: record.stakingDuration,
      startDate: record.startDate,
      endDate: record.endDate,
      daysRemaining: record.daysRemaining,
      progressPercentage: record.progressPercentage,
      status: record.status,
      originalBenefits: record.originalBenefits,
      stakedBenefits: record.stakedBenefits,
      rewardsEarned: record.calculateRewards(),
      canEndEarly: record.canEndEarly()
    }));

    return sendResponse(res, 200, "Staking details retrieved successfully", {
      activeStaking: stakingDetails,
      totalActiveStaking: stakingDetails.length
    });
  } catch (error) {
    console.error("Error retrieving staking details:", error);
    return sendResponse(res, 500, "Failed to retrieve staking details");
  }
};

// Open Entry Allocation Management
exports.getUserAllocations = async (req, res) => {
  try {
    const { includeExpired = false } = req.query;

    let allocations;
    if (includeExpired === 'true') {
      allocations = await OpenEntryAllocation.find({ userId: req.user._id })
        .sort({ createdAt: -1 });
    } else {
      allocations = await OpenEntryAllocation.getActiveAllocationsForUser(req.user._id);
    }

    const totalAvailable = await OpenEntryAllocation.getTotalAvailableTickets(req.user._id);

    const allocationDetails = allocations.map(allocation => ({
      id: allocation._id,
      ticketsAllocated: allocation.ticketsAllocated,
      ticketsUsed: allocation.ticketsUsed,
      ticketsRemaining: allocation.ticketsRemaining,
      allocationDate: allocation.allocationDate,
      expirationDate: allocation.expirationDate,
      source: allocation.source,
      status: allocation.status,
      isExpired: allocation.isExpired,
      isFullyUsed: allocation.isFullyUsed,
      usageHistory: allocation.usageHistory
    }));

    return sendResponse(res, 200, "Allocations retrieved successfully", {
      allocations: allocationDetails,
      totalAvailableTickets: totalAvailable[0]?.totalTickets || 0,
      totalAllocations: allocationDetails.length
    });
  } catch (error) {
    console.error("Error retrieving allocations:", error);
    return sendResponse(res, 500, "Failed to retrieve allocations");
  }
};

exports.useOpenEntryTickets = async (req, res) => {
  try {
    const { ticketsToUse, raffleId, transactionId } = req.body;

    if (!ticketsToUse || ticketsToUse <= 0) {
      return sendResponse(res, 400, "Valid number of tickets to use is required");
    }

    if (!raffleId) {
      return sendResponse(res, 400, "Raffle ID is required");
    }

    // Get active allocations for user
    const allocations = await OpenEntryAllocation.getActiveAllocationsForUser(req.user._id);

    if (allocations.length === 0) {
      return sendResponse(res, 400, "No active allocations available");
    }

    // Calculate total available tickets
    const totalAvailable = allocations.reduce((sum, allocation) => sum + allocation.ticketsRemaining, 0);

    if (totalAvailable < ticketsToUse) {
      return sendResponse(res, 400, `Insufficient tickets. Available: ${totalAvailable}, Requested: ${ticketsToUse}`);
    }

    // Use tickets from allocations (FIFO - oldest first)
    let remainingToUse = ticketsToUse;
    const usedAllocations = [];

    for (const allocation of allocations) {
      if (remainingToUse <= 0) break;

      const ticketsFromThisAllocation = Math.min(remainingToUse, allocation.ticketsRemaining);
      
      if (ticketsFromThisAllocation > 0) {
        await allocation.useTickets(ticketsFromThisAllocation, raffleId, transactionId);
        usedAllocations.push({
          allocationId: allocation._id,
          ticketsUsed: ticketsFromThisAllocation,
          source: allocation.source
        });
        remainingToUse -= ticketsFromThisAllocation;
      }
    }

    return sendResponse(res, 200, "Open entry tickets used successfully", {
      ticketsUsed: ticketsToUse,
      raffleId,
      usedAllocations,
      remainingTickets: totalAvailable - ticketsToUse
    });
  } catch (error) {
    console.error("Error using open entry tickets:", error);
    return sendResponse(res, 500, "Failed to use open entry tickets");
  }
};

// Fee Discount and Priority Access
exports.applyFeeDiscount = async (req, res) => {
  try {
    const { originalFee } = req.body;

    if (!originalFee || originalFee <= 0) {
      return sendResponse(res, 400, "Valid original fee amount is required");
    }

    const discountResult = await foundersKeyService.applyFeeDiscount(req.user._id, originalFee);

    return sendResponse(res, 200, "Fee discount calculated successfully", discountResult);
  } catch (error) {
    console.error("Error applying fee discount:", error);
    return sendResponse(res, 500, "Failed to apply fee discount");
  }
};

exports.checkPriorityAccess = async (req, res) => {
  try {
    const hasPriorityAccess = await foundersKeyService.hasPriorityAccess(req.user._id);

    const user = await User.findById(req.user._id);
    const benefits = user ? user.getFoundersKeyBenefits() : { priorityAccess: false };

    return sendResponse(res, 200, "Priority access status retrieved", {
      hasPriorityAccess,
      benefits: {
        priorityAccess: benefits.priorityAccess,
        feeDiscount: benefits.feeDiscount,
        openEntryTickets: benefits.openEntryTickets
      },
      tier: user?.tier || 'bronze'
    });
  } catch (error) {
    console.error("Error checking priority access:", error);
    return sendResponse(res, 500, "Failed to check priority access");
  }
};