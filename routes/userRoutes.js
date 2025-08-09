const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const userController = require("../controllers/userController");
const rateLimiter = require("../middleware/rateLimiter");
const {
	checkUserCreationVerificationCode,
} = require("../middleware/checkVerificationCode");
const {
	validatePassword,
	validateUsername,
	validateEmail,
	isUserCanWithdraw,
	validateTelegramUsername,
	isUserHasEnoughNafflings,
} = require("../middleware/validate");
const {
	authenticate,
	authenticateSignature,
	authenticateSignatureWhenUpdatingWallet,
	requireRole,
} = require("../middleware/authenticate");
const multer = require("multer");
const { imageFileFilter } = require("../utils/image");
const optionalAuthenticate = require("../middleware/optionalAuthenticate");
const { getFeeOnWithdraw } = require("../middleware/helpers");
const { allowlistExists } = require("../middleware/allowlistValidate");

router.get("/raffle-service-fee", userController.getRaffleServiceFee);
// Import rate limiting middleware
const {
	authRateLimit,
	loginRateLimit,
	registrationRateLimit,
	passwordResetRateLimit,
	emailVerificationRateLimit,
	walletConnectionRateLimit
} = require("../middleware/authRateLimit");

router.post("/signup", registrationRateLimit, validateEmail, validatePassword, authController.signUp);
router.post("/login", loginRateLimit, authController.login);
router.post(
	"/login/wallet",
	walletConnectionRateLimit,
	authenticateSignature,
	authController.loginUsingWallet,
);

// Enhanced authentication endpoints
router.post("/logout", authenticate, authController.logout);
router.post("/refresh-token", authRateLimit, authController.refreshToken);
router.get("/verify-session", authRateLimit, authController.verifySession);
router.get("/auth-methods", authenticate, authController.getAuthMethods);
router.post(
	"/link-wallet",
	authenticate,
	walletConnectionRateLimit,
	authenticateSignatureWhenUpdatingWallet,
	authController.linkWallet
);
router.post(
	"/send-email-verification",
	emailVerificationRateLimit,
	checkUserCreationVerificationCode,
	rateLimiter({ durationSec: 15 * 60, allowedHits: 5 }),
	authController.sendEmailVerification,
);

const storage = multer.memoryStorage();
const singleUpload = multer({
	storage: storage,
	limits: { fileSize: 25 * 1024 * 1024 },
	fileFilter: imageFileFilter,
}).single("file");

router.get("/search", userController.searchUser);

router
	.route("/profile/wallet")
	.post(
		authenticate,
		authenticateSignatureWhenUpdatingWallet,
		userController.addWallet,
	)
	.delete(authenticate, userController.deleteWallet);

router
	.route("/profile")
	.get(authenticate, userController.getUserProfile)
	.patch(
		authenticate,
		singleUpload,
		validateUsername,
		validateEmail,
		validatePassword,
		validateTelegramUsername,
		userController.updateUserProfile,
	);

router.post(
	"/verify-token/email",
	rateLimiter({ durationSec: 15 * 60, allowedHits: 10 }),
	userController.updateEmail,
);

router.post(
	"/update-password",
	authenticate,
	validatePassword,
	userController.updateUserPassword,
);

router.post(
	"/request-temporary-password",
	rateLimiter({ durationSec: 15 * 60, allowedHits: 5 }),
	userController.requestPasswordReset,
);

router.post(
	"/reset-password",
	rateLimiter({ durationSec: 15 * 60, allowedHits: 5 }),
	validatePassword,
	userController.resetPassword,
);

router
	.route("/withdraw")
	.get(
		authenticate,
		requireRole(["admin", "super"]),
		userController.getWithdrawalRequests,
	)
	.post(
		authenticate,
		getFeeOnWithdraw,
		isUserCanWithdraw,
		userController.createCoinWithdrawalRequest,
	);

router.get(
	"/get-token-withdrawal-fees",
	optionalAuthenticate,
	rateLimiter({ durationSec: 60, allowedHits: 200 }),
	getFeeOnWithdraw,
	userController.getWithdrawalFee,
);

router.patch(
	"/withdraw/reject-withdrawal-request/:id",
	authenticate,
	requireRole(["admin", "super"]),
	userController.rejectWithdrawalRequest,
);

router.get(
	"/withdraw/history",
	authenticate,
	requireRole(["admin", "super"]),
	userController.getWithdrawalHistory,
);

router.post("/activity-log", authenticate, userController.logUserActivity);

router.post(
	"/activity/points",
	authenticate,
	userController.giveActivityPoints,
);

router.get("/leaderboards/:leaderboardType", userController.getLeaderboards);

router.get(
	"/transaction/history",
	authenticate,
	userController.getTransactionHistories,
);

router
	.route("/airdrop")
	.get(authenticate, userController.checkAirdropStatus)
	.post(
		authenticate,
		isUserHasEnoughNafflings({ amount: 5 }),
		rateLimiter({ durationSec: 60, allowedHits: 5 }),
		userController.checkTasksCompletionForPreLaunchAirdrop,
	);

router.get("/my-allowlists", authenticate, userController.getMyAllowlists);

// Enhanced profile management endpoints
router.get("/profile/comprehensive", authenticate, userController.getComprehensiveProfile);
router.patch("/profile/data", authenticate, userController.updateProfileData);
router.get("/profile/wallets", authenticate, userController.getUserWallets);
router.patch("/profile/primary-wallet", authenticate, userController.setPrimaryWallet);
router.patch("/profile/wallet-metadata", authenticate, userController.updateWalletMetadata);
router.get("/profile/founders-keys", authenticate, userController.getFoundersKeyBenefits);
router.post("/profile/check-founders-keys", authenticate, userController.checkFoundersKeys);
router.get("/profile/activity-summary", authenticate, userController.getUserActivitySummary);
router.patch("/profile/preferences", authenticate, userController.updateUserPreferences);

// Notification and settings management
router.get("/profile/notifications", authenticate, userController.getNotificationPreferences);
router.patch("/profile/notifications", authenticate, userController.updateNotificationPreferences);

// Action items and achievements
router.get("/profile/action-items", authenticate, userController.getUserActionItems);
router.patch("/profile/action-items/:actionItemId/complete", authenticate, userController.markActionItemCompleted);
router.get("/profile/achievements", authenticate, userController.getUserAchievements);

// Staking and community data
router.get("/profile/staking-positions", authenticate, userController.getUserStakingPositions);
router.get("/profile/community-memberships", authenticate, userController.getUserCommunityMemberships);

// Transaction history and analytics
router.get("/profile/transaction-history", authenticate, userController.getUserTransactionHistory);
router.get("/profile/analytics", authenticate, userController.getUserAnalytics);

module.exports = router;
