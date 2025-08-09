const mongoose = require("mongoose");
const { VALID_GAMES } = require("../../config/config");
const { Schema } = mongoose;

const activeGameSchema = new Schema(
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
      default: null,
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
      index: true,
    },
    betAmountForFilter: {
      type: Number,
      required: true,
      index: true,
    },
    odds: {
      type: String,
      required: true,
      index: true
    },
    payout: {
      type: String,
      required: true,
    },
    challengerBuyInAmount: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["waiting", "inProgress", "awaitingRematch"],
      default: "waiting",
      index: true,
    },
    draw: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ActiveGame", activeGameSchema);
