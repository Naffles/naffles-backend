const crypto = require('crypto');
const seedrandom = require("seedrandom");
const { WEB3_VRF, VRF_CONTRACT_ABI, VRF_CONTRACT_ADDRESS, VRF_WALLET } = require('../config/vrf');

// Generate a temporary password
function generateTemporaryPassword(length = 10) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }
  return password;
}

function generateRandomToken(length = 16) {
  return crypto.randomBytes(length).toString('hex');
}

function selectRandomEntry(options) {
  if (!Array.isArray(options) || options.length === 0)
    throw new Error("Input list must be a non-empty array");

  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generates an array of unique random numbers based on a seed using a partial Fisher-Yates shuffle.
 *
 * @param {string} seed - The seed value for the random number generator.
 * @param {number} count - The number of unique random numbers to generate.
 * @param {number} min - The minimum value of the random number range (inclusive).
 * @param {number} max - The maximum value of the random number range (inclusive).
 * @returns {number[]} - An array of unique random numbers.
 * @throws {Error} - If the range is too small to generate the required number of unique numbers.
 */
function generateUniqueRandomNumbers(seed, count, min, max) {
  const range = max - min + 1;
  if (range < count) {
    throw new Error("Range is too small to generate the required number of unique numbers.");
  }

  const rng = seedrandom(seed);
  const selectedNumbers = [];
  const map = {}; // To keep track of swapped elements

  for (let i = 0; i < count; i++) {
    // Generate a random index between i and range - 1
    const j = i + Math.floor(rng() * (range - i));

    // Retrieve the actual values at indices i and j, accounting for previous swaps
    const valAtJ = map[j] !== undefined ? map[j] : j;
    const valAtI = map[i] !== undefined ? map[i] : i;

    // Perform the swap in the map
    map[j] = valAtI;
    map[i] = valAtJ;

    // Add the selected number to the result, adjusted by min
    selectedNumbers.push(valAtJ + min);
  }

  return selectedNumbers;
}

const requestForRandomNumber = async (naffleId, range, options = {}) => {
  try {
    const { nativePayment = false, isAllowlist = false } = options
    const contract = new WEB3_VRF.eth.Contract(VRF_CONTRACT_ABI, VRF_CONTRACT_ADDRESS);
    // check if valid naffleId
    const chainLinkId = await contract.methods
      .naffleIdToChainlinkRequestId(naffleId)
      .call();
    const { randomNumber, fulfilled } = await contract.methods
      .chainlinkRequestStatus(chainLinkId)
      .call();
    if (!fulfilled) {
      // const blockNumber = await web3.eth.getBlockNumber();
      const gasPrice = await WEB3_VRF.eth.getGasPrice();
      const tx = await contract.methods.drawWinner(naffleId, range, nativePayment, isAllowlist).send({
        from: VRF_WALLET.address,
        gas: 200000, // setting the gas limit
        gasPrice: gasPrice.toString() // setting the gas price
      });
      console.log("Transaction Hash: " + tx?.transactionHash);
      return tx.transactionHash;
    } else {
      return null;
    }


  } catch (err) {
    throw new Error(`Error requesting random number: ${err.message}`);
  }
}

module.exports = {
  requestForRandomNumber,
  generateTemporaryPassword,
  generateRandomToken,
  selectRandomEntry,
  generateUniqueRandomNumbers
};
