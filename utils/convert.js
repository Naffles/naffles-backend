const path = require("path");
const { uploadFile } = require("../services/gcs");
const { getAsync } = require("../config/redisClient");
const sharp = require("sharp");
const { getSupportedTokenDecimalMultiplier } = require("./helpers");
const moment = require("moment");
const MomentFormatConstants = require("./constants/MomentFormatConstants");

const convertToWebpAndUpload = async (file, folderName = "profile-pictures") => {
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const formattedDate = moment().format(MomentFormatConstants.YYMMDD);
  const randomNumber = Math.floor(Math.random() * 1000000);
  var newFileName = `${path.basename(file.originalname, fileExtension)}.webp`;
  newFileName = `${formattedDate}-${randomNumber}${newFileName}`;

  let webpBuffer;
  const options = {};
  if (fileExtension === "gif") options.animated = true;

  webpBuffer = await sharp(file.buffer, options)
    .webp({ quality: 80 })
    .toBuffer();

  const fileBuffer = { buffer: webpBuffer, filename: newFileName, mimetype: "image/webp" };
  const result = await uploadFile(fileBuffer, folderName, process.env.GCS_BUCKET_NAME);
  return result;
};

// 3500000000000000000000 => 3500
const convertToNum = async (amount, tokenType = 'eth') => {
  tokenType = tokenType.toLowerCase();
  const multiplier = await getSupportedTokenDecimalMultiplier(tokenType);
  return Number(parseFloat(amount) / multiplier);
};

// 3500 => 3500000000000000000000
const convertToBigInt = async (amount, tokenType = 'eth', session = null) => {
  tokenType = tokenType.toLowerCase();
  const multiplier = await getSupportedTokenDecimalMultiplier(tokenType, session);
  return BigInt(amount) * BigInt(multiplier);
};

// BigInt
const convertToUsd = async (amount, coinType = 'eth') => {
  coinType = coinType.toLowerCase();
  var amount = BigInt(amount.toString());
  var convertedAmount = 0n;
  const multiplier = 1000n; // Use BigInt for multiplier to avoid conversion issues
  const frontEndPrecisionAdjustment = 1000n;
  const cryptoPrices = JSON.parse(await getAsync('crypto:prices'));

  if (coinType == 'eth') {
    const ethereumPrice = cryptoPrices?.ethereum?.usd || 0;
    const ethereumPriceBigInt = BigInt(Math.round(ethereumPrice * Number(multiplier))); // Ensure price is converted to integer
    convertedAmount = (amount * ethereumPriceBigInt * frontEndPrecisionAdjustment) / BigInt(10 ** 18) / multiplier;
  } else if (coinType == 'sol') {
    const solanaPrice = cryptoPrices?.solana?.usd || 0;
    const solanaPriceBigInt = BigInt(Math.round(solanaPrice * Number(multiplier))); // Ensure price is converted to integer
    convertedAmount = (amount * solanaPriceBigInt * frontEndPrecisionAdjustment) / BigInt(10 ** 9) / multiplier;
  }

  return convertedAmount;
};


module.exports = { convertToWebpAndUpload, convertToNum, convertToBigInt, convertToUsd };
