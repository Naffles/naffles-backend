const mongoose = require("mongoose");
const Message = require("../../models/chat/message");
const User = require("../../models/user/user");
const WalletBalance = require("../../models/user/walletBalance");

// Reusable authentication check function
async function isUserHasEnoughBalance(userId, coinType, amountToCheck) {
  coinType = coinType.toLowerCase();
  const amountToCheckBigInt = BigInt(amountToCheck.toString());
  if (coinType == "points") {
    const user = await User.findById(userId);
    if (!user) {
      console.log("no user found");
      return null;
    }
    const userBalanceBigInt = BigInt(user['temporaryPoints'] || 0);
    if (amountToCheckBigInt > userBalanceBigInt) {
      console.error("user does not have enough token");
      return false;
    }
  } else {
    const wallet = await WalletBalance.findOne({
      userRef: mongoose.Types.ObjectId(userId),
    });
    if (!wallet) {
      console.log("no wallet account");
      return false;
    }
    const accountBalance = BigInt(wallet?.balances?.get(coinType) || 0);
    if (amountToCheckBigInt > accountBalance) {
      console.error("user does not have enough token");
      return false;
    }
  }
  return true;
}

function calculateChallengerBuyInAmount(odds, amount) {
  const numericalOdds = BigInt(odds.toString());
  const numericalAmount = BigInt(amount.toString());
  // Calculate the challenger's buy-in amount
  const challengerBuyInAmount = numericalAmount / numericalOdds;
  return challengerBuyInAmount;
}

async function saveGlobalChatMessage(data) {
  try {
    const newMessage = new Message(data);
    return (await newMessage.save())._id;
  } catch (error) {
    console.error("Error saving message: ", error);
  }
}

async function removeLastMessage() {
  try {
    // Ensure only the last 50 messages are kept
    const messageCount = await Message.countDocuments();
    if (messageCount > 50) {
      const oldestMessage = await Message.findOne().sort({ timestamp: 1 });
      await oldestMessage.remove();
    }
  } catch (error) {
    console.error("Error removing last message on global chat", error);
  }
}

module.exports = {
  isUserHasEnoughBalance,
  calculateChallengerBuyInAmount,
  saveGlobalChatMessage,
  removeLastMessage
}

