const User = require('../../models/user/user');
const UserPromotion = require('../../models/promotions/userPromotion');

class UserTargetingService {
  constructor() {
    // Initialize any external services needed for NFT verification
    this.nftService = null; // Will be injected if needed
  }

  /**
   * Find users eligible for a promotion based on targeting criteria
   */
  async findEligibleUsers(promotion, options = {}) {
    try {
      const { limit = 1000, excludeExisting = true } = options;
      const criteria = promotion.targetingCriteria;
      
      // Build base query
      let query = {};
      
      // Handle user type targeting
      switch (criteria.userType) {
        case 'new_users':
          query = await this.buildNewUsersQuery(criteria);
          break;
        case 'existing_users':
          query = await this.buildExistingUsersQuery(criteria);
          break;
        case 'nft_holders':
          return await this.findNFTHolders(promotion, options);
        case 'specific_users':
          query = { _id: { $in: criteria.specificUserIds || [] } };
          break;
        case 'all_users':
        default:
          query = {};
          break;
      }
      
      // Apply registration date range filter
      if (criteria.userRegistrationDateRange) {
        const dateFilter = {};
        if (criteria.userRegistrationDateRange.startDate) {
          dateFilter.$gte = new Date(criteria.userRegistrationDateRange.startDate);
        }
        if (criteria.userRegistrationDateRange.endDate) {
          dateFilter.$lte = new Date(criteria.userRegistrationDateRange.endDate);
        }
        if (Object.keys(dateFilter).length > 0) {
          query.createdAt = dateFilter;
        }
      }
      
      // Exclude specific users
      if (criteria.excludedUserIds && criteria.excludedUserIds.length > 0) {
        query._id = query._id || {};
        if (query._id.$in) {
          // Remove excluded users from specific users list
          query._id.$in = query._id.$in.filter(id => 
            !criteria.excludedUserIds.some(excludedId => 
              excludedId.toString() === id.toString()
            )
          );
        } else {
          query._id.$nin = criteria.excludedUserIds;
        }
      }
      
      // Exclude users who already have this promotion (if requested)
      if (excludeExisting) {
        const existingUserIds = await UserPromotion.distinct('userId', {
          promotionId: promotion._id,
          status: 'active'
        });
        
        if (existingUserIds.length > 0) {
          query._id = query._id || {};
          if (query._id.$nin) {
            query._id.$nin = [...query._id.$nin, ...existingUserIds];
          } else {
            query._id.$nin = existingUserIds;
          }
        }
      }
      
      // Execute query
      const users = await User.find(query)
        .select('_id username email createdAt walletAddresses')
        .limit(limit)
        .lean();
      
      console.log(`Found ${users.length} eligible users for promotion ${promotion._id}`);
      
      return users;
    } catch (error) {
      console.error('Error finding eligible users:', error);
      throw error;
    }
  }

