const mongoose = require("mongoose");
const { Schema } = mongoose;

const userLogSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    transaction: {
        type: new Schema({
            transactionType: {
                type: String,
                enum: ["deposit", "withdraw", "adminDeposit"],
            },
            amount: {
                type: Number,
            },
            coinType: {
                type: String,
            },
        }),
        default: null,
    },
    raffle: {
        type: Schema.Types.ObjectId,
        ref: "Raffle",
        default: null,
    },
    ticketPurchaseId: {
        type: String,
        default: null,
    },
    game: {
        type: String,
        enum: [null, "rockPaperScissors", "coinToss"],
        default: null,
    },
    challengerName: {
        type: String,
        default: null,
    },
    wonAmount: {
        type: Number,
        default: null,
    },
    lostAmount: {
        type: Number,
        default: null,
    }
}, { timestamps: true });

module.exports = mongoose.model("UserLog", userLogSchema);