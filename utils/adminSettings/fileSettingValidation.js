const {
    AllowableNFTContractsForRaffles,
    AllowableTokenContractsForLotteries,
    CanCreateRaffleWallets,
    GeoblockedCountries,
    CanClaimOpenTicketsWhitelist,
    PartnerTokenList,
    PartnerNFTList,
    PartnerReferralLinks
} = require("../../models/admin/fileUploadSettings/uploadableContent");

const schemaMapping = {
    allowableNFTContractsForRaffles: {
        model: AllowableNFTContractsForRaffles,
        fields: ["name", "chainId", "contract"]
    },
    allowableTokenContractsForLotteries: {
        model: AllowableTokenContractsForLotteries,
        fields: ["name", "ticker", "decimal", "network", "contractAddress", "isNativeToken", "chainId", "rpcUrl", "chainName", "tokenType", "icon"]
    },
    canCreateRaffleWallets: {
        model: CanCreateRaffleWallets,
        fields: ["chainId", "walletAddress"]
    },
    geoblockedCountries: {
        model: GeoblockedCountries,
        fields: ["country", "isBlocked"]
    },
    canClaimOpenTicketsWhitelist: {
        model: CanClaimOpenTicketsWhitelist,
        fields: ["chainId", "walletAddress", "ticketLimit"]
    },
    partnerTokenList: {
        model: PartnerTokenList,
        fields: ["name", "chainId", "contract", "percentBonus"]
    },
    partnerNFTList: {
        model: PartnerNFTList,
        fields: ["name", "chainId", "contract", "percentBonus"]
    },
    partnerReferralLinks: {
        model: PartnerReferralLinks,
        fields: ["referralLink", "percentBonus"]
    }
};

const validateCSVHeaders = (headers, settingType) => {
    const expectedFields = schemaMapping[settingType].fields;
    const missingFields = expectedFields.filter(field => !headers.includes(field.toLowerCase()));

    if (missingFields.length > 0) {
        throw new Error(`CSV headers do not match the expected fields for ${settingType}. Missing fields: ${missingFields.join(", ")}`);
    }
};

module.exports = {
    schemaMapping,
    validateCSVHeaders,
};
