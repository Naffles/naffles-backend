const mongoose = require("mongoose");
const { Schema } = mongoose;

const foundersKeyStakingSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  tokenId: {
    type: String,
    required: true
  },
  contractAddress: {
    type: String,
    required: true,
    lowercase: true
  },
  chainId: {
    type: String,
    required: true
  },
  // Staking configuration
  stakingDuration: {
    type: Number,
    required: true, // Duration in days
    min: 1
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  // Status tracking
  status: {
    type: String,
    enum: ["active", "completed", "cancelled", "expired"],
    default: "active"
  },
  endedAt: Date,
  // Benefits tracking
  originalBenefits: {
    feeDiscount: {
      type: Number,
      default: 0
    },
    priorityAccess: {
      type: Boolean,
      default: false
    },
    openEntryTickets: {
      type: Number,
      default: 0
    }
  },
  stakedBenefits: {
    feeDiscount: {
      type: Number,
      default: 0
    },
    priorityAccess: {
      type: Boolean,
      default: false
    },
    openEntryTickets: {
      type: Number,
      default: 0
    }
  },
  // Reward tracking
  rewardsEarned: {
    openEntryTickets: {
      type: Number,
      default: 0
    },
    bonusPoints: {
      type: Number,
      default: 0
    }
  },
  // Metadata
  stakingReason: {
    type: String,
    enum: ["manual", "auto_renewal", "promotion"],
    default: "manual"
  },
  notes: String
}, {
  timestamps: true
});

// Indexes
foundersKeyStakingSchema.index({ userId: 1, status: 1 });
foundersKeyStakingSchema.index({ tokenId: 1, contractAddress: 1 });
foundersKeyStakingSchema.index({ endDate: 1, status: 1 });
foundersKeyStakingSchema.index({ startDate: 1 });

// Virtual for days remaining
foundersKeyStakingSchema.virtual('daysRemaining').get(function() {
  if (this.status !== 'active') return 0;
  
  const now = new Date();
  const timeDiff = this.endDate.getTime() - now.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  return Math.max(0, daysDiff);
});

// Virtual for progress percentage
foundersKeyStakingSchema.virtual('progressPercentage').get(function() {
  const now = new Date();
  const totalDuration = this.endDate.getTime() - this.startDate.getTime();
  const elapsed = now.getTime() - this.startDate.getTime();
  
  const percentage = (elapsed / totalDuration) * 100;
  return Math.min(100, Math.max(0, percentage));
});

// Instance methods
foundersKeyStakingSchema.methods.isExpired = function() {
  return new Date() > this.endDate && this.status === 'active';
};

foundersKeyStakingSchema.methods.canEndEarly = function() {
  // Allow early ending after 50% of staking period
  const now = new Date();
  const halfwayPoint = new Date(this.startDate.getTime() + 
    (this.endDate.getTime() - this.startDate.getTime()) / 2);
  
  return now >= halfwayPoint && this.status === 'active';
};

foundersKeyStakingSchema.methods.calculateRewards = function() {
  const daysStaked = Math.floor((Date.now() - this.startDate.getTime()) / (1000 * 60 * 60 * 24));
  const stakingMultiplier = this.getStakingMultiplier();
  
  // Calculate rewards based on staking duration and benefits
  const baseTickets = this.originalBenefits.openEntryTickets;
  const bonusTickets = Math.floor((baseTickets * stakingMultiplier - baseTickets) * (daysStaked / this.stakingDuration));
  
  return {
    openEntryTickets: bonusTickets,
    bonusPoints: Math.floor(daysStaked * stakingMultiplier * 10) // 10 points per day with multiplier
  };
};

foundersKeyStakingSchema.methods.getStakingMultiplier = function() {
  if (this.stakingDuration >= 365) return 2.0; // 1 year+
  if (this.stakingDuration >= 180) return 1.5; // 6 months+
  if (this.stakingDuration >= 90) return 1.25; // 3 months+
  if (this.stakingDuration >= 30) return 1.1; // 1 month+
  return 1.0;
};

// Static methods
foundersKeyStakingSchema.statics.getActiveStakingByUser = function(userId) {
  return this.find({ userId, status: 'active' });
};

foundersKeyStakingSchema.statics.getExpiredStaking = function() {
  return this.find({
    status: 'active',
    endDate: { $lt: new Date() }
  });
};

foundersKeyStakingSchema.statics.getStakingStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalDuration: { $sum: "$stakingDuration" },
        avgDuration: { $avg: "$stakingDuration" }
      }
    }
  ]);
};

// Pre-save middleware
foundersKeyStakingSchema.pre('save', function(next) {
  // Auto-expire if past end date
  if (this.status === 'active' && new Date() > this.endDate) {
    this.status = 'expired';
    this.endedAt = new Date();
  }
  
  next();
});

module.exports = mongoose.model("FoundersKeyStaking", foundersKeyStakingSchema);