const mongoose = require('mongoose');

const allowlistConfigurationSchema = new mongoose.Schema({
  // Global allowlist settings
  globallyEnabled: {
    type: Boolean,
    default: true
  },
  
  // Community limits
  maxAllowlistsPerCommunity: {
    type: Number,
    default: 5,
    min: 1,
    max: 50
  },
  
  // Approval requirements
  requiresApproval: {
    type: Boolean,
    default: false
  },
  
  // Community age requirements
  minimumCommunityAge: {
    type: Number,
    default: 0, // days
    min: 0
  },
  
  // Platform fee configuration
  platformFeePercentage: {
    type: Number,
    default: 5, // 5% platform fee on creator profits
    min: 0,
    max: 50
  },
  
  // Restricted communities
  restrictedCommunities: [{
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community'
    },
    reason: String,
    restrictedAt: {
      type: Date,
      default: Date.now
    },
    restrictedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Community-specific overrides
  communityOverrides: [{
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community'
    },
    maxAllowlists: Number,
    restrictionsDisabled: {
      type: Boolean,
      default: false
    },
    customFeePercentage: Number,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Audit trail
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Ensure only one configuration document exists
allowlistConfigurationSchema.index({}, { unique: true });

// Method to get effective settings for a community
allowlistConfigurationSchema.methods.getEffectiveSettings = function(communityId) {
  // Check for community-specific overrides
  const override = this.communityOverrides.find(
    o => o.communityId.toString() === communityId.toString()
  );
  
  // Check if community is restricted
  const isRestricted = this.restrictedCommunities.some(
    r => r.communityId.toString() === communityId.toString()
  );
  
  return {
    enabled: this.globallyEnabled && !isRestricted,
    maxAllowlists: override?.maxAllowlists || this.maxAllowlistsPerCommunity,
    requiresApproval: override?.restrictionsDisabled ? false : this.requiresApproval,
    platformFeePercentage: override?.customFeePercentage || this.platformFeePercentage,
    restrictionsDisabled: override?.restrictionsDisabled || false
  };
};

// Method to check if community can create allowlists
allowlistConfigurationSchema.methods.canCommunityCreateAllowlist = async function(communityId) {
  const settings = this.getEffectiveSettings(communityId);
  
  if (!settings.enabled) {
    return {
      canCreate: false,
      reason: 'Allowlist creation is disabled for this community'
    };
  }
  
  // Check current live allowlists count
  const Allowlist = mongoose.model('Allowlist');
  const liveCount = await Allowlist.countDocuments({
    communityId: communityId,
    status: 'active',
    endTime: { $gt: new Date() }
  });
  
  if (liveCount >= settings.maxAllowlists) {
    return {
      canCreate: false,
      reason: `Community has reached maximum of ${settings.maxAllowlists} live allowlists`
    };
  }
  
  return {
    canCreate: true,
    currentCount: liveCount,
    maxAllowed: settings.maxAllowlists
  };
};

// Static method to get or create default configuration
allowlistConfigurationSchema.statics.getConfiguration = async function() {
  let config = await this.findOne();
  
  if (!config) {
    config = await this.create({
      globallyEnabled: true,
      maxAllowlistsPerCommunity: 5,
      requiresApproval: false,
      minimumCommunityAge: 0,
      platformFeePercentage: 5
    });
  }
  
  return config;
};

// Method to update platform fee
allowlistConfigurationSchema.methods.updatePlatformFee = function(newPercentage, updatedBy) {
  this.platformFeePercentage = newPercentage;
  this.lastUpdated = new Date();
  this.updatedBy = updatedBy;
  return this.save();
};

// Method to disable restrictions for a community
allowlistConfigurationSchema.methods.disableRestrictionsForCommunity = function(communityId, updatedBy) {
  const existingOverride = this.communityOverrides.find(
    o => o.communityId.toString() === communityId.toString()
  );
  
  if (existingOverride) {
    existingOverride.restrictionsDisabled = true;
    existingOverride.updatedBy = updatedBy;
    existingOverride.updatedAt = new Date();
  } else {
    this.communityOverrides.push({
      communityId,
      restrictionsDisabled: true,
      updatedBy,
      updatedAt: new Date()
    });
  }
  
  this.lastUpdated = new Date();
  this.updatedBy = updatedBy;
  return this.save();
};

module.exports = mongoose.model('AllowlistConfiguration', allowlistConfigurationSchema);