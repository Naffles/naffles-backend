const mongoose = require("mongoose");
const WalletAddress = require("../models/user/walletAddress");
const User = require("../models/user/user");
const sendResponse = require("../utils/responseHandler");
const GameHistory = require("../models/game/gameHistory");
const GameAnalytics = require("../models/analytics/gameAnalytics");
const {
	AdminSettings,
	PointsEarningActivitiesSettings,
	JackpotAccumulationSettings,
} = require("../models/admin/adminSettings");
const Jackpot = require("../models/jackpot/jackpot");
const Raffle = require("../models/raffle/raffle");
const { findRaffles } = require("../services/raffleService");
const {
	calculateAndUpdateJackpot,
	getPointsAccumulated,
} = require("../services/jackpotAccumulation");
const UserLog = require("../models/user/userLog");
const { updateOrAddActivity } = require("../utils/adminSettingsUpdateHelper");
const {
	TICKER_TO_TOKEN_NAME,
	TOKEN_DECIMAL_MULTIPLIER,
	REDIS_FEATURED_COMMUNITY_IMAGE_KEY,
	REDIS_FEATURED_TOKEN_IMAGE_KEY,
} = require("../config/config");
const multer = require("multer");
const path = require("path");
const { handleCSVUpload } = require("../services/fileUploadService");
const {
	convertToNum,
	convertToUsd,
	convertToWebpAndUpload,
} = require("../utils/convert");
const { getUserProfileImage, getImage } = require("../utils/image");
const { generateRandomToken, generateUniqueRandomNumbers } = require("../utils/random");
const WalletBalance = require("../models/user/walletBalance");
const createWalletBalance = require("../utils/createWalletBalance");
const { getAsync } = require("../config/redisClient");
const Withdraw = require("../models/transactions/withdraw");
const Deposit = require("../models/transactions/deposit");
const { Fee } = require("../models/analytics/fee");
const {
	AllowableTokenContractsForLotteries,
} = require("../models/admin/fileUploadSettings/uploadableContent");
const {
	getSupportedTokenDecimalMultiplier,
	getAllValidTickers,
} = require("../utils/helpers");
const FeaturedCommunity = require("../models/featured/featuredCommunity");
const { deleteFile } = require("../services/gcs");
const FeaturedToken = require("../models/featured/featuredToken");
const clientService = require("../services/clientService");

// Set storage engine
const storage = multer.memoryStorage();

// Initialize upload
const upload = multer({
	storage: storage,
	limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB per file
	fileFilter: (req, file, cb) => {
		// Allowed file types
		const fileTypes = /csv/;
		// Check file extension
		const extname = fileTypes.test(
			path.extname(file.originalname).toLowerCase(),
		);
		// Check mime type
		const mimetype = file.mimetype === "text/csv";

		if (mimetype && extname) {
			return cb(null, true);
		} else {
			cb("Error: CSV Files Only!");
		}
	},
});

exports.userAnalytics = async (req, res) => {
	try {
		// Count the total number of users
		const userCount = await User.countDocuments();
		// Count the total number of wallet addresses
		const walletCount = await WalletAddress.countDocuments();
		// Prepare the analytics data dynamically
		const analyticsData = [
			{ description: "Users", value: userCount },
			{ description: "Wallets", value: walletCount },
		];
		// Send the response with the structured data
		sendResponse(res, 200, "Analytics Data", analyticsData);
	} catch (error) {
		console.error("Failed to retrieve analytics data:", error);
		return sendResponse(res, 500, "Failed to retrieve data", {
			error: error.message,
		});
	}
};

exports.gameAnalytics = async (req, res) => {
	try {
		// Retrieve the analytics document
		const analytics = await GameAnalytics.findOne();
		// Check if the analytics data exists
		if (!analytics) {
			return sendResponse(res, 404, "No analytics data found", {});
		}

		// Retrieve the fee document
		const fee = await Fee.findOne();

		// Prepare the analytics data dynamically
		const analyticsData = [
			{ description: "Games Played", value: analytics.totalGames },
			{ description: "Coin Flip", value: analytics.coinTossGames },
			{
				description: "Rock, Paper, Scissors",
				value: analytics.rockPaperScissorsGames,
			},
		];

		// Include the fees earned in the analytics data
		if (fee && fee.balances) {
			for (const [keyx, value] of fee.balances.entries()) {
				const key = keyx.toLowerCase();
				var multiplier = TOKEN_DECIMAL_MULTIPLIER[key];
				if (!multiplier) {
					const token = await AllowableTokenContractsForLotteries.findOne({
						ticker: key,
					});
					const decimal = token?.decimal || 0;
					multiplier = 10 ** decimal;
				}
				const convertedValue = Number(parseFloat(value) / multiplier);
				var usdValue = await convertToUsd(value, key);
				const frontEndPrecisionAdjustment = BigInt(1000);
				usdValue = usdValue / frontEndPrecisionAdjustment;
				analyticsData.push({
					description: `Fees Earned (${key})`,
					value: `${convertedValue} (${usdValue} USD)`,
				});
			}
		}
		// console.log("analytics data: ", analyticsData);
		// Send the response with the structured data
		sendResponse(res, 200, "Game Analytics Data", analyticsData);
	} catch (error) {
		console.error("Failed to retrieve game analytics data:", error);
		return sendResponse(res, 500, "Failed to retrieve data", {
			error: error.message,
		});
	}
};