  /**
   * Build query for new users
   */
  async buildNewUsersQuery(criteria) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return {
      createdAt: { $gte: thirtyDaysAgo }
    };
  }

  /**
   * Build query for existing users
   */
  async buildExistingUsersQuery(criteria) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return {
      createdAt: { $lt: thirtyDaysAgo }
    };
  }

  /**
   * Find NFT holders based on requirements
   */
  async findNFTHolders(promotion, options = {}) {
    try {
      const { limit = 1000, excludeExisting = true } = options;
      const criteria = promotion.targetingCriteria;
      
      if (!criteria.nftRequirements || criteria.nftRequirements.length === 0) {
        throw new Error('NFT requirements not specified for NFT holders targeting');
      }
      
      // Get all users first (we'll filter by NFT holdings)
      let baseQuery = {};
      
      // Apply other filters
      if (criteria.userRegistrationDateRange) {
        const dateFilter = {};
        if (criteria.userRegistrationDateRange.startDate) {
          dateFilter.$gte = new Date(criteria.userRegistrationDateRange.startDate);
        }
        if (criteria.userRegistrationDateRange.endDate) {
          dateFilter.$lte = new Date(criteria.userRegistrationDateRange.endDate);
        }
        if (Object.keys(dateFilter).length > 0) {
          baseQuery.createdAt = dateFilter;
        }
      }
      
      // Exclude specific users
      if (criteria.excludedUserIds && criteria.excludedUserIds.length > 0) {
        baseQuery._id = { $nin: criteria.excludedUserIds };
      }
      
      // Exclude users who already have this promotion
      if (excludeExisting) {
        const existingUserIds = await UserPromotion.distinct('userId', {
          promotionId: promotion._id,
          status: 'active'
        });
        
        if (existingUserIds.length > 0) {
          baseQuery._id = baseQuery._id || {};
          if (baseQuery._id.$nin) {
            baseQuery._id.$nin = [...baseQuery._id.$nin, ...existingUserIds];
          } else {
            baseQuery._id.$nin = existingUserIds;
          }
        }
      }
      
      const users = await User.find(baseQuery)
        .select('_id username email createdAt walletAddresses')
        .limit(limit * 2) // Get more users to account for NFT filtering
        .lean();
      
      // Filter users by NFT holdings
      const eligibleUsers = [];
      
      for (const user of users) {
        if (eligibleUsers.length >= limit) break;
        
        try {
          const isEligible = await this.checkNFTEligibility(user, criteria.nftRequirements);
          if (isEligible) {
            eligibleUsers.push(user);
          }
        } catch (error) {
          console.warn(`Error checking NFT eligibility for user ${user._id}:`, error.message);
        }
      }
      
      console.log(`Found ${eligibleUsers.length} NFT holders eligible for promotion ${promotion._id}`);
      
      return eligibleUsers;
    } catch (error) {
      console.error('Error finding NFT holders:', error);
      throw error;
    }
  }

  /**
   * Check if user meets NFT requirements
   */
  async checkNFTEligibility(user, nftRequirements) {
    try {
      // Get user's NFT holdings
      const nftHoldings = await this.getUserNFTHoldings(user);
      
      // Check each NFT requirement
      for (const requirement of nftRequirements) {
        const matchingNFTs = nftHoldings.filter(nft => 
          nft.contractAddress.toLowerCase() === requirement.contractAddress.toLowerCase() &&
          nft.blockchain === requirement.blockchain
        );
        
        // Check minimum token count
        if (matchingNFTs.length < requirement.minTokenCount) {
          return false;
        }
        
        // Check specific token IDs if required
        if (requirement.specificTokenIds && requirement.specificTokenIds.length > 0) {
          const hasRequiredTokens = requirement.specificTokenIds.some(tokenId =>
            matchingNFTs.some(nft => nft.tokenId === tokenId)
          );
          if (!hasRequiredTokens) {
            return false;
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error checking NFT eligibility:', error);
      return false;
    }
  }

  /**
   * Get user's NFT holdings
   */
  async getUserNFTHoldings(user) {
    try {
      // This would integrate with the existing NFT service
      // For now, return empty array as placeholder
      if (this.nftService) {
        return await this.nftService.getUserNFTs(user.walletAddresses);
      }
      
      // Placeholder implementation
      return [];
    } catch (error) {
      console.error('Error getting user NFT holdings:', error);
      return [];
    }
  }

  /**
   * Evaluate user eligibility for a specific promotion
   */
  async evaluateUserEligibility(userId, promotion) {
    try {
      const user = await User.findById(userId).lean();
      if (!user) {
        return { eligible: false, reason: 'User not found' };
      }
      
      const criteria = promotion.targetingCriteria;
      
      // Check excluded users
      if (criteria.excludedUserIds && criteria.excludedUserIds.includes(userId)) {
        return { eligible: false, reason: 'User is excluded from this promotion' };
      }
      
      // Check specific users
      if (criteria.userType === 'specific_users') {
        const isSpecificUser = criteria.specificUserIds && criteria.specificUserIds.includes(userId);
        if (!isSpecificUser) {
          return { eligible: false, reason: 'User is not in the specific users list' };
        }
      }
      
      // Check user type
      if (criteria.userType === 'new_users') {
        const daysSinceRegistration = (Date.now() - user.createdAt) / (1000 * 60 * 60 * 24);
        if (daysSinceRegistration > 30) {
          return { eligible: false, reason: 'User is not a new user (registered more than 30 days ago)' };
        }
      }
      
      if (criteria.userType === 'existing_users') {
        const daysSinceRegistration = (Date.now() - user.createdAt) / (1000 * 60 * 60 * 24);
        if (daysSinceRegistration <= 30) {
          return { eligible: false, reason: 'User is too new (registered within 30 days)' };
        }
      }
      
      // Check registration date range
      if (criteria.userRegistrationDateRange) {
        const userRegDate = user.createdAt;
        if (criteria.userRegistrationDateRange.startDate && userRegDate < criteria.userRegistrationDateRange.startDate) {
          return { eligible: false, reason: 'User registered before the required date range' };
        }
        if (criteria.userRegistrationDateRange.endDate && userRegDate > criteria.userRegistrationDateRange.endDate) {
          return { eligible: false, reason: 'User registered after the required date range' };
        }
      }
      
      // Check NFT requirements
      if (criteria.userType === 'nft_holders' && criteria.nftRequirements && criteria.nftRequirements.length > 0) {
        const hasRequiredNFTs = await this.checkNFTEligibility(user, criteria.nftRequirements);
        if (!hasRequiredNFTs) {
          return { eligible: false, reason: 'User does not meet NFT holding requirements' };
        }
      }
      
      // Check if user already has this promotion
      const existingPromotion = await UserPromotion.findOne({
        userId,
        promotionId: promotion._id,
        status: 'active'
      });
      
      if (existingPromotion) {
        return { eligible: false, reason: 'User already has this promotion assigned' };
      }
      
      // Check max assignments limit
      if (criteria.maxAssignments) {
        const currentAssignments = await UserPromotion.countDocuments({
          promotionId: promotion._id,
          status: 'active'
        });
        
        if (currentAssignments >= criteria.maxAssignments) {
          return { eligible: false, reason: 'Maximum assignments limit reached for this promotion' };
        }
      }
      
      return { eligible: true, reason: 'User meets all eligibility criteria' };
    } catch (error) {
      console.error('Error evaluating user eligibility:', error);
      return { eligible: false, reason: 'Error evaluating eligibility' };
    }
  }

  /**
   * Get targeting analytics for a promotion
   */
  async getTargetingAnalytics(promotion) {
    try {
      const criteria = promotion.targetingCriteria;
      
      // Get total potential users
      const totalUsers = await User.countDocuments();
      
      // Get users matching targeting criteria (without NFT filtering for performance)
      let baseQuery = {};
      
      if (criteria.userType === 'new_users') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        baseQuery.createdAt = { $gte: thirtyDaysAgo };
      } else if (criteria.userType === 'existing_users') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        baseQuery.createdAt = { $lt: thirtyDaysAgo };
      } else if (criteria.userType === 'specific_users') {
        baseQuery._id = { $in: criteria.specificUserIds || [] };
      }
      
      // Apply registration date range
      if (criteria.userRegistrationDateRange) {
        const dateFilter = {};
        if (criteria.userRegistrationDateRange.startDate) {
          dateFilter.$gte = new Date(criteria.userRegistrationDateRange.startDate);
        }
        if (criteria.userRegistrationDateRange.endDate) {
          dateFilter.$lte = new Date(criteria.userRegistrationDateRange.endDate);
        }
        if (Object.keys(dateFilter).length > 0) {
          baseQuery.createdAt = dateFilter;
        }
      }
      
      // Exclude specific users
      if (criteria.excludedUserIds && criteria.excludedUserIds.length > 0) {
        baseQuery._id = baseQuery._id || {};
        if (baseQuery._id.$in) {
          baseQuery._id.$in = baseQuery._id.$in.filter(id => 
            !criteria.excludedUserIds.some(excludedId => 
              excludedId.toString() === id.toString()
            )
          );
        } else {
          baseQuery._id.$nin = criteria.excludedUserIds;
        }
      }
      
      const potentialUsers = await User.countDocuments(baseQuery);
      
      // Get current assignments
      const currentAssignments = await UserPromotion.countDocuments({
        promotionId: promotion._id,
        status: 'active'
      });
      
      // Calculate remaining capacity
      const maxAssignments = criteria.maxAssignments || potentialUsers;
      const remainingCapacity = Math.max(0, maxAssignments - currentAssignments);
      
      return {
        totalUsers,
        potentialUsers,
        currentAssignments,
        maxAssignments: criteria.maxAssignments,
        remainingCapacity,
        targetingEfficiency: totalUsers > 0 ? (potentialUsers / totalUsers) * 100 : 0,
        assignmentRate: potentialUsers > 0 ? (currentAssignments / potentialUsers) * 100 : 0
      };
    } catch (error) {
      console.error('Error getting targeting analytics:', error);
      throw error;
    }
  }

  /**
   * Set NFT service for NFT-related operations
   */
  setNFTService(nftService) {
    this.nftService = nftService;
  }
}

module.exports = UserTargetingService;