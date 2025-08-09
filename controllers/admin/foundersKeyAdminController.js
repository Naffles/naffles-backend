const FoundersKeyContract = require("../../models/user/foundersKeyContract");
const FoundersKeyStaking = require("../../models/user/foundersKeyStaking");
const OpenEntryAllocation = require("../../models/user/openEntryAllocation");
const User = require("../../models/user/user");
const foundersKeyService = require("../../services/foundersKeyService");
const FoundersKeyConfig = require("../../models/admin/foundersKeyConfig");
const sendResponse = require("../../utils/responseHandler");
const mongoose = require("mongoose");

// Contract Management
exports.createFoundersKeyContract = async (req, res) => {
  try {
    const {
      name,
      contractAddress,
      chainId,
      network,
      defaultTier,
      baseBenefits,
      metadata
    } = req.body;

    // Validate required fields
    if (!name || !contractAddress || !chainId || !network) {
      return sendResponse(res, 400, "Missing required fields");
    }

    // Check if contract already exists
    const existingContract = await FoundersKeyContract.findOne({
      contractAddress: contractAddress.toLowerCase(),
      chainId
    });

    if (existingContract) {
      return sendResponse(res, 400, "Contract already exists");
    }

    const contract = new FoundersKeyContract({
      name,
      contractAddress: contractAddress.toLowerCase(),
      chainId,
      network,
      defaultTier: defaultTier || 1,
      baseBenefits: baseBenefits || {
        feeDiscount: 5,
        priorityAccess: false,
        openEntryTickets: 1
      },
      metadata: metadata || {},
      createdBy: req.user._id
    });

    await contract.save();

    return sendResponse(res, 201, "Founders Key contract created successfully", contract);
  } catch (error) {
    console.error("Error creating Founders Key contract:", error);
    return sendResponse(res, 500, "Failed to create contract");
  }
};

