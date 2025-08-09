const mongoose = require('mongoose');

const allowlistSchema = new mongoose.Schema({
  // Basic allowlist information
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  
  // Community association
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: false // Can be null for system-wide allowlists
  },
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Entry configuration
  entryPrice: {
    tokenType: {
      type: String,
      required: true,
      enum: ['ETH', 'SOL', 'MATIC', 'USDC', 'USDT', 'BTC', 'points']
    },
    amount: {
      type: String,
      required: true,
      default: '0' // Can be zero for free allowlists
    }
  },
  
  // Winner configuration
  winnerCount: {
    type: mongoose.Schema.Types.Mixed, // Can be number or 'everyone'
    required: true,
    validate: {
      validator: function(v) {
        return v === 'everyone' || (typeof v === 'number' && v >= 1 && v <= 100000);
      },
      message: 'Winner count must be "everyone" or a number between 1 and 100,000'
    }
  },
  
  // Profit guarantee system
  profitGuaranteePercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0 // Percentage of winner ticket sales distributed to losers
  },
  
  // Timing
  duration: {
    type: Number,
    required: true,
    min: 1 // Duration in hours
  },
  endTime: {
    type: Date,
    required: true
  },
  
  // Social task requirements
  socialTasks: [{
    taskId: {
      type: String,
      required: true
    },
    taskType: {
      type: String,
      required: true,
      enum: ['twitter_follow', 'discord_join', 'telegram_join', 'custom']
    },
    required: {
      type: Boolean,
      default: true
    },
    pointsReward: {
      type: Number,
      default: 0
    },
    verificationData: {
      twitter: {
        username: String,
        action: {
          type: String,
          enum: ['follow', 'retweet', 'like']
        },
        targetUrl: String
      },
      discord: {
        serverId: String,
        serverName: String,
        requiredRole: String
      },
      telegram: {
        channelId: String,
        channelName: String,
        action: {
          type: String,
          enum: ['join', 'message']
        }
      },
      custom: {
        title: String,
        description: String,
        verificationUrl: String
      }
    }
  }],
  
  // Access requirements
  accessRequirements: [{
    type: {
      type: String,
      enum: ['nft_ownership', 'token_balance', 'community_member']
    },
    contractAddress: String,
    minimumAmount: String,
    communityId: mongoose.Schema.Types.ObjectId
  }],
  
  // Entry limits
  maxEntries: {
    type: Number,
    default: null // No limit if null
  },
  allowDuplicateWallets: {
    type: Boolean,
    default: false
  },
  
  // Status and completion
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  
  // VRF and winner selection
  vrfRequestId: {
    type: String,
    default: null
  },
  randomness: {
    type: String,
    default: null
  },
  winnerSelectionMethod: {
    type: String,
    enum: ['vrf', 'failsafe'],
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  
  // Statistics
  totalEntries: {
    type: Number,
    default: 0
  },
  totalTicketSales: {
    tokenType: String,
    amount: {
      type: String,
      default: '0'
    }
  },
  
  // Payout tracking
  payoutProcessed: {
    type: Boolean,
    default: false
  },
  payoutSummary: {
    totalRefunds: {
      tokenType: String,
      amount: String
    },
    totalProfitGuarantee: {
      tokenType: String,
      amount: String
    },
    creatorProfit: {
      tokenType: String,
      amount: String
    },
    platformFee: {
      tokenType: String,
      amount: String
    },
    profitPerLoser: {
      tokenType: String,
      amount: String
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
allowlistSchema.index({ communityId: 1, status: 1 });
allowlistSchema.index({ creatorId: 1, status: 1 });
allowlistSchema.index({ endTime: 1, status: 1 });
allowlistSchema.index({ status: 1, createdAt: -1 });

// Virtual for checking if allowlist is live
allowlistSchema.virtual('isLive').get(function() {
  return this.status === 'active' && new Date() < this.endTime;
});

// Method to check if community has reached allowlist limit
allowlistSchema.statics.checkCommunityLimit = async function(communityId) {
  const liveCount = await this.countDocuments({
    communityId: communityId,
    status: 'active',
    endTime: { $gt: new Date() }
  });
  
  return {
    currentLiveAllowlists: liveCount,
    maxLiveAllowlists: 5, // Default limit
    canCreateNew: liveCount < 5
  };
};

// Method to calculate profit guarantee
allowlistSchema.methods.calculateProfitGuarantee = function(winnerCount, loserCount) {
  if (this.profitGuaranteePercentage === 0 || loserCount === 0) {
    return '0';
  }
  
  const ticketPrice = parseFloat(this.entryPrice.amount);
  const totalWinnerSales = winnerCount * ticketPrice;
  const profitGuaranteePool = totalWinnerSales * (this.profitGuaranteePercentage / 100);
  const profitPerLoser = profitGuaranteePool / loserCount;
  
  return profitPerLoser.toString();
};

module.exports = mongoose.model('Allowlist', allowlistSchema);