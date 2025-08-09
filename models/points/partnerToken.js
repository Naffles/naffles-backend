const mongoose = require('mongoose');

const partnerTokenSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  contractAddress: {
    type: String,
    required: true
  },
  chainId: {
    type: String,
    required: true
  },
  multiplier: {
    type: Number,
    required: true,
    min: 1.0,
    max: 10.0,
    default: 1.5
  },
  isActive: {
    type: Boolean,
    default: true
  },
  partnerInfo: {
    name: { type: String, required: true },
    website: { type: String },
    description: { type: String },
    logo: { type: String }
  },
  bonusActivities: {
    gaming: { type: Boolean, default: true },
    raffleTickets: { type: Boolean, default: true },
    raffleCreation: { type: Boolean, default: false },
    staking: { type: Boolean, default: false }
  },
  minimumAmount: {
    type: Number,
    default: 0
  },
  maxBonusPerDay: {
    type: Number,
    default: null // null means no limit
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date,
    default: null // null means no expiration
  }
}, {
  timestamps: true
});

// Compound index for efficient lookups
partnerTokenSchema.index({ contractAddress: 1, chainId: 1 }, { unique: true });
partnerTokenSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });

// Method to check if token is currently valid
partnerTokenSchema.methods.isCurrentlyValid = function() {
  if (!this.isActive) return false;
  
  const now = new Date();
  if (this.validFrom && now < this.validFrom) return false;
  if (this.validUntil && now > this.validUntil) return false;
  
  return true;
};

// Method to get multiplier for specific activity
partnerTokenSchema.methods.getMultiplierForActivity = function(activity) {
  if (!this.isCurrentlyValid()) return 1.0;
  if (!this.bonusActivities[activity]) return 1.0;
  
  return this.multiplier;
};

// Static method to find partner token by contract and chain
partnerTokenSchema.statics.findByContract = function(contractAddress, chainId) {
  return this.findOne({
    contractAddress: contractAddress.toLowerCase(),
    chainId,
    isActive: true
  });
};

// Static method to get all active partner tokens
partnerTokenSchema.statics.getActiveTokens = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    $or: [
      { validFrom: { $lte: now } },
      { validFrom: null }
    ],
    $or: [
      { validUntil: { $gte: now } },
      { validUntil: null }
    ]
  }).sort({ 'partnerInfo.name': 1 });
};

module.exports = mongoose.model('PartnerToken', partnerTokenSchema);