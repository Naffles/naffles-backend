const mongoose = require("mongoose");
const { Schema } = mongoose;

const foundersKeyContractSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  contractAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  chainId: {
    type: String,
    required: true,
    enum: ["1", "ethereum", "solana", "polygon", "base"]
  },
  network: {
    type: String,
    required: true,
    enum: ["ethereum", "solana", "polygon", "base"]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Default tier for keys from this contract
  defaultTier: {
    type: Number,
    default: 1,
    min: 1,
    max: 5
  },
  // Mapping of tokenId to tier (for contracts with variable tiers)
  tierMapping: {
    type: Map,
    of: Number,
    default: new Map()
  },
  // Base benefits for this contract
  baseBenefits: {
    feeDiscount: {
      type: Number,
      default: 5, // 5% base discount
      min: 0,
      max: 25
    },
    priorityAccess: {
      type: Boolean,
      default: false
    },
    openEntryTickets: {
      type: Number,
      default: 1,
      min: 0
    }
  },
  // Contract metadata
  metadata: {
    description: String,
    imageUrl: String,
    externalUrl: String,
    totalSupply: Number,
    createdBy: String
  },
  // Admin configuration
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  lastScanned: Date,
  scanEnabled: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
foundersKeyContractSchema.index({ contractAddress: 1, chainId: 1 }, { unique: true });
foundersKeyContractSchema.index({ isActive: 1 });
foundersKeyContractSchema.index({ network: 1 });

// Instance methods
foundersKeyContractSchema.methods.updateTierMapping = function(tokenId, tier) {
  this.tierMapping.set(tokenId, tier);
  return this.save();
};

foundersKeyContractSchema.methods.getBenefitsForTier = function(tier) {
  const multipliers = {
    1: { feeDiscount: 1, openEntryTickets: 1 },
    2: { feeDiscount: 1.5, openEntryTickets: 2 },
    3: { feeDiscount: 2, openEntryTickets: 3 },
    4: { feeDiscount: 2.5, openEntryTickets: 5 },
    5: { feeDiscount: 3, openEntryTickets: 8 }
  };
  
  const multiplier = multipliers[tier] || multipliers[1];
  
  return {
    feeDiscount: Math.min(this.baseBenefits.feeDiscount * multiplier.feeDiscount, 50),
    priorityAccess: tier >= 2,
    openEntryTickets: this.baseBenefits.openEntryTickets * multiplier.openEntryTickets
  };
};

// Static methods
foundersKeyContractSchema.statics.getActiveContracts = function() {
  return this.find({ isActive: true });
};

foundersKeyContractSchema.statics.getContractsByNetwork = function(network) {
  return this.find({ network, isActive: true });
};

module.exports = mongoose.model("FoundersKeyContract", foundersKeyContractSchema);