exports.getFoundersKeyContracts = async (req, res) => {
  try {
    const { page = 1, limit = 10, network, isActive } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (network) filter.network = network;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const contracts = await FoundersKeyContract.find(filter)
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await FoundersKeyContract.countDocuments(filter);

    return sendResponse(res, 200, "Contracts retrieved successfully", {
      contracts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalContracts: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Error retrieving contracts:", error);
    return sendResponse(res, 500, "Failed to retrieve contracts");
  }
};

exports.updateFoundersKeyContract = async (req, res) => {
  try {
    const { contractId } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated
    delete updates.contractAddress;
    delete updates.chainId;
    delete updates.createdBy;

    const contract = await FoundersKeyContract.findByIdAndUpdate(
      contractId,
      updates,
      { new: true, runValidators: true }
    );

    if (!contract) {
      return sendResponse(res, 404, "Contract not found");
    }

    return sendResponse(res, 200, "Contract updated successfully", contract);
  } catch (error) {
    console.error("Error updating contract:", error);
    return sendResponse(res, 500, "Failed to update contract");
  }
};

exports.deleteFoundersKeyContract = async (req, res) => {
  try {
    const { contractId } = req.params;

    const contract = await FoundersKeyContract.findByIdAndDelete(contractId);

    if (!contract) {
      return sendResponse(res, 404, "Contract not found");
    }

    return sendResponse(res, 200, "Contract deleted successfully");
  } catch (error) {
    console.error("Error deleting contract:", error);
    return sendResponse(res, 500, "Failed to delete contract");
  }
};

// Tier Management
exports.updateTierMapping = async (req, res) => {
  try {
    const { contractId } = req.params;
    const { tierMappings } = req.body; // Array of { tokenId, tier }

    const contract = await FoundersKeyContract.findById(contractId);
    if (!contract) {
      return sendResponse(res, 404, "Contract not found");
    }

    // Update tier mappings
    tierMappings.forEach(({ tokenId, tier }) => {
      if (tier >= 1 && tier <= 5) {
        contract.tierMapping.set(tokenId, tier);
      }
    });

    await contract.save();

    return sendResponse(res, 200, "Tier mappings updated successfully", {
      contractId,
      updatedMappings: Array.from(contract.tierMapping.entries())
    });
  } catch (error) {
    console.error("Error updating tier mappings:", error);
    return sendResponse(res, 500, "Failed to update tier mappings");
  }
};

// Staking Management
exports.getStakingOverview = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, userId } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;

    const stakingRecords = await FoundersKeyStaking.find(filter)
      .populate('userId', 'username primaryWallet')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await FoundersKeyStaking.countDocuments(filter);

    // Get staking statistics
    const stats = await FoundersKeyStaking.getStakingStats();

    return sendResponse(res, 200, "Staking overview retrieved successfully", {
      stakingRecords,
      statistics: stats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Error retrieving staking overview:", error);
    return sendResponse(res, 500, "Failed to retrieve staking overview");
  }
};

exports.forceEndStaking = async (req, res) => {
  try {
    const { stakingId } = req.params;
    const { reason } = req.body;

    const stakingRecord = await FoundersKeyStaking.findById(stakingId);
    if (!stakingRecord) {
      return sendResponse(res, 404, "Staking record not found");
    }

    if (stakingRecord.status !== 'active') {
      return sendResponse(res, 400, "Staking is not active");
    }

    // End the staking
    const result = await foundersKeyService.endStaking(
      stakingRecord.userId,
      stakingRecord.tokenId,
      stakingRecord.contractAddress
    );

    // Add admin note
    stakingRecord.notes = `Force ended by admin: ${reason || 'No reason provided'}`;
    stakingRecord.status = 'cancelled';
    await stakingRecord.save();

    return sendResponse(res, 200, "Staking ended successfully", result);
  } catch (error) {
    console.error("Error force ending staking:", error);
    return sendResponse(res, 500, "Failed to end staking");
  }
};

// Open Entry Allocation Management
exports.getAllocationsOverview = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, source, userId } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (userId) filter.userId = userId;

    const allocations = await OpenEntryAllocation.find(filter)
      .populate('userId', 'username primaryWallet')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await OpenEntryAllocation.countDocuments(filter);

    // Get allocation statistics
    const stats = await OpenEntryAllocation.getAllocationStats();

    return sendResponse(res, 200, "Allocations overview retrieved successfully", {
      allocations,
      statistics: stats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Error retrieving allocations overview:", error);
    return sendResponse(res, 500, "Failed to retrieve allocations overview");
  }
};

exports.createManualAllocation = async (req, res) => {
  try {
    const {
      userId,
      ticketsAllocated,
      expirationDate,
      notes
    } = req.body;

    if (!userId || !ticketsAllocated) {
      return sendResponse(res, 400, "User ID and ticket amount are required");
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return sendResponse(res, 404, "User not found");
    }

    const allocation = new OpenEntryAllocation({
      userId,
      ticketsAllocated,
      expirationDate: expirationDate || undefined, // Use default if not provided
      source: 'admin_allocation',
      sourceDetails: {
        adminUserId: req.user._id
      },
      status: 'active',
      activatedAt: new Date(),
      notes
    });

    await allocation.save();

    return sendResponse(res, 201, "Manual allocation created successfully", allocation);
  } catch (error) {
    console.error("Error creating manual allocation:", error);
    return sendResponse(res, 500, "Failed to create allocation");
  }
};

exports.processMonthlyAllocations = async (req, res) => {
  try {
    const allocations = await foundersKeyService.processOpenEntryAllocations();

    return sendResponse(res, 200, "Monthly allocations processed successfully", {
      allocationsCreated: allocations.length,
      allocations
    });
  } catch (error) {
    console.error("Error processing monthly allocations:", error);
    return sendResponse(res, 500, "Failed to process allocations");
  }
};

