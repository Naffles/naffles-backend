const mongoose = require("mongoose");
const { Schema } = mongoose;
const { VALID_GAMES } = require("../../config/config");

const playerQueueSchema = new Schema(
  {
    playerId: {
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
    tokenType: {
      type: String,
      required: true,
      index: true,
    },
    betAmount: {
      type: String,
      required: true,
    },
    queuePosition: {
      type: Number,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["waiting", "matched", "expired", "cancelled"],
      default: "waiting",
      index: true,
    },
    gameSessionId: {
      type: Schema.Types.ObjectId,
      ref: "GameSession",
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from creation
      index: true,
    },
    notificationSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Compound indexes for efficient querying
playerQueueSchema.index({ gameType: 1, tokenType: 1, status: 1, queuePosition: 1 });
playerQueueSchema.index({ playerId: 1, status: 1 });
playerQueueSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to get next queue position
playerQueueSchema.statics.getNextQueuePosition = async function(gameType, tokenType) {
  const lastInQueue = await this.findOne({
    gameType,
    tokenType,
    status: "waiting"
  }).sort({ queuePosition: -1 });
  
  return lastInQueue ? lastInQueue.queuePosition + 1 : 1;
};

// Method to check if queue entry is expired
playerQueueSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

// Method to match with a game session
playerQueueSchema.methods.matchWithSession = function(gameSessionId) {
  this.status = "matched";
  this.gameSessionId = gameSessionId;
};

// Method to cancel queue entry
playerQueueSchema.methods.cancel = function() {
  this.status = "cancelled";
};

module.exports = mongoose.model("PlayerQueue", playerQueueSchema);