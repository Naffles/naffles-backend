const mongoose = require("mongoose");
const rafflePrize = require("./rafflePrize");
const { Schema } = mongoose;

const raffleWinnerSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    raffle: {
        type: Schema.Types.ObjectId,
        ref: "Raffle",
        required: true,
        index: true
    },
    eventId: {
        type: String,
    },
    winningTicket: {
        type: Schema.Types.ObjectId,
        ref: "RaffleTicket",
        required: true,
        unique: true,
        index: true
    },
    winningTicketId: {
        type: String,
        unique: true,
    },
    isClaimed: {
        type: Boolean,
        default: false
    },
    rafflePrize: {
        type: Schema.Types.ObjectId,
        ref: "RafflePrize",
        required: true,
        index: true
    }
}, { timestamps: true });

const RaffleWinner = mongoose.model("RaffleWinner", raffleWinnerSchema);
module.exports = RaffleWinner;
