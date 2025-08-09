const mongoose = require("mongoose");
const { Schema } = mongoose;

const jackpotAccumulationSchema = new Schema({
    activity: {
        type: String,
        enum: [
            "newAccountPoints",
            "newRafflePoints",
            "ticketPurchasePoints",
            "tokenGameCompletedPoints",
            "pointsGameCompletedPoints",
        ],
        unique: true,
    },
    points: {
        type: Number,
        default: 0,
        index: true,
    }
});

const earningActivitySettingsSchema = new Schema({
    activity: {
        type: String,
        enum: [
            "perReserveRaffleCreated",
            "perUnconditionalRaffleCreated",
            "perUnlimitedRaffleCreated",
            "perRaffleSellOut",
            "perUsd10TicketsPurchased",
            "perSystemGamePlayed",
            "perPlayerGamePlayed",
            "perGameWin",
            "perUsd10BetAmount",
            "perNaffBetAmount",
            "perPartnerTokenBetAmount",
            "nafflesTweetPost",
            "perCommunityTicketPurchase",
            "perCommunityGamePlayed",
            "perCommunitySocialTaskCompleted",
            "perCommunityAllowlistEntered",
            "perCommunityProductPurchased"
        ],
        unique: true,
    },
    points: {
        type: Number,
        default: 0,
        index: true,
    }
});

const adminSettingsSchema = new Schema({
    canCreateRaffle: {
        type: String,
        enum: ["everyone", "foundersKeyHoldersOnly", "foundersKeyHoldersAndTokenStakers"]
    },
    raffleTokenCountRequired: {
        type: Number,
        default: 2000,
    },
    raffleFeePercentage: {
        type: Number,
        default: 3,
    },
    wageringFeePercentage: {
        type: Number,
        default: 3,
    },
    allowSellersReserveRaffles: {
        type: Boolean,
        default: true,
    },
    salesRoyalties: {
        type: Boolean,
        default: true,
    },
    openEntryExchangeRate: {
        type: Number,
    },
    pointsEarningActivities: [{
        type: Schema.Types.ObjectId,
        ref: "PointsEarningActivitiesSettings",
        index: true,
    }],
    jackpotAccumulation: [{
        type: Schema.Types.ObjectId,
        ref: "JackpotAccumulationSettings",
        index: true,
    }],
    jackpotPointsPerTenSeconds: {
        type: Number,
    },
    maximumDailyPoints: {
        type: Number,
    },
    machineCreatedGamesBetValue: [{
        tokenType: {
            type: String,
            unique: true,
        },
        amount: {
            type: String,
            index: true,
        }
    }],
    homepageFeaturedRaffles: [{
        type: String,
        default: null
    }],
    uploadableContent: {
        type: Schema.Types.ObjectId,
        ref: "UploadableContentSettings",
        index: true,
    },
    activateBlockpass: {
        type: Boolean,
        default: false
    },
    // Geo-blocking settings
    blockedCountries: [{
        type: String,
        index: true
    }],
    geoBlockingEnabled: {
        type: Boolean,
        default: false
    },
    // KYC settings
    kycRequired: {
        type: Boolean,
        default: false
    },
    kycProvider: {
        type: String,
        enum: ['none', 'blockpass', 'jumio', 'onfido'],
        default: 'none'
    },
    kycThreshold: {
        type: Number,
        default: 1000
    },
});

const JackpotAccumulationSettings = mongoose.model("JackpotAccumulationSettings", jackpotAccumulationSchema);
const PointsEarningActivitiesSettings = mongoose.model("PointsEarningActivitiesSettings", earningActivitySettingsSchema);
const AdminSettings = mongoose.model("AdminSettings", adminSettingsSchema);

module.exports = {
    JackpotAccumulationSettings,
    PointsEarningActivitiesSettings,
    AdminSettings
};