const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const treasuryWalletSchema = new Schema({
  chainId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  address: {
    type: String,
    required: true,
    index: true
  },
  chainName: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  // Security and audit fields
  encryptedPrivateKey: {
    type: String,
    select: false // Never include in queries by default
  },
  keyDerivationSalt: {
    type: String,
    select: false
  },
  // Configuration metadata
  configuration: {
    rpcEndpoints: [String],
    explorerUrl: String,
    gasSettings: {
      gasLimit: Number,
      maxFeePerGas: String,
      maxPriorityFeePerGas: String
    },
    tokenContracts: [{
      symbol: String,
      address: String,
      decimals: Number,
      isNative: Boolean
    }]
  },
  // Audit trail
  auditLog: [{
    action: {
      type: String,
      enum: ['created', 'updated', 'activated', 'deactivated', 'key_rotated', 'address_changed'],
      required: true
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: {
      type: Map,
      of: String
    },
    ipAddress: String,
    userAgent: String,
    mfaVerified: {
      type: Boolean,
      default: false
    }
  }],
  // Health monitoring
  healthStatus: {
    lastChecked: Date,
    status: {
      type: String,
      enum: ['healthy', 'warning', 'critical'],
      default: 'healthy'
    },
    issues: [String],
    balance: {
      lastUpdated: Date,
      nativeBalance: String,
      tokenBalances: [{
        symbol: String,
        balance: String,
        usdValue: Number
      }]
    }
  },
  // MFA settings for this wallet
  mfaSettings: {
    required: {
      type: Boolean,
      default: true
    },
    methods: [{
      type: String,
      enum: ['email', 'totp', 'sms']
    }],
    lastMfaVerification: Date
  }
}, { 
  timestamps: true,
  // Enable versioning for audit purposes
  versionKey: 'version'
});

// Indexes for efficient queries
treasuryWalletSchema.index({ chainId: 1, isActive: 1 });
treasuryWalletSchema.index({ address: 1 });
treasuryWalletSchema.index({ 'healthStatus.status': 1 });
treasuryWalletSchema.index({ 'auditLog.timestamp': -1 });

// Instance methods
treasuryWalletSchema.methods.addAuditEntry = function(action, adminId, details = {}, ipAddress = '', userAgent = '', mfaVerified = false) {
  this.auditLog.push({
    action,
    adminId,
    details: new Map(Object.entries(details)),
    ipAddress,
    userAgent,
    mfaVerified,
    timestamp: new Date()
  });
  return this.save();
};

treasuryWalletSchema.methods.updateHealthStatus = function(status, issues = []) {
  this.healthStatus.lastChecked = new Date();
  this.healthStatus.status = status;
  this.healthStatus.issues = issues;
  return this.save();
};

treasuryWalletSchema.methods.updateBalance = function(nativeBalance, tokenBalances = []) {
  this.healthStatus.balance = {
    lastUpdated: new Date(),
    nativeBalance,
    tokenBalances
  };
  return this.save();
};

treasuryWalletSchema.methods.verifyMfa = function() {
  this.mfaSettings.lastMfaVerification = new Date();
  return this.save();
};

treasuryWalletSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  delete obj.encryptedPrivateKey;
  delete obj.keyDerivationSalt;
  return obj;
};

// Static methods
treasuryWalletSchema.statics.findActiveWallets = function() {
  return this.find({ isActive: true }).select('-encryptedPrivateKey -keyDerivationSalt');
};

treasuryWalletSchema.statics.findByChain = function(chainId) {
  return this.findOne({ chainId, isActive: true }).select('-encryptedPrivateKey -keyDerivationSalt');
};

treasuryWalletSchema.statics.getHealthSummary = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    { $group: {
      _id: '$healthStatus.status',
      count: { $sum: 1 },
      chains: { $push: '$chainId' }
    }}
  ]);
};

// Pre-save middleware for validation
treasuryWalletSchema.pre('save', function(next) {
  // Validate address format based on chain
  if (this.isModified('address')) {
    const isValidAddress = this.validateAddressFormat();
    if (!isValidAddress) {
      return next(new Error(`Invalid address format for chain ${this.chainId}`));
    }
  }
  next();
});

// Address validation method
treasuryWalletSchema.methods.validateAddressFormat = function() {
  try {
    if (this.chainId === 'solana-mainnet') {
      // Solana address validation (base58, 32-44 characters)
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(this.address);
    } else {
      // Ethereum-based address validation (0x + 40 hex characters)
      return /^0x[a-fA-F0-9]{40}$/.test(this.address);
    }
  } catch {
    return false;
  }
};

// Virtual for getting recent audit entries
treasuryWalletSchema.virtual('recentAuditEntries').get(function() {
  return this.auditLog
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);
});

module.exports = mongoose.model("TreasuryWallet", treasuryWalletSchema);