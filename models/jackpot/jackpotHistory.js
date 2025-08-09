const mongoose = require("mongoose");
const { Schema } = mongoose;

const jackpotHistorySchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    walletAddress:{ 
        type: Schema.Types.ObjectId,
        ref: "WalletAddress",
        required: true,
        index: true,
    },
    wonAmount: {
        type: Number,
        required: true,
        index: true,
    },
    tokenType: {
        type: String,
        required: true,
        index: true,
    },
    isGiveaway: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model("JackpotHistory", jackpotHistorySchema);
