const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
  // Basic promotion information
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  
  // Promotion type and configuration
  type: {
    type: String,
    required: true,
    enum: ['fee_discount', 'deposit_bonus', 'free_tokens']
  },
  
  // Fee discount configuration
  feeDiscountConfig: {
    discountPercentage: {
      type: Number,
      min: 0,
      max: 100
    },
    applicableFeeTypes: [{
      type: String,
      enum: ['raffle_fee', 'house_fee', 'community_product_fee', 'withdrawal_fee']
    }],
    maxUsageCount: {
      type: Number,
      min: 1
    },
    usageResetPeriod: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'never']
    }
  },
  
  // Deposit bonus configuration
  depositBonusConfig: {
    bonusPercentage: {
      type: Number,
      min: 0,
      max: 200
    },
    maxBonusAmount: {
      type: Number,
      min: 0
    },
    minDepositAmount: {
      type: Number,
      min: 0
    },
    applicableTokens: [{
      tokenContract: String,
      tokenSymbol: String,
      blockchain: String
    }],
    expiryDays: {
      type: Number,
      min: 1,
      max: 365
    },
    withdrawalResetWarning: {
      type: Boolean,
      default: true
    }
  },
  
  // Free tokens configuration
  freeTokensConfig: {
    tokenType: {
      type: String,
      enum: ['open_entry_tickets', 'platform_tokens']
    },
    tokenAmount: {
      type: Number,
      min: 1
    },
    tokenContract: String,
    tokenSymbol: String,
    blockchain: String,
    distributionFrequency: {
      type: String,
      enum: ['one_time', 'daily', 'weekly', 'monthly']
    },
    activityRequirements: [{
      activityType: {
        type: String,
        enum: ['login', 'raffle_participation', 'gaming_activity', 'community_engagement']
      },
      requiredCount: Number,
      timeframe: {
        type: String,
        enum: ['daily', 'weekly', 'monthly']
      }
    }]
  },
  
  // Targeting and eligibility
  targetingCriteria: {
    userType: {
      type: String,
      enum: ['all_users', 'new_users', 'existing_users', 'nft_holders', 'specific_users'],
      default: 'all_users'
    },
    nftRequirements: [{
      contractAddress: String,
      blockchain: String,
      minTokenCount: {
        type: Number,
        default: 1
      },
      specificTokenIds: [String]
    }],
    userRegistrationDateRange: {
      startDate: Date,
      endDate: Date
    },
    excludedUserIds: [mongoose.Schema.Types.ObjectId],
    specificUserIds: [mongoose.Schema.Types.ObjectId],
    maxAssignments: Number
  },
  
  // Promotion status and timing
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'expired', 'cancelled'],
    default: 'draft'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  
  // Usage tracking and analytics
  totalAssignments: {
    type: Number,
    default: 0
  },
  totalUsages: {
    type: Number,
    default: 0
  },
  totalSavings: {
    type: Number,
    default: 0
  },
  totalBonusAwarded: {
    type: Number,
    default: 0
  },
  
  // Priority for best promotion selection
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  
  // Admin information
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Fraud prevention
  fraudPreventionConfig: {
    maxUsagePerUser: {
      type: Number,
      default: 1
    },
    cooldownPeriod: {
      type: Number, // hours
      default: 24
    },
    requiresManualApproval: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
promotionSchema.index({ status: 1, startDate: 1, endDate: 1 });
promotionSchema.index({ type: 1, status: 1 });
promotionSchema.index({ 'targetingCriteria.userType': 1 });
promotionSchema.index({ priority: -1, startDate: 1 });
promotionSchema.index({ createdBy: 1 });

// Virtual for checking if promotion is currently active
promotionSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.status === 'active' && 
         this.startDate <= now && 
         this.endDate >= now;
});

// Method to check if user is eligible for this promotion
promotionSchema.methods.isUserEligible = function(user, nftHoldings = []) {
  const criteria = this.targetingCriteria;
  
  // Check excluded users
  if (criteria.excludedUserIds && criteria.excludedUserIds.includes(user._id)) {
    return false;
  }
  
  // Check specific users
  if (criteria.userType === 'specific_users') {
    return criteria.specificUserIds && criteria.specificUserIds.includes(user._id);
  }
  
  // Check user type
  if (criteria.userType === 'new_users') {
    const daysSinceRegistration = (Date.now() - user.createdAt) / (1000 * 60 * 60 * 24);
    if (daysSinceRegistration > 30) return false; // New user = registered within 30 days
  }
  
  // Check registration date range
  if (criteria.userRegistrationDateRange) {
    const userRegDate = user.createdAt;
    if (criteria.userRegistrationDateRange.startDate && userRegDate < criteria.userRegistrationDateRange.startDate) {
      return false;
    }
    if (criteria.userRegistrationDateRange.endDate && userRegDate > criteria.userRegistrationDateRange.endDate) {
      return false;
    }
  }
  
  // Check NFT requirements
  if (criteria.userType === 'nft_holders' && criteria.nftRequirements && criteria.nftRequirements.length > 0) {
    for (const nftReq of criteria.nftRequirements) {
      const matchingNFTs = nftHoldings.filter(nft => 
        nft.contractAddress.toLowerCase() === nftReq.contractAddress.toLowerCase() &&
        nft.blockchain === nftReq.blockchain
      );
      
      if (matchingNFTs.length < nftReq.minTokenCount) {
        return false;
      }
      
      // Check specific token IDs if required
      if (nftReq.specificTokenIds && nftReq.specificTokenIds.length > 0) {
        const hasRequiredTokens = nftReq.specificTokenIds.some(tokenId =>
          matchingNFTs.some(nft => nft.tokenId === tokenId)
        );
        if (!hasRequiredTokens) {
          return false;
        }
      }
    }
  }
  
  return true;
};

// Method to calculate discount amount
promotionSchema.methods.calculateFeeDiscount = function(originalFee, feeType) {
  if (this.type !== 'fee_discount' || !this.feeDiscountConfig) {
    return 0;
  }
  
  const config = this.feeDiscountConfig;
  if (!config.applicableFeeTypes.includes(feeType)) {
    return 0;
  }
  
  return (originalFee * config.discountPercentage) / 100;
};

// Method to calculate bonus amount
promotionSchema.methods.calculateDepositBonus = function(depositAmount, tokenInfo) {
  if (this.type !== 'deposit_bonus' || !this.depositBonusConfig) {
    return 0;
  }
  
  const config = this.depositBonusConfig;
  
  // Check minimum deposit
  if (depositAmount < config.minDepositAmount) {
    return 0;
  }
  
  // Check applicable tokens
  if (config.applicableTokens && config.applicableTokens.length > 0) {
    const isApplicableToken = config.applicableTokens.some(token =>
      token.tokenContract.toLowerCase() === tokenInfo.tokenContract.toLowerCase() &&
      token.blockchain === tokenInfo.blockchain
    );
    if (!isApplicableToken) {
      return 0;
    }
  }
  
  const bonusAmount = (depositAmount * config.bonusPercentage) / 100;
  return Math.min(bonusAmount, config.maxBonusAmount || bonusAmount);
};

promotionSchema.set('toJSON', { virtuals: true });
promotionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Promotion', promotionSchema);