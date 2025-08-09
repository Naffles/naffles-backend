const mongoose = require("mongoose");
const { Schema }= mongoose;
const { createNewGiveawayPresave } = require("../../middleware/schemaPreSave");


const giveawaySchema = new Schema({
    jackpot: {
        type: Schema.Types.ObjectId,
        ref: "Jackpot",
        required: true,
        index: true
    },
    eventId: {
        type: String,
        unique: true,
    },
    startDate: {
        type: Date,
        required: true,
        default: Date.now()
    },
    endDate: {
        type: Date,
        required: true,
    },
    scheduledDrawDate: {
        type: Date,
        required: true,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
    },
    status: {
        isActive: {
            type: Boolean,
            default: true,
        },
        wonBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        }
    },
    homepageDurationDays: {
        type: Number,
        default: null
    }
});

createNewGiveawayPresave(giveawaySchema);

module.exports = mongoose.model("Giveaway", giveawaySchema);
