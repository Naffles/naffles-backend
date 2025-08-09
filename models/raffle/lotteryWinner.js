const mongoose = require("mongoose");
const { Schema } = mongoose;
const LotteryEventCategory = require("../../utils/enums/lotteryEventCategory");

const lotteryWinnerSchema = new Schema({
    lotteryEventCategory: {
        type: String,
        // JACKPOT, CRYPTO_RAFFLE, NFT_RAFFLE, NAFFLINGS_RAFFLE
        enum: LotteryEventCategory.values(),
        required: true,
        index: true
    },
    eventId: {
        type: String,
        required: true,
        index: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    prizeWon: {
        jackpot: {
            prizePoolType: {
                type: String,
                // Currently, jackpot prize pool is only nafflings for now
                // enum: ["NAFFLINGS", "nafflings"],
            },
            amount: {
                type: String
            }
        },
        crypto: {
            token: {
                type: String,
            }, 
            amount: {
                type: Number,
            }
        },
        nft: {
            type: Schema.Types.ObjectId,
            ref: "NFT",
            index: true
        },
        nafflings: {
            type: String
        }
    }
}, { timestamps: true });

const LotteryWinner = mongoose.model("LotteryWinner", lotteryWinnerSchema);
module.exports = LotteryWinner;
