const mongoose = require("mongoose");
const { Schema } = mongoose;

const userStatsSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true
    },
    temporaryPointsAsNumber: {
        type: Number,
    },
    gamesPlayed: {
        type: Number,
        required: true,
        default: 0
    },
    gamesWon: {
        type: Number,
        required: true,
        default: 0
    },
    totalWinnings: {
        type: Number,
        required: true,
        default: 0
    },
    totalWinningsAsString: {
        type: String,
        required: true,
        default: "0"
    },
    rafflesEntered: {
        type: Number,
        required: true,
        default: 0
    }
}, { timestamps: true });

userStatsSchema.index({ rafflesEntered: -1 });
userStatsSchema.index({ temporaryPointsAsNumber: -1 });

module.exports = mongoose.model("UserStats", userStatsSchema);