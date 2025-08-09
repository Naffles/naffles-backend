const express = require("express");
const router = express.Router();
const {
	authenticate,
	isUserClientProfileAdmin,
} = require("../middleware/authenticate");
const clientController = require("../controllers/clientController");
const {
	getClientSubscriptionFee,
	dynamicItemPurchaseHandler,
	isShopItemIdValid,
} = require("../middleware/helpers");
const {
	isUserCanPay,
	isUserHasEnoughNafflings,
	normalizeString,
	parseBigInt,
	parseNumber,
	restructureBodyMiddleware,
	isBotInTelegramChannel,
	isValidCommunityId,
	isValidDiscordInviteLink,
	isBotInGuild,
	validateTweetUrl,
	conditionalValidDiscordInviteLink,
	conditionalBotInGuild,
	conditionalBotInTelegramChannel,
	conditionalValidateTweetUrl,
	validateWalletAddress,
} = require("../middleware/validate");
const { imageUpload, fileUpload } = require("../middleware/upload");
const rateLimiter = require("../middleware/rateLimiter");
const optionalAuthenticate = require("../middleware/optionalAuthenticate");
const {
	REQUIRED_NAFFLINGS_ON_INCREASING_CLIENT_PROFILE,
} = require("../config/client");
const sendResponse = require("../utils/responseHandler");
const parseFormData = require("../middleware/parseFormData");
const {
	allowlistExists,
	checkIfUserHasBalance,
	validateAllowlistCreation,
	allowlistHasStarted,
	checkAllowlistStatus,
	checkUserClaimedTasks,
} = require("../middleware/allowlistValidate");

router.get(
	"/leaderboard/:clientProfileId",
	clientController.getClientMemberProfiles,
);
router.get(
	"/manage",
	authenticate,
	isUserClientProfileAdmin,
	clientController.getClientAdminActivities, // Fetch client activities with pagination and sorting
);

router.get(
	"/earn/:communityId",
	optionalAuthenticate,
	isValidCommunityId,
	clientController.getCommunityEarnDashboard,
);

// ---------deprecated----------------
// router.post(
// 	"/earn/check-task-status/:taskId/:specificTask",
// 	authenticate,
// 	rateLimiter({ durationSec: 15, allowedHits: 5 }),
// 	clientController.checkTaskStatus,
// );

// router.post(
// 	"/earn/claim/:id",
// 	authenticate,
// 	clientController.claimPointsForTaskCompletion,
// );
// ------------------------------------

router.post(
	"/earn/claim/:id",
	authenticate,
	rateLimiter({ durationSec: 15, allowedHits: 5 }),
	clientController.claimPointsForTaskCompletion,
)

router.post(
	"/follow-community/:communityId",
	authenticate,
	isValidCommunityId,
	clientController.followCommunity,
);

router
	.route("/manage")
	.get(
		authenticate,
		isUserClientProfileAdmin,
		clientController.getClientAdminActivities,
	); // Fetch client activities with pagination and sorting

router.delete(
	"/manage/:activity/:id",
	authenticate,
	isUserClientProfileAdmin,
	normalizeString(["params.activity", "params.id"]),
	clientController.deleteAdminActivity,
);

router
	.route("/")
	.get(authenticate, clientController.getClientProfile)
	.patch(
		authenticate,
		imageUpload([{ name: "backgroundImage" }, { name: "icon" }]),
		clientController.updateClientProfile,
	);

router.get(
	"/payment-for-subscription",
	authenticate,
	clientController.getAmountForIncreasingClientProfile,
);
router.get(
	"/user/balance/:id",
	authenticate,
	clientController.getClientMemberBalance,
);
router.get(
	"/user/community-list",
	authenticate,
	clientController.getMyCommunities,
);

router.get("/explore-communities",
	// authenticate,
	clientController.exploreCommunities
);

router.post(
	"/:communityId/user/add",
	authenticate,
	isValidCommunityId,
	clientController.addToMyCommunities,
);

router.get(
	"/shop-item/list/:pointSystemName",
	normalizeString(["params.pointSystemName"]),
	clientController.getListOfShopItems,
);

// you can use this WITH or WITHOUT a client profile
// use this to increase client profile expiration using nafflings
// the `amount` is the amount of nafflings for payment
// currently it's set for REQUIRED_NAFFLINGS_ON_INCREASING_CLIENT_PROFILE nafflings for 30 days increase
router.post(
	"/increase-client-profile-expiration-using-nafflings",
	authenticate,
	isUserHasEnoughNafflings({
		amount: REQUIRED_NAFFLINGS_ON_INCREASING_CLIENT_PROFILE,
	}),
	clientController.increaseClientSubscriptionUsingNafflings,
);

// if the user don't have a client profile, will not be
// able to use this function
router.post(
	"/increase-client-profile-expiration/:days",
	authenticate,
	isUserClientProfileAdmin,
	getClientSubscriptionFee,
	isUserCanPay,
	clientController.increaseClientSubscription,
);

router.get(
	"/get-subscription-fee/:days",
	getClientSubscriptionFee,
	clientController.getClientSubscriptionFeePerToken,
);

router.patch(
	"/change-user-balance/:action/:userId",
	authenticate,
	isUserClientProfileAdmin,
	clientController.changeUserBalance,
);

