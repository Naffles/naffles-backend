const mongoose = require("mongoose");
const { Schema } = mongoose;
const { VALID_GAMES } = require("../../config/config");

const houseSlotSchema = new Schema(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gameType: {
      type: String,
      enum: VALID_GAMES,
      required: true,
      index: true,
    },
    fundAmount: {
      type: String,
      required: true,
    },
    currentFunds: {
      type: String,
      required: true,
    },
    minimumFunds: {
      type: String,
      required: true,
    },
    tokenType: {
      type: String,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    queuePosition: {
      type: Number,
      default: 0,
      index: true,
    },
    gamesPlayed: {
      type: Number,
      default: 0,
    },
    totalWinnings: {
      type: String,
      default: "0",
    },
    totalLosses: {
      type: String,
      default: "0",
    },
    lastUsed: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "insufficient_funds"],
      default: "active",
      index: true,
    },
    // Session-based fields
    roundsPerSession: {
      type: Number,
      default: 20,
      min: 1,
      max: 1000,
    },
    safetyMultiplier: {
      type: Number,
      default: 10,
      min: 1,
      max: 100,
    },
    currentSessionId: {
      type: String,
      default: null,
      index: true,
    },
    sessionRoundsUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    sessionExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    nextHouseSlotQueued: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Compound index for efficient querying
houseSlotSchema.index({ gameType: 1, tokenType: 1, isActive: 1, queuePosition: 1 });
houseSlotSchema.index({ ownerId: 1, gameType: 1, tokenType: 1 });
houseSlotSchema.index({ currentSessionId: 1 });
houseSlotSchema.index({ sessionExpiresAt: 1 });
houseSlotSchema.index({ gameType: 1, tokenType: 1, currentSessionId: 1 });

// Pre-save middleware to calculate minimum funds using session parameters
houseSlotSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('fundAmount') || this.isModified('safetyMultiplier') || this.isModified('roundsPerSession')) {
    // Calculate minimum funds as safetyMultiplier × roundsPerSession × maxPayout
    // This ensures house can handle a full session with safety buffer
    const fundAmountBigInt = BigInt(this.fundAmount);
    const safetyMultiplier = this.safetyMultiplier || 10;
    const roundsPerSession = this.roundsPerSession || 20;
    
    // Estimate max payout per round as fundAmount / (safetyMultiplier * roundsPerSession)
    const maxPayoutPerRound = fundAmountBigInt / BigInt(safetyMultiplier * roundsPerSession);
    this.minimumFunds = (BigInt(safetyMultiplier) * BigInt(roundsPerSession) * maxPayoutPerRound).toString();
    
    if (this.isNew) {
      this.currentFunds = this.fundAmount;
    }
  }
  next();
});

// Method to check if house has sufficient funds for a bet
houseSlotSchema.methods.hasSufficientFunds = function(betAmount) {
  const currentFundsBigInt = BigInt(this.currentFunds);
  const betAmountBigInt = BigInt(betAmount);
  const minimumFundsBigInt = BigInt(this.minimumFunds);
  
  // House needs to have enough funds to cover the bet plus maintain minimum
  return currentFundsBigInt >= (betAmountBigInt + minimumFundsBigInt);
};

// Method to process house win
houseSlotSchema.methods.processWin = function(winAmount) {
  const currentFundsBigInt = BigInt(this.currentFunds);
  const winAmountBigInt = BigInt(winAmount);
  const totalWinningsBigInt = BigInt(this.totalWinnings);
  
  this.currentFunds = (currentFundsBigInt + winAmountBigInt).toString();
  this.totalWinnings = (totalWinningsBigInt + winAmountBigInt).toString();
  this.gamesPlayed += 1;
  this.lastUsed = new Date();
};

// Method to process house loss
houseSlotSchema.methods.processLoss = function(lossAmount) {
  const currentFundsBigInt = BigInt(this.currentFunds);
  const lossAmountBigInt = BigInt(lossAmount);
  const totalLossesBigInt = BigInt(this.totalLosses);
  
  this.currentFunds = (currentFundsBigInt - lossAmountBigInt).toString();
  this.totalLosses = (totalLossesBigInt + lossAmountBigInt).toString();
  this.gamesPlayed += 1;
  this.lastUsed = new Date();
  
  // Check if house still has sufficient funds
  const minimumFundsBigInt = BigInt(this.minimumFunds);
  if (currentFundsBigInt - lossAmountBigInt < minimumFundsBigInt) {
    this.isActive = false;
    this.status = "insufficient_funds";
  }
};

// Method to calculate minimum funding requirement
houseSlotSchema.methods.calculateMinimumFunding = function(maxPayout) {
  const safetyMultiplier = this.safetyMultiplier || 10;
  const roundsPerSession = this.roundsPerSession || 20;
  const maxPayoutBigInt = BigInt(maxPayout);
  
  return (BigInt(safetyMultiplier) * BigInt(roundsPerSession) * maxPayoutBigInt).toString();
};

// Method to reserve house slot for session
houseSlotSchema.methods.reserveForSession = function(sessionId, sessionDurationMinutes = 30) {
  if (this.currentSessionId) {
    throw new Error('House slot is already reserved for another session');
  }
  
  this.currentSessionId = sessionId;
  this.sessionRoundsUsed = 0;
  this.sessionExpiresAt = new Date(Date.now() + sessionDurationMinutes * 60 * 1000);
  this.lastUsed = new Date();
};

// Method to release house slot from session
houseSlotSchema.methods.releaseFromSession = function() {
  this.currentSessionId = null;
  this.sessionRoundsUsed = 0;
  this.sessionExpiresAt = null;
};

// Method to check if session is expired
houseSlotSchema.methods.isSessionExpired = function() {
  if (!this.sessionExpiresAt) return false;
  return new Date() > this.sessionExpiresAt;
};

// Method to check if session is near limit
houseSlotSchema.methods.isSessionNearLimit = function(threshold = 0.8) {
  if (!this.currentSessionId) return false;
  const roundsPerSession = this.roundsPerSession || 20;
  return this.sessionRoundsUsed >= (roundsPerSession * threshold);
};

// Method to increment session rounds
houseSlotSchema.methods.incrementSessionRounds = function() {
  if (this.currentSessionId) {
    this.sessionRoundsUsed += 1;
  }
};

// Method to check if session has remaining rounds
houseSlotSchema.methods.hasRemainingRounds = function() {
  if (!this.currentSessionId) return true;
  const roundsPerSession = this.roundsPerSession || 20;
  return this.sessionRoundsUsed < roundsPerSession;
};

module.exports = mongoose.model("HouseSlot", houseSlotSchema);