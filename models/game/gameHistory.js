const mongoose = require("mongoose");
const { Schema } = mongoose;
const { convertToNum } = require("../../utils/convert");
const { VALID_GAMES } = require("../../config/config");
const User = require("../user/user");
const UserHistory = require("../user/userHistory");

const gameHistorySchema = new Schema(
  {
    creator: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    challenger: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gameType: {
      type: String,
      enum: VALID_GAMES,
      required: true,
      index: true,
    },
    coinType: {
      type: String,
      required: true,
      index: true,
    },
    betAmount: {
      type: String,
      required: true,
    },
    odds: {
      type: String,
      required: true,
    },
    payout: {
      type: String,
      required: true,
    },
    winner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    systemFee: {
      type: String,
    }
  },
  { timestamps: true }
);

// Function to convert game type to a more readable format
function formatGameType(gameType) {
  switch (gameType) {
    case 'rockPaperScissors':
      return 'Rock, Paper, Scissors';
    case 'coinToss':
      return 'Coin Toss';
    default:
      return gameType;
  }
}

// Post-save hook to sync with UserHistory
gameHistorySchema.post('save', async function (doc, next) {
  try {
    const convertedBetAmount = await convertToNum(doc.betAmount, doc.coinType === 'points' ? undefined : doc.coinType);
    const creator = await User.findById(doc.creator);
    const challenger = await User.findById(doc.challenger);

    const creatorStatus = doc.winner && doc.winner.equals(doc.creator) ? 'won' : 'lost';
    const challengerStatus = doc.winner && doc.winner.equals(doc.challenger) ? 'won' : 'lost';

    const coinType = doc.coinType == "points" ? "NAFFLINGS" : doc.coinType.toUpperCase();

    const creatorAmount = `${creatorStatus === 'won' ? '+' : '-'} ${coinType} ${convertedBetAmount}`;
    const challengerAmount = `${challengerStatus === 'won' ? '+' : '-'} ${coinType} ${convertedBetAmount}`;

    const formattedGameType = formatGameType(doc.gameType);

    const userHistories = [
      {
        userRef: doc.creator,
        eventType: 'game',
        eventId: doc._id,
        status: creatorStatus,
        amount: creatorAmount,
        details: `${formattedGameType} v ${challenger.username}`,
        dateCreated: doc.createdAt
      },
      {
        userRef: doc.challenger,
        eventType: 'game',
        eventId: doc._id,
        status: challengerStatus,
        amount: challengerAmount,
        details: `${formattedGameType} v ${creator.username}`,
        dateCreated: doc.createdAt
      },
    ];

    await UserHistory.insertMany(userHistories);
  } catch (error) {
    console.error("Error syncing with userHistory:", error);
  }

  next();
});

module.exports = mongoose.model("GameHistory", gameHistorySchema);
