const mongoose = require("mongoose");

const gameBetLimitsSchema = new mongoose.Schema({
  gameType: {
    type: String,
    required: true,
    enum: ["blackjack", "coinToss", "rockPaperScissors"],
    index: true
  },
  tokenType: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  maxBetAmount: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^\d+(\.\d+)?$/.test(v) && parseFloat(v) > 0;
      },
      message: 'Max bet amount must be a positive number'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, {
  timestamps: true
});

// Compound index to ensure unique game-token combinations
gameBetLimitsSchema.index({ gameType: 1, tokenType: 1 }, { unique: true });

// Static method to get bet limit for a specific game and token
gameBetLimitsSchema.statics.getBetLimit = async function(gameType, tokenType) {
  try {
    const limit = await this.findOne({
      gameType,
      tokenType: tokenType.toLowerCase(),
      isActive: true
    });
    return limit ? limit.maxBetAmount : null;
  } catch (error) {
    console.error('Error getting bet limit:', error);
    throw error;
  }
};

// Static method to set or update bet limit
gameBetLimitsSchema.statics.setBetLimit = async function(gameType, tokenType, maxBetAmount, userId) {
  try {
    const result = await this.findOneAndUpdate(
      {
        gameType,
        tokenType: tokenType.toLowerCase()
      },
      {
        maxBetAmount,
        updatedBy: userId,
        isActive: true
      },
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    );
    return result;
  } catch (error) {
    console.error('Error setting bet limit:', error);
    throw error;
  }
};

// Static method to get all bet limits
gameBetLimitsSchema.statics.getAllBetLimits = async function() {
  try {
    return await this.find({ isActive: true })
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .sort({ gameType: 1, tokenType: 1 });
  } catch (error) {
    console.error('Error getting all bet limits:', error);
    throw error;
  }
};

module.exports = mongoose.model("GameBetLimits", gameBetLimitsSchema);