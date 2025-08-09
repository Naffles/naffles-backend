const mongoose = require("mongoose");
const { VALID_GAMES } = require("../../config/config");
const { Schema } = mongoose;

const nafflingRewardsSchema = new Schema(
  {
    campaign: {
      type: String,
      trim: true,
      lowercase: true,
    },
    rewardedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    points: {
      type: String,
      default: 0,
    },
    address: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("NafflingRewards", nafflingRewardsSchema);
