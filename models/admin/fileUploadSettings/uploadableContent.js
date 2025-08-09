const mongoose = require("mongoose");
const { Schema } = mongoose;

const allowableNFTContractsForRafflesSchema = new Schema({
    name: {
        type: String,
    },
    chainId: {
        type: String,
    },
    contract: {
        type: String,
    }
});

const allowableTokenContractsForLotteriesSchema = new Schema({
    name: String,
    ticker: String,
    decimal: Number,
    network: String,
    contractAddress: String,
    isNativeToken: Boolean,
    chainId: String,
    rpcUrl: String,
    chainName: String,
    tokenType: String,
    icon: String,
}, { timestamps: true });

// Pre-save hook to set the ticker to lowercase
allowableTokenContractsForLotteriesSchema.pre('save', function (next) {
    if (this.isModified('ticker')) {
        this.ticker = this.ticker.toLowerCase();
    }
    next();
});

const canCreateRaffleWalletsSchema = new Schema({
    chainId: {
        type: String,

    },
    walletAddress: {
        type: String,
    }
});

const geoblockedCountriesSchema = new Schema({
    country: {
        type: String,
    },
    isBlocked: {
        type: Boolean,
    },
});

const canClaimOpenTicketsWhitelistSchema = new Schema({
    chainId: {
        type: String,
    },
    walletAddress: {
        type: String,
    },
    ticketLimit: {
        type: Number,
    }
});

const partnerTokenListSchema = new Schema({
    name: {
        type: String,
    },
    chainId: {
        type: String,
    },
    contract: {
        type: String,
    },
    percentBonus: {
        type: Number,
    },
});

const partnerNFTListSchema = new Schema({
    name: {
        type: String,
    },
    chainId: {
        type: String,
    },
    contract: {
        type: String,
    },
    percentBonus: {
        type: Number,
    },
});

const partnerReferralLinksSchema = new Schema({
    referralLink: {
        type: String,
    },
    percentBonus: {
        type: Number,
    },
});

const uploadableContentSettingsSchema = new Schema({
    allowableNFTContractsForRaffles: [{
        type: Schema.Types.ObjectId,
        ref: "AllowableNFTContractsForRaffles",
        index: true,
    }],
    allowableTokenContractsForLotteries: [{
        type: Schema.Types.ObjectId,
        ref: "AllowableTokenContractsForLotteries",
        index: true,
    }],
    canCreateRaffleWallets: [{
        type: Schema.Types.ObjectId,
        ref: "CanCreateRaffleWallets",
        index: true,
    }],
    geoblockedCountries: [{
        type: Schema.Types.ObjectId,
        ref: "GeoblockedCountries",
        index: true,
    }],
    canClaimOpenTicketsWhitelist: [{
        type: Schema.Types.ObjectId,
        ref: "CanClaimOpenTicketsWhitelist",
        index: true,
    }],
    partnerTokenList: [{
        type: Schema.Types.ObjectId,
        ref: "PartnerTokenList",
        index: true,
    }],
    partnerNFTList: [{
        type: Schema.Types.ObjectId,
        ref: "PartnerNFTList",
        index: true,
    }],
    partnerReferralLinks: [{
        type: Schema.Types.ObjectId,
        ref: "PartnerReferralLinks",
        index: true,
    }]
});

const AllowableNFTContractsForRaffles = mongoose.model("AllowableNFTContractsForRaffles", allowableNFTContractsForRafflesSchema);
const AllowableTokenContractsForLotteries = mongoose.model("AllowableTokenContractsForLotteries", allowableTokenContractsForLotteriesSchema);
const CanCreateRaffleWallets = mongoose.model("CanCreateRaffleWallets", canCreateRaffleWalletsSchema);
const GeoblockedCountries = mongoose.model("GeoblockedCountries", geoblockedCountriesSchema);
const CanClaimOpenTicketsWhitelist = mongoose.model("CanClaimOpenTicketsWhitelist", canClaimOpenTicketsWhitelistSchema);
const PartnerTokenList = mongoose.model("PartnerTokenList", partnerTokenListSchema);
const PartnerNFTList = mongoose.model("PartnerNFTList", partnerNFTListSchema);
const PartnerReferralLinks = mongoose.model("PartnerReferralLinks", partnerReferralLinksSchema);
const UploadableContentSettings = mongoose.model("UploadableContentSettings", uploadableContentSettingsSchema);

module.exports = {
    AllowableNFTContractsForRaffles,
    AllowableTokenContractsForLotteries,
    CanCreateRaffleWallets,
    GeoblockedCountries,
    CanClaimOpenTicketsWhitelist,
    PartnerTokenList,
    PartnerNFTList,
    PartnerReferralLinks,
    UploadableContentSettings,
};