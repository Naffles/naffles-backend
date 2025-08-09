const mongoose = require("mongoose");
const { VALID_COMMUNITY_TASK } = require("../../../../config/config");
const ClientTask = require("./clientTask");
const Schema = mongoose.Schema;

// Schema for tracking claims separately
const clientMemberClaimedTaskSchema = new Schema({
  taskId: {
    type: Schema.Types.ObjectId,
    ref: "ClientTask",
    required: true,
    index: true,
  },
  taskType: {
    type: String,
    required: true,
    enum: VALID_COMMUNITY_TASK,
    index: true,
  },
  claimedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  status: {
    type: String,
    index: true,
    enum: ['completed', 'pending'],
    default: 'pending'
  },
  pointsClaimed: {
    type: Number,
    default: 0
  },
  task: {
    twitter: {
      validAmountOfFollowers: Boolean,
      like: Boolean,
      retweet: Boolean,
      comment: Boolean,
      status: {
        type: String,
        enum: ['idle', 'checking-in-progress'],
        default: 'idle'
      }
    },
    telegram: {
      joined: Boolean,
      connected: Boolean,
    },
    discord: {
      joined: Boolean,
      connected: Boolean,
    }
  }
}, { timestamps: true });

// Create indexes to optimize queries
clientMemberClaimedTaskSchema.index({ taskId: 1, claimedBy: 1 });

module.exports = mongoose.model("ClientMemberClaimedTask", clientMemberClaimedTaskSchema);
