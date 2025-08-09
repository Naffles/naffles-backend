const mongoose = require("mongoose");
const ClientProfile = require("../models/client/clientProfile");
const sendResponse = require("../utils/responseHandler");
const ClientSubscriptionTransactionHistory = require("../models/client/clientSubscriptionTransactionHistory");
const WalletBalance = require("../models/user/walletBalance");
const { convertToWebpAndUpload, convertToBigInt } = require("../utils/convert");
const { deleteFile, getAndOrSetCachedSignedUrl } = require("../services/gcs");
const {
	GCS_PROFILE_PICTURE_TTL,
	VALID_COMMUNITY_TASK,
} = require("../config/config");
const ClientMemberProfile = require("../models/client/clientMemberProfile");
const ClientAdminAdjustBalanceHistory = require("../models/client/clientAdminAdjustBalanceHistory");
const ClientAdminActivityManagement = require("../models/client/clientAdminActivityManagement");
const ClientShop = require("../models/client/items/shop/clientShop");
const {
	AllowableTokenContractsForLotteries,
} = require("../models/admin/fileUploadSettings/uploadableContent");
const { handleFileUpdate } = require("../utils/helpers");
const ClientShopTransactionHistory = require("../models/client/items/shop/clientShopTransactionHistory");
const createWalletBalance = require("../utils/createWalletBalance");
const csvParser = require("csv-parser");
const stream = require("stream");
const ClientShopCsvData = require("../models/client/items/shop/clientShopCsvData");
const ClientTask = require("../models/client/items/earn/clientTask");
const {
	isBotInTelegramChannelFunction,
	isUserInTelegramChannel,
	isBotInGuildFunction,
	isUserInGuildFunction,
} = require("../middleware/validate");
const ClientMemberClaimedTask = require("../models/client/items/earn/clientMemberClaimedTask");
const clientMemberProfile = require("../models/client/clientMemberProfile");
const {
	REQUIRED_NAFFLINGS_ON_INCREASING_CLIENT_PROFILE,
	SUBSCRIPTION_FEE_IN_USD,
} = require("../config/client");
const { checkTwitterTaskQueue } = require("../config/queue");
const clientService = require("../services/clientService");
const User = require("../models/user/user");
const { pointsEarnedByActivity } = require("../services/pointsService");

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

exports.getMyCommunities = async (req, res) => {
	const user = req.user;
	const page = parseInt(req.query.page) || 1; // Default page to 1
	const limit = parseInt(req.query.limit) || 20; // Default limit to 20
	const sortBy = req.query.sortBy || "createdAt"; // Default sort by earned points
	const sortOrder = req.query.sortOrder === "desc" ? -1 : 1; // Default sort order is ascending (1)
	try {
		// Pagination logic
		const skip = (page - 1) * limit;

		// Build the sort object based on the query parameters
		const sortOptions = {};
		sortOptions[sortBy] = sortOrder;

		// Query to find the ClientMemberProfiles
		const memberProfiles = await ClientMemberProfile.find({
			memberRef: user._id,
		})
			.sort(sortOptions) // Apply sorting
			.skip(skip)
			.limit(limit)
			.populate(
				"clientProfileRef",
				"name socials backgroundImage pointSystem.name icon",
			) // Populate member details, including profileImage
			.exec();
		// Fetch the signed URL for profile images
		const communities = await Promise.all(
			memberProfiles.map(async (profile) => {
				const { clientProfileRef } = profile;
				const returnData = {
					name: clientProfileRef.name,
					pointSystem: { name: clientProfileRef.pointSystem.name },
					socials: clientProfileRef?.socials,
				};

				if (clientProfileRef?.backgroundImage) {
					// Fetch the signed URL for the profileImage
					returnData.backgroundImageUrl = await getAndOrSetCachedSignedUrl(
						clientProfileRef.backgroundImage,
						process.env.GCS_BUCKET_NAME,
						GCS_PROFILE_PICTURE_TTL,
					);
				}

				if (clientProfileRef?.icon) {
					// Fetch the signed URL for the profileImage
					returnData.iconUrl = await getAndOrSetCachedSignedUrl(
						clientProfileRef.icon,
						process.env.GCS_BUCKET_NAME,
						GCS_PROFILE_PICTURE_TTL,
					);
				}

				return returnData;
			}),
		);

		// Get the total count for pagination
		const total = await ClientMemberProfile.countDocuments({
			memberRef: user._id,
		});

		// Send the paginated response
		return sendResponse(res, 200, "Successfully fetched member profiles", {
			page,
			limit,
			totalPages: Math.ceil(total / limit),
			totalMembers: total,
			communities, // Send member profiles with profileImageUrl included
		});
	} catch (error) {
		console.log("Error getting communities: ", error);
		return sendResponse(res, 500, "Error getting user communities");
	}
};


exports.exploreCommunities = async (req, res) => {
	try {
		const { query, page = 1 } = req.query;
		const limit = parseInt(req.query.limit || "10", 10);
		const skip = (page - 1) * limit;
		let communities, count;

		// Ensure the current date is in UTC+0
		const utcNow = new Date(new Date().toISOString());
		// Base query to exclude documents with no valid name
		const baseQuery = {
			name: { $ne: null, $ne: "" }, // Exclude null or empty name
			expiresAt: { $gte: utcNow },
		};

		if (query) {
			// Use regex for partial, case-insensitive matching
			const searchRegex = new RegExp(query, "i");
			baseQuery.name.$regex = searchRegex;

			communities = await ClientProfile.find(baseQuery)
				.sort({ createdAt: -1 }) // Sort by creation date
				.limit(limit)
				.skip(skip)
				.exec();

			// Count matching users for pagination
			count = await ClientProfile.countDocuments(baseQuery);
		} else {
			// No query: Fetch all users with pagination
			communities = await ClientProfile.find(baseQuery)
				.sort({ createdAt: -1 })
				.limit(limit)
				.skip(skip)
				.exec();

			// Count matching users for pagination
			count = await ClientProfile.countDocuments(baseQuery);
		}

		// Map over each user to fetch their wallet address and game statistics
		const communitiesWithDetails = await Promise.all(
			communities.map(async (community) => {

				const returnData = {
					name: community?.name || "no name",
					pointSystem: { name: community.pointSystem.name },
					socials: community?.socials,
				};

				if (community?.backgroundImage) {
					// Fetch the signed URL for the profileImage
					returnData.backgroundImageUrl = await getAndOrSetCachedSignedUrl(
						community.backgroundImage,
						process.env.GCS_BUCKET_NAME,
						GCS_PROFILE_PICTURE_TTL,
					);
				}

				if (community?.icon) {
					// Fetch the signed URL for the profileImage
					returnData.iconUrl = await getAndOrSetCachedSignedUrl(
						community.icon,
						process.env.GCS_BUCKET_NAME,
						GCS_PROFILE_PICTURE_TTL,
					);
				}

				return returnData;
			}),
		);
		return sendResponse(res, 200, "success", {
			communities: communitiesWithDetails,
			totalPages: Math.ceil(count / limit),
			currentPage: parseInt(page),
			totalCommunity: count,
		});
	} catch (error) {
		console.error("Failed to retrieve communities:", error);
		return sendResponse(res, 500, "Failed to retrieve data", error.message);
	}
}

exports.addToMyCommunities = async (req, res) => {
	const { user, clientProfile } = req;
	try {
		var clientMemberProfile = await ClientMemberProfile.findOne({
			clientProfileRef: clientProfile._id,
			memberRef: user._id,
		});

		let message = "Already added to my communities";

		if (!clientMemberProfile) {
			clientMemberProfile = new ClientMemberProfile({
				clientProfileRef: clientProfile._id,
				memberRef: user._id,
			});
			await clientMemberProfile.save();
			message = "Successfully added to my communities";
		}

		return sendResponse(res, 200, message);
	} catch (error) {
		console.log("Error adding to my communities: ", err);
		return sendResponse(res, 500, "Error adding to my communities");
	}
};

exports.getClientMemberBalance = async (req, res) => {
	const { id } = req.params;
	const user = req.user;
	try {
		const clientProfile = await ClientProfile.findById(id);
		if (!clientProfile) {
			return sendResponse(res, 400, "Community Profile not found.");
		}

		const memberProfile = await ClientMemberProfile.findOne({
			clientProfileRef: id,
			memberRef: user._id,
		}).populate("clientProfileRef", "pointSystem.name");
		var balance;
		if (!memberProfile) {
			balance = 0;
		}
		balance = memberProfile?.points?.balance || 0;
		const name = clientProfile?.pointSystem?.name || "none";
		return sendResponse(res, 200, "Community Balance successfully fetched", {
			balance,
			name,
		});
	} catch (error) {
		console.log("Error getting client member balance: ", error);
		return sendResponse(res, 500, "Error getting member balance");
	}
};

exports.getClientProfile = async (req, res) => {
	const user = req.user;

	try {
		// Ensure the current date is in UTC+0
		const utcNow = new Date(new Date().toISOString());

		// Find client profile by user ID
		const clientProfile = await ClientProfile.findOne({ adminRef: user._id });

		// If profile is not found
		if (!clientProfile) {
			return sendResponse(res, 400, "User doesn't have a community profile.");
		}

		// Check if the profile is expired
		if (clientProfile.expiresAt && clientProfile.expiresAt <= utcNow) {
			return sendResponse(
				res,
				403,
				"Your community profile has expired. Please renew your subscription to continue.",
			);
		}

		// Convert profile to a plain object
		const client = clientProfile.toObject();

		// Generate signed URLs for backgroundImage and icon if they exist
		client.backgroundImageUrl = await generateSignedUrl(client.backgroundImage);
		client.iconUrl = await generateSignedUrl(client.icon);

		// Include subscription requirements
		client.requiredNafflingsOnIncreasingClientProfileFor30Days =
			REQUIRED_NAFFLINGS_ON_INCREASING_CLIENT_PROFILE;
		client.requiredUsdOnIncreasingClientProfileFor30Days =
			SUBSCRIPTION_FEE_IN_USD.DAYS_30;
		client.requiredUsdOnIncreasingClientProfileFor180Days =
			SUBSCRIPTION_FEE_IN_USD.DAYS_180;

		// Send successful response
		return sendResponse(
			res,
			200,
			"Successfully fetched community profile",
			client,
		);
	} catch (error) {
		console.log("Error getting community profile:", error);
		return sendResponse(res, 500, "Error getting community profile");
	}
};

