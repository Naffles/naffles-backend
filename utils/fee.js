const { AdminSettings } = require("../models/admin/adminSettings");
const { Fee } = require("../models/analytics/fee");

const calculateAndSaveGameFee = async (coinType, amount) => {
  try {
    coinType = coinType.toLowerCase();
    const multiplier = 100; // Multiplier to handle decimal percentages
    const settings = await AdminSettings.findOne({});
    const feeRate = BigInt(settings?.wageringFeePercentage * multiplier || 0);

    // Convert the amount to BigInt
    const amountBigInt = BigInt(amount);

    // Calculate total fee
    const totalFee = (amountBigInt * feeRate) / BigInt(multiplier * 100); // Adjust the multiplier for correct division
    const netAmount = amountBigInt - totalFee;

    // Save the total fee to the Fee model
    const fee = await Fee.findOne({});
    if (!fee) {
      const newFee = new Fee({
        balances: {
          [coinType]: totalFee.toString(),
        },
      });
      await newFee.save();
    } else {
      const currentFee = BigInt(fee.balances.get(coinType) || 0);
      fee.balances.set(coinType, (currentFee + totalFee).toString());
      await fee.save();
    }

    return {
      netAmount: netAmount.toString(),
      totalFee: totalFee.toString(),
    };
  } catch (error) {
    console.error("Error calculating game fee:", error);
    throw error;
  }
};

module.exports = {
  calculateAndSaveGameFee,
};
