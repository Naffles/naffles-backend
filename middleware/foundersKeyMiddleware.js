const User = require('../models/user/user');
const foundersKeyService = require('../services/foundersKeyService');
const universalNFTBenefitsService = require('../services/universalNFTBenefitsService');
const sendResponse = require('../utils/responseHandler');

/**
 * Middleware to check if user has Founders Key benefits
 * Now uses Universal NFT Benefits Service with smart contract verification
 */
const requireFoundersKey = async (req, res, next) => {
  try {
    if (!req.user) {
      return sendResponse(res, 401, "Authentication required");
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return sendResponse(res, 404, "User not found");
    }

    // Get user's complete benefits profile including smart contract verification
    const benefitsProfile = await universalNFTBenefitsService.getUserBenefitsProfile(req.user._id);
    
    // Check if user has any Founders Keys
    if (benefitsProfile.aggregatedBenefits.foundersKeysOwned === 0) {
      return sendResponse(res, 403, "Founders Key required for this action");
    }

    // Add comprehensive benefits to request
    req.foundersKeyBenefits = benefitsProfile.aggregatedBenefits;
    req.userTier = benefitsProfile.aggregatedBenefits.highestTier;
    req.nftBenefitsProfile = benefitsProfile;
    
    next();
  } catch (error) {
    console.error("Error in requireFoundersKey middleware:", error);
    return sendResponse(res, 500, "Failed to verify Founders Key status");
  }
};

/**
 * Middleware to check if user has priority access
 * Now uses Universal NFT Benefits Service
 */
const requirePriorityAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return sendResponse(res, 401, "Authentication required");
    }

    // Get user's aggregated benefits from all NFT collections
    const benefitsProfile = await universalNFTBenefitsService.getUserBenefitsProfile(req.user._id);
    
    if (!benefitsProfile.aggregatedBenefits.priorityAccess) {
      return sendResponse(res, 403, "Priority access required for this action");
    }

    // Add benefits profile to request for further use
    req.nftBenefitsProfile = benefitsProfile;
    
    next();
  } catch (error) {
    console.error("Error in requirePriorityAccess middleware:", error);
    return sendResponse(res, 500, "Failed to verify priority access");
  }
};

/**
 * Middleware to check minimum tier requirement
 */
const requireMinimumTier = (minimumTier) => {
  const tierHierarchy = {
    'bronze': 1,
    'silver': 2,
    'gold': 3,
    'platinum': 4,
    'diamond': 5
  };

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return sendResponse(res, 401, "Authentication required");
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return sendResponse(res, 404, "User not found");
      }

      const userTierLevel = tierHierarchy[user.tier] || 0;
      const requiredTierLevel = tierHierarchy[minimumTier] || 0;

      if (userTierLevel < requiredTierLevel) {
        return sendResponse(res, 403, `Minimum ${minimumTier} tier required for this action`);
      }

      req.userTier = user.tier;
      req.foundersKeyBenefits = user.getFoundersKeyBenefits();
      
      next();
    } catch (error) {
      console.error("Error in requireMinimumTier middleware:", error);
      return sendResponse(res, 500, "Failed to verify tier requirement");
    }
  };
};

/**
 * Middleware to apply fee discount to request
 * Now uses Universal NFT Benefits Service for cross-collection discounts
 */
const applyFeeDiscount = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(); // Continue without discount if not authenticated
    }

    // Check if fee amount is provided in request body or query
    const originalFee = req.body.fee || req.query.fee;
    
    if (originalFee && !isNaN(originalFee)) {
      // Get user's aggregated benefits from all NFT collections
      const benefitsProfile = await universalNFTBenefitsService.getUserBenefitsProfile(req.user._id);
      const discountPercent = benefitsProfile.aggregatedBenefits.feeDiscount || 0;
      
      if (discountPercent > 0) {
        const discountAmount = (parseFloat(originalFee) * discountPercent) / 100;
        const discountedFee = parseFloat(originalFee) - discountAmount;
        
        const discountResult = {
          originalFee: parseFloat(originalFee),
          discountPercent,
          discountAmount,
          finalFee: Math.max(discountedFee, 0),
          appliedDiscount: true,
          benefitSource: benefitsProfile.aggregatedBenefits.primaryCollection,
          smartContractVerified: benefitsProfile.smartContractVerified
        };
        
        // Add discount information to request
        req.feeDiscount = discountResult;
        
        // Update fee in request body if discount was applied
        if (req.body.fee) {
          req.body.originalFee = req.body.fee;
          req.body.fee = discountResult.finalFee;
        }
      } else {
        req.feeDiscount = {
          originalFee: parseFloat(originalFee),
          discountPercent: 0,
          discountAmount: 0,
          finalFee: parseFloat(originalFee),
          appliedDiscount: false
        };
      }
    }

    next();
  } catch (error) {
    console.error("Error in applyFeeDiscount middleware:", error);
    // Continue without discount on error
    next();
  }
};

/**
 * Middleware to validate staking parameters
 */
const validateStakingParams = (req, res, next) => {
  const { tokenId, contractAddress, stakingDuration } = req.body;

  if (!tokenId || !contractAddress) {
    return sendResponse(res, 400, "Token ID and contract address are required");
  }

  if (stakingDuration !== undefined) {
    const duration = parseInt(stakingDuration);
    
    if (isNaN(duration) || duration < 30 || duration > 1095) {
      return sendResponse(res, 400, "Staking duration must be between 30 and 1095 days");
    }
    
    req.body.stakingDuration = duration;
  }

  next();
};

