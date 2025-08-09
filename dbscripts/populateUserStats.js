const User = require('../models/user/user');
const GameHistory = require('../models/game/gameHistory');
const UserStats = require('../models/analytics/userStats');
const { convertToUsd } = require('../utils/convert');
const { calculateChallengerBuyInAmount } = require('../services/socket/helpers');

const getUserRole = (game, userId) => {
  if (game.creator.equals(userId)) {
    return 'creator';
  } else if (game.challenger.equals(userId)) {
    return 'challenger';
  } else {
    return 'unknown';
  }
};

const populateUserStats = async () => {
  const userStatsCount = await UserStats.countDocuments();
  if (userStatsCount > 0) {
    console.log('user stats already initialized')
    return;
  }

  const users = await User.find();
  for (const user of users) {
    const temporaryPointsAsNumber = user.temporaryPointsAsNumber;

    // games played
    const gamesPlayed = await GameHistory.countDocuments({
      $or: [{ creator: user._id }, { challenger: user._id }]
    });
    const gamesWon = await GameHistory.find({
      winner: user._id
    });

    const gamesWonCount = await GameHistory.countDocuments({
      winner: user._id
    });

    let totalWinnings = 0n;
    const frontEndPrecisionAdjustment = BigInt(1000);
    for (const game of gamesWon) {
      const coinType = game.coinType.toLowerCase();
      if (coinType !== 'points') {
        // Determine if the user is the creator or the challenger
        const userRole = getUserRole(game, user._id);

        var amount;
        const payout = game.payout;
        const betAmount = game.betAmount;
        const odds = game.odds;
        // Perform any additional calculations based on the user's role
        if (userRole === 'creator') {
          amount = BigInt(payout) - BigInt(betAmount);
          // Perform calculations for creator
        } else if (userRole === 'challenger') {
          // Perform calculations for challenger
          const challengerBuyInAmount = calculateChallengerBuyInAmount(odds, betAmount);
          amount = BigInt(payout) - BigInt(challengerBuyInAmount);
        }
        const amountConverted = await convertToUsd(amount, coinType);
        totalWinnings += BigInt(amountConverted / frontEndPrecisionAdjustment);
      }
    }

    let update = {
      temporaryPointsAsNumber,
      gamesPlayed,
      gamesWon: gamesWonCount,
    };
    if (totalWinnings !== 0n) {
      update.totalWinnings = Number(totalWinnings);
      update.totalWinningsAsString = totalWinnings.toString();
    }

    // Update stats for the user
    let userStat = await UserStats.findOneAndUpdate(
      { user: user._id },
      { $set: update },
      { new: true, upsert: true }
    );
    // console.log("update: ", update);
  }
  console.log("user stats initialized");
};

module.exports = populateUserStats;