exports.getAmountForIncreasingClientProfile = async (req, res) => {
	const amount = {
		requiredNafflingsOnIncreasingClientProfileFor30Days:
			REQUIRED_NAFFLINGS_ON_INCREASING_CLIENT_PROFILE,
		requiredUsdOnIncreasingClientProfileFor30Days:
			SUBSCRIPTION_FEE_IN_USD.DAYS_30,
		requiredUsdOnIncreasingClientProfileFor180Days:
			SUBSCRIPTION_FEE_IN_USD.DAYS_180,
	};
	return sendResponse(res, 200, "Successfully fetched amount needed", amount);
};

exports.getClientProfileUsingName = async (req, res) => {
	const { pointSystemName } = req.params;
	try {
		// Ensure the current date is in UTC+0
		const utcNow = new Date(new Date().toISOString());

		const clientProfile = await ClientProfile.findOne({
			"pointSystem.name": pointSystemName,
			"pointSystem.status": true,
			$or: [
				{ expiresAt: { $exists: false } }, // Include if expiresAt field is absent
				{ expiresAt: { $gt: utcNow } }, // Include if expiresAt is in the future
			],
		});

		if (!clientProfile) {
			return sendResponse(res, 400, "Community profile not found");
		}

		const client = clientProfile.toObject();

		// Generate signed URLs for backgroundImage and icon if they exist
		client.backgroundImageUrl = await generateSignedUrl(client.backgroundImage);
		client.iconUrl = await generateSignedUrl(client.icon);
		client.requiredNafflingsOnIncreasingClientProfileFor30Days =
			REQUIRED_NAFFLINGS_ON_INCREASING_CLIENT_PROFILE;
		client.requiredUsdOnIncreasingClientProfileFor30Days =
			SUBSCRIPTION_FEE_IN_USD.DAYS_30;
		client.requiredUsdOnIncreasingClientProfileFor180Days =
			SUBSCRIPTION_FEE_IN_USD.DAYS_180;

		return sendResponse(
			res,
			200,
			"Successfully fetched community profile",
			client,
		);
	} catch (error) {
		console.log("Error getting community profile: ", error);
		return sendResponse(res, 500, "Error getting community profile");
	}
};

exports.updateClientProfile = async (req, res) => {
	const user = req.user;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		const clientProfile = await ClientProfile.findOne({
			adminRef: user._id,
		}).session(session);
		if (!clientProfile) {
			await session.abortTransaction();
			return sendResponse(res, 400, "User doesn't have a community profile");
		}

		const updateFields = [
			"name",
			"description",
			"pointSystem.name",
			"pointSystem.status",
			"chatSystem",
			"socials.twitter",
			"socials.discord",
			"socials.telegram",
			"defaultGames.enabled",
			"defaultGames.buyInAmount",
			"jackpotPointsAccumulationPerTenSeconds.amount",
			"pointsJackpot.status",
			"pointsJackpot.periodInDays",
		];
		let isUpdated = false;
		// Generic update handler for the fields
		updateFields.forEach((field) => {
			if (
				req.body[field] !== undefined &&
				req.body[field] !== clientProfile[field]
			) {
				clientProfile.set(field, req.body[field]);
				if (field === "pointSystem.name") {
					clientProfile.set("pointSystem.nameInsensitive", req.body[field]);
				}
				isUpdated = true;
			}
		});
		// save beforehand so we can check if there's an error on the fields
		// before saving the image
		await clientProfile.save({ session });

		// Handle file updates in a reusable function
		const handleFileUpdate = async (fileKey, filePath, folderName) => {
			if (req.files && req.files[fileKey] && req.files[fileKey].length > 0) {
				const file = req.files[fileKey][0];
				const fileKeyNew = await convertToWebpAndUpload(file, folderName);
				const savedFileKey = clientProfile[filePath];
				if (fileKeyNew) {
					clientProfile[filePath] = fileKeyNew;
					const url = await getAndOrSetCachedSignedUrl(
						clientProfile[filePath],
						process.env.GCS_BUCKET_NAME,
						GCS_PROFILE_PICTURE_TTL,
					);
					// no need to save the url, just cache the image
					// clientProfile[`${filePath}Url`] = url;
					if (savedFileKey) {
						await deleteFile(savedFileKey);
					}
					isUpdated = true;
				}
			}
		};
		// Handle file updates
		await handleFileUpdate(
			"backgroundImage",
			"backgroundImage",
			"client-profile/background-images",
		);
		await handleFileUpdate("icon", "icon", "client-profile/icon-images");

		// If no updates were made, return a message and skip saving
		if (!isUpdated) {
			await session.abortTransaction();
			return sendResponse(
				res,
				200,
				"No changes detected in community profile.",
			);
		}

		await clientProfile.save({ session });
		await session.commitTransaction();
		return sendResponse(
			res,
			200,
			"Client Profile details updated successfully.",
		);
	} catch (error) {
		await session.abortTransaction();
		console.log("Error updating community profile:", error);
		return sendResponse(res, 500, error.message, { error: error.message });
	} finally {
		// End session
		session.endSession();
	}
};

exports.increaseClientSubscriptionUsingNafflings = async (req, res) => {
	const user = req.user;
	const { feeAmount, days = 30 } = req.fee;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// check first if it's already have a community profile if not create a new one
		var clientProfile = await ClientProfile.findOne({
			adminRef: user._id,
		}).session(session);
		if (!clientProfile) {
			clientProfile = new ClientProfile({ adminRef: user._id });
			await clientProfile.save({ session });
			// create community profile member
			const newMember = new ClientMemberProfile({
				clientProfileRef: clientProfile._id,
				memberRef: user._id,
			});
			await newMember.save({ session });
		}

		// deduct balance
		const feeAmountInBigInt = await convertToBigInt(Math.floor(feeAmount));
		target = "temporaryPoints";
		const newBalance = BigInt(user[target].toString()) - feeAmountInBigInt;
		user[target] = newBalance.toString();
		await user.save({ session });

		// create a transaction document
		const clientTx = new ClientSubscriptionTransactionHistory({
			clientProfileRef: clientProfile._id,
			fee: { feeInNafflings: feeAmount },
			days,
			coinType: "nafflings-internal",
		});
		await clientTx.save({ session });

		// Calculate new expiration date in UTC+0
		const currentDate = clientProfile.expiresAt
			? new Date(clientProfile.expiresAt)
			: new Date();
		const currentUTCDate = Date.UTC(
			currentDate.getUTCFullYear(),
			currentDate.getUTCMonth(),
			currentDate.getUTCDate(),
			currentDate.getUTCHours(),
			currentDate.getUTCMinutes(),
			currentDate.getUTCSeconds(),
		);

		const newExpirationDateUTC = new Date(
			currentUTCDate + days * 24 * 60 * 60 * 1000,
		); // Add 'days' in milliseconds

		// Update the community profile with the new expiration date in UTC
		clientProfile.expiresAt = newExpirationDateUTC;
		await clientProfile.save({ session });
		await session.commitTransaction();
		return sendResponse(res, 201, "Subscription successful", clientProfile);
	} catch (error) {
		await session.abortTransaction();
		console.log("Error extending community profile using nafflings:", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	} finally {
		// End session
		session.endSession();
	}
};

exports.increaseClientSubscription = async (req, res) => {
	const { days } = req.params;
	const { feeInCrypto, coinType, feeInUsd } = req.fee;
	const user = req.user;
	const clientProfile = req.clientProfile;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// deduct the amount to user balance
		const userWallet = await WalletBalance.findOne({
			userRef: user._id,
		}).session(session);
		const balances = userWallet.balances;
		let userBalance = BigInt(balances.get(coinType) || "0");

		const deductedBalance = userBalance - BigInt(feeInCrypto);
		userWallet.balances.set(coinType, deductedBalance.toString());
		await userWallet.save({ session });

		// create a transaction document
		const clientTx = new ClientSubscriptionTransactionHistory({
			clientProfileRef: clientProfile._id,
			days,
			fee: { feeInUsd, feeInCrypto },
			coinType,
		});
		await clientTx.save({ session });

		// Calculate new expiration date in UTC+0
		const currentDate = clientProfile.expiresAt
			? new Date(clientProfile.expiresAt)
			: new Date();
		const currentUTCDate = Date.UTC(
			currentDate.getUTCFullYear(),
			currentDate.getUTCMonth(),
			currentDate.getUTCDate(),
			currentDate.getUTCHours(),
			currentDate.getUTCMinutes(),
			currentDate.getUTCSeconds(),
		);

		const newExpirationDateUTC = new Date(
			currentUTCDate + days * 24 * 60 * 60 * 1000,
		); // Add 'days' in milliseconds

		// Update the community profile with the new expiration date in UTC
		clientProfile.expiresAt = newExpirationDateUTC;
		await clientProfile.save({ session });
		await session.commitTransaction();
		return sendResponse(res, 201, "Subscription successful", clientProfile);
	} catch (error) {
		await session.abortTransaction();
		console.log("Error extending community profile:", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	} finally {
		// End session
		session.endSession();
	}
};

exports.getClientSubscriptionFeePerToken = async (req, res) => {
	return sendResponse(
		res,
		200,
		"Succefully fetched client subscription fee",
		req.fee,
	);
};

