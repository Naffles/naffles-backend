const mongoose = require("mongoose");
const { Schema } = mongoose;

const jackpotSchema = new Schema({
    prizePoolType: {
        type: String,
        required: true,
        default: "nafflings"
    },
    totalAmount: {
        type: Number,
        required: true,
        default: 0,
    },
    isGiveaway: {
        type: Boolean,
        required: true,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    lastUpdated: {
        type: Number,
        default: () => Date.now(),
    }
});

const Jackpot = mongoose.model("Jackpot", jackpotSchema);
module.exports = Jackpot;
