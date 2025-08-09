const {
    AdminSettings,
    PointsEarningActivitiesSettings,
    JackpotAccumulationSettings
} = require('../models/admin/adminSettings');
const {
    AllowableNFTContractsForRaffles,
    AllowableTokenContractsForLotteries,
    CanCreateRaffleWallets,
    GeoblockedCountries,
    CanClaimOpenTicketsWhitelist,
    PartnerTokenList,
    PartnerNFTList,
    PartnerReferralLinks,
    UploadableContentSettings
} = require("../models/admin/fileUploadSettings/uploadableContent");
const Jackpot = require("../models/jackpot/jackpot");
const Raffle = require("../models/raffle/raffle");

async function cleanupDatabase() {
    try {
        await AllowableNFTContractsForRaffles.deleteMany();
        await AllowableTokenContractsForLotteries.deleteMany();
        await CanCreateRaffleWallets.deleteMany();
        await GeoblockedCountries.deleteMany();
        await CanClaimOpenTicketsWhitelist.deleteMany();
        await PartnerTokenList.deleteMany();
        await PartnerNFTList.deleteMany();
        await PartnerReferralLinks.deleteMany();
        await UploadableContentSettings.deleteMany();
        await AdminSettings.deleteMany();
        await PointsEarningActivitiesSettings.deleteMany();
        await JackpotAccumulationSettings.deleteMany();
        await Jackpot.deleteMany();
        await Raffle.deleteMany();
        console.log('Cleanup completed');
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

module.exports = cleanupDatabase;