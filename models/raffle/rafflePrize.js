const mongoose = require("mongoose");
const { LOTTERY_TYPES } = require("../../config/config");
const { Schema } = mongoose;


const rafflePrizeSchema = new Schema({
    raffle: { 
        type: Schema.Types.ObjectId,
        ref: "Raffle",
        required: true,
        index: true
    },
    nafflings: {
        type: String
    },
    // If lotteryType is TOKEN
    tokenPrize: {
        token: {
            type: String
        },
        amount: {
            type: String
        },
        chainId: {
            type: String
        },
        decimals: {
            type: Number
        },
        symbol: {
            type: String
        },
        validated: {
            type: Boolean,
            default: false
        }
    },
    // if lotteryType is NFT 
    nftPrize: {
        contractAddress: {
            type: String,
        },
        tokenId: {
            type: String,
        },
        chainId: {
            type: String,
        },
        collection: {
            type: String,
        },
        floorPrice: {
            type: String,
        },
        metadata: {
            name: String,
            description: String,
            image: String,
            attributes: [{
                trait_type: String,
                value: String
            }]
        },
        validated: {
            type: Boolean,
            default: false
        },
        ownershipVerified: {
            type: Boolean,
            default: false
        }
    },
    lotteryTypeEnum: {
        type: String,
        enum: LOTTERY_TYPES,
        required: true
    },
    // Validation status
    validationStatus: {
        type: String,
        enum: ["pending", "validated", "failed"],
        default: "pending"
    },
    validationError: {
        type: String,
        default: null
    },
    validatedAt: {
        type: Date,
        default: null
    },
    validatedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null
    }
}, {
    timestamps: true
});

const RafflePrize = mongoose.model("RafflePrize", rafflePrizeSchema);
module.exports = RafflePrize;