router.get(
	"/buy/shop-item/is-user-has-enough-balance/:shopItemId",
	authenticate,
	clientController.isUserHasEnoughBalanceToBuyItemInShop,
);

router
	.route("/telegram")
	.post(
		authenticate,
		parseNumber(["body.durationInDays", "body.points"], { allowZero: false }),
		normalizeString(["body.telegramChannel"]),
		isUserClientProfileAdmin,
		rateLimiter({ durationSec: 30, allowedHits: 5 }),
		isBotInTelegramChannel,
		clientController.createTelegramTask,
	);

router
	.route("/discord")
	.post(
		authenticate,
		parseNumber(["body.durationInDays", "body.points"], { allowZero: false }),
		isUserClientProfileAdmin,
		rateLimiter({ durationSec: 30, allowedHits: 5 }),
		isValidDiscordInviteLink,
		isBotInGuild,
		clientController.createDiscordTask,
	);

router
	.route("/twitter")
	.post(
		authenticate,
		parseNumber(
			["body.durationInDays", "body.points", "body.minimumFollowers"],
			{ allowZero: false },
		),
		normalizeString(["body.tweetUrl"]),
		isUserClientProfileAdmin,
		validateTweetUrl,
		clientController.createTwitterTask,
	);

router
	.route("/shop-item/token-pot-crypto")
	.post(
		authenticate,
		imageUpload([{ name: "image" }]),
		restructureBodyMiddleware,
		isUserClientProfileAdmin,
		parseBigInt(["body.pot.amount"], { allowZero: false }),
		parseNumber(["body.sell.price"], { allowZero: false }),
		normalizeString(["body.pot.currency", "body.sell.currency"]),
		clientController.createShopItemCryptoTokenPot,
	);

router
	.route("/shop-item/token-pot-points")
	.post(
		authenticate,
		imageUpload([{ name: "image" }]),
		restructureBodyMiddleware,
		isUserClientProfileAdmin,
		parseBigInt(["body.sell.price"], { allowZero: false }),
		parseNumber(["body.pot.amount"], { allowZero: false }),
		normalizeString(["body.pot.currency", "body.sell.currency"]),
		clientController.createShopItemPointsTokenPot,
	);

router.post(
	"/buy/shop-item/:items",
	authenticate,
	isShopItemIdValid,
	dynamicItemPurchaseHandler,
);

router
	.route("/shop-item/file")
	.post(
		authenticate,
		fileUpload([{ name: "file" }, { name: "image" }]),
		restructureBodyMiddleware,
		isUserClientProfileAdmin,
		parseNumber(["body.quantity"], { allowZero: false }),
		normalizeString([
			"body.sell.tokenType",
			"body.sell.currency",
			"body.sell.tokenType",
		]),
		clientController.createShopItemFile,
	);

router
	.route("/shop-item/csv")
	.post(
		authenticate,
		fileUpload([{ name: "csv" }, { name: "image" }]),
		restructureBodyMiddleware,
		isUserClientProfileAdmin,
		normalizeString([
			"body.sell.tokenType",
			"body.sell.currency",
			"body.sell.tokenType",
		]),
		clientController.createShopItemCsv,
	);

// ALLOWLIST
router
	.route("/allowlist")
	//
	.post(
		authenticate,
		imageUpload([{ name: "banner" }]),
		parseFormData,
		isUserClientProfileAdmin,
		validateAllowlistCreation,
		conditionalValidDiscordInviteLink, // only runs if joinDiscord is provided
		conditionalBotInGuild, // only runs if joinDiscord is provided
		conditionalBotInTelegramChannel, // only runs if joinTelegram is provided
		conditionalValidateTweetUrl, // only runs if twitterTasks is provided
		clientController.createNewAllowlist,
	)
	// GET ALL Allowlists
	.get(optionalAuthenticate, clientController.getAllowlists);

router
	.route("/allowlist/:allowlistId")
	// Enter a given allowlist by purchasing a ticket
	// Also checks for the requirements
	.post(
		authenticate,
		allowlistExists({ purchaseTicketFlag: true, populateTasks: true }),
		allowlistHasStarted,
		checkIfUserHasBalance,
		validateWalletAddress,
		clientController.buyAllowlistTicket,
	)
	// Fetch specific allowlist by id
	.get(
		optionalAuthenticate,
		allowlistExists({ populateClientProfile: true, fetchLean: false }),
		checkUserClaimedTasks,
		clientController.getAllowlistById,
	);

router.post(
	"/allowlist/:allowlistId/verify",
	authenticate,
	allowlistExists({ populateTasks: true }),
	clientController.verifyAllowlistEntryStatus,
);

// Get ALL allowlist for certain Client Profile (community)
router.get(
	"/:communityId/allowlists",
	optionalAuthenticate,
	isValidCommunityId,
	clientController.getClientProfileAllowlists,
);

// Download the allowlist winners csv file
router.get(
	"/allowlist/:allowlistId/download-winners",
	authenticate,
	isUserClientProfileAdmin,
	allowlistExists(),
	checkAllowlistStatus,
	clientController.downloadWinnersCsv,
);

// this one should be on the lowest part to not messed up the order of APIs
// since other apis use params.
router.get(
	"/:pointSystemName",
	normalizeString(["params.pointSystemName"]),
	clientController.getClientProfileUsingName,
);

module.exports = router;