exports.raffleAnalytics = async (req, res) => {
	// Just a placeholder for now
};

exports.getUserAdministrationTable = async (req, res) => {
	try {
		const { query, page = 1 } = req.query;
		const limit = parseInt(req.query.limit || "10", 10);
		const skip = (page - 1) * limit;

		let users, count;

		if (query) {
			// Use regex for partial, case-insensitive matching
			const searchRegex = new RegExp(query, "i");

			// Step 1: Search for users by username or email
			users = await User.find({
				$or: [
					{ username: searchRegex },
					{ email: searchRegex },
				],
			})
				.sort({ createdAt: -1 }) // Sort by creation date
				.limit(limit)
				.skip(skip)
				.exec();

			// Count matching users for pagination
			count = await User.countDocuments({
				$or: [
					{ username: searchRegex },
					{ email: searchRegex },
				],
			});

			// Step 2: If no users are found, search in WalletAddress
			if (users.length === 0) {
				const matchedWallets = await WalletAddress.find({ address: searchRegex })
					.select("userRef") // Only fetch userRef
					.limit(limit)
					.skip(skip)
					.exec();

				// Fetch users based on the userRef from matched wallets
				const userIds = matchedWallets.map((wallet) => wallet.userRef);
				users = await User.find({ _id: { $in: userIds } })
					.sort({ createdAt: -1 })
					.limit(limit)
					.skip(skip)
					.exec();

				// Count matching wallet-based users for pagination
				count = await User.countDocuments({ _id: { $in: userIds } });
			}
		} else {
			// No query: Fetch all users with pagination
			users = await User.find({})
				.sort({ createdAt: -1 })
				.limit(limit)
				.skip(skip)
				.exec();

			// Count all users for pagination
			count = await User.countDocuments();
		}

		// Map over each user to fetch their wallet address and game statistics
		const usersWithStats = await Promise.all(
			users.map(async (user) => {
				const wallet = await WalletAddress.findOne({
					userRef: user._id,
				}).exec();
				const gamesPlayed = await GameHistory.countDocuments({
					$or: [{ creator: user._id }, { challenger: user._id }],
				});
				const gamesWon = await GameHistory.countDocuments({
					winner: user._id,
				});
				const points = await convertToNum(user.temporaryPoints);
				const profileImageUrl = await getUserProfileImage(user.profileImage);
				return {
					id: user._id.toString(),
					joined: user.createdAt,
					userImage: profileImageUrl,
					userEmail: user.email,
					userName: user.username,
					walletAddress: wallet ? wallet.address : "NA",
					walletType: wallet?.walletType == "metamask" ? "EVM" : "SOL",
					gamesPlayed: gamesPlayed,
					gamesWon: gamesWon,
					rafflesCreated: 0,
					ticketsBought: 0,
					temporaryPoints: points, // user.temporaryPoints,
					admin: user.role == "admin" ? true : false,
					superAdmin: user.role == "super" ? true : false,
				};
			}),
		);

		// Return paginated results
		return sendResponse(res, 200, "success", {
			users: usersWithStats,
			totalPages: Math.ceil(count / limit),
			currentPage: parseInt(page),
			totalUsers: count,
		});
	} catch (error) {
		console.error("Failed to retrieve user administration data:", error);
		return sendResponse(res, 500, "Failed to retrieve data", error.message);
	}
};

exports.changeUserRole = async (req, res) => {
	const { userId, newRole } = req.body;

	// Validate the new role
	if (!newRole || !["admin", "user", "super"].includes(newRole)) {
		return sendResponse(res, 400, "Invalid or missing role");
	}

	try {
		// Find user by ID and update their role
		const user = await User.findByIdAndUpdate(
			userId,
			{ role: newRole },
			{ new: true, runValidators: true },
		);

		if (!user) {
			return sendResponse(res, 404, "User not found");
		}

		return res.status(200).json({
			message: "User role updated successfully",
			user: {
				id: user._id,
				username: user.username,
				role: user.role,
			},
		});
	} catch (error) {
		console.error("Failed to update user role:", error);
		return sendResponse(res, 500, "Failed to update user role", {
			error: error.message,
		});
	}
};

