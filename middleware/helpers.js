const { SUBSCRIPTION_FEE_IN_USD } = require("../config/client");
const {
	TICKER_TO_TOKEN_NAME,
	NATIVE_TOKEN_FEE_IN_DOLLARS,
	TOKEN_FEE_IN_DOLLARS,
} = require("../config/config");
const { getAsync } = require("../config/redisClient");
const {
	buyShopItemCryptoTokenPot,
	buyShopItemPointsTokenPot,
	buyShopItemFile,
	buyShopItemCsv,
} = require("../controllers/clientController");
const {
	AllowableTokenContractsForLotteries,
} = require("../models/admin/fileUploadSettings/uploadableContent");
const ClientShop = require("../models/client/items/shop/clientShop");
const sendResponse = require("../utils/responseHandler");
const { getAndOrSetCachedSignedUrl } = require("../services/gcs");
const { GCS_PROFILE_PICTURE_TTL } = require("../config/config");

const itemPurchaseMapping = {
	"token-pot-crypto": buyShopItemCryptoTokenPot,
	"token-pot-points": buyShopItemPointsTokenPot,
	file: buyShopItemFile,
	csv: buyShopItemCsv,
};

const dynamicItemPurchaseHandler = (req, res, next) => {
	const { items } = req.params; // Get the :items parameter
	const purchaseHandler = itemPurchaseMapping[items]; // Get the corresponding handler function

	if (purchaseHandler) {
		return purchaseHandler(req, res, next); // Call the handler function
	} else {
		return sendResponse(
			res,
			400,
			`No purchase handler defined for item type: ${items}`,
		);
	}
};

const isShopItemIdValid = async (req, res, next) => {
	const { shopItemId: id } = req.body; // The shop item ID
	// Validate that the item ID is provided
	if (!id) {
		return sendResponse(res, 400, "Shop item ID is required.");
	}

	// Find the shop item being purchased and check if it's active
	const shopItem = await ClientShop.findOne({
		_id: id,
		status: "active",
	});

	if (!shopItem) {
		return sendResponse(
			res,
			404,
			"Shop item not found or not available for purchase.",
		);
	}
	req.shopItem = shopItem;
	next();
};

// get fee for withdrawing certain token
const getFeeOnWithdraw = async (req, res, next) => {
	// Check both req.query and req.body for the parameters
	const coinType = req.query.coinType || req.body.coinType;
	const payInNative = req.query.payInNative || req.body.payInNative || "true"; // Default to "true" if not provided

	// Convert the string "false" to a boolean false
	const isPayInNative = payInNative.toLowerCase() === "true";
	try {
		if (!coinType) {
			return sendResponse(res, 400, "Cointype not found");
		}
		// check if this one is supported
		const tokenInfo = await AllowableTokenContractsForLotteries.findOne({
			ticker: coinType.toLowerCase(),
		});
		// check if this is supported
		if (!tokenInfo) {
			return sendResponse(res, 400, "Cointype not supported");
		}

		const multiplier = BigInt(10 ** 18); // for precision
		const coin = coinType.toLowerCase();
		const isNativeToken = tokenInfo.isNativeToken;
		const tokenDecimal = BigInt(10 ** tokenInfo.decimal || 0);
		const tokenType = tokenInfo.tokenType;
		const network = tokenInfo.network.split("-");

		// check for native token
		var nativeToken;
		switch (tokenType) {
			case "evm-native":
			case "sol":
				nativeToken = coin;
				break;
			case "spl":
				nativeToken = "sol";
				break;
			case "erc20":
				if (network[0] === "eth") {
					nativeToken = "eth";
				} else if (network[0] === "base") {
					nativeToken = "beth";
				} else {
					nativeToken = "evml2"; // instead of base, generalize to evm l2 since the gas fees are the same $0.5
				}
				break;
			default:
				break;
		}

		if (isNativeToken || isPayInNative) {
			feeInDollars = BigInt(NATIVE_TOKEN_FEE_IN_DOLLARS[nativeToken] || "0");
		} else {
			switch (tokenType) {
				case "spl":
					feeInDollars = BigInt(TOKEN_FEE_IN_DOLLARS["spl"] || "0");
					break;
				case "erc20":
					if (network[0] === "eth") {
						feeInDollars = BigInt(TOKEN_FEE_IN_DOLLARS["erc20"] || "0");
					} else {
						feeInDollars = BigInt(TOKEN_FEE_IN_DOLLARS["evml2"] || "0");
					}
					break;
				default:
					feeInDollars = BigInt(0);
			}
		}
		const savedFeeInDollar = feeInDollars;
		if (feeInDollars === BigInt(0)) {
			return sendResponse(res, 400, "Fee not supported");
		}

		feeInDollars = (feeInDollars * multiplier) / BigInt(100);
		const cryptoPrices = await getAsync("crypto:prices");
		const cryptoData = JSON.parse(cryptoPrices);

		const coinx = isNativeToken || isPayInNative ? nativeToken : coin;
		const priceInUsd = cryptoData[TICKER_TO_TOKEN_NAME[coinx]]?.usd || 0;
		const adjustedPrice = Math.floor(priceInUsd * Number(10 ** 10));
		const pricePerToken = BigInt(adjustedPrice);

		if (pricePerToken === BigInt(0)) {
			return sendResponse(res, 400, "Unable to fetch price on token");
		}

		let feeInCrypto = feeInDollars / pricePerToken;
		feeInCrypto = (feeInCrypto * tokenDecimal) / BigInt(10 ** 8); // 18 - 10;
		req.fee = {
			amount: feeInCrypto?.toString(),
			gasFeeInDollars: Number(savedFeeInDollar) / 100,
			payInNative: isPayInNative,
			nativeToken,
			feeCoinType: isPayInNative ? nativeToken : coin,
		};
		next();
	} catch (err) {
		console.log("Error getting fee upon withdraw: ", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	}
};

const getClientSubscriptionFee = async (req, res, next) => {
	const { days } = req.params;
	const coinType = req.query.coinType || req.body.coinType;

	// check if this one is supported
	const tokenInfo = await AllowableTokenContractsForLotteries.findOne({
		ticker: coinType.toLowerCase(),
	});
	// check if this is supported
	if (!tokenInfo) {
		return sendResponse(res, 400, "Cointype not supported");
	}

	const tokenDecimal = BigInt(10 ** tokenInfo.decimal || 0);

	var feeInUsd;
	if (days == "30") {
		feeInUsd = SUBSCRIPTION_FEE_IN_USD.DAYS_30;
	} else if (days == "180") {
		feeInUsd = SUBSCRIPTION_FEE_IN_USD.DAYS_180;
	} else {
		return sendResponse(res, 400, "Invalid number of days");
	}

	const cryptoPrices = await getAsync("crypto:prices");
	const cryptoData = JSON.parse(cryptoPrices);

	const multiplier = BigInt(10 ** 18);
	const feeInUsdAdjusted = BigInt(feeInUsd) * multiplier;

	const priceInUsd = cryptoData[TICKER_TO_TOKEN_NAME[coinType]]?.usd || 0;
	const adjustedPrice = Math.floor(priceInUsd * Number(10 ** 10));
	const pricePerToken = BigInt(adjustedPrice);
	if (pricePerToken === BigInt(0)) {
		return sendResponse(res, 400, `Unable to fetch price on token ${coinType}`);
	}

	let feeInCrypto = feeInUsdAdjusted / pricePerToken;
	feeInCrypto = (feeInCrypto * tokenDecimal) / BigInt(10 ** 8); // 18 - 10;
	req.fee = {
		feeInUsd: feeInUsd,
		feeInCrypto: feeInCrypto?.toString(),
		coinType: coinType,
	};
	next();
};

// Helper function to handle signed URL generation
const generateSignedUrl = async (filePath) => {
	if (filePath) {
		return await getAndOrSetCachedSignedUrl(
			filePath,
			process.env.GCS_BUCKET_NAME,
			GCS_PROFILE_PICTURE_TTL,
		);
	}
	return null;
};

module.exports = {
	isShopItemIdValid,
	getFeeOnWithdraw,
	getClientSubscriptionFee,
	dynamicItemPurchaseHandler,
	generateSignedUrl,
};
