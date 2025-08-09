const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Main schema to store the multi-step user onboarding process
const airdropSchema = new Schema({
  eventName: {
    type: String,
    default: "airdrop-pre-token-launch",
    required: true,
    index: true
  },
  userRef: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  walletAddress: {
    type: String,
    unique: true,
    index: true,
    sparse: true,
  },
  taskStatus: {
    wallet: {
      type: Boolean,
      default: false,
    },
    connectDiscord: {
      type: Boolean,
      default: false,
    },
    joinNafflesDiscord: {
      type: Boolean,
      default: false,
    },
    connectTelegram: {
      type: Boolean,
      default: false,
    },
    joinNafflesTelegram: {
      type: Boolean,
      default: false,
    },
    connectX: {
      type: Boolean,
      default: false,
    },
    followNafflesOnX: {
      type: Boolean,
      default: false,
    },
    repostNafflesPostOnX: {
      type: Boolean,
      default: false,
    },
  },
  status: {
    type: String,
    default: "pending",
    enum: ['pending', 'completed', 'checking-twitter-task']
  }
}, { timestamps: true });

// Pre-save hook to check if all tasks are completed and update status to "completed"
airdropSchema.pre('save', async function (next) {
  // Check if all tasks in taskStatus are true
  const allTasksCompleted = Object.values(this.taskStatus).every(status => status === true);

  // Update the status to "completed" if all tasks are completed
  if (allTasksCompleted) {
    this.status = 'completed';
    console.log(`Airdrop status set to "completed" for user ${this.userRef}`);
  }

  next();
});

module.exports = mongoose.model("airdrop", airdropSchema);
