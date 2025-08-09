const validPrizePoolTypes = ["nafflings", "eth"]; // Update to ENV config

async function validatePrizePoolType(prizePoolType) {

    const result = validPrizePoolTypes.includes(prizePoolType);
    console.log(`validatePrizePoolType: result=${result}`);
    return result;
}

module.exports = { validatePrizePoolType };