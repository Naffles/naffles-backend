const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const walletAddressSchema = new Schema({
  userRef: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  address: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true
  },
  walletType: {
    type: String,
    required: true,
    enum: ["phantom", "metamask"]
  },
  chainId: {
    type: String,
    required: true,
    index: true
  },
  isPrimary: {
    type: Boolean,
    default: false,
    index: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  // Track when this wallet was connected
  connectedAt: {
    type: Date,
    default: Date.now
  },
  // Track last time this wallet was used for authentication
  lastUsedAt: Date,
  // Metadata for wallet-specific information
  metadata: {
    label: String, // User-defined label for the wallet
    network: String, // mainnet, testnet, etc.
    balance: String, // Last known balance (for display purposes)
    nftCount: Number // Last known NFT count
  }
}, { timestamps: true });

// Create a descending index on createdAt for efficient sorting
walletAddressSchema.index({ createdAt: -1 });
// Compound index for user and wallet type (one wallet per type per user)
walletAddressSchema.index({ userRef: 1, walletType: 1 });
// Index for primary wallet lookup
walletAddressSchema.index({ userRef: 1, isPrimary: 1 });

// Instance methods
walletAddressSchema.methods.markAsUsed = function() {
  this.lastUsedAt = new Date();
  return this.save();
};

walletAddressSchema.methods.updateMetadata = function(metadata) {
  this.metadata = { ...this.metadata, ...metadata };
  return this.save();
};

// Static methods
walletAddressSchema.statics.findByAddress = function(address) {
  return this.findOne({ address: address.toLowerCase() }).populate('userRef');
};

walletAddressSchema.statics.findPrimaryWallet = function(userId) {
  return this.findOne({ userRef: userId, isPrimary: true });
};

walletAddressSchema.statics.findUserWallets = function(userId) {
  return this.find({ userRef: userId }).sort({ isPrimary: -1, createdAt: -1 });
};

// Pre-save middleware to ensure only one primary wallet per user
walletAddressSchema.pre('save', async function(next) {
  if (this.isPrimary && this.isModified('isPrimary')) {
    // Remove primary status from other wallets of the same user
    await this.constructor.updateMany(
      { userRef: this.userRef, _id: { $ne: this._id } },
      { isPrimary: false }
    );
  }
  next();
});

module.exports = mongoose.model("WalletAddress", walletAddressSchema);
