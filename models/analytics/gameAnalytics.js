const mongoose = require("mongoose");
const { Schema } = mongoose;

const gameAnalyticsSchema = new Schema({
  totalGames: {
    type: Number,
    default: 0,
  },
  rockPaperScissorsGames: {
    type: Number,
    default: 0,
  },
  coinTossGames: {
    type: Number,
    default: 0,
  }
});

module.exports = mongoose.model("GameAnalytics", gameAnalyticsSchema);