/**
 * Middleware to validate open entry ticket usage
 */
const validateTicketUsage = async (req, res, next) => {
  try {
    const { ticketsToUse, raffleId } = req.body;

    if (!ticketsToUse || !raffleId) {
      return sendResponse(res, 400, "Tickets to use and raffle ID are required");
    }

    const tickets = parseInt(ticketsToUse);
    if (isNaN(tickets) || tickets <= 0) {
      return sendResponse(res, 400, "Invalid number of tickets");
    }

    // Check if user has enough tickets available
    const OpenEntryAllocation = require('../models/user/openEntryAllocation');
    const totalAvailable = await OpenEntryAllocation.getTotalAvailableTickets(req.user._id);
    const availableTickets = totalAvailable[0]?.totalTickets || 0;

    if (availableTickets < tickets) {
      return sendResponse(res, 400, `Insufficient tickets. Available: ${availableTickets}, Requested: ${tickets}`);
    }

    req.body.ticketsToUse = tickets;
    next();
  } catch (error) {
    console.error("Error in validateTicketUsage middleware:", error);
    return sendResponse(res, 500, "Failed to validate ticket usage");
  }
};

/**
 * Middleware to add comprehensive NFT benefits context to request
 * Now includes all NFT collections with smart contract verification
 */
const addFoundersKeyContext = async (req, res, next) => {
  try {
    if (!req.user) {
      return next();
    }

    // Get comprehensive NFT benefits profile
    const benefitsProfile = await universalNFTBenefitsService.getUserBenefitsProfile(req.user._id);

    // Add comprehensive NFT information to request context
    req.foundersKeyContext = {
      // Legacy compatibility
      hasFoundersKey: benefitsProfile.aggregatedBenefits.foundersKeysOwned > 0,
      foundersKeys: benefitsProfile.collectionBreakdown.founders_keys || [],
      benefits: benefitsProfile.aggregatedBenefits,
      tier: benefitsProfile.aggregatedBenefits.highestTier,
      keyCount: benefitsProfile.aggregatedBenefits.foundersKeysOwned,
      
      // Enhanced universal benefits
      allNFTCollections: benefitsProfile.collectionBreakdown,
      totalNFTs: benefitsProfile.aggregatedBenefits.totalNFTs,
      totalCollections: benefitsProfile.totalCollections,
      primaryCollection: benefitsProfile.aggregatedBenefits.primaryCollection,
      smartContractVerified: benefitsProfile.smartContractVerified,
      benefitSources: benefitsProfile.aggregatedBenefits.benefitSources
    };

    // Also add to nftBenefitsProfile for consistency
    req.nftBenefitsProfile = benefitsProfile;

    next();
  } catch (error) {
    console.error("Error in addFoundersKeyContext middleware:", error);
    // Continue without context on error
    next();
  }
};

/**
 * Middleware to log Founders Key actions for analytics
 */
const logFoundersKeyAction = (action) => {
  return (req, res, next) => {
    // Store original res.json to intercept response
    const originalJson = res.json;
    
    res.json = function(data) {
      // Log the action if it was successful
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const logData = {
          userId: req.user?._id,
          action,
          timestamp: new Date(),
          foundersKeyContext: req.foundersKeyContext,
          requestData: {
            body: req.body,
            params: req.params,
            query: req.query
          },
          responseStatus: res.statusCode
        };

        // Async logging (don't wait for it)
        setImmediate(() => {
          try {
            // Here you could save to a FoundersKeyActionLog model
            console.log('Founders Key Action:', JSON.stringify(logData, null, 2));
          } catch (error) {
            console.error('Error logging Founders Key action:', error);
          }
        });
      }

      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * Middleware to check if user can create raffles (based on admin settings)
 */
const checkRaffleCreationPermission = async (req, res, next) => {
  try {
    const AdminSettings = require('../models/admin/adminSettings');
    const settings = await AdminSettings.findOne();
    
    if (!settings) {
      return next(); // Allow if no settings found
    }

    const canCreateRaffle = settings.canCreateRaffle;
    
    switch (canCreateRaffle) {
      case 'everyone':
        return next();
        
      case 'foundersKeyHoldersOnly':
        if (!req.user) {
          return sendResponse(res, 401, "Authentication required");
        }
        
        const user = await User.findById(req.user._id);
        if (!user || !user.hasFoundersKey()) {
          return sendResponse(res, 403, "Founders Key required to create raffles");
        }
        return next();
        
      case 'foundersKeyHoldersAndTokenStakers':
        if (!req.user) {
          return sendResponse(res, 401, "Authentication required");
        }
        
        const userWithStaking = await User.findById(req.user._id);
        const hasFoundersKey = userWithStaking && userWithStaking.hasFoundersKey();
        
        // Check if user has active staking (this would need to be implemented based on your staking system)
        const hasActiveStaking = false; // Placeholder - implement based on your staking system
        
        if (!hasFoundersKey && !hasActiveStaking) {
          return sendResponse(res, 403, "Founders Key or active token staking required to create raffles");
        }
        return next();
        
      default:
        return next();
    }
  } catch (error) {
    console.error("Error in checkRaffleCreationPermission middleware:", error);
    return sendResponse(res, 500, "Failed to verify raffle creation permission");
  }
};

module.exports = {
  requireFoundersKey,
  requirePriorityAccess,
  requireMinimumTier,
  applyFeeDiscount,
  validateStakingParams,
  validateTicketUsage,
  addFoundersKeyContext,
  logFoundersKeyAction,
  checkRaffleCreationPermission
};