exports.getUserLogDetails = async (req, res) => {
	const { userId } = req.query;

	if (!userId) {
		return sendResponse(res, 400, "User ID is required.");
	}

	try {
		const userLogs = await UserLog.find({ user: userId })
			.populate("user") // Populate user details
			.populate("raffle")
			.exec();

		if (!userLogs.length) {
			return sendResponse(res, 404, "No logs found for this user.");
		}

		return sendResponse(res, 200, userLogs);
	} catch (error) {
		console.error("Error fetching user details:", error);
		return sendResponse(res, 500, "Failed to fetch user details.");
	}
};

exports.getAllRaffles = async (req, res) => {
	console.log("Fetching raffles...");
	try {
		const { isGiveaway } = req.query;
		const raffles = await findRaffles(req, isGiveaway);

		if (!raffles) {
			return sendResponse(res, 400, "Invalid prizePoolType");
		}

		if (raffles.length === 0) {
			return sendResponse(res, 404, "No raffles found.");
		}

		return sendResponse(res, 200, "Successfully fetched raffles", raffles);
	} catch (error) {
		console.log("Error occured during fetch:", error);
		return sendResponse(res, 500, "Something went wrong.");
	}
};

exports.generalAdminSettings = async (req, res) => {
	console.log("Fetching General Admin Settings..");
	try {
		const adminSettings = await AdminSettings.findOne().populate([
			"pointsEarningActivities",
			"jackpotAccumulation",
		]);

		if (!adminSettings) {
			return sendResponse(res, 404, "Settings not found.");
		}

		return sendResponse(res, 200, adminSettings);
	} catch (error) {
		console.error("Something went wrong:", error);
		return sendResponse(res, 500, "Failed to fetch general admin settings", {
			error: error.message,
		});
	}
};

exports.updateAdminSettings = async (req, res) => {
	console.log("Updating Admin settings...");
	const {
		canCreateRaffle,
		raffleTokenCountRequired,
		raffleFeePercentage,
		wageringFeePercentage,
		allowSellersReserveRaffles,
		salesRoyalties,
		openEntryExchangeRate,
		pointsEarningActivities,
		jackpotAccumulation,
		jackpotPointsPerTenSeconds,
		maximumDailyPoints,
		machineCreatedGamesBetValue,
		activateBlockpass = false,
	} = req.body;
	try {
		let settings = await AdminSettings.findOne({}).populate(
			"pointsEarningActivities jackpotAccumulation",
		);
		if (!settings) {
			return sendResponse(res, 404, "Settings not found.");
		}

		if (activateBlockpass) settings.activateBlockpass = activateBlockpass;
		if (canCreateRaffle) settings.canCreateRaffle = canCreateRaffle;
		if (raffleTokenCountRequired)
			settings.raffleTokenCountRequired = raffleTokenCountRequired;
		if (raffleFeePercentage) settings.raffleFeePercentage = raffleFeePercentage;
		if (wageringFeePercentage)
			settings.wageringFeePercentage = wageringFeePercentage;
		if (allowSellersReserveRaffles)
			settings.allowSellersReserveRaffles = allowSellersReserveRaffles;
		if (salesRoyalties) settings.salesRoyalties = salesRoyalties;
		if (openEntryExchangeRate)
			settings.openEntryExchangeRate = openEntryExchangeRate;
		if (jackpotPointsPerTenSeconds) {
			settings.jackpotPointsPerTenSeconds = jackpotPointsPerTenSeconds;
			const activeJackpots = await Jackpot.find({ isActive: true });
			for (const jackpot of activeJackpots)
				await calculateAndUpdateJackpot(jackpot);
		}
		if (maximumDailyPoints) settings.maximumDailyPoints = maximumDailyPoints;

		// Update pointsEarningActivities activities
		if (pointsEarningActivities) {
			await updateOrAddActivity(
				settings.pointsEarningActivities,
				pointsEarningActivities,
				PointsEarningActivitiesSettings,
			);
		}

		// Update jackpotAccumulation activities
		if (jackpotAccumulation) {
			await updateOrAddActivity(
				settings.jackpotAccumulation,
				jackpotAccumulation,
				JackpotAccumulationSettings,
			);
		}

		// Update machineCreatedGamesBetValue activities
		if (machineCreatedGamesBetValue) {
			const existingBetValuesMap = new Map(
				settings.machineCreatedGamesBetValue.map((item) => [
					item.tokenType.toLowerCase(),
					item,
				]),
			);
			machineCreatedGamesBetValue.forEach((item) => {
				const existingBet = existingBetValuesMap.get(
					item.tokenType.toLowerCase(),
				);
				if (existingBet) {
					// Update existing bet
					existingBet.amount = item.amount;
				} else {
					// Add new tokenType
					settings.machineCreatedGamesBetValue.push(item);
				}
			});
		}

		await settings.save();
		// Re-populate fields to get the latest changes
		const updatedSettings = await AdminSettings.findOne({}).populate(
			"pointsEarningActivities jackpotAccumulation",
		);
		// console.log(`updatedSettings: ${updatedSettings}`);

		return sendResponse(
			res,
			200,
			"Settings updated successfully.",
			updatedSettings,
		);
	} catch (error) {
		console.error("Error updating admin settings:", error);
		return sendResponse(
			res,
			500,
			"An error occured while updating admin settings.",
		);
	}
};

