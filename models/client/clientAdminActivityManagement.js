const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// for Manage tab
const clientAdminActivityManagementSchema = new Schema({
  clientProfileRef: {
    type: Schema.Types.ObjectId,
    ref: "ClientProfile",
    required: true,
    index: true,
  },
  adminRef: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  itemType: {
    type: String,
    lowercase: true,
    trim: true,
    enum: ['twitter-task', 'telegram-task', 'discord-task', 'token-raffle', 'nft-raffle', 'allowlist-raffle', 'shop-item'],
    required: true,
    index: true
  },
  eventId: {
    type: Schema.Types.ObjectId, // Reference to the actual task/raffle/etc.
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'canceled'],
    default: 'active',
    index: true,
  },
  details: {
    type: String,
    trim: true,
  },
  startDate: {
    type: Date,
    index: true,
    sparse: true,
  },
  endDate: {
    type: Date,
    index: true,
    sparse: true,
  }
}, { timestamps: true });

module.exports = mongoose.model("ClientAdminActivityManagement", clientAdminActivityManagementSchema);
