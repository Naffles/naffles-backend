const express = require("express");
const router = express.Router();
const { requireRole, authenticate } = require("../middleware/authenticate");
const adminController = require("../controllers/adminController");
const optionalAuthenticate = require("../middleware/optionalAuthenticate");
const multer = require("multer");
const { imageFileFilter } = require("../utils/image");
const rateLimiter = require("../middleware/rateLimiter");
const { allowlistExists } = require("../middleware/allowlistValidate");

// Import admin sub-routes
const betLimitsRouter = require("./admin/betLimits");
const pointsAdminRouter = require("./admin/pointsAdmin");
const foundersKeyAdminRouter = require("./admin/foundersKeyAdmin");
const allowlistAdminRouter = require("./admin/allowlistAdmin");
const affiliateAdminRouter = require("./admin/affiliateAdmin");

const storage = multer.memoryStorage();
const singleUpload = multer({
	storage: storage,
	limits: { fileSize: 25 * 1024 * 1024 },
	fileFilter: imageFileFilter,
}).single("file");

router.get(
	"/analytics/user",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.userAnalytics,
);

router.get(
	"/analytics/game",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.gameAnalytics,
);

router.get(
	"/analytics/raffle",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.raffleAnalytics,
);

router.get(
	"/analytics/user-administration-table",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.getUserAdministrationTable,
);

router.patch(
	"/analytics/user-administration-table/change-user-role",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.changeUserRole,
);

router.get(
	"/user-administration/activity-log",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.getUserLogDetails,
);

router.get(
	"/raffles",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.getAllRaffles,
);

router.get(
	"/settings/general",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.generalAdminSettings,
);

router.patch(
	"/settings/general",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.updateAdminSettings,
);

router.get(
	"/settings/homepage-featured",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.getHomepageFeatured,
);

router.patch(
	"/settings/homepage-featured",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.updateHomepageFeatured,
);

router.get(
	"/jackpot/:prizePoolType",
	optionalAuthenticate,
	adminController.getTotalJackpot,
);

router.post(
	"/jackpot/win",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.winJackpot,
);

// router.patch("/settingsV2/:settingType",
//     authenticate,
//     requireRole(['admin', 'super']),
//     adminController.updateSettingsBundle
// );

router.patch(
	"/settings/general/upload/:settingType",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.uploadSettingsFile,
);

router
	.route("/user-balance/:id")
	.get(
		authenticate,
		requireRole(["admin", "super"]),
		adminController.getUserBalancesAndWithdrawalRequests,
	)
	.patch(
		authenticate,
		requireRole(["super"]),
		adminController.updateUserBalance,
	);

// router.patch("/update-user-balance/:id",
//     authenticate,
//     requireRole(['admin', 'super']),
//     adminController.getUserBalancesAndWithdrawalRequests
// )

router.post(
	"/raffle/update",
	authenticate,
	requireRole(["admin", "super"]),
	adminController.updateRaffle,
);

router
	.route("/featured/community")
	.post(
		authenticate,
		requireRole(["admin", "super"]),
		singleUpload,
		adminController.addFeaturedCommunity,
	)
	.patch(
		authenticate,
		requireRole(["admin", "super"]),
		singleUpload,
		adminController.updateFeaturedCommunity,
	)
	.delete(
		authenticate,
		requireRole(["admin", "super"]),
		adminController.deleteFeaturedCommunity,
	)
	.get(
		rateLimiter({ durationSec: 60, allowedHits: 200 }),
		adminController.getFeaturedCommunity,
	);

router
	.route("/featured/token")
	.post(
		authenticate,
		requireRole(["admin", "super"]),
		singleUpload,
		adminController.addFeaturedToken,
	)
	.patch(
		authenticate,
		requireRole(["admin", "super"]),
		singleUpload,
		adminController.updateFeaturedToken,
	)
	.delete(
		authenticate,
		requireRole(["admin", "super"]),
		adminController.deleteFeaturedToken,
	)
	.get(
		rateLimiter({ durationSec: 60, allowedHits: 200 }),
		adminController.getFeaturedToken,
	);

router.post(
	"/allowlist/draw-winners",
	authenticate,
	requireRole(["super"]),
	allowlistExists({ fetchLean: false }),
	adminController.overrideAllowlistWinnerDraw,
);

// Bet limits management routes
router.use("/bet-limits", betLimitsRouter);

// Points system management routes
router.use("/points", authenticate, requireRole(["admin", "super"]), pointsAdminRouter);

// Founders Key management routes
router.use("/founders-keys", foundersKeyAdminRouter);

// Allowlist management routes
router.use("/allowlists", allowlistAdminRouter);

// Affiliate management routes
router.use("/affiliates", affiliateAdminRouter);

module.exports = router;
