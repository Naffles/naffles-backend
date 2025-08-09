const LotteryEventCategory = {
    JACKPOT: "JACKPOT",
    CRYPTO_RAFFLE: "CRYPTO_RAFFLE",
    NFT_RAFFLE: "NFT_RAFFLE",
    NAFFLINGS_RAFFLE: "NAFFLINGS_RAFFLE",

    values() {
        return Object.values(this).filter(value => typeof value === "string");
    }
};
Object.freeze(LotteryEventCategory);

module.exports = LotteryEventCategory;