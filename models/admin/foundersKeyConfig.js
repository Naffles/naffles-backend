const mongoose = require("mongoose");
const { Schema } = mongoose;

const foundersKeyConfigSchema = new Schema({
  // Tier multipliers for fee discounts and open entry tickets
  tierMultipliers: {
    tier1: {
      feeDiscountMultiplier: {
        type: Number,
        default: 1.0,
        min: 0,
        max: 10
      },
      openEntryTicketsMultiplier: {
        type: Number,
        default: 1,
        min: 0,
        max: 50
      }
    },
    tier2: {
      feeDiscountMultiplier: {
        type: Number,
        default: 1.5,
        min: 0,
        max: 10
      },
      openEntryTicketsMultiplier: {
        type: Number,
        default: 2,
        min: 0,
        max: 50
      }
    },
    tier3: {
      feeDiscountMultiplier: {
        type: Number,
        default: 2.0,
        min: 0,
        max: 10
      },
      openEntryTicketsMultiplier: {
        type: Number,
        default: 3,
        min: 0,
        max: 50
      }
    },
    tier4: {
      feeDiscountMultiplier: {
        type: Number,
        default: 2.5,
        min: 0,
        max: 10
      },
      openEntryTicketsMultiplier: {
        type: Number,
        default: 5,
        min: 0,
        max: 50
      }
    },
    tier5: {
      feeDiscountMultiplier: {
        type: Number,
        default: 3.0,
        min: 0,
        max: 10
      },
      openEntryTicketsMultiplier: {
        type: Number,
        default: 8,
        min: 0,
        max: 50
      }
    }
  },

  // Staking duration multipliers
  stakingMultipliers: {
    duration30Days: {
      multiplier: {
        type: Number,
        default: 1.1,
        min: 1.0,
        max: 5.0
      },
      minDays: {
        type: Number,
        default: 30,
        min: 1
      }
    },
    duration90Days: {
      multiplier: {
        type: Number,
        default: 1.25,
        min: 1.0,
        max: 5.0
      },
      minDays: {
        type: Number,
        default: 90,
        min: 1
      }
    },
    duration180Days: {
      multiplier: {
        type: Number,
        default: 1.5,
        min: 1.0,
        max: 5.0
      },
      minDays: {
        type: Number,
        default: 180,
        min: 1
      }
    },
    duration365Days: {
      multiplier: {
        type: Number,
        default: 2.0,
        min: 1.0,
        max: 5.0
      },
      minDays: {
        type: Number,
        default: 365,
        min: 1
      }
    }
  },

  // Global limits and settings
  globalSettings: {
    maxFeeDiscountPercent: {
      type: Number,
      default: 75,
      min: 0,
      max: 100
    },
    maxFeeDiscountWithoutStaking: {
      type: Number,
      default: 50,
      min: 0,
      max: 100
    },
    priorityAccessMinTier: {
      type: Number,
      default: 2,
      min: 1,
      max: 5
    },
    maxStakingDurationDays: {
      type: Number,
      default: 1095, // 3 years
      min: 30,
      max: 3650
    },
    minStakingDurationDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365
    }
  },

  // System metadata
  lastUpdatedBy: {
    type: Schema.Types.ObjectId,
    ref: "User"
  },
  version: {
    type: Number,
    default: 1
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Ensure only one active configuration exists
foundersKeyConfigSchema.index({ isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

// Instance methods
foundersKeyConfigSchema.methods.getTierMultiplier = function(tier, type) {
  const tierKey = `tier${tier}`;
  const multiplierKey = type === 'feeDiscount' ? 'feeDiscountMultiplier' : 'openEntryTicketsMultiplier';
  
  if (this.tierMultipliers[tierKey] && this.tierMultipliers[tierKey][multiplierKey] !== undefined) {
    return this.tierMultipliers[tierKey][multiplierKey];
  }
  
  // Fallback to tier 1 if not found
  return this.tierMultipliers.tier1[multiplierKey] || (type === 'feeDiscount' ? 1.0 : 1);
};

foundersKeyConfigSchema.methods.getStakingMultiplier = function(stakingDurationDays) {
  const durations = [
    { key: 'duration365Days', minDays: this.stakingMultipliers.duration365Days.minDays },
    { key: 'duration180Days', minDays: this.stakingMultipliers.duration180Days.minDays },
    { key: 'duration90Days', minDays: this.stakingMultipliers.duration90Days.minDays },
    { key: 'duration30Days', minDays: this.stakingMultipliers.duration30Days.minDays }
  ];
  
  for (const duration of durations) {
    if (stakingDurationDays >= duration.minDays) {
      return this.stakingMultipliers[duration.key].multiplier;
    }
  }
  
  return 1.0; // No multiplier for less than minimum duration
};

foundersKeyConfigSchema.methods.calculateBenefits = function(baseBenefits, tier, stakingDurationDays = 0) {
  const feeDiscountMultiplier = this.getTierMultiplier(tier, 'feeDiscount');
  const ticketsMultiplier = this.getTierMultiplier(tier, 'openEntryTickets');
  const stakingMultiplier = stakingDurationDays > 0 ? this.getStakingMultiplier(stakingDurationDays) : 1.0;
  
  const calculatedFeeDiscount = baseBenefits.feeDiscount * feeDiscountMultiplier * stakingMultiplier;
  const maxDiscount = stakingDurationDays > 0 ? 
    this.globalSettings.maxFeeDiscountPercent : 
    this.globalSettings.maxFeeDiscountWithoutStaking;
  
  return {
    feeDiscount: Math.min(calculatedFeeDiscount, maxDiscount),
    priorityAccess: tier >= this.globalSettings.priorityAccessMinTier,
    openEntryTickets: Math.floor(baseBenefits.openEntryTickets * ticketsMultiplier * stakingMultiplier)
  };
};

// Static methods
foundersKeyConfigSchema.statics.getActiveConfig = async function() {
  let config = await this.findOne({ isActive: true });
  
  if (!config) {
    // Create default configuration if none exists
    config = new this({
      isActive: true
    });
    await config.save();
  }
  
  return config;
};

foundersKeyConfigSchema.statics.updateConfig = async function(updates, updatedBy) {
  const config = await this.getActiveConfig();
  
  // Update the configuration
  Object.keys(updates).forEach(key => {
    if (config[key] !== undefined) {
      if (typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
        config[key] = { ...config[key], ...updates[key] };
      } else {
        config[key] = updates[key];
      }
    }
  });
  
  config.lastUpdatedBy = updatedBy;
  config.version += 1;
  
  await config.save();
  return config;
};

// Pre-save validation
foundersKeyConfigSchema.pre('save', function(next) {
  // Validate that staking durations are in ascending order
  const durations = [
    this.stakingMultipliers.duration30Days.minDays,
    this.stakingMultipliers.duration90Days.minDays,
    this.stakingMultipliers.duration180Days.minDays,
    this.stakingMultipliers.duration365Days.minDays
  ];
  
  for (let i = 1; i < durations.length; i++) {
    if (durations[i] <= durations[i-1]) {
      return next(new Error('Staking duration thresholds must be in ascending order'));
    }
  }
  
  // Validate that multipliers are in ascending order
  const multipliers = [
    this.stakingMultipliers.duration30Days.multiplier,
    this.stakingMultipliers.duration90Days.multiplier,
    this.stakingMultipliers.duration180Days.multiplier,
    this.stakingMultipliers.duration365Days.multiplier
  ];
  
  for (let i = 1; i < multipliers.length; i++) {
    if (multipliers[i] < multipliers[i-1]) {
      return next(new Error('Staking multipliers should generally increase with duration'));
    }
  }
  
  next();
});

module.exports = mongoose.model("FoundersKeyConfig", foundersKeyConfigSchema);