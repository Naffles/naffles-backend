const mongoose = require("mongoose");
const { Schema } = mongoose;
const { VALID_GAMES } = require("../../config/config");

const gameSessionSchema = new Schema(
  {
    playerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    houseSlotId: {
      type: Schema.Types.ObjectId,
      ref: "HouseSlot",
      default: null,
      index: true,
    },
    gameType: {
      type: String,
      enum: VALID_GAMES,
      required: true,
      index: true,
    },
    betAmount: {
      type: String,
      required: true,
    },
    tokenType: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["waiting_for_house", "in_progress", "completed", "cancelled", "expired"],
      default: "waiting_for_house",
      index: true,
    },
    gameState: {
      type: Schema.Types.Mixed,
      default: {},
    },
    auditTrail: [{
      action: String,
      actionData: Schema.Types.Mixed,
      gameStateBefore: Schema.Types.Mixed,
      gameStateAfter: Schema.Types.Mixed,
      timestamp: { type: Date, default: Date.now },
      vrfRequestId: String,
      randomnessUsed: String
    }],
    result: {
      winner: {
        type: String,
        enum: ["player", "house", "draw"],
        default: null,
      },
      playerPayout: {
        type: String,
        default: "0",
      },
      housePayout: {
        type: String,
        default: "0",
      },
      gameData: {
        type: Schema.Types.Mixed,
        default: {},
      },
    },
    vrfRequestId: {
      type: String,
      default: null,
      index: true,
    },
    randomness: {
      type: String,
      default: null,
    },
    isThirdParty: {
      type: Boolean,
      default: false,
      index: true,
    },
    thirdPartyGameId: {
      type: String,
      default: null,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from creation
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound indexes for efficient querying
gameSessionSchema.index({ playerId: 1, status: 1 });
gameSessionSchema.index({ houseSlotId: 1, status: 1 });
gameSessionSchema.index({ gameType: 1, tokenType: 1, status: 1 });
gameSessionSchema.index({ isThirdParty: 1, thirdPartyGameId: 1 });
gameSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Method to check if session is expired
gameSessionSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

// Method to complete the game session
gameSessionSchema.methods.complete = function(result) {
  this.status = "completed";
  this.result = result;
  this.completedAt = new Date();
};

// Method to cancel the game session
gameSessionSchema.methods.cancel = function(reason = "cancelled") {
  this.status = reason;
  this.completedAt = new Date();
};

// Pre-save middleware to handle status changes
gameSessionSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'completed' || this.status === 'cancelled' || this.status === 'expired') {
      this.completedAt = new Date();
    }
  }
  next();
});

module.exports = mongoose.model("GameSession", gameSessionSchema);