exports.getHomepageFeatured = async (req, res) => {
	try {
		// List all active raffles (excluding admin giveaways)
		const isGiveaway = false;
		const activeRaffles = await findRaffles(req, isGiveaway);
		return sendResponse(res, 200, activeRaffles);
	} catch (error) {
		console.error("Something went wrong:", error);
		return sendResponse(
			res,
			500,
			"An error occured while getting homepage featured.",
		);
	}
};

exports.updateHomepageFeatured = async (req, res) => {
	try {
		const adminSettings = await AdminSettings.findOne();

		if (!adminSettings) {
			return sendResponse(res, 404, "Admin settings not found.");
		}
		const { raffleIdsToBeFeatured, removeIdsFromFeatured } = req.body;
		adminSettings.homepageFeaturedRaffles = raffleIdsToBeFeatured;
		await adminSettings.save();

		// Set isFeatured to true for active raffles that need to be featured
		await Raffle.updateMany(
			{ _id: { $in: raffleIdsToBeFeatured } },
			{ isFeatured: true },
		);

		// Set isFeatured to false for raffles that need to be removed from featured
		await Raffle.updateMany(
			{ _id: { $in: removeIdsFromFeatured } },
			{ isFeatured: false },
		);

		return sendResponse(res, 200, "Updated homepage featured!");
	} catch (error) {
		console.error("Something went wrong:", error);
		return sendResponse(
			res,
			500,
			"An error occured while getting homepage featured.",
		);
	}
};

exports.getTotalJackpot = async (req, res) => {
	var { prizePoolType } = req.params;
	const { isGiveaway, calculated } = req.query;

	try {
		prizePoolType = prizePoolType.toLowerCase();
		// Validate tokenType
		const validCoinTypes = await getAllValidTickers();
		if (!validCoinTypes.includes(prizePoolType)) {
			return sendResponse(res, 404, "Token Type not Found.", {
				error: "Incorrect prizePoolType.",
			});
		}

		let jackpot = await Jackpot.findOne({ prizePoolType, isGiveaway });

		if (!jackpot) {
			return sendResponse(res, 400, `Jackpot not found.`);
		}

		// Fetch the jackpot interval accumulation amount
		const adminSettings = await AdminSettings.findOne(
			{},
			{ jackpotPointsPerTenSeconds: 1 },
		).lean();

		if (!adminSettings.jackpotPointsPerTenSeconds) {
			return sendResponse(res, 500, "Something went wrong.", {
				error: "Setting jackpotPointsPerTenSeconds has no value.",
			});
		}
		const pointsPer10Seconds = adminSettings.jackpotPointsPerTenSeconds;

		if (calculated)
			jackpot.totalAmount += await getPointsAccumulated(
				jackpot.lastUpdated,
				pointsPer10Seconds,
			);

		const responseObj = {
			jackpot: jackpot,
			jackpotPointsPerTenSeconds: pointsPer10Seconds,
		};

		return sendResponse(res, 200, "Jackpot fetched successfully.", responseObj);
	} catch (error) {
		console.error("Error occured:", error);
	}
};

// Deprecated
exports.winJackpot = async (req, res) => {
	const { jackpotType, winnerId } = req.query;
	try {
		if (!jackpotType) {
			return sendResponse(res, 400, "Jackpot type is required");
		}
		const jackpot = await Jackpot.findOne({
			isActive: true,
			prizePoolType: jackpotType,
		});
		const winner = await User.findById(winnerId);

		const jackpotPrizeTotal = await calculateAndUpdateJackpot(jackpot, {
			winner,
		});

		// TODO add jackpot to winner

		return sendResponse(
			res,
			200,
			`Congratulations! You won the jackpot prize of ${jackpotPrizeTotal}!`,
		);
	} catch (error) {
		console.error("Error occured:", error);
	}
};

// exports.updateSettingsBundle = async (req, res) => {
//     const { settingType } = req.params;
//     const { update } = req.body;

//     // List of valid setting types for specific keys
//     const validSettings = [
//         "canCreateRaffle",
//         "raffleTokenCountRequired",
//         "raffleFeePercentage",
//         "wageringFeePercentage",
//         "allowSellersReserveRaffles",
//         "salesRoyalties",
//         "openEntryExchangeRate",
//         "pointsPerTenSeconds",
//         "pointsPerDay"
//     ];

//     // Check if the provided settingType is valid for specific keys
//     if (validSettings.includes(settingType)) {
//         try {
//             // Construct the dynamic update object
//             const dynamicUpdate = {};
//             dynamicUpdate[settingType] = update; // Assuming update contains an array with one element for specific keys

