const { AdminSettings } = require("../models/admin/adminSettings");
const { UploadableContentSettings } = require("../models/admin/fileUploadSettings/uploadableContent");
const { parseCSV, normalizeHeader } = require("../utils/adminSettings/csvFileParser");
const { schemaMapping } = require("../utils/adminSettings/fileSettingValidation");
const countries = require('i18n-iso-countries');


const handleCSVUpload = async (buffer, settingType) => {
    const csvData = await parseCSV(buffer, settingType);

    console.log("**CSV Parsed successfully**");

    const transformedData = await transformCSVData(csvData, settingType);

    // Update the UploadableContentSettings document
    const uploadableContent = await UploadableContentSettings.findOneAndUpdate(
        {},
        { $set: { [settingType]: transformedData.map(doc => doc._id) } },
        { new: true, upsert: true }
    );

    // Update the AdminSettings document
    await AdminSettings.findOneAndUpdate(
        {},
        { $set: { uploadableContent: uploadableContent._id } },
        { new: true, upsert: true }
    );

    return uploadableContent;
};

const transformCSVData = async (csvData, settingType) => {
    const mapItem = (item, fields) => {
        return fields.reduce((acc, field) => {
            let data = item[normalizeHeader(field)].trim();
            // Ensure 'true' and 'false' strings are converted to boolean
            if (typeof data === 'string') {
                const target = data.toLowerCase();
                if (target === 'true') {
                    data = true;
                } else if (target === 'false') {
                    data = false;
                }
            }

            acc[field] = data;
            return acc;
        }, {});
    };

    const { model: Model, fields } = schemaMapping[settingType];
    await Model.deleteMany({});

    switch (settingType) {
        case "geoblockedCountries":
            return Promise.all(
                csvData.map(item => {
                    if (!countries.isValid(item.country)) {
                        throw new Error(`Invalid country code: ${item.country}`);
                    }
                    if (!['Y', 'N'].includes(item.isblocked)) {
                        throw new Error(`Invalid value for isBlocked: ${item.isblocked}`);
                    }
                    return new Model({
                        country: item["country"],
                        isBlocked: item.isblocked === "Y"
                    }).save();
                })
            );

        case "canClaimOpenTicketsWhitelist":
            return Promise.all(
                csvData.map(item => new Model({
                    chain: item.chain,
                    walletAddress: item.walletAddress,
                    ticketLimit: parseInt(item.ticketlimit, 10)
                }).save())
            );

        case "partnerTokenList":
        case "partnerNFTList":
            return Promise.all(
                csvData.map(item => new Model({
                    name: item.name,
                    chain: item.chain,
                    contract: item.contract,
                    percentBonus: parseFloat(item.percentbonus)
                }).save())
            );

        case "partnerReferralLinks":
            return Promise.all(
                csvData.map(item => new Model({
                    referralLink: item.referrallink,
                    percentBonus: parseFloat(item.percentbonus)
                }).save())
            );

        case "allowableNFTContractsForRaffles":
        case "allowableTokenContractsForLotteries":
        case "canCreateRaffleWallets":
            return Promise.all(
                csvData.map(item => new Model(mapItem(item, fields)).save())
            );

        default:
            throw new Error("Invalid settingType");
    }
};

module.exports = {
    handleCSVUpload,
};