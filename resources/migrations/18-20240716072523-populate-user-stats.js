const { calculateChallengerBuyInAmount } = require("../../services/socket/helpers");
const { convertToUsd } = require("../../utils/convert");

module.exports = {
  async up(db, client) {
    // Get all documents from the User collection
    const users = await db.collection('users').find({}).toArray();

    // Loop through each user and populate UserStats
    for (const user of users) {
      const temporaryPointsAsNumber = user.temporaryPointsAsNumber;

      // Retrieve existing UserStats if available
      const existingUserStats = await db.collection('userstats').findOne({ user: user._id });
      const existingGamesPlayed = existingUserStats ? existingUserStats.gamesPlayed : null;
      const existingGamesWon = existingUserStats ? existingUserStats.gamesWon : null;

      // Calculate games played and games won if not available in existing UserStats
      const gamesPlayed = existingGamesPlayed !== null ? existingGamesPlayed : await db.collection('gamehistories').countDocuments({
        $or: [{ creator: user._id }, { challenger: user._id }]
      });

      const gamesWonCount = existingGamesWon !== null ? existingGamesWon : await db.collection('gamehistories').countDocuments({
        winner: user._id
      });

      // Calculate total winnings
      let totalWinnings = 0n;
      const frontEndPrecisionAdjustment = BigInt(1000);
      const gamesWon = await db.collection('gamehistories').find({
        winner: user._id
      }).toArray();

      for (const game of gamesWon) {
        const coinType = game.coinType.toLowerCase();
        if (coinType !== 'points') {
          const userRole = getUserRole(game, user._id);
          let amount;
          const payout = game.payout;
          const betAmount = game.betAmount;
          const odds = game.odds;

          if (userRole === 'creator') {
            amount = BigInt(payout) - BigInt(betAmount);
          } else if (userRole === 'challenger') {
            const challengerBuyInAmount = calculateChallengerBuyInAmount(odds, betAmount);
            amount = BigInt(payout) - BigInt(challengerBuyInAmount);
          }
          const amountConverted = await convertToUsd(amount, coinType);
          totalWinnings += BigInt(amountConverted / frontEndPrecisionAdjustment);
        }
      }

      // Calculate raffles entered
      const rafflesEntered = await db.collection('raffletickets').distinct('raffle', { purchasedBy: user._id });
      const rafflesEnteredCount = rafflesEntered.length;

      // Create update object
      let update = {
        user: user._id,
        temporaryPointsAsNumber,
        gamesPlayed,
        gamesWon: gamesWonCount,
        totalWinnings: Number(totalWinnings),
        totalWinningsAsString: totalWinnings.toString(),
        rafflesEntered: rafflesEnteredCount,
      };

      // Insert or update the UserStats document
      await db.collection('userstats').updateOne(
        { user: user._id },
        { $set: update },
        { upsert: true }
      );
    }

    console.log('User stats initialized');
  },

  async down(db, client) {
    // Implement the logic to undo the population if needed
    await db.collection('userstats').deleteMany({});
    console.log('User stats reverted');
  }
};

const getUserRole = (game, userId) => {
  if (game.creator.equals(userId)) {
    return 'creator';
  } else if (game.challenger.equals(userId)) {
    return 'challenger';
  } else {
    return 'unknown';
  }
};
