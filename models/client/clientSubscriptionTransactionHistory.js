const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const clientSubscriptionTransactionHistorySchema = new Schema({
  clientProfileRef: {
    type: Schema.Types.ObjectId,
    ref: "ClientProfile",
    required: true,
    index: true,
  },
  days: {
    type: Number,
    default: 0,
    required: true,
  },
  fee: {
    feeInUsd: {
      type: Number,
      default: 0,
    },
    feeInCrypto: {
      type: String,
      default: '0',
      trim: true,
      lowercase: true,
    },
    feeInNafflings: {
      type: Number,
      default: 0,
    }
  },
  coinType: {
    type: String,
    trim: true,
    lowercase: true
  }
}, { timestamps: true });

module.exports = mongoose.model("ClientSubscriptionTransactionHistory", clientSubscriptionTransactionHistorySchema);