//             // Use findOneAndUpdate with upsert option to create the document if it doesn't exist
//             const settings = await AdminSettings.findOneAndUpdate(
//                 {},  // Empty query object to match any document
//                 { $set: dynamicUpdate }, // Update the setting value
//                 { new: true, upsert: true, setDefaultsOnInsert: true } // Options
//             );

//             return sendResponse(res, 200, "Setting updated successfully", settings);
//         } catch (error) {
//             console.error("Failed to update settings:", error);
//             return sendResponse(res, 500, "Failed to update settings", error.message);
//         }
//     }

//     // Handling nested array updates
//     try {
//         if (settingType === "pointsEarningActivities") {
//             const updates = update.map(item => ({
//                 updateOne: {
//                     filter: { activity: item.activity },
//                     update: { $set: { points: item.points } },
//                     upsert: true
//                 }
//             }));
//             await PointsEarningActivitiesSettings.bulkWrite(updates);
//             return sendResponse(res, 200, "Points earning activities updated successfully.");
//         }

//         if (settingType === "jackpotAccumulation") {
//             const updates = update.map(item => ({
//                 updateOne: {
//                     filter: { activity: item.activity },
//                     update: { $set: { points: item.points } },
//                     upsert: true
//                 }
//             }));
//             await JackpotAccumulationSettings.bulkWrite(updates);
//             return sendResponse(res, 200, "Jackpot accumulation updated successfully.");
//         }

//         if (settingType === "machineCreatedGamesBetValue") {
//             const updatePromises = update.map(async item => {
//                 // Try to update the existing entry
//                 const result = await AdminSettings.findOneAndUpdate(
//                     { 'machineCreatedGamesBetValue.tokenType': item.tokenType },
//                     { $set: { 'machineCreatedGamesBetValue.$.amount': item.amount } }
//                 );

//                 // If no matching element is found, insert a new one
//                 if (!result) {
//                     return AdminSettings.updateOne(
//                         {}, // Assuming a single AdminSettings document
//                         { $addToSet: { machineCreatedGamesBetValue: { tokenType: item.tokenType, amount: item.amount } } },
//                         { upsert: true }
//                     );
//                 }
//             });

//             // Execute all update operations
//             await Promise.all(updatePromises);
//             return sendResponse(res, 200, "Machine created games bet value updated successfully.");
//         }
//     } catch (error) {
//         console.error("Failed to update settings:", error);
//         return sendResponse(res, 500, "Failed to update settings", error.message);
//     }

//     return sendResponse(res, 400, "Invalid setting type.");
// };

exports.uploadSettingsFile = async (req, res) => {
	const { settingType } = req.params;
	const validSettingTypes = [
		"allowableNFTContractsForRaffles",
		"allowableTokenContractsForLotteries",
		"canCreateRaffleWallets",
		"geoblockedCountries",
		"canClaimOpenTicketsWhitelist",
		"partnerNFTList",
		"partnerTokenList",
		"partnerReferralLinks",
	];

	if (!validSettingTypes.includes(settingType)) {
		return sendResponse(res, 400, "Invalid Setting Type.");
	}
	// return sendResponse(res, 200, "OKIE");

	upload.single("file")(req, res, async (err) => {
		if (err) {
			return sendResponse(res, 400, "File error.", { error: err });
		}
		if (!req.file) {
			return sendResponse(res, 400, "No file uploaded.");
		}

		try {
			await handleCSVUpload(req.file.buffer, settingType);
			sendResponse(res, 200, "Settings updated successfully");
		} catch (error) {
			console.error("Failed to update settings:", error);
			return sendResponse(res, 500, "Failed to update settings", error.message);
		}
	});
};

exports.getUserBalancesAndWithdrawalRequests = async (req, res) => {
	try {
		const { id } = req.params;

		const user = await User.findById(id);
		if (!user) {
			return sendResponse(res, 404, "User not found");
		}

		// get withdrawal requests
		const withdrawalRequests = await Withdraw.find({
			userRef: user._id,
			status: "pending"
		})
			.sort({ createdAt: -1 })
			.limit(10)
			.exec();

		let userWalletBalance = await WalletBalance.findOne({ userRef: user._id });
		if (!userWalletBalance) {
			userWalletBalance = await createWalletBalance(user._id);
		}

		const multiplier = 10 ** 18; // number of decimals for precision
		const data = JSON.parse(await getAsync("crypto:prices"));

		// Fetch balances and convert them dynamically
		const userBalance = [];
		for (const [tokenx, balance] of userWalletBalance.balances.entries()) {
			const token = tokenx.toLowerCase();
			const tokenBalance = BigInt(balance || "0");
			const tokenPrice = BigInt(
				Math.round(
					data[TICKER_TO_TOKEN_NAME[token]]?.usd * Number(multiplier),
				) || "0",
			);
			const tokenDecimal =
				(await getSupportedTokenDecimalMultiplier(token)) || 10 ** 9;
			const tokenBalanceConverted =
				(tokenBalance * tokenPrice) / BigInt(tokenDecimal * multiplier);

			userBalance.push({
				tokenType: token,
				amount: tokenBalance.toString(),
				conversion: tokenBalanceConverted
					? tokenBalanceConverted.toString()
					: "--",
				id: generateRandomToken(),
			});
		}

		const userData = {
			userBalance: userBalance,
			withdrawalRequests,
		};
		sendResponse(
			res,
			200,
			"User balance and withdrawal requests retrieved successfully.",
			userData,
		);
	} catch (error) {
		console.error("Error retrieving user balances:", error);
		sendResponse(
			res,
			500,
			"An error occurred while retrieving the user balances.",
		);
	}
};

exports.updateUserBalance = async (req, res) => {
	try {
		const { id } = req.params;
		var { tokenType, amount = 0 } = req.body;
		tokenType = tokenType.toLowerCase();
		// req.user should be populated by the authenticate middleware
		const admin = req.user;

		// Validate tokenType
		const validCoinTypes = await getAllValidTickers();
		if (!validCoinTypes.includes(tokenType)) {
			return sendResponse(res, 400, "Invalid token type");
		}

		// Validate amount
		if (isNaN(Number(amount)) || Number(amount) === 0) {
			return sendResponse(res, 400, "Invalid amount");
		}
		const amountBigInt = BigInt(amount);

		// Find user
		const user = await User.findById(id);
		if (!user) {
			return sendResponse(res, 404, "User not found");
		}

		// Handle points separately
		if (tokenType === "points") {
			const currentPoints = BigInt(user.temporaryPoints || "0");
			const newPoints = currentPoints + amountBigInt;

			if (newPoints < 0n) {
				newPoints = 0n;
			}

			user.temporaryPoints = newPoints.toString();
			await user.save();
		} else {
			// Find or create wallet balance for user
			let userWalletBalance = await WalletBalance.findOne({
				userRef: user._id,
			});
			if (!userWalletBalance) {
				userWalletBalance = await createWalletBalance(user._id);
			}

			// Update the balance
			const currentBalance = BigInt(
				userWalletBalance.balances.get(tokenType) || "0",
			);
			const newBalance = currentBalance + amountBigInt;

			if (newBalance < 0n) {
				newBalance = 0n;
			}

			userWalletBalance.balances.set(tokenType, newBalance.toString());
			await userWalletBalance.save();

			// Track deposits for positive amounts
			if (amountBigInt > 0n) {
				const deposit = new Deposit({
					userRef: user._id,
					fromAddress: admin._id.toString(),
					amount: amountBigInt.toString(),
					transactionHash: generateRandomToken(),
					coinType: tokenType,
					network: "internal",
				});
				await deposit.save();
			} else {
				// // Track withdrawals for negative amounts
				// const latestWithdraw = await Withdraw.findOne({
				// 	userRef: user._id,
				// }).sort({ createdAt: -1 });

				// const withdraw = new Withdraw({
				// 	userRef: user._id,
				// 	toAddress: admin._id.toString(),
				// 	amount: amountBigInt.toString(),
				// 	transactionHash: generateRandomToken(),
				// 	coinType: tokenType,
				// 	status: "debited-internally",
				// 	network: "internal",
				// 	currentTreasuryBalance: latestWithdraw
				// 		? latestWithdraw.currentTreasuryBalance
				// 		: "0",
				// 	currentUserTotalDeposited: latestWithdraw
				// 		? latestWithdraw.currentUserTotalDeposited
				// 		: "0",
				// 	currentUserTotalWithdrawn: latestWithdraw
				// 		? latestWithdraw.currentUserTotalWithdrawn
				// 		: "0",
				// });
				// await withdraw.save();
			}
		}
		sendResponse(res, 200, "User balance updated successfully");
	} catch (error) {
		console.error("Error updating user balance:", error);
		sendResponse(
			res,
			500,
			"An error occurred while updating the user balance.",
		);
	}
};

// needs admin previledge
// promote, hide/show and cancel only
exports.updateRaffle = async (req, res) => {
	const { raffleId, isActive, isFeatured, isCancelled } = req.body;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		let raffle = await Raffle.findById(raffleId);
		if (typeof isActive == "boolean") raffle.status.isActive = isActive;
		if (typeof isFeatured == "boolean") raffle.isFeatured = isFeatured;
		if (typeof isCancelled == "boolean") {
			raffle.isCancelled = isCancelled;
			if (isCancelled) {
				raffle.isCancelledBy = req.user._id;
			}
		}
		await raffle.save({ session });
		await session.commitTransaction();
		if (!raffle) {
			return sendResponse(res, 400, "Raffle not found.");
		} else {
			return sendResponse(res, 200, "Raffle update successfully", raffle);
		}
	} catch (err) {
		await session.abortTransaction();
		console.log("Error updating raffle", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	} finally {
		// End session
		session.endSession();
	}
};

exports.addFeaturedCommunity = async (req, res) => {
	const {
		communityName,
		twitterUsername,
		discordInviteUrl,
		webUrl,
		description,
	} = req.body;
	const session = await mongoose.startSession();
	session.startTransaction();
	let avatarKey;
	try {
		const data = {
			...(communityName && { communityName }),
			...(twitterUsername && { twitterUsername }),
			...(discordInviteUrl && { discordInviteUrl }),
			...(webUrl && { webUrl }),
			...(description && { description }),
			createdBy: req.user._id,
		};

		if (req.file) {
			// Upload the new file and update the user profile image key
			avatarKey = await convertToWebpAndUpload(
				req.file,
				"featured/community-images",
			);
			if (avatarKey) data.image = avatarKey;
		}

		const newFeaturedCommunity = new FeaturedCommunity(data);
		await newFeaturedCommunity.save({ session });
		await session.commitTransaction();
		return sendResponse(
			res,
			200,
			"Featured Community created successfully",
			newFeaturedCommunity,
		);
	} catch (err) {
		if (avatarKey) {
			await deleteFile(avatarKey, process.env.GCS_BUCKET_NAME);
		}
		await session.abortTransaction();
		console.log("Error adding featured community", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	} finally {
		session.endSession();
	}
};

exports.updateFeaturedCommunity = async (req, res) => {
	const {
		id,
		communityName,
		twitterUsername,
		discordInviteUrl,
		webUrl,
		description,
	} = req.body;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		const update = {
			...(communityName && { communityName }),
			...(twitterUsername && { twitterUsername }),
			...(discordInviteUrl && { discordInviteUrl }),
			...(webUrl && { webUrl }),
			...(description && { description }),
		};
		const community = await FeaturedCommunity.findOneAndUpdate(
			{ _id: mongoose.Types.ObjectId(id) },
			{ $set: update },
			{ new: true, session: session },
		);

		if (req.file && community) {
			// Upload the new file and update the user profile image key
			const avatarKey = await convertToWebpAndUpload(
				req.file,
				"featured/community-images",
			);
			if (avatarKey) {
				// Check if there's an existing image and delete it from GCS
				if (community.image) {
					await deleteFile(community.image, process.env.GCS_BUCKET_NAME);
				}
				community.image = avatarKey;
				await community.save({ session });
			}
		}

		if (!community) {
			await session.abortTransaction();
			return sendResponse(res, 400, "No featured community found");
		}
		await session.commitTransaction();
		return sendResponse(
			res,
			200,
			"Featured Community updated successfully",
			community,
		);
	} catch (err) {
		await session.abortTransaction();
		console.log("Error updating featured community", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	} finally {
		session.endSession();
	}
};

exports.deleteFeaturedCommunity = async (req, res) => {
	const { id } = req.body;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		const community = await FeaturedCommunity.findOneAndDelete(
			{ _id: mongoose.Types.ObjectId(id) },
			{ session: session },
		);

		if (!community) {
			await session.abortTransaction();
			return sendResponse(res, 400, "No featured community found");
		} else {
			// delete image here
			if (community.image) {
				await deleteFile(community.image, process.env.GCS_BUCKET_NAME);
			}
		}
		await session.commitTransaction();
		return sendResponse(
			res,
			200,
			"Featured Community deleted successfully",
			community,
		);
	} catch (err) {
		await session.abortTransaction();
		console.log("Error deleting featured community", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	} finally {
		session.endSession();
	}
};

exports.getFeaturedCommunity = async (req, res) => {
	try {
		const { page = 1, id, communityName } = req.query;
		let limit = parseInt(req.query.limit || "10", 10);
		limit = limit > 0 ? Math.min(limit, 10) : 10;
		const filter = {
			...(id && { _id: mongoose.Types.ObjectId(id) }),
			...(communityName && { communityName }),
			// add additional filter here
			// also update indexing when adding additional filter
		};

		const communities = await FeaturedCommunity.find(filter)
			.sort({ createdAt: -1 })
			.limit(limit)
			.skip((page - 1) * limit)
			.exec();

		const data = await Promise.all(
			communities.map(async (community) => {
				const communityAsObject = community.toObject();
				return {
					...communityAsObject,
					image: await getImage(
						community.image,
						REDIS_FEATURED_COMMUNITY_IMAGE_KEY,
					),
				};
			}),
		);
		const count = await FeaturedCommunity.countDocuments(filter);
		return sendResponse(res, 200, "Success", {
			featuredCommunities: data,
			totalPages: Math.ceil(count / limit),
			currentPage: parseInt(page),
			totalCount: count,
		});
	} catch (err) {
		console.error("Error retrieving featured communities:", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	}
};

exports.addFeaturedToken = async (req, res) => {
	const { tokenName, description } = req.body;
	const session = await mongoose.startSession();
	session.startTransaction();
	let avatarKey;
	try {
		const data = {
			...(tokenName && { tokenName }),
			...(description && { description }),
			createdBy: req.user._id,
		};

		if (req.file) {
			// Upload the new file and update the user profile image key
			avatarKey = await convertToWebpAndUpload(
				req.file,
				"featured/token-images",
			);
			if (avatarKey) data.image = avatarKey;
		}

		const newFeaturedToken = new FeaturedToken(data);
		await newFeaturedToken.save({ session });
		await session.commitTransaction();
		return sendResponse(
			res,
			200,
			"Featured Token created successfully",
			newFeaturedToken,
		);
	} catch (err) {
		if (avatarKey) {
			await deleteFile(avatarKey, process.env.GCS_BUCKET_NAME);
		}
		await session.abortTransaction();
		console.log("Error adding featured token", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	} finally {
		session.endSession();
	}
};

exports.updateFeaturedToken = async (req, res) => {
	const { id, tokenName, description } = req.body;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		const update = {
			...(tokenName && { tokenName }),
			...(description && { description }),
		};
		const token = await FeaturedToken.findOneAndUpdate(
			{ _id: mongoose.Types.ObjectId(id) },
			{ $set: update },
			{ new: true, session: session },
		);
		if (req.file && token) {
			// Upload the new file and update the user profile image key
			const avatarKey = await convertToWebpAndUpload(
				req.file,
				"featured/token-images",
			);
			if (avatarKey) {
				// Check if there's an existing image and delete it from GCS
				if (token.image) {
					await deleteFile(token.image, process.env.GCS_BUCKET_NAME);
				}
				token.image = avatarKey;
				await token.save({ session });
			}
		}

		if (!token) {
			await session.abortTransaction();
			return sendResponse(res, 400, "No featured token found");
		}
		await session.commitTransaction();
		return sendResponse(res, 200, "Featured Token updated successfully", token);
	} catch (err) {
		await session.abortTransaction();
		console.log("Error updating featured token", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	} finally {
		session.endSession();
	}
};

exports.deleteFeaturedToken = async (req, res) => {
	const { id } = req.body;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		const token = await FeaturedToken.findOneAndDelete(
			{ _id: mongoose.Types.ObjectId(id) },
			{ session: session },
		);

		if (!token) {
			await session.abortTransaction();
			return sendResponse(res, 400, "No featured token found");
		}

		// Delete image if it exists
		if (token.image) {
			await deleteFile(token.image, process.env.GCS_BUCKET_NAME);
		}
		await session.commitTransaction();
		return sendResponse(
			res,
			200,
			"Featured Community deleted successfully",
			token,
		);
	} catch (err) {
		await session.abortTransaction();
		console.log("Error deleting featured token", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	} finally {
		session.endSession();
	}
};

exports.getFeaturedToken = async (req, res) => {
	try {
		const { page = 1, id, tokenName } = req.query;
		let limit = parseInt(req.query.limit || "10", 10);
		limit = limit > 0 ? Math.min(limit, 10) : 10;
		const filter = {
			...(id && { _id: mongoose.Types.ObjectId(id) }),
			...(tokenName && { tokenName }),
			// add additional filter here
			// also update indexing when adding additional filter
		};

		const tokens = await FeaturedToken.find(filter)
			.sort({ createdAt: -1 })
			.limit(limit)
			.skip((page - 1) * limit)
			.exec();

		const data = await Promise.all(
			tokens.map(async (token) => {
				const tokenAsObject = token.toObject();
				return {
					...tokenAsObject,
					image: await getImage(token.image, REDIS_FEATURED_TOKEN_IMAGE_KEY),
				};
			}),
		);
		const count = await FeaturedToken.countDocuments(filter);
		return sendResponse(res, 200, "Success", {
			featuredTokens: data,
			totalPages: Math.ceil(count / limit),
			currentPage: parseInt(page),
			totalCount: count,
		});
	} catch (err) {
		console.error("Error retrieving featured tokens:", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	}
};

exports.overrideAllowlistWinnerDraw = async (req, res) => {
	const allowlist = req.allowlist;

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		let winningNumbers;
		if (allowlist.winnerCount > 0) {
			// const seed =
			("65426469662354611784473905808410978691062132394446912436502799897201512339271");
			// winningNumbers = await clientService.pickRandomTicketNumbers(allowlist);
			// winningNumbers = generateUniqueRandomNumbers(seed, allowlist.winnerCount, 1, 7);
		}
		// await clientService.concludeAllowlist(session, allowlist, winningNumbers);
		await clientService.prepareAllowlist(session, allowlist);
		await session.commitTransaction();
		return sendResponse(res, 200, "Successfully drawn winners for allowlist");
	} catch (err) {
		await session.abortTransaction();
		console.log(`Error drawing winners for allowlist ${allowlist._id}:`, err);
		return sendResponse(res, 500, "Something went wrong.", err);
	} finally {
		session.endSession();
	}
};
