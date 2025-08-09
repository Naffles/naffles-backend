const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const walletBalanceSchema = new Schema({
  userRef: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  balances: {
    type: Map,
    of: String,
    default: {},
  },
  fundingBalances: { // balances that waiting to withdraw
    type: Map,
    of: String,
    default: {},
  },
  itemShopBalances: { // balances that the user is currently selling (active)
    type: Map,
    of: String,
    default: {},
  }
}, { timestamps: true });

module.exports = mongoose.model("WalletBalance", walletBalanceSchema);