// Analytics and Reporting
exports.getFoundersKeyAnalytics = async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    const daysBack = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));

    // Get key metrics
    const totalHolders = await User.countDocuments({ 
      "foundersKeys.0": { $exists: true } 
    });

    const activeStaking = await FoundersKeyStaking.countDocuments({ 
      status: 'active' 
    });

    const totalAllocations = await OpenEntryAllocation.aggregate([
      {
        $group: {
          _id: null,
          totalTickets: { $sum: '$ticketsAllocated' },
          usedTickets: { $sum: '$ticketsUsed' }
        }
      }
    ]);

    // Get tier distribution
    const tierDistribution = await User.aggregate([
      { $match: { "foundersKeys.0": { $exists: true } } },
      { $unwind: "$foundersKeys" },
      {
        $group: {
          _id: "$foundersKeys.tier",
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get recent activity
    const recentStaking = await FoundersKeyStaking.find({
      createdAt: { $gte: startDate }
    }).countDocuments();

    const recentAllocations = await OpenEntryAllocation.find({
      createdAt: { $gte: startDate }
    }).countDocuments();

    return sendResponse(res, 200, "Analytics retrieved successfully", {
      overview: {
        totalHolders,
        activeStaking,
        totalAllocatedTickets: totalAllocations[0]?.totalTickets || 0,
        usedTickets: totalAllocations[0]?.usedTickets || 0,
        utilizationRate: totalAllocations[0] ? 
          ((totalAllocations[0].usedTickets / totalAllocations[0].totalTickets) * 100).toFixed(2) : 0
      },
      tierDistribution,
      recentActivity: {
        newStaking: recentStaking,
        newAllocations: recentAllocations,
        timeframe: `${daysBack} days`
      }
    });
  } catch (error) {
    console.error("Error retrieving analytics:", error);
    return sendResponse(res, 500, "Failed to retrieve analytics");
  }
};

exports.exportFoundersKeySnapshot = async (req, res) => {
  try {
    const snapshot = await foundersKeyService.generateFoundersKeySnapshot();

    // Convert to CSV format
    const csvHeaders = [
      'Username',
      'Wallet Address',
      'Tier',
      'Total Keys',
      'Highest Key Tier',
      'Fee Discount %',
      'Priority Access',
      'Open Entry Tickets',
      'Staking Keys'
    ];

    const csvRows = snapshot.map(user => [
      user.username,
      user.walletAddress,
      user.tier,
      user.totalKeys,
      user.highestKeyTier,
      user.totalFeeDiscount,
      user.priorityAccess ? 'Yes' : 'No',
      user.openEntryTickets,
      user.stakingKeys
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="founders-key-snapshot.csv"');
    
    return res.send(csvContent);
  } catch (error) {
    console.error("Error exporting snapshot:", error);
    return sendResponse(res, 500, "Failed to export snapshot");
  }
};

// Utility Functions
exports.scanAllWalletsForKeys = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    // Get users with wallet addresses but no Founders Keys
    const users = await User.find({
      "primaryWallet.address": { $exists: true },
      "foundersKeys.0": { $exists: false }
    }).limit(parseInt(limit));

    let scannedCount = 0;
    let keysFound = 0;

    for (const user of users) {
      try {
        const foundersKeys = await foundersKeyService.scanWalletForFoundersKeys(
          user.primaryWallet.address
        );

        if (foundersKeys.length > 0) {
          user.foundersKeys.push(...foundersKeys);
          await user.save();
          keysFound += foundersKeys.length;
        }

        scannedCount++;
      } catch (error) {
        console.error(`Error scanning wallet ${user.primaryWallet.address}:`, error);
      }
    }

    return sendResponse(res, 200, "Wallet scanning completed", {
      walletsScanned: scannedCount,
      keysFound,
      usersUpdated: users.filter(u => u.foundersKeys.length > 0).length
    });
  } catch (error) {
    console.error("Error scanning wallets:", error);
    return sendResponse(res, 500, "Failed to scan wallets");
  }
};

exports.expireOldAllocations = async (req, res) => {
  try {
    const expiredAllocations = await OpenEntryAllocation.getExpiredAllocations();
    
    let expiredCount = 0;
    for (const allocation of expiredAllocations) {
      await allocation.expire();
      expiredCount++;
    }

    return sendResponse(res, 200, "Expired allocations processed", {
      expiredCount
    });
  } catch (error) {
    console.error("Error expiring allocations:", error);
    return sendResponse(res, 500, "Failed to expire allocations");
  }
};

// Configuration Management
exports.getFoundersKeyConfig = async (req, res) => {
  try {
    const config = await FoundersKeyConfig.getActiveConfig();
    
    return sendResponse(res, 200, "Configuration retrieved successfully", {
      config,
      lastUpdated: config.updatedAt,
      version: config.version
    });
  } catch (error) {
    console.error("Error retrieving configuration:", error);
    return sendResponse(res, 500, "Failed to retrieve configuration");
  }
};

exports.updateFoundersKeyConfig = async (req, res) => {
  try {
    const updates = req.body;
    
    // Validate the updates structure
    const allowedUpdates = ['tierMultipliers', 'stakingMultipliers', 'globalSettings'];
    const updateKeys = Object.keys(updates);
    const isValidUpdate = updateKeys.every(key => allowedUpdates.includes(key));
    
    if (!isValidUpdate) {
      return sendResponse(res, 400, "Invalid configuration keys provided");
    }
    
    const updatedConfig = await FoundersKeyConfig.updateConfig(updates, req.user._id);
    
    return sendResponse(res, 200, "Configuration updated successfully", {
      config: updatedConfig,
      version: updatedConfig.version,
      lastUpdatedBy: req.user.username
    });
  } catch (error) {
    console.error("Error updating configuration:", error);
    return sendResponse(res, 500, error.message || "Failed to update configuration");
  }
};

exports.resetFoundersKeyConfig = async (req, res) => {
  try {
    // Create a new default configuration
    const currentConfig = await FoundersKeyConfig.getActiveConfig();
    currentConfig.isActive = false;
    await currentConfig.save();
    
    const newConfig = new FoundersKeyConfig({
      isActive: true,
      lastUpdatedBy: req.user._id
    });
    await newConfig.save();
    
    return sendResponse(res, 200, "Configuration reset to defaults successfully", {
      config: newConfig,
      version: newConfig.version
    });
  } catch (error) {
    console.error("Error resetting configuration:", error);
    return sendResponse(res, 500, "Failed to reset configuration");
  }
};

exports.previewBenefitsCalculation = async (req, res) => {
  try {
    const { contractId, tier, stakingDurationDays = 0 } = req.body;
    
    if (!contractId || !tier) {
      return sendResponse(res, 400, "Contract ID and tier are required");
    }
    
    const contract = await FoundersKeyContract.findById(contractId);
    if (!contract) {
      return sendResponse(res, 404, "Contract not found");
    }
    
    const config = await FoundersKeyConfig.getActiveConfig();
    const benefits = config.calculateBenefits(contract.baseBenefits, tier, stakingDurationDays);
    
    // Also calculate for all tiers for comparison
    const allTierBenefits = {};
    for (let t = 1; t <= 5; t++) {
      allTierBenefits[`tier${t}`] = {
        withoutStaking: config.calculateBenefits(contract.baseBenefits, t, 0),
        withStaking: stakingDurationDays > 0 ? config.calculateBenefits(contract.baseBenefits, t, stakingDurationDays) : null
      };
    }
    
    return sendResponse(res, 200, "Benefits calculation preview", {
      requestedCalculation: {
        tier,
        stakingDurationDays,
        benefits
      },
      allTierComparison: allTierBenefits,
      contractBaseBenefits: contract.baseBenefits,
      configVersion: config.version
    });
  } catch (error) {
    console.error("Error calculating benefits preview:", error);
    return sendResponse(res, 500, "Failed to calculate benefits preview");
  }
};

exports.getConfigurationHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    const history = await FoundersKeyConfig.find()
      .populate('lastUpdatedBy', 'username')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await FoundersKeyConfig.countDocuments();
    
    return sendResponse(res, 200, "Configuration history retrieved successfully", {
      history,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Error retrieving configuration history:", error);
    return sendResponse(res, 500, "Failed to retrieve configuration history");
  }
};