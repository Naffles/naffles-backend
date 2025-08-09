const mongoose = require("mongoose");
const { Schema } = mongoose;

const feeSchema = new Schema({
  balances: {
    type: Map,
    of: String,
    default: {},
  },
}, { timestamps: true });

const Fee = mongoose.model("Fee", feeSchema);

const initializeFee = async () => {
  try {
    const fee = await Fee.findOne({});
    if (!fee) {
      const newFee = new Fee({});
      await newFee.save();
      console.log("Fee initialized with default values.");
    } else {
      console.log("Fee already exists.");
    }
  } catch (error) {
    console.error("Error initializing fee:", error);
  }
};

module.exports = { Fee, initializeFee };
