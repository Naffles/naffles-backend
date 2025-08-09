const mongoose = require("mongoose");
const { Schema } = mongoose;

const userDepositAndWithdrawHistorySchema = new Schema({
  userRef: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    // unique: true,
    index: true,
  },
  actionId: { // deposit and/or withdraw ids for reference
    type: Schema.Types.ObjectId,
  },
  totalDepositedAmount: {
    type: Map,
    of: String,
    default: {},
  },
  totalWithdrawnAmount: {
    type: Map,
    of: String,
    default: {},
  },
}, { timestamps: true });

module.exports = mongoose.model(
  "UserDepositAndWithdrawHistory",
  userDepositAndWithdrawHistorySchema
);
