const mongoose = require("mongoose");
const WalletBalance = require("../models/user/walletBalance");

const createWalletBalance = async (userId) => {
  try {
    const userObjectId = mongoose.Types.ObjectId(userId);
    let walletBalance = await WalletBalance.findOne({ userRef: userObjectId });

    if (!walletBalance) {
      walletBalance = new WalletBalance({ userRef: userObjectId });
      await walletBalance.save();
    }

    return walletBalance;
  } catch (error) {
    console.error("Error creating wallet balance:", error);
    throw error;
  }
};

module.exports = createWalletBalance;
