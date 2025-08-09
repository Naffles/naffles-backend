const UserStats = require("../models/analytics/userStats");
const { calculateChallengerBuyInAmount } = require("../services/socket/helpers");
const { convertToUsd } = require("./convert");

const getUserRole = (game, userId) => {
  if (game.creator.equals(userId)) {
    return 'creator';
  } else if (game.challenger.equals(userId)) {
    return 'challenger';
  } else {
    return 'unknown';
  }
};

async function updateUserStats(winnerId, loserId, activeGame) {
  try {
    console.log("Updating user stats...");

    // Update stats for the winner if winnerId exists
    if(winnerId) {
      let winner = await UserStats.findOneAndUpdate(
        { user: winnerId },
        { $inc: { gamesPlayed: 1, gamesWon: 1 }, },
        { new: true, upsert: true }
      );

      const frontEndPrecisionAdjustment = BigInt(1000);
      const coinType = activeGame.coinType.toLowerCase();


      if (coinType !== "points") {
        const userRole = getUserRole(activeGame, winnerId);
        var amount;
        const payout = activeGame.payout;
        const betAmount = activeGame.betAmount;
        const odds = activeGame.odds;

        if (userRole === 'creator') {
          amount = BigInt(payout) - BigInt(betAmount);
          // Perform calculations for creator
        } else if (userRole === 'challenger') {
          // Perform calculations for challenger
          const challengerBuyInAmount = calculateChallengerBuyInAmount(odds, betAmount);
          amount = BigInt(payout) - BigInt(challengerBuyInAmount);
        }
        const amountConverted = await convertToUsd(amount, coinType);
        const currentAmount = BigInt(winner.totalWinnings);
        const newWinningsAmount = currentAmount + (amountConverted / frontEndPrecisionAdjustment);
        winner.totalWinnings = Number(newWinningsAmount);
        winner.totalWinningsAsString = newWinningsAmount.toString();
        await winner.save();
        console.log(`totalWinnings=${newWinningsAmount}`);
      }
    }

    // Update stats for the loser if loserId exists
    if(loserId) {
      await UserStats.updateOne(
        { user: loserId },
        { $inc: { gamesPlayed: 1 }, },
        { upsert: true }
      );
    }

    console.log(`UserStats updated for winner ${winnerId} and loser ${loserId}`);
  } catch (error) {
    console.error('Error updating UserStats:', error);
  }
};

module.exports = { updateUserStats };