const mongoose = require("mongoose");
const { userRoles } = require("../../config/config");
const { updateTemporaryPointsAsNumberUser, updateUserStatsTemporaryPointsAsNumberUser } = require("../../middleware/schemaPreSave");
const { Schema } = mongoose;

// Founders Key schema for embedded documents
const foundersKeySchema = new Schema({
  tokenId: {
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
  tier: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  stakingPeriod: {
    startDate: Date,
    endDate: Date,
    duration: Number, // in days
    isActive: {
      type: Boolean,
      default: false
    }
  },
  benefits: {
    feeDiscount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    priorityAccess: {
      type: Boolean,
      default: false
    },
    openEntryTickets: {
      type: Number,
      default: 0
    }
  }
}, { _id: false });

// Profile data schema
const profileDataSchema = new Schema({
  displayName: {
    type: String,
    trim: true,
    maxlength: 100
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 500
  },
  location: {
    type: String,
    trim: true,
    maxlength: 100
  },
  website: {
    type: String,
    trim: true,
    maxlength: 200
  },
  preferences: {
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      marketing: {
        type: Boolean,
        default: false
      }
    },
    privacy: {
      showProfile: {
        type: Boolean,
        default: true
      },
      showActivity: {
        type: Boolean,
        default: true
      }
    }
  }
}, { _id: false });

const userSchema = new Schema(
  {
    temporaryPoints: {
      type: String,
      default: 0,
    },
    temporaryPointsAsNumber: {
      type: Number,
      default: 0,
    },
    profileImage: {
      type: String,
      default: "",
    },
    username: {
      type: String,
      required: [true, "user must have a username"],
      unique: true,
      index: true,
      lowercase: true,
      trim: true
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      enum: userRoles,
      default: 'user',
      required: true
    },
    // Enhanced profile data
    profileData: {
      type: profileDataSchema,
      default: () => ({})
    },
    // Founders Keys tracking
    foundersKeys: [foundersKeySchema],
    // User tier based on keys and activity
    tier: {
      type: String,
      enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
      default: 'bronze'
    },
    // Authentication method tracking
    authMethods: {
      wallet: {
        type: Boolean,
        default: false
      },
      email: {
        type: Boolean,
        default: false
      }
    },
    // Primary wallet address (for quick access)
    primaryWallet: {
      address: String,
      walletType: {
        type: String,
        enum: ["phantom", "metamask"]
      },
      chainId: String
    },
    // Account status and security
    isVerified: {
      type: Boolean,
      default: false
    },
    isBlocked: {
      type: Boolean,
      default: false
    },
    blockReason: String,
    // Session tracking
    lastLoginAt: Date,
    lastActiveAt: Date,
    loginCount: {
      type: Number,
      default: 0
    },
    // Geolocation for compliance
    geolocation: {
      country: String,
      region: String,
      city: String,
      isBlocked: {
        type: Boolean,
        default: false
      }
    },
    socials: {
      twitter: {
        username: {
          type: String,
          trim: true,
          min: 1,
          max: 50,
        }
      },
      telegram: {
        id: {
          type: String,
          trim: true,
          min: 1,
          max: 100
        },
        username: {
          type: String,
          trim: true,
          min: 1,
          max: 50,
        },
        name: {
          type: String,
          trim: true,
          min: 1,
          max: 100,
        }
      },
      discord: {
        id: {
          type: String,
          trim: true,
          min: 1,
          max: 100
        },
        username: {
          type: String,
          trim: true,
          min: 1,
          max: 50,
        },
        name: {
          type: String,
          trim: true,
          min: 1,
          max: 100,
        }
      },
    }
  },
  { timestamps: true }
);

// Create a text index on username and email fields
userSchema.index({ username: 'text', email: 'text' });
// Create a number index on points
userSchema.index({ temporaryPointsAsNumber: -1 });
// Create a descending index on createdAt for efficient sorting
userSchema.index({ createdAt: -1 });
// Index for primary wallet address lookup
userSchema.index({ 'primaryWallet.address': 1 });
// Index for tier-based queries
userSchema.index({ tier: 1 });
// Index for blocked users
userSchema.index({ isBlocked: 1 });
// Index for last activity tracking
userSchema.index({ lastActiveAt: -1 });

// Instance methods
userSchema.methods.updateLastActivity = function() {
  this.lastActiveAt = new Date();
  return this.save();
};

userSchema.methods.incrementLoginCount = function() {
  this.loginCount += 1;
  this.lastLoginAt = new Date();
  return this.save();
};

userSchema.methods.calculateTier = function() {
  const keyCount = this.foundersKeys.length;
  const highestKeyTier = this.foundersKeys.reduce((max, key) => Math.max(max, key.tier), 0);
  
  if (highestKeyTier >= 5 || keyCount >= 5) return 'diamond';
  if (highestKeyTier >= 4 || keyCount >= 3) return 'platinum';
  if (highestKeyTier >= 3 || keyCount >= 2) return 'gold';
  if (highestKeyTier >= 2 || keyCount >= 1) return 'silver';
  return 'bronze';
};

userSchema.methods.getFoundersKeyBenefits = function() {
  return this.foundersKeys.reduce((benefits, key) => {
    benefits.feeDiscount = Math.max(benefits.feeDiscount, key.benefits.feeDiscount);
    benefits.priorityAccess = benefits.priorityAccess || key.benefits.priorityAccess;
    benefits.openEntryTickets += key.benefits.openEntryTickets;
    return benefits;
  }, { feeDiscount: 0, priorityAccess: false, openEntryTickets: 0 });
};

userSchema.methods.hasFoundersKey = function() {
  return this.foundersKeys.length > 0;
};

userSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Static methods
userSchema.statics.findByWalletAddress = function(address) {
  return this.findOne({ 'primaryWallet.address': address });
};

userSchema.statics.findActiveUsers = function(days = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  return this.find({ lastActiveAt: { $gte: cutoffDate } });
};

// Pre-save middleware to update tier
userSchema.pre('save', function(next) {
  if (this.isModified('foundersKeys')) {
    this.tier = this.calculateTier();
  }
  next();
});

updateTemporaryPointsAsNumberUser(userSchema);
updateUserStatsTemporaryPointsAsNumberUser(userSchema);

module.exports = mongoose.model("User", userSchema);