exports.followCommunity = async (req, res) => {
	const clientProfile = req.clientProfile;
	const user = req.user;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		const member = await ClientMemberProfile.find({
			clientProfileRef: clientProfile._id,
			memberRef: user._id,
		}).session(session);
		if (member) {
			await session.abortTransaction();
			return sendResponse(res, 400, "Community already followed");
		}

		const newMember = new clientMemberProfile({
			clientProfileRef: clientProfile._id,
			memberRef: user._id,
		}).session(session);

		await newMember.save({ session });
		await session.commitTransaction();
		return sendResponse(res, 201, "Community followed successfully");
	} catch (error) {
		// Rollback the transaction in case of an error
		await session.abortTransaction();
		console.log("Error following community:", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

// only admin
exports.changeUserBalance = async (req, res) => {
	const clientProfile = req.clientProfile;
	const adminRef = req.user;
	const { userId, action } = req.params;
	var amount = +req.body.amount;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// Validate the action
		if (!["credit", "debit"].includes(action)) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				"Invalid action. It must be either 'credit' or 'debit'.",
			);
		}

		// Validate the amount
		if (isNaN(amount) || amount <= 0) {
			await session.abortTransaction();
			return sendResponse(res, 400, "Invalid amount.");
		}

		// check if valid userId
		const userProfile = await User.findById(userId);
		if (!userProfile) {
			await session.abortTransaction();
			return sendResponse(res, 400, `Account to ${action} not found`);
		}

		// Find the user's ClientMemberProfile
		let clientMemberProfile = await ClientMemberProfile.findOne({
			clientProfileRef: clientProfile._id,
			memberRef: userId,
		}).session(session);

		if (!clientMemberProfile) {
			// If the profile is not found, create a new one
			clientMemberProfile = new ClientMemberProfile({
				clientProfileRef: clientProfile._id,
				memberRef: userId,
			});
			await clientMemberProfile.save({ session }); // Save the new profile with session
		}
		// Adjust the user's earned points based on action
		if (action === "credit") {
			clientMemberProfile.points.earned += amount;
		} else if (action === "debit") {
			// Check if balance is less than the amount to debit
			if (clientMemberProfile.points.balance < amount) {
				// If balance is less than the amount, set amount to balance so it doesn't go negative
				amount = clientMemberProfile.points.balance;
			}
			// Deduct the amount from earned points
			clientMemberProfile.points.earned -= amount;
		}

		// Save the changes in ClientMemberProfile
		await clientMemberProfile.save({ session });

		// Log the adjustment in ClientAdminAdjustBalanceHistory
		const balanceHistory = new ClientAdminAdjustBalanceHistory({
			clientProfileRef: mongoose.Types.ObjectId(clientProfile._id),
			adminRef: adminRef._id,
			user: userId,
			event: action,
			amount,
			userNewBalance: clientMemberProfile.points.earned, // log the new balance after adjustment
		});
		await balanceHistory.save({ session });

		// Commit the transaction
		await session.commitTransaction();
		return sendResponse(res, 200, "User balance successfully updated.");
	} catch (error) {
		// Rollback the transaction in case of an error
		await session.abortTransaction();
		console.log("Error changing user balance:", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

exports.getClientMemberProfiles = async (req, res) => {
	const { clientProfileId } = req.params;
	const page = parseInt(req.query.page) || 1; // Default page to 1
	const limit = parseInt(req.query.limit) || 20; // Default limit to 20
	const sortBy = req.query.sortBy || "points.earned"; // Default sort by earned points
	const sortOrder = req.query.sortOrder === "asc" ? 1 : -1; // Default sort order is ascending (1)

	try {
		// Find the community profile by ID
		const clientProfile = await ClientProfile.findById(clientProfileId);
		if (!clientProfile) {
			return sendResponse(res, 404, "Client profile not found.");
		}

		// Pagination logic
		const skip = (page - 1) * limit;

		// Build the sort object based on the query parameters
		const sortOptions = {};
		sortOptions[sortBy] = sortOrder;

		// Query to find the ClientMemberProfiles based on clientProfileId
		const memberProfiles = await ClientMemberProfile.find({
			clientProfileRef: clientProfileId,
		})
			.sort(sortOptions) // Apply sorting
			.skip(skip)
			.limit(limit)
			.populate("memberRef", "username profileImage") // Populate member details, including profileImage
			.exec();

		// Fetch the signed URL for profile images
		const populatedMemberProfiles = await Promise.all(
			memberProfiles.map(async (profile) => {
				const profileObj = profile.toObject();
				if (profileObj?.memberRef?.profileImage) {
					// Fetch the signed URL for the profileImage
					profileObj.memberRef.profileImageUrl =
						await getAndOrSetCachedSignedUrl(
							profileObj.memberRef.profileImage,
							process.env.GCS_BUCKET_NAME,
							GCS_PROFILE_PICTURE_TTL,
						);
				}
				return profileObj;
			}),
		);

		// Get the total count for pagination
		const total = await ClientMemberProfile.countDocuments({
			clientProfileRef: clientProfileId,
		});

		// Send the paginated response
		return sendResponse(res, 200, "Successfully fetched member profiles", {
			page,
			limit,
			totalPages: Math.ceil(total / limit),
			totalMembers: total,
			memberProfiles: populatedMemberProfiles, // Send member profiles with profileImageUrl included
		});
	} catch (error) {
		console.log("Error getting client member profiles:", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	}
};

exports.createShopItemCryptoTokenPot = async (req, res) => {
	const clientProfile = req.clientProfile;
	const adminRef = req.user;
	const productType = "token-pot-crypto";
	var { name, pot, sell } = req.body;

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// Validate inputs
		if (!name || !pot || !sell) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				"All fields are required: name, pot and sell.",
			);
		}

		// Check if the user already has 20 active tasks
		const activeShopItem = await ClientShop.countDocuments({
			adminRef: adminRef._id,
			status: "active",
		}).session(session);

		if (activeShopItem >= 20) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				"You can only have 20 active shop items at a time.",
			);
		}

		const potCurrency = pot.currency;
		// check if this is supported
		const tokenInfo = await AllowableTokenContractsForLotteries.findOne({
			ticker: potCurrency,
		}).session(session);
		if (!tokenInfo) {
			await session.abortTransaction();
			return sendResponse(res, 400, "Cointype not supported");
		}
		const potAmount = pot.amount;
		// check if the admin has this amount;
		const adminWallet = await WalletBalance.findOne({
			userRef: adminRef._id,
		}).session(session);
		if (!adminWallet) {
			await session.abortTransaction();
			return sendResponse(res, 400, "Admin does not have a wallet yet");
		}

		const balances = adminWallet.balances;
		const itemShopBalances = adminWallet?.itemShopBalances;

		const adminBalance = BigInt(balances.get(potCurrency) || "0");
		const adminItemShopBalance = BigInt(
			itemShopBalances.get(potCurrency) || "0",
		);
		if (BigInt(potAmount) > BigInt(adminBalance)) {
			await session.abortTransaction();
			return sendResponse(res, 400, `Not enough ${potCurrency} balance`, {
				currentBalance: adminBalance.toString(),
				amountToWithdraw: potAmount.toString(),
			});
		}
		// transfer the balance to itemShopBalance (balances -> itemShopBalances);
		// deduct the balance
		const newAdminBalance = adminBalance - BigInt(potAmount);
		adminWallet.balances.set(potCurrency, newAdminBalance);
		// add the amount here for selling
		const newAdminItemShopBalance = adminItemShopBalance + BigInt(potAmount);
		adminWallet.itemShopBalances.set(potCurrency, newAdminItemShopBalance);
		await adminWallet.save({ session });

		// save new shop item ('token-pot-crypto');
		const newShopItem = new ClientShop({
			clientProfileRef: clientProfile._id,
			adminRef: adminRef._id,
			name,
			productType,
			pot: {
				currency: potCurrency,
				amount: potAmount,
				tokenType: "crypto",
			},
			sell: {
				currency: clientProfile.pointSystem.name,
				price: sell.price || 0,
				tokenType: "community-token",
			},
		});

		// Save the shop item to the database
		await newShopItem.save({ session });

		// Handle file updates in a reusable function
		const handleFileUpdate = async (fileKey, filePath, folderName) => {
			if (req.files && req.files[fileKey] && req.files[fileKey].length > 0) {
				const file = req.files[fileKey][0];
				const fileKeyNew = await convertToWebpAndUpload(file, folderName);
				const savedFileKey = newShopItem[filePath];
				if (fileKeyNew) {
					newShopItem[filePath] = fileKeyNew;
					const url = await getAndOrSetCachedSignedUrl(
						newShopItem[filePath],
						process.env.GCS_BUCKET_NAME,
						GCS_PROFILE_PICTURE_TTL,
					);
					// no need to save the url, just cache the image
					// newShopItem[`${filePath}Url`] = url;
					if (savedFileKey) {
						await deleteFile(savedFileKey);
					}
				}
			}
		};
		// Handle file update
		await handleFileUpdate(
			"image",
			"image",
			"client-profile/shop-item/token-pot-crypto/image",
		);
		// Save the shop item to the database
		await newShopItem.save({ session });

		// Commit the transaction
		await session.commitTransaction();
		return sendResponse(res, 201, "Item successfully created.", newShopItem);
	} catch (error) {
		await session.abortTransaction();
		console.log("Error creating item in shop (token-pot-crypto):", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

// Use by a normal user to buy a token pot listed in the shop
exports.buyShopItemCryptoTokenPot = async (req, res) => {
	const user = req.user; // The user buying the item
	const shopItem = req.shopItem;

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// Check if the user has enough points to buy the item
		const clientMemberProfile = await ClientMemberProfile.findOne({
			clientProfileRef: shopItem.clientProfileRef,
			memberRef: user._id,
		}).session(session);

		if (
			!clientMemberProfile ||
			clientMemberProfile.points.balance < Number(shopItem.sell.price)
		) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				"Insufficient points balance to buy this item.",
			);
		}

		// Deduct the points from the user's balance
		clientMemberProfile.points.used += Number(shopItem.sell.price);

		// Save the updated client member profile
		await clientMemberProfile.save({ session });

		// Update the WalletBalance to add the pot amount to the user's balance
		var walletBalance = await WalletBalance.findOne({
			userRef: user._id,
		}).session(session);

		if (!walletBalance) {
			walletBalance = new WalletBalance({ userRef: user._id });
			await walletBalance.save({ session });
		}

		const potCurrency = shopItem.pot.currency;
		const potAmount = BigInt(shopItem.pot.amount);

		// Update the user's wallet balance by adding the purchased amount
		const currentBalance = BigInt(
			walletBalance.balances.get(potCurrency) || "0",
		);
		const newBalance = currentBalance + potAmount;
		walletBalance.balances.set(potCurrency, newBalance.toString());

		// Save the updated wallet balance
		await walletBalance.save({ session });

		// Deduct the pot amount from the admin's itemShopBalances
		const adminWallet = await WalletBalance.findOne({
			userRef: shopItem.adminRef,
		}).session(session);

		if (!adminWallet) {
			await session.abortTransaction();
			return sendResponse(res, 404, "Admin wallet not found.");
		}

		const adminItemShopBalance = BigInt(
			adminWallet.itemShopBalances.get(potCurrency) || "0",
		);

		if (potAmount > adminItemShopBalance) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				`Admin does not have enough ${potCurrency} in item shop balance for this transaction.`,
			);
		}

		// Calculate the new admin item shop balance after the purchase
		const newAdminItemShopBalance = adminItemShopBalance - potAmount;
		adminWallet.itemShopBalances.set(
			potCurrency,
			newAdminItemShopBalance.toString(),
		);

		// Save the updated admin wallet balance
		await adminWallet.save({ session });

		// Update the shop item status to 'completed' since it's bought
		shopItem.status = "completed";
		shopItem.buyerRef = user._id;
		await shopItem.save({ session });

		// Earn points based on setting: perCommunityProductPurchased
		await pointsEarnedByActivity(user._id, "perCommunityProductPurchased");

		// Commit the transaction
		await session.commitTransaction();

		// Send success response
		return sendResponse(
			res,
			200,
			"Item successfully purchased and balance updated.",
			{
				shopItem,
				newWalletBalance: newBalance.toString(),
			},
		);
	} catch (error) {
		await session.abortTransaction();
		console.error("Error buying shop item (token-pot-crypto):", error);
		return sendResponse(res, 500, "Something went wrong during the purchase.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

exports.createShopItemPointsTokenPot = async (req, res) => {
	const clientProfile = req.clientProfile;
	const adminRef = req.user;
	const productType = "token-pot-points";
	var { name, pot, sell } = req.body;

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// Validate inputs
		if (!name || !pot || !sell) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				"All fields are required: name, pot and sell.",
			);
		}

		// Check if the user already has 20 active tasks
		const activeShopItem = await ClientShop.countDocuments({
			adminRef: adminRef._id,
			status: "active",
		}).session(session);

		if (activeShopItem >= 20) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				"You can only have 20 active shop items at a time.",
			);
		}

		const sellCurrency = sell.currency;
		// check if this is supported before selling
		const tokenInfo = await AllowableTokenContractsForLotteries.findOne({
			ticker: sellCurrency,
		}).session(session);
		if (!tokenInfo) {
			await session.abortTransaction();
			return sendResponse(res, 400, "Cointype not supported");
		}

		// save new shop item ('token-pot-points');
		const newShopItem = new ClientShop({
			clientProfileRef: clientProfile._id,
			adminRef: adminRef._id,
			name,
			productType,
			pot: {
				currency: clientProfile.pointSystem.name,
				amount: pot.amount,
				tokenType: "community-token",
			},
			sell: {
				currency: sellCurrency,
				price: sell.price,
				tokenType: "crypto",
			},
		});

		// Save the shop item to the database
		await newShopItem.save({ session });

		// Handle file updates in a reusable function
		const handleFileUpdate = async (fileKey, filePath, folderName) => {
			if (req.files && req.files[fileKey] && req.files[fileKey].length > 0) {
				const file = req.files[fileKey][0];
				const fileKeyNew = await convertToWebpAndUpload(file, folderName);
				const savedFileKey = newShopItem[filePath];
				if (fileKeyNew) {
					newShopItem[filePath] = fileKeyNew;
					const url = await getAndOrSetCachedSignedUrl(
						newShopItem[filePath],
						process.env.GCS_BUCKET_NAME,
						GCS_PROFILE_PICTURE_TTL,
					);
					// no need to save the url, just cache the image
					// newShopItem[`${filePath}Url`] = url;
					if (savedFileKey) {
						await deleteFile(savedFileKey);
					}
				}
			}
		};
		// Handle file update
		await handleFileUpdate(
			"image",
			"image",
			"client-profile/shop-item/token-pot-points/image",
		);
		// Save the shop item to the database
		await newShopItem.save({ session });

		// Commit the transaction
		await session.commitTransaction();
		return sendResponse(res, 201, "Item successfully created.", newShopItem);
	} catch (error) {
		await session.abortTransaction();
		console.log("Error creating item in shop (token-pot-points):", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

// Use by a normal user to buy points using crypto from their wallet
exports.buyShopItemPointsTokenPot = async (req, res) => {
	const user = req.user; // The user buying points
	const shopItem = req.shopItem;

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// Check if the user has enough crypto balance to buy the points
		const userWallet = await WalletBalance.findOne({
			userRef: user._id,
		}).session(session);

		if (!userWallet) {
			await session.abortTransaction();
			return sendResponse(res, 404, "User wallet not found.");
		}

		const sellCurrency = shopItem.sell.currency;
		const sellAmount = BigInt(shopItem.sell.price);

		const userCryptoBalance = BigInt(
			userWallet.balances.get(sellCurrency) || "0",
		);

		if (sellAmount > userCryptoBalance) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				`Insufficient ${sellCurrency} balance to buy points.`,
			);
		}

		// Deduct the crypto amount from the user's wallet
		const newUserCryptoBalance = userCryptoBalance - sellAmount;
		userWallet.balances.set(sellCurrency, newUserCryptoBalance.toString());
		await userWallet.save({ session });

		// Credit the crypto amount to the admin's wallet
		var adminWallet = await WalletBalance.findOne({
			userRef: shopItem.adminRef,
		}).session(session);

		if (!adminWallet) {
			adminWallet = new WalletBalance({ userRef: shopItem.adminRef });
			await adminWallet.save({ session });
		}

		const currentAdminCryptoBalance = BigInt(
			adminWallet.balances.get(sellCurrency) || "0",
		);
		const newAdminCryptoBalance = currentAdminCryptoBalance + sellAmount;
		adminWallet.balances.set(sellCurrency, newAdminCryptoBalance.toString());
		await adminWallet.save({ session });

		// Credit the points amount to the user's clientMemberProfile balance
		var clientMemberProfile = await ClientMemberProfile.findOne({
			clientProfileRef: shopItem.clientProfileRef,
			memberRef: user._id,
		}).session(session);

		if (!clientMemberProfile) {
			clientMemberProfile = new ClientMemberProfile({
				clientProfileRef: shopItem.clientProfileRef,
				memberRef: user._id,
			});
			await clientMemberProfile.save({ session });
		}

		// Add the points to the user's balance
		clientMemberProfile.points.earned += Number(shopItem.pot.amount);
		await clientMemberProfile.save({ session });

		// Update the shop item status to 'completed' since the transaction is successful
		shopItem.status = "completed";
		shopItem.buyerRef = user._id; // Assign buyer reference
		await shopItem.save({ session });

		// Earn points based on setting: perCommunityProductPurchased
		await pointsEarnedByActivity(user._id, "perCommunityProductPurchased");

		// Commit the transaction
		await session.commitTransaction();

		// Send success response
		return sendResponse(
			res,
			200,
			"Points successfully purchased using crypto and balance updated.",
			{
				shopItem,
				newUserCryptoBalance: newUserCryptoBalance.toString(),
				userPointsBalance: clientMemberProfile.points.earned.toString(),
			},
		);
	} catch (error) {
		await session.abortTransaction();
		console.error("Error buying shop item (token-pot-points):", error);
		return sendResponse(res, 500, "Something went wrong during the purchase.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

exports.deleteAdminActivity = async (req, res) => {
	const clientProfile = req.clientProfile;
	const adminRef = req.user;
	const { activity, id } = req.params;

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		if (activity == "shop-item") {
			// Find the item to be deleted
			const item = await ClientShop.findOne({
				_id: id,
				clientProfileRef: clientProfile._id,
				adminRef: adminRef._id,
			})
				.select("+csv")
				.session(session);
			if (!item) {
				await session.abortTransaction();
				return sendResponse(res, 404, "Shop Item not found");
			}

			// Delete the shop item (this will trigger the pre('remove') hook)
			await item.remove({ session });

			if (item.image) await deleteFile(item.image);
			if (item.file) await deleteFile(item.file);
			if (item.csv) await deleteFile(item.csv);

			// Commit the transaction
			await session.commitTransaction();
			return sendResponse(
				res,
				200,
				"Shop Item and associated activity deleted successfully",
			);
		} else if (
			activity == "telegram-task" ||
			activity == "discord-task" ||
			activity == "twitter-task"
		) {
			const task = await ClientTask.findById(id).session(session);
			if (!task) {
				await session.abortTransaction();
				return sendResponse(res, 404, "task not found");
			}
			// Delete the task
			await task.remove({ session });
			// Commit the transaction
			await session.commitTransaction();
			return sendResponse(
				res,
				200,
				`${task?.earnType} task and associated activity deleted successfully`,
			);
		}

		await session.abortTransaction();
		return sendResponse(res, 400, "Invalid activity");
	} catch (error) {
		await session.abortTransaction();
		console.log("Error deleting Shop Item:", error);
		return sendResponse(res, 500, "Something went wrong", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

exports.getClientAdminActivities = async (req, res) => {
	const clientProfile = req.clientProfile;
	const page = parseInt(req.query.page) || 1; // Default page is 1
	const limit = parseInt(req.query.limit) || 10; // Default limit is 10
	const sortBy = req.query.sortBy || "startDate"; // Default sorting by startDate
	const sortOrder = req.query.sortOrder === "asc" ? 1 : -1; // Default sort order is descending
	const status = req.query.status; // Get status from query params

	try {
		// Define the sort object dynamically based on the request query
		const sortOptions = {};
		sortOptions[sortBy] = sortOrder;
		// Build the query object
		const query = {
			clientProfileRef: clientProfile._id,
			// Filter activities whose endDate is greater than or equal to the current date
			$or: [
				{ endDate: { $gte: new Date() } },
				{ endDate: { $exists: false } }, // Include documents where endDate doesn't exist
				{ itemType: "allowlist-raffle" }, // Include all allowlist regardless of endDate
			],
		};
		if (status) {
			query.status = status;
		}
		// Query to find all activities related to the clientProfile with optional pagination and sorting
		const activities = await ClientAdminActivityManagement.find(query)
			.sort(sortOptions) // Apply sorting based on the sortOptions
			.skip((page - 1) * limit) // Skip for pagination
			.limit(limit) // Limit the number of records per page
			.exec();

		// Get the total count of activities for pagination
		const totalActivities =
			await ClientAdminActivityManagement.countDocuments(query);
		return sendResponse(res, 200, "Client activities retrieved successfully", {
			page,
			limit,
			totalPages: Math.ceil(totalActivities / limit),
			totalActivities,
			activities,
		});
	} catch (error) {
		console.log("Error fetching client admin activities:", error);
		return sendResponse(res, 500, "Something went wrong", {
			error: error.message,
		});
	}
};

exports.isUserHasEnoughBalanceToBuyItemInShop = async (req, res) => {
	const buyer = req.user;
	const { shopItemId: id } = req.params;
	try {
		// Validate that the item ID is provided
		if (!id) {
			return sendResponse(res, 400, "Shop item ID is required.");
		}

		// Find the shop item being purchased and check if it's active and of type 'token-pot-crypto'
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
		const sellTokenType = shopItem.sell.tokenType;
		if (!sellTokenType) {
			return sendResponse(res, 404, "Not valid token type");
		}

		if (sellTokenType == "crypto") {
			// Check if the user has enough crypto balance to buy the points
			const userWallet = await WalletBalance.findOne({ userRef: buyer._id });

			if (!userWallet) {
				return sendResponse(res, 404, "User wallet not found.");
			}

			const sellCurrency = shopItem.sell.currency;
			const sellAmount = BigInt(shopItem.sell.price);

			const userCryptoBalance = BigInt(
				userWallet.balances.get(sellCurrency) || "0",
			);

			if (sellAmount > userCryptoBalance) {
				return sendResponse(
					res,
					400,
					`Insufficient ${sellCurrency} balance to buy points.`,
				);
			}
		} else {
			// community-token
			// Check if the user has enough points to buy the item
			const clientMemberProfile = await ClientMemberProfile.findOne({
				clientProfileRef: shopItem.clientProfileRef,
				memberRef: buyer._id,
			});

			if (
				!clientMemberProfile ||
				clientMemberProfile.points.balance < Number(shopItem.sell.price)
			) {
				return sendResponse(
					res,
					400,
					"Insufficient points balance to buy this item.",
				);
			}
		}
		return sendResponse(res, 200, "User has enough balance to buy this item");
	} catch (error) {
		console.log("Error fetching client admin activities:", error);
		return sendResponse(res, 500, "Something went wrong", {
			error: error.message,
		});
	}
};

exports.createShopItemFile = async (req, res) => {
	const clientProfile = req.clientProfile;
	const adminRef = req.user;
	const productType = "file";
	var { name, sell, quantity } = req.body;

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// Validate inputs
		if (!name || !sell || !quantity) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				"All fields are required: name, sell and quantity.",
			);
		}

		// Check if the user already has 20 active tasks
		const activeShopItem = await ClientShop.countDocuments({
			adminRef: adminRef._id,
			status: "active",
		}).session(session);

		if (activeShopItem >= 20) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				"You can only have 20 active shop items at a time.",
			);
		}

		// check for sell token type
		var sellCurrency = sell.currency;
		if (sell.tokenType == "crypto") {
			// check if the currency is supported
			const tokenInfo = await AllowableTokenContractsForLotteries.findOne({
				ticker: sellCurrency,
			}).session(session);
			if (!tokenInfo) {
				await session.abortTransaction();
				return sendResponse(res, 400, "Sell currency not supported");
			}
		} else {
			// make sure that the pointSystem name and sell currency
			// is same on the clientProfile when tokenType is 'community-token'
			sellCurrency = clientProfile.pointSystem.name;
		}

		// save new shop item ('file');
		var newShopItem = new ClientShop({
			clientProfileRef: clientProfile._id,
			adminRef: adminRef._id,
			name,
			productType,
			totalCount: quantity,
			pot: {
				quantity,
			},
			sell: {
				currency: sellCurrency,
				price: sell.price || 0,
				tokenType: sell.tokenType,
			},
		});

		// // Save the shop item to the database
		await newShopItem.save({ session });
		// Use dynamic file upload for image (convert to webp)
		newShopItem = await handleFileUpdate(
			req,
			newShopItem,
			"image",
			"image",
			"client-profile/shop-item/file/image",
			true,
		);
		// // Use dynamic file upload for fileData (no conversion)
		newShopItem = await handleFileUpdate(
			req,
			newShopItem,
			"file",
			"file",
			"client-profile/shop-item/file/file",
			false,
		);
		// Save the shop item again with updated file paths
		await newShopItem.save({ session });
		// Commit the transaction
		await session.commitTransaction();
		return sendResponse(res, 201, "Item successfully created.", newShopItem);
	} catch (error) {
		await session.abortTransaction();
		console.log("Error creating item in shop (file):", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

exports.buyShopItemFile = async (req, res) => {
	const buyer = req.user; // The user buying the item
	const shopItem = req.shopItem;

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// check if there's enough quantity left.
		const quantity = shopItem.pot.quantity || 0;
		if (quantity <= 0) {
			await session.abortTransaction();
			return sendResponse(res, 404, "There's no item left to buy");
		}

		// check buyer balance if enough and deduct and send to seller
		const sellTokenType = shopItem.sell.tokenType;
		const sellCurrency = shopItem.sell.currency;
		const sellAmount = shopItem.sell.price;
		// check if it's a community-token or a crypto
		// transact the payment
		if (sellTokenType == "crypto") {
			// check if the coin is supported
			const tokenInfo = await AllowableTokenContractsForLotteries.findOne({
				ticker: sellCurrency,
			}).session(session);
			if (!tokenInfo) {
				await session.abortTransaction();
				return sendResponse(res, 400, "Sell currency not supported");
			}

			// check if the buyer has this amount;
			const buyerWallet = await WalletBalance.findOne({
				userRef: buyer._id,
			}).session(session);
			if (!buyerWallet) {
				await session.abortTransaction();
				return sendResponse(res, 400, "Buyer does not have a wallet yet");
			}

			const balances = buyerWallet.balances;
			const buyerBalance = BigInt(balances.get(sellCurrency) || "0");
			if (BigInt(sellAmount) > buyerBalance) {
				await session.abortTransaction();
				return sendResponse(res, 400, `Not enough ${sellCurrency} balance`, {
					currentBalance: buyerBalance.toString(),
					itemPrice: sellAmount,
				});
			}
			// deduct the balance and transfer to seller from buyer
			const newBuyerBalance = buyerBalance - BigInt(sellAmount);
			buyerWallet.balances.set(sellCurrency, newBuyerBalance);
			await buyerWallet.save({ session });

			// get seller wallet
			var sellerWallet = await WalletBalance.findOne({
				userRef: shopItem.adminRef,
			}).session(session);
			if (!sellerWallet) {
				sellerWallet = await createWalletBalance(shopItem.adminRef);
			}

			const sbalance = sellerWallet.balances;
			const sellerBalance = BigInt(sbalance.get(sellCurrency) || "0");
			const newSellerBalance = sellerBalance + BigInt(sellAmount);
			sellerWallet.balances.set(sellCurrency, newSellerBalance);
			await sellerWallet.save({ session });
		} else {
			// sell.tokenType == 'community'
			// Check if the buyer has enough points to buy the item
			const clientMemberProfile = await ClientMemberProfile.findOne({
				clientProfileRef: shopItem.clientProfileRef,
				memberRef: buyer._id,
			}).session(session);

			if (
				!clientMemberProfile ||
				clientMemberProfile.points.balance < Number(shopItem.sell.price)
			) {
				await session.abortTransaction();
				return sendResponse(
					res,
					400,
					"Insufficient points balance to buy this item.",
				);
			}

			// Deduct the points from the buyer's balance
			clientMemberProfile.points.used += Number(shopItem.sell.price);
			// Save the updated client member profile
			await clientMemberProfile.save({ session });
		}

		const itemQuantity = shopItem.pot.quantity;
		const itemLeftCount = shopItem.pot.quantity - 1;
		if (itemLeftCount <= 0) {
			shopItem.status = "completed";
		}

		shopItem.pot.quantity = itemLeftCount;
		await shopItem.save({ session });

		// manually add transaction history here
		const transactionHistory = new ClientShopTransactionHistory({
			shopItemRef: shopItem._id,
			buyerRef: buyer._id,
			sellerRef: shopItem.adminRef,
			clientProfileRef: shopItem.clientProfileRef,
			totalCount: shopItem.totalCount,
			transaction: {
				item: {
					quantity: itemQuantity,
				},
				price: {
					amount: shopItem.sell.price,
					currency: shopItem.sell.currency,
					tokenType: shopItem.sell.tokenType,
				},
			},
			product: {
				name: shopItem.name,
				productType: shopItem.productType,
				quantity: itemQuantity,
				file: shopItem.file,
			},
			status: "completed",
		});

		await transactionHistory.save({ session });

		// return the file bought
		const fileBought = await getAndOrSetCachedSignedUrl(
			shopItem.file,
			process.env.GCS_BUCKET_NAME,
			GCS_PROFILE_PICTURE_TTL,
		);

		// Earn points based on setting: perCommunityProductPurchased
		await pointsEarnedByActivity(user._id, "perCommunityProductPurchased");

		// Commit the transaction
		await session.commitTransaction();
		// Send success response
		return sendResponse(res, 200, "File successfully purchased", {
			file: fileBought,
		});
	} catch (error) {
		await session.abortTransaction();
		console.error("Error buying shop item (file):", error);
		return sendResponse(res, 500, "Something went wrong during the purchase.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

// Function to extract the first column from a CSV file buffer
const extractFirstColumnFromCsv = (file) => {
	return new Promise((resolve, reject) => {
		const firstColumnData = [];
		const Readable = stream.Readable;
		const readableStream = new Readable();
		readableStream._read = () => { }; // No-op (_read is required)

		// Push the CSV file buffer to the readable stream
		readableStream.push(file.buffer);
		readableStream.push(null);

		readableStream
			.pipe(csvParser({ headers: false })) // Parse the CSV data
			.on("data", (row) => {
				const firstColumnValue = Object.values(row)[0]; // Get the first value from the row
				if (firstColumnValue !== undefined && firstColumnValue !== null) {
					firstColumnData.push(firstColumnValue.toString());
				}
			})
			.on("end", () => resolve(firstColumnData))
			.on("error", (err) => reject(err));
	});
};

exports.createShopItemCsv = async (req, res) => {
	const clientProfile = req.clientProfile;
	const adminRef = req.user;
	const productType = "csv";
	let { name, sell } = req.body;

	const session = await mongoose.startSession();
	session.startTransaction();

	try {
		// Validate inputs
		if (!name || !sell) {
			await session.abortTransaction();
			return sendResponse(res, 400, "All fields are required: name and sell.");
		}

		// Check if the user already has 20 active tasks
		const activeShopItem = await ClientShop.countDocuments({
			adminRef: adminRef._id,
			status: "active",
		}).session(session);

		if (activeShopItem >= 20) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				"You can only have 20 active shop items at a time.",
			);
		}

		// Check for sell token type
		let sellCurrency = sell.currency;
		if (sell.tokenType === "crypto") {
			// Check if the currency is supported
			const tokenInfo = await AllowableTokenContractsForLotteries.findOne({
				ticker: sellCurrency,
			}).session(session);
			if (!tokenInfo) {
				await session.abortTransaction();
				return sendResponse(res, 400, "Sell currency not supported");
			}
		} else {
			// Make sure that the pointSystem name and sell currency are the same on the clientProfile when tokenType is 'community-token'
			sellCurrency = clientProfile.pointSystem.name;
		}

		// Ensure a CSV file is uploaded
		const fileKey = productType;
		if (!(req.files && req.files[fileKey] && req.files[fileKey].length > 0)) {
			await session.abortTransaction();
			return sendResponse(res, 400, "CSV file is required.");
		}

		// Extract the first row of data from the CSV file
		const file = req.files[fileKey][0];
		const firstColumnData = await extractFirstColumnFromCsv(file);
		if (firstColumnData.length === 0) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				"CSV file is empty or does not have valid data.",
			);
		}

		// Create and save the CSV data document
		const newCsvData = new ClientShopCsvData({
			shopItemRef: null, // We'll update this reference after creating the shop item
			columnData: firstColumnData,
			rowCount: firstColumnData.length,
		});
		await newCsvData.save({ session });

		// Create the new shop item ('csv')
		var newShopItem = new ClientShop({
			clientProfileRef: clientProfile._id,
			adminRef: adminRef._id,
			name,
			productType,
			totalCount: firstColumnData.length,
			pot: {
				csvDataRef: newCsvData._id, // Link the CSV data reference
				quantity: firstColumnData.length, // Store the row count as quantity
			},
			sell: {
				currency: sellCurrency,
				price: sell.price || 0,
				tokenType: sell.tokenType,
			},
		});

		// Save the shop item to the database
		await newShopItem.save({ session });
		// Use dynamic file upload for image (convert to webp)
		newShopItem = await handleFileUpdate(
			req,
			newShopItem,
			"image",
			"image",
			"client-profile/shop-item/csv/image",
			true,
		);
		newShopItem = await handleFileUpdate(
			req,
			newShopItem,
			"csv",
			"csv",
			"client-profile/shop-item/csv/csv",
			false,
		);
		await newShopItem.save({ session });
		// Update the CSV data reference to include the new shop item reference
		newCsvData.shopItemRef = newShopItem._id;
		await newCsvData.save({ session });

		// Commit the transaction
		await session.commitTransaction();
		return sendResponse(
			res,
			201,
			"CSV item successfully created.",
			newShopItem,
		);
	} catch (error) {
		await session.abortTransaction();
		console.log("Error creating item in shop (csv):", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

exports.buyShopItemCsv = async (req, res) => {
	const buyer = req.user; // The user buying the item
	const shopItem = req.shopItem;

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// check if there's enough quantity left.
		const quantity = shopItem.pot.quantity || 0;
		if (quantity <= 0) {
			await session.abortTransaction();
			return sendResponse(res, 404, "There's no item left to buy");
		}
		// check buyer balance if enough and deduct and send to seller
		const sellTokenType = shopItem.sell.tokenType;
		const sellCurrency = shopItem.sell.currency;
		const sellAmount = shopItem.sell.price;
		// check if it's a community-token or a crypto
		// transact the payment
		if (sellTokenType == "crypto") {
			// check if the coin is supported
			const tokenInfo = await AllowableTokenContractsForLotteries.findOne({
				ticker: sellCurrency,
			}).session(session);
			if (!tokenInfo) {
				await session.abortTransaction();
				return sendResponse(res, 400, "Sell currency not supported");
			}

			// check if the buyer has this amount;
			const buyerWallet = await WalletBalance.findOne({
				userRef: buyer._id,
			}).session(session);
			if (!buyerWallet) {
				await session.abortTransaction();
				return sendResponse(res, 400, "Buyer does not have a wallet yet");
			}

			const balances = buyerWallet.balances;
			const buyerBalance = BigInt(balances.get(sellCurrency) || "0");
			if (BigInt(sellAmount) > buyerBalance) {
				await session.abortTransaction();
				return sendResponse(res, 400, `Not enough ${sellCurrency} balance`, {
					currentBalance: buyerBalance.toString(),
					itemPrice: sellAmount,
				});
			}
			// deduct the balance and transfer to seller from buyer
			const newBuyerBalance = buyerBalance - BigInt(sellAmount);
			buyerWallet.balances.set(sellCurrency, newBuyerBalance);
			await buyerWallet.save({ session });

			// get seller wallet
			var sellerWallet = await WalletBalance.findOne({
				userRef: shopItem.adminRef,
			}).session(session);
			if (!sellerWallet) {
				sellerWallet = await createWalletBalance(shopItem.adminRef);
			}

			const sbalance = sellerWallet.balances;
			const sellerBalance = BigInt(sbalance.get(sellCurrency) || "0");
			const newSellerBalance = sellerBalance + BigInt(sellAmount);
			sellerWallet.balances.set(sellCurrency, newSellerBalance);
			await sellerWallet.save({ session });
		} else {
			// sell.tokenType == 'community'
			// Check if the buyer has enough points to buy the item
			const clientMemberProfile = await ClientMemberProfile.findOne({
				clientProfileRef: shopItem.clientProfileRef,
				memberRef: buyer._id,
			}).session(session);

			if (
				!clientMemberProfile ||
				clientMemberProfile.points.balance < Number(shopItem.sell.price)
			) {
				await session.abortTransaction();
				return sendResponse(
					res,
					400,
					"Insufficient points balance to buy this item.",
				);
			}

			// Deduct the points from the buyer's balance
			clientMemberProfile.points.used += Number(shopItem.sell.price);
			// Save the updated client member profile
			await clientMemberProfile.save({ session });
		}

		const itemQuantity = shopItem.pot.quantity;
		const itemLeftCount = shopItem.pot.quantity - 1;
		if (itemLeftCount <= 0) {
			shopItem.status = "completed";
		}

		shopItem.pot.quantity = itemLeftCount;
		await shopItem.save({ session });

		// Retrieve the first item and remove it atomically
		const csvData = await ClientShopCsvData.findOne({
			shopItemRef: shopItem._id,
		}).session(session);

		// Check if there's CSV data
		if (!csvData || csvData.columnData.length === 0) {
			await session.abortTransaction();
			return sendResponse(res, 400, "No CSV data available for this item.");
		}

		// Get the first element
		const csvCode = csvData.columnData[0];

		// Remove the first element from the columnData array
		await ClientShopCsvData.updateOne(
			{ shopItemRef: shopItem._id },
			{ $pop: { columnData: -1 } }, // -1 removes the first element
			{ session },
		);

		// manually add transaction history here
		const transactionHistory = new ClientShopTransactionHistory({
			shopItemRef: shopItem._id,
			buyerRef: buyer._id,
			sellerRef: shopItem.adminRef,
			clientProfileRef: shopItem.clientProfileRef,
			totalCount: shopItem.totalCount,
			transaction: {
				item: {
					quantity: itemQuantity,
				},
				price: {
					amount: shopItem.sell.price,
					currency: shopItem.sell.currency,
					tokenType: shopItem.sell.tokenType,
				},
			},
			product: {
				name: shopItem.name,
				productType: shopItem.productType,
				quantity: itemQuantity,
				csvCode: csvCode,
			},
			status: "completed",
		});

		await transactionHistory.save({ session });

		// Earn points based on setting: perCommunityProductPurchased
		await pointsEarnedByActivity(user._id, "perCommunityProductPurchased");

		// Commit the transaction
		await session.commitTransaction();
		// Send success response
		return sendResponse(res, 200, "Code successfully purchased");
	} catch (error) {
		await session.abortTransaction();
		console.error("Error buying shop item (csv):", error);
		return sendResponse(res, 500, "Something went wrong during the purchase.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

exports.getListOfShopItems = async (req, res) => {
	const page = parseInt(req.query.page) || 1; // Default page is 1
	const limit = parseInt(req.query.limit) || 20; // Default limit is 20
	const sortBy = req.query.sortBy || "createdAt"; // Default sorting by startDate
	const sortOrder = req.query.sortOrder === "asc" ? 1 : -1; // Default sort order is descending
	const { pointSystemName } = req.params;
	try {
		const clientProfile = await ClientProfile.findOne({
			"pointSystem.name": pointSystemName,
		});
		if (!clientProfile) {
			return sendResponse(res, 400, "Couldn't find user profile");
		}

		// Define the sort object dynamically based on the request query
		const sortOptions = {};
		sortOptions[sortBy] = sortOrder;

		// Query to find all shop items related to the clientProfile with optional pagination and sorting
		const itemLists = await ClientShop.find({
			clientProfileRef: clientProfile._id,
			status: "active",
		})
			.sort(sortOptions) // Apply sorting based on the sortOptions
			.skip((page - 1) * limit) // Skip for pagination
			.limit(limit) // Limit the number of records per page
			.populate("clientProfileRef", "pointSystem.nameInsensitive")
			.exec();

		// Get the total count of shop items for pagination
		const totalShopItems = await ClientShop.countDocuments({
			clientProfileRef: clientProfile._id,
			status: "active",
		});

		// Map through the item lists to generate signed URLs for images or files
		const itemsWithUrls = await Promise.all(
			itemLists.map(async (item) => {
				const shopItem = item.toObject();

				// Generate signed URLs for image, file, and csv if they exist
				shopItem.imageUrl = await generateSignedUrl(shopItem.image);
				// no need for these 2 data (file and csv) just the image is fine
				// shopItem.fileUrl = await generateSignedUrl(shopItem.file);
				// shopItem.csvUrl = await generateSignedUrl(shopItem.csv);

				// Return the updated shop item with URLs
				return shopItem;
			}),
		);

		return sendResponse(res, 200, "Client Shop Items retrieved successfully", {
			page,
			limit,
			totalPages: Math.ceil(totalShopItems / limit),
			totalShopItems,
			itemLists: itemsWithUrls, // Return items with signed URLs
		});
	} catch (error) {
		console.log("Error getting list of items: ", error);
		return sendResponse(res, 500, "Error getting list of items");
	}
};

exports.createTwitterTask = async (req, res) => {
	const clientProfile = req.clientProfile;
	const adminRef = req.user;
	const {
		tweetUrl,
		durationInDays,
		points,
		retweet = true,
		comment = true,
		like = true,
		minimumFollowers = 1,
	} = req.body;
	// Ensure the current date is in UTC+0
	const utcNow = new Date(new Date().toISOString());
	// Strictly parse `retweet` and `comment` as booleans, defaulting to `false` if invalid
	const isRetweet = retweet === true || retweet === "true";
	const isComment = comment === true || comment === "true";
	const isLike = like === true || like === "true";

	if (!isRetweet && !isComment) {
		return sendResponse(res, 400, "Either retweet or comment must be active.");
	}

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// No need to validate the inputs, it's already been validated
		// prior using middlewares i.e., parseNumber and normalizeString

		// Check if the user already has 10 active telegram tasks
		const activeTaskCount = await ClientTask.countDocuments({
			adminRef: adminRef._id,
			earnType: "twitter",
			endDate: { $gte: utcNow },
			points: { $gt: 0 }, // Only count tasks with points (allowlist tasks not included)
		}).session(session);

		if (activeTaskCount >= 10) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				"You can only have 10 active Twitter tasks at a time.",
			);
		}

		const newTask = await clientService.createTwitterTask(
			session,
			clientProfile,
			{
				points,
				tweetUrl,
				durationInDays,
				minimumFollowers,
				isRetweet,
				isComment,
				isLike,
				isFollow: false,
			},
		);

		// Commit the transaction
		await session.commitTransaction();
		return sendResponse(
			res,
			201,
			"Twitter task successfully created.",
			newTask,
		);
	} catch (error) {
		await session.abortTransaction();
		console.log("Error creating Twitter task:", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

exports.createTelegramTask = async (req, res) => {
	const clientProfile = req.clientProfile;
	const adminRef = req.user;
	const { durationInDays, points, telegramChannel } = req.body;

	// Ensure the current date is in UTC+0
	const utcNow = new Date(new Date().toISOString());

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// No need to validate the inputs, it's already been validated
		// prior using middlewares i.e., parseNumber and normalizeString

		// Check if the user already has 10 active telegram tasks
		const activeTaskCount = await ClientTask.countDocuments({
			adminRef: adminRef._id,
			earnType: "telegram",
			endDate: { $gte: utcNow },
			points: { $gt: 0 }, // Only count tasks with points (allowlist tasks not included)
		}).session(session);

		if (activeTaskCount >= 10) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				"You can only have 10 active Telegram tasks at a time.",
			);
		}

		// Create the new Telegram task
		const newTask = await clientService.createTelegramTask(
			session,
			clientProfile,
			{ points, durationInDays, telegramChannel },
		);

		// Commit the transaction
		await session.commitTransaction();
		return sendResponse(
			res,
			201,
			"Telegram task successfully created.",
			newTask,
		);
	} catch (error) {
		await session.abortTransaction();
		console.log("Error creating Telegram task:", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

exports.createDiscordTask = async (req, res) => {
	const clientProfile = req.clientProfile;
	const adminRef = req.user;
	const { durationInDays, points, discordInviteLink } = req.body;
	const { guildId, guildName } = req.guild;

	// Ensure the current date is in UTC+0
	const utcNow = new Date(new Date().toISOString());

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// No need to validate the inputs, it's already been validated
		// prior using middlewares i.e., parseNumber
		// cannot validate discordInviteLink as it's a case sensitive one

		// Check if the user already has 10 active discord tasks
		const activeTaskCount = await ClientTask.countDocuments({
			adminRef: adminRef._id,
			earnType: "discord",
			endDate: { $gte: utcNow },
			points: { $gt: 0 }, // Only count tasks with points (allowlist tasks not included)
		}).session(session);

		if (activeTaskCount >= 10) {
			await session.abortTransaction();
			return sendResponse(
				res,
				400,
				"You can only have 10 active Discord tasks at a time.",
			);
		}
		// Create the new Telegram task
		const newTask = await clientService.createDiscordTask(
			session,
			clientProfile,
			{ points, durationInDays, guildName, guildId, discordInviteLink },
		);

		// Save the task to the database
		await newTask.save({ session });

		// Commit the transaction
		await session.commitTransaction();
		return sendResponse(
			res,
			201,
			"Discord task successfully created.",
			newTask,
		);
	} catch (error) {
		await session.abortTransaction();
		console.log("Error creating Discord task:", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

exports.getCommunityEarnDashboard = async (req, res) => {
	const page = parseInt(req.query.page) || 1; // Default page is 1
	const limit = parseInt(req.query.limit) || 20; // Default limit is 20
	const sortBy = req.query.sortBy || "createdAt"; // Default sorting by startDate
	const sortOrder = req.query.sortOrder === "asc" ? 1 : -1; // Default sort order is descending
	const clientProfile = req.clientProfile;
	const user = req.user;

	// Ensure the current date is in UTC+0
	const utcNow = new Date(new Date().toISOString());

	try {
		// Define the sort object dynamically based on the request query
		const sortOptions = {};
		sortOptions[sortBy] = sortOrder;

		const query = {
			// Filter activities whose endDate is greater than or equal to the current date
			$or: [
				{ endDate: { $gte: utcNow } },
				{ endDate: { $exists: false } }, // Include documents where endDate doesn't exist
			],
			clientProfileRef: clientProfile._id,
			points: { $gt: 0 }, // Only count tasks with points (allowlist tasks not included)
		};

		const totalTasks = await ClientTask.find(query)
			.populate("adminRef", "name username profileImage socials")
			.sort(sortOptions) // Apply sorting based on the sortOptions
			.skip((page - 1) * limit) // Skip for pagination
			.limit(limit) // Limit the number of records per page
			.exec();

		const tasksWithUrls = await Promise.all(
			totalTasks.map(async (data) => {
				const task = data.toObject();
				if (task?.adminRef?.profileImage) {
					task.adminRef.profileImageUrl = await getAndOrSetCachedSignedUrl(
						task?.adminRef?.profileImage,
					);
				}
				// Set default values for telegram, twitter, and discord in the task object
				if (task.earnType == 'telegram') {
					task.telegram = task.telegram || { channel: null };
				}
				if (task.earnType == 'twitter') {
					task.twitter = task.twitter || {
						link: null,
						action: { like: false, retweet: false, comment: false },
					};
				}
				if (task.earnType == 'discord') {
					task.discord = task.discord || {
						server: { name: null, id: null },
						inviteLink: null,
					};
				}

				// check if the user already claimed
				task.claimStatus = false;
				if (user && user._id) {
					const userClaimed = await ClientMemberClaimedTask.findOne({
						taskId: task._id,
						claimedBy: user._id,
					});
					// Initialize task.claimDetails if it doesn't exist
					task.claimStatus = userClaimed?.status === "completed" ? true : false;
					task.claimDetails = task.claimDetails || {};
					task.claimable = false;

					// task.claimDetails = userClaimed;
					if (task.earnType == "telegram") {
						task.claimDetails.joined = userClaimed?.task?.telegram?.joined || false;
						task.claimDetails.connected = userClaimed?.task?.telegram?.connected || false;
					} else if (task.earnType == "discord") {
						task.claimDetails.joined = userClaimed?.task?.discord?.joined || false;
						task.claimDetails.connected = userClaimed?.task?.discord?.connected || false;
					} else if (task.earnType == "twitter") {
						// Twitter-specific conditions based on task requirements
						const twitterRetweetRequired = task.twitter?.action?.retweet === true;
						const twitterCommentRequired = task.twitter?.action?.comment === true;
						const twitterFollowersRequired = !!task.twitter?.minimumFollowers;

						// task completion
						const twitterRetweetCompleted = userClaimed?.task?.twitter?.retweet === true;
						const twitterCommentCompleted = userClaimed?.task?.twitter?.comment === true;
						const twitterFollowersCompleted = userClaimed?.task?.twitter?.validAmountOfFollowers === true;
						const twitterJobStatus = userClaimed?.task?.twitter?.status || 'idle';

						if (
							(twitterRetweetRequired && !twitterRetweetCompleted) ||
							(twitterCommentRequired && !twitterCommentCompleted) ||
							(twitterFollowersRequired && !twitterFollowersCompleted)
						) {
							task.claimable = false;
						} else {
							task.claimable = true;
						}
						task.claimDetails.twitterJobStatus = twitterJobStatus;
						task.claimDetails.retweet = twitterRetweetCompleted;
						task.claimDetails.comment = twitterCommentCompleted;
						task.claimDetails.validAmountOfFollowers = twitterFollowersCompleted;
					}
				}
				return task;
			}),
		);

		// Get the total count of items for pagination
		const totalTasksCount = await ClientShop.countDocuments(query);
		return sendResponse(res, 200, "Items retrieved successfully", {
			page,
			limit,
			totalPages: Math.ceil(totalTasksCount / limit),
			totalTasksCount,
			taskLists: tasksWithUrls, // Return items with signed URLs
		});
	} catch (error) {
		console.log("Error getting list of items: ", error);
		return sendResponse(res, 500, "Error getting list of items");
	}
};

// Helper function to find or create a ClientMemberProfile
const findOrCreateClientMemberProfile = async (task, user, session) => {
	let clientMemberProfile = await ClientMemberProfile.findOne({
		clientProfileRef: task.clientProfileRef,
		memberRef: user._id,
	}).session(session);

	if (!clientMemberProfile) {
		// If the profile is not found, create a new one
		clientMemberProfile = new ClientMemberProfile({
			clientProfileRef: task.clientProfileRef,
			memberRef: user._id,
		});
		await clientMemberProfile.save({ session }); // Save the new profile with session
	}

	return clientMemberProfile;
};

// Helper function to claim rewards and save the task data
const claimReward = async (claimData, task, user, rewardAmount, session) => {
	// Find or create client member profile
	const clientMemberProfile = await findOrCreateClientMemberProfile(
		task,
		user,
		session,
	);

	// Update the points earned
	clientMemberProfile.points.earned += rewardAmount;
	await clientMemberProfile.save({ session });

	claimData.status = "completed";
	claimData.pointsClaimed = rewardAmount;
	await claimData.save({ session });
};

// Helper function to claim rewards and save the task data
exports.checkAndChangeTaskStatus = async (
	session,
	task,
	user,
	taskType,
	extraData = {},
	status = "pending",
) => {
	// Find the claimed task and update if it exists, otherwise create a new one
	try {
		const userTaskStatus = await ClientMemberClaimedTask.findOneAndUpdate(
			{
				taskId: task._id,
				claimedBy: user._id,
			},
			{
				$set: {
					taskType: taskType,
					status,
					pointsClaimed: 0,
					task: extraData, // Set the task-specific details (e.g., twitter, telegram)
				},
			},
			{
				new: true, // Return the updated document if it exists
				upsert: true, // Create a new document if it doesn't exist
				session, // Use the provided session for transaction support
			},
		);
		return userTaskStatus;
	} catch (error) {
		console.error("Error in checkAndChangeTaskStatus:", error);
		throw new Error("Unable to claim or update task.");
	}
};

exports.claimPointsForTaskCompletion = async (req, res) => {
	const user = req.user;
	const { id: taskId } = req.params;

	// Ensure the current date is in UTC+0
	const utcNow = new Date(new Date().toISOString());

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// Check if the task is existing and active
		const task = await ClientTask.findById(taskId).session(session);
		if (!task || utcNow > task?.endDate) {
			await session.abortTransaction();
			return sendResponse(res, 400, "Task not found");
		}

		// Check if the user has already claimed this task
		var isAlreadyClaimed = await ClientMemberClaimedTask.findOne({
			taskId,
			claimedBy: user._id,
		}).session(session);

		if (isAlreadyClaimed && isAlreadyClaimed.status === "completed") {
			await session.abortTransaction();
			return sendResponse(res, 400, "Task already claimed by the user.");
		}

		// Convert to an object if a document was found; otherwise, initialize as an empty object
		const rewardAmount = task.points;
		var userTaskStatus = isAlreadyClaimed ? isAlreadyClaimed.toObject() : {};
		var joined = false;
		var connected = false;
		var update = false;
		const earnType = task.earnType;
		if (task.earnType == 'telegram') {
			const telegramChannel = task.telegram.channel;
			const telegramId = user.socials?.telegram?.id;

			joined = userTaskStatus?.task?.telegram?.joined || false;
			connected = userTaskStatus?.task?.telegram?.connected || false;

			if (!userTaskStatus?.task?.telegram?.connected) {
				update = true;
				connected = !!telegramId;
			}
			if (!userTaskStatus?.task?.telegram?.joined) {
				const botInChannel =
					await isBotInTelegramChannelFunction(telegramChannel);
				if (!botInChannel) {
					await session.abortTransaction();
					return sendResponse(
						res,
						400,
						`Naffles bot not on tg channel: ${telegramChannel}, contact community admin`,
						{ joined, connected }
					);
				}
				if (telegramId) {
					const userInChannel = await isUserInTelegramChannel(
						telegramChannel,
						telegramId,
					);
					joined = userInChannel ? true : false;
					if (joined) update = true;
				}
			}

			if ((joined || connected) && update) {
				userTaskStatus = await this.checkAndChangeTaskStatus(
					session,
					task,
					user,
					"telegram",
					{ telegram: { joined, connected } },
				);
			}
			if (joined && connected) {
				await claimReward(userTaskStatus, task, user, rewardAmount, session);
				// Earn points based on setting: perCommunitySocialTaskCompleted
				await pointsEarnedByActivity(user._id, "perCommunitySocialTaskCompleted");
				await session.commitTransaction();
				return sendResponse(res, 200, "Task claimed successfully", { joined, connected, earnType });
			} else {
				await session.commitTransaction();
				return sendResponse(res, 200, "Finish all tasked before claiming", { joined, connected });
			}
		} if (task.earnType == 'discord') {
			const guildId = task.discord.server.id;
			const discordId = user.socials?.discord?.id;

			joined = userTaskStatus?.task?.discord?.joined || false;
			connected = userTaskStatus?.task?.discord?.connected || false;

			if (!userTaskStatus?.task?.discord?.connected) {
				update = true;
				connected = !!discordId;
			}

			if (!userTaskStatus?.task?.discord?.joined) {
				const botInChannel = await isBotInGuildFunction(guildId);
				if (!botInChannel) {
					await session.abortTransaction();
					return sendResponse(
						res,
						400,
						`Naffles bot not on discord community channel, contact community admin`,
						{ joined, connected }
					);
				}
				if (discordId) {
					const userInChannel = await isUserInGuildFunction(guildId, discordId);
					joined = userInChannel ? true : false;
					if (joined) update = true;
				}
			}

			if ((joined || connected) && update) {
				userTaskStatus = await this.checkAndChangeTaskStatus(
					session,
					task,
					user,
					"discord",
					{ discord: { joined, connected } },
				);
			}
			if (joined && connected) {
				await claimReward(userTaskStatus, task, user, rewardAmount, session);
				// Earn points based on setting: perCommunitySocialTaskCompleted
				await pointsEarnedByActivity(user._id, "perCommunitySocialTaskCompleted");
				await session.commitTransaction();
				return sendResponse(res, 200, "Task claimed successfully", { joined, connected, earnType });
			} else {
				await session.commitTransaction();
				return sendResponse(res, 200, "Finish all tasked before claiming", { joined, connected });
			}
		} else if (task.earnType == 'twitter') {
			const twitterUsername = user.socials?.twitter?.username;
			connected = !!twitterUsername;
			if (!connected) {
				await session.abortTransaction();
				return sendResponse(
					res,
					400,
					"User doesn't have a twitter connected to their account.",
					{ connected }
				);
			}

			// Twitter-specific conditions based on task requirements
			const twitterRetweetRequired = task.twitter?.action?.retweet === true;
			const twitterCommentRequired = task.twitter?.action?.comment === true;
			const twitterFollowersRequired = !!task.twitter?.minimumFollowers;

			// task completion
			const twitterRetweetCompleted =
				userTaskStatus?.task?.twitter?.retweet === true;
			const twitterCommentCompleted =
				userTaskStatus?.task?.twitter?.comment === true;
			const twitterFollowersCompleted =
				userTaskStatus?.task?.twitter?.validAmountOfFollowers === true;

			const data = {
				connected,
				retweet: twitterRetweetCompleted,
				comment: twitterCommentCompleted,
				validAmountOfFollowers: twitterFollowersCompleted,
				earnType
			}

			if (
				(twitterRetweetRequired && !twitterRetweetCompleted) ||
				(twitterCommentRequired && !twitterCommentCompleted) ||
				(twitterFollowersRequired && !twitterFollowersCompleted)
			) {
				// Check if the queue has more than 1000 waiting tasks
				const waitingCount = await checkTwitterTaskQueue.getWaitingCount();
				if (waitingCount >= 1000) {
					await session.abortTransaction();
					return sendResponse(res, 429, "Queue is full. Please try again later.");
				}

				let message = "Your request is being processed and may take up to 5 minutes.";
				if (twitterFollowersRequired && !twitterFollowersCompleted) {
					const followers = task.twitter?.minimumFollowers || 0;
					message += ` Please ensure that you have minimum of ${followers} follower${followers === 1 ? '' : 's'}`;
				}

				// add twitter task on queu
				const jobId = `${user._id}-${task._id}`; // Create a unique job ID
				// Check if a job with the same jobId already exists
				const existingJob = await checkTwitterTaskQueue.getJob(jobId);
				if (existingJob) {
					console.log(`Job already exists for user ${user._id} and task ${task._id}. Skipping addition.`);
				} else {
					// Update task.twitter.status to "checking-in-progress"
					if (!isAlreadyClaimed) {
						// Create a new claimed task entry if it doesn't exist
						isAlreadyClaimed = new ClientMemberClaimedTask({
							taskId,
							taskType: "twitter",
							claimedBy: user._id,
							status: "pending",
							task: {
								twitter: {
									validAmountOfFollowers: false,
									like: false,
									retweet: false,
									comment: false,
									status: "checking-in-progress", // Set status to "checking-in-progress"
								}
							}
						});
					} else {
						// Update the existing claimed task's twitter status
						isAlreadyClaimed.task.twitter.status = "checking-in-progress";
					}

					// Save the changes
					await isAlreadyClaimed.save({ session });
					// Add the twitter task to the queue
					checkTwitterTaskQueue
						.add(
							{ twitterTask: task, user },
							{
								jobId,
								attempts: 1,
								removeOnComplete: true,
								removeOnFail: true,
							},
						)
						.then((job) =>
							console.log(`Added Twitter task to queue with jobId: ${jobId}`),
						)
						.catch((err) =>
							console.error("Error adding Twitter task to queue:", err),
						);
				}
				await session.commitTransaction();
				return sendResponse(res, 200, message, data);
			} else {
				// claim reward
				await claimReward(isAlreadyClaimed, task, user, rewardAmount, session);
				// Earn points based on setting: perCommunitySocialTaskCompleted
				await pointsEarnedByActivity(user._id, "perCommunitySocialTaskCompleted");
				await session.commitTransaction();
				return sendResponse(res, 200, "Task claimed successfully", data);
			}
		}
	} catch (error) {
		await session.abortTransaction();
		console.log("Error task claiming:", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

exports.createNewAllowlist = async (req, res) => {
	const clientProfile = req.clientProfile;
	const reqBody = req.body;
	const user = req.user;

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// Get banner if provided
		const bannerImg =
			req.files?.banner && req.files.banner.length > 0
				? req.files.banner[0]
				: null;
		reqBody.banner = bannerImg;

		const guild = req.guild;
		const newAllowlist = await clientService.createNewAllowlist(
			session,
			clientProfile,
			{ ...reqBody, guild, user },
		);

		await session.commitTransaction();
		return sendResponse(
			res,
			201,
			"Successfully created allowlist",
			newAllowlist,
		);
	} catch (err) {
		await session.abortTransaction();
		console.log("Error creating new allowlist:", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	} finally {
		session.endSession();
	}
};

exports.getAllowlists = async (req, res) => {
	const { presale, free, blockchain, status, sortBy, sortOrder, page, limit } =
		req.query;
	try {
		const response = await clientService.getAllowlists({
			presale,
			free,
			blockchain,
			status,
			sortBy,
			sortOrder,
			page,
			limit,
		});
		return sendResponse(res, 200, "Successfully fetched allowlists!", response);
	} catch (err) {
		console.log("Error fetching allowlists:", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	}
};

exports.buyAllowlistTicket = async (req, res) => {
	const allowlist = req.allowlist;
	const reqBody = req.body;
	const userWalletBalances = req.userWalletBalance;
	const currentUser = req.user;
	const walletAddressId = req.walletAddressId;

	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		const response = await clientService.buyAllowlistTicket(session, {
			allowlist,
			reqBody,
			userWalletBalances,
			currentUser,
			walletAddressId,
		});
		await session.commitTransaction();
		return sendResponse(res, 201, "Ticket successfully purchased!", response);
	} catch (err) {
		await session.abortTransaction();
		console.log("Error purchasing an allowlist ticket:", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	} finally {
		session.endSession();
	}
};

exports.getAllowlistById = async (req, res) => {
	const { allowlist, user, taskClaimStatus } = req;
	try {
		const response = await clientService.getAllowlistById(allowlist, user);
		if (!response) {
			return sendResponse(res, 400, "Allowlist not found.");
		}
		return sendResponse(res, 200, "Sucess", {
			allowlist: response,
			taskClaimStatus,
		});
	} catch (err) {
		console.log("Error fetching allowlist:", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	}
};

exports.verifyAllowlistEntryStatus = async (req, res) => {
	const { allowlist, user } = req;
	const { email, walletAddress } = req.body;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		const response = await clientService.verifyAllowlistEntryStatus(
			session,
			user,
			allowlist,
			{ email, walletAddress },
		);
		return sendResponse(res, 200, "Verified task status", response);
	} catch (err) {
		console.log("Error verifying entry status:", err);
		return sendResponse(res, 500, "Error verifying entry status.", {
			error: err.message,
		});
	}
};

exports.getClientProfileAllowlists = async (req, res) => {
	const clientProfile = req.clientProfile;
	try {
		const response = await clientService.getAllowlists({
			presale: "true",
			free: "true",
			clientProfileId: clientProfile._id,
			status: ["live"],
			sortBy: "_id",
			sortOrder: "asc",
			limit: 0,
		});
		return sendResponse(
			res,
			200,
			"Successfully fetched allowlists!",
			response.allowlists,
		);
	} catch (err) {
		console.log("Error fetching allowlists:", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	}
};

exports.downloadWinnersCsv = async (req, res) => {
	const allowlist = req.allowlist;
	try {
		if (!allowlist.winnersGcsKey) {
			console.error("Error fetching allowlist winners CSV. File not found.");
			return sendResponse(
				res,
				500,
				"Error fetching download link. File not found.",
			);
		}

		const downloadLink = await getAndOrSetCachedSignedUrl(
			allowlist.winnersGcsKey,
			process.env.GCS_BUCKET_NAME,
			GCS_PROFILE_PICTURE_TTL,
		);
		return sendResponse(res, 200, "Successs", { downloadLink });
	} catch (err) {
		console.error(
			"Error getting download link for allowlist winners csv file,",
			err,
		);
		return sendResponse("Error getting download link.", { error: err.message });
	}
};
