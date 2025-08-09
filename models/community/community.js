const mongoose = require('mongoose');

const communitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isNafflesCommunity: {
    type: Boolean,
    default: false
  },
  pointsConfiguration: {
    pointsName: {
      type: String,
      required: true,
      default: 'Community Points'
    },
    pointsSymbol: {
      type: String,
      maxlength: 10
    },
    initialBalance: {
      type: Number,
      default: 0,
      min: 0
    },
    activityPointsMap: {
      type: Map,
      of: Number,
      default: new Map([
        ['raffle_creation', 50],
        ['raffle_ticket_purchase', 1],
        ['gaming_blackjack', 5],
        ['gaming_coin_toss', 3],
        ['gaming_rock_paper_scissors', 3],
        ['gaming_crypto_slots', 8],
        ['community_task', 15],
        ['daily_login', 5]
      ])
    },
    enableAchievements: {
      type: Boolean,
      default: true
    },
    enableLeaderboards: {
      type: Boolean,
      default: true
    },
    customTiers: [{
      name: String,
      threshold: Number,
      color: String
    }]
  },
  features: {
    enableJackpot: {
      type: Boolean,
      default: false // Only true for Naffles community
    },
    enableSystemWideEarning: {
      type: Boolean,
      default: false // Only true for Naffles community
    },
    enableGaming: {
      type: Boolean,
      default: true
    },
    enableRaffles: {
      type: Boolean,
      default: true
    },
    enableMarketplace: {
      type: Boolean,
      default: false
    },
    enableSocialTasks: {
      type: Boolean,
      default: true
    }
  },
  accessRequirements: {
    isPublic: {
      type: Boolean,
      default: true
    },
    nftRequirements: [{
      contractAddress: String,
      chainId: String,
      minTokens: {
        type: Number,
        default: 1
      }
    }],
    discordRoles: [{
      serverId: String,
      roleId: String,
      roleName: String
    }]
  },
  branding: {
    logoUrl: String,
    bannerUrl: String,
    primaryColor: {
      type: String,
      default: '#3B82F6'
    },
    secondaryColor: {
      type: String,
      default: '#1E40AF'
    }
  },
  stats: {
    memberCount: {
      type: Number,
      default: 0
    },
    totalPointsIssued: {
      type: Number,
      default: 0
    },
    totalActivities: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
communitySchema.index({ slug: 1 });
communitySchema.index({ creatorId: 1 });
communitySchema.index({ isNafflesCommunity: 1 });
communitySchema.index({ isActive: 1 });
communitySchema.index({ 'stats.memberCount': -1 });

// Virtual for member count
communitySchema.virtual('members', {
  ref: 'CommunityMember',
  localField: '_id',
  foreignField: 'communityId',
  count: true
});

// Method to check if user can manage community
communitySchema.methods.canUserManage = function(userId, userRole) {
  // Community creator can always manage
  if (this.creatorId.toString() === userId.toString()) {
    return true;
  }
  
  // Naffles administrators can manage any community
  if (userRole === 'naffles_admin' || userRole === 'super_admin') {
    return true;
  }
  
  return false;
};

// Method to get default tier configuration
communitySchema.methods.getTierConfiguration = function() {
  if (this.pointsConfiguration.customTiers && this.pointsConfiguration.customTiers.length > 0) {
    return this.pointsConfiguration.customTiers;
  }
  
  // Default tier configuration
  return [
    { name: 'bronze', threshold: 0, color: '#CD7F32' },
    { name: 'silver', threshold: 1000, color: '#C0C0C0' },
    { name: 'gold', threshold: 5000, color: '#FFD700' },
    { name: 'platinum', threshold: 15000, color: '#E5E4E2' },
    { name: 'diamond', threshold: 50000, color: '#B9F2FF' }
  ];
};

// Static method to create Naffles flagship community
communitySchema.statics.createNafflesCommunity = async function() {
  const existingNaffles = await this.findOne({ isNafflesCommunity: true });
  if (existingNaffles) {
    return existingNaffles;
  }

  const nafflesCommunity = new this({
    name: 'Naffles',
    slug: 'naffles',
    description: 'The flagship Naffles community with enhanced features and system-wide earning opportunities.',
    creatorId: null, // System-created
    isNafflesCommunity: true,
    pointsConfiguration: {
      pointsName: 'Naffles Points',
      pointsSymbol: 'NP',
      initialBalance: 0,
      enableAchievements: true,
      enableLeaderboards: true
    },
    features: {
      enableJackpot: true,
      enableSystemWideEarning: true,
      enableGaming: true,
      enableRaffles: true,
      enableMarketplace: true,
      enableSocialTasks: true
    },
    branding: {
      primaryColor: '#6366F1',
      secondaryColor: '#4F46E5'
    }
  });

  return await nafflesCommunity.save();
};

module.exports = mongoose.model('Community', communitySchema);