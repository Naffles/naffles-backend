const { GCS_PROFILE_PICTURE_TTL } = require("../config/config");
const { getAsync, setAsync } = require("../config/redisClient");
const { AllowableTokenContractsForLotteries } = require("../models/admin/fileUploadSettings/uploadableContent");
const { uploadFile, getAndOrSetCachedSignedUrl, deleteFile } = require("../services/gcs");
const path = require("path");
const sharp = require("sharp");
const moment = require("moment");
const MomentFormatConstants = require("./constants/MomentFormatConstants");
const Session = require("../models/utils/session");
const axios = require("axios");

const getSupportedTokenDecimalMultiplier = async (symbol, session = null) => {
  try {
    const ticker = symbol.toLowerCase();
    if (ticker == 'points' || ticker == 'nafflings') {
      return 10 ** 18;
    }
    const token = await AllowableTokenContractsForLotteries.findOne({ ticker }).session(session);
    const decimal = token ? token?.decimal : 0;
    return 10 ** decimal;
  } catch (error) {
    console.error("Error getting token decimal multiplier:", error);
    throw error;
  }
};

const getAllSupportedTokenDecimalMultiplierAsObject = async () => {
  try {
    const tokens = await AllowableTokenContractsForLotteries.find({});
    const tokenDecimalMultipliers = tokens.reduce((acc, token) => {
      acc[token.ticker] = 10 ** token.decimal;
      return acc;
    }, {
      points: 10 ** 18, // Adding points with a fixed decimal multiplier
    });
    return tokenDecimalMultipliers;
  } catch (error) {
    console.error("Error getting token decimal multipliers:", error);
    throw error;
  }
}

// valid ticker for games and lotteries
const REDIS_KEY = "allowableTokenContractsTickers";
const REDIS_LAST_UPDATED_KEY = "allowableTokenContractsLastUpdated";
const getAllValidTickers = async () => {
  try {
    // Check if data is already in Redis
    const cachedData = await getAsync(REDIS_KEY);
    const lastUpdated = await getAsync(REDIS_LAST_UPDATED_KEY);

    if (cachedData && lastUpdated) {
      const lastUpdatedDate = new Date(lastUpdated);
      const latestUpdated = await AllowableTokenContractsForLotteries.findOne()
        .sort({ updatedAt: -1 })
        .select("updatedAt");

      if (latestUpdated && new Date(latestUpdated.updatedAt) <= lastUpdatedDate) {
        // Return cached data if it's up-to-date
        const cachedTickers = JSON.parse(cachedData);
        return ["points", ...cachedTickers];
      }
    }

    // Fetch fresh data from the database
    const tokens = await AllowableTokenContractsForLotteries.find({});
    const tickers = tokens.map(token => token.ticker);

    // Store fresh data in Redis
    await setAsync(REDIS_KEY, JSON.stringify(tickers));
    await setAsync(REDIS_LAST_UPDATED_KEY, new Date().toISOString());

    // Include 'points' in the tickers array
    return ["points", ...tickers];
  } catch (error) {
    console.error("Error getting valid tickers:", error);
    throw error;
  }
};

const convertToWebpThenUpload = async (file, folderName = "profile-pictures") => {
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

// Updated handleFileUpdate function
const handleFileUpdate = async (req, objectToUpdate, fileKey, fieldPath, folderName, convertToWebp = false) => {
  if (req.files && req.files[fileKey] && req.files[fileKey].length > 0) {
    const file = req.files[fileKey][0];
    let fileKeyNew;

    // If convertToWebp is true, convert image files to webp format and upload.
    if (convertToWebp) {
      fileKeyNew = await convertToWebpThenUpload(file, folderName);
    } else {
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const formattedDate = moment().format(MomentFormatConstants.YYMMDD);
      const randomNumber = Math.floor(Math.random() * 1000000);
      var newFileName = `${path.basename(file.originalname, fileExtension)}`;
      newFileName = `${formattedDate}-${randomNumber}${newFileName}`;
      newFileName += fileExtension;
      // For non-image files (PDFs, DOCXs, etc.), directly upload the file without conversion.
      const fileBuffer = { buffer: file.buffer, filename: newFileName, mimetype: file.mimetype };
      fileKeyNew = await uploadFile(fileBuffer, folderName, process.env.GCS_BUCKET_NAME);
    }

    // Access the previous saved file key in the object
    const savedFileKey = objectToUpdate[fieldPath];

    if (fileKeyNew) {
      // Dynamically update the object field with the new file path.
      objectToUpdate[fieldPath] = fileKeyNew;

      // Optionally, get the signed URL for the uploaded file.
      const url = await getAndOrSetCachedSignedUrl(
        objectToUpdate[fieldPath],
        process.env.GCS_BUCKET_NAME,
        GCS_PROFILE_PICTURE_TTL
      );

      // If there's an old file, delete it to avoid unnecessary storage usage.
      if (savedFileKey) {
        await deleteFile(savedFileKey);
      }
    }
  }
  return objectToUpdate; // Return the updated object to the caller
};

const handleImageUpdate = async (file, folderName, options = {}) => {
	const newImageKey = await convertToWebpThenUpload(file, folderName);

	const { object, imgKey } = options;
	if (object && imgKey) {
		const currentImage = object[imgKey];
		if (currentImage) {
			await deleteFile(currentImage);
		}
	}

	return newImageKey;
};

module.exports = {
  getSupportedTokenDecimalMultiplier,
  getAllSupportedTokenDecimalMultiplierAsObject,
  getAllValidTickers,
  handleFileUpdate,
  handleImageUpdate,
};
