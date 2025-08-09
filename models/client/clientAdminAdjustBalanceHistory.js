const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const clientAdminAdjustBalanceHistorySchema = new Schema({
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
  event: {
    type: String,
    enum: ['credit', 'debit'],
    trim: true,
    lowercase: true,
    index: true,
  },
  amount: {
    type: Number,
    default: 0,
  },
  userNewBalance: {
    type: Number,
    default: 0,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
}, { timestamps: true });

module.exports = mongoose.model("ClientAdminAdjustBalanceHistory", clientAdminAdjustBalanceHistorySchema);
