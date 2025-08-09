const express = require("express");
const router = express.Router();
const { requireRole, authenticate } = require("../middleware/authenticate");
const optionalAuthenticate = require("../middleware/optionalAuthenticate");
const raffleController = require("../controllers/raffleContoller");
const { validatePermission } = require("../middleware/validate");
const raffleService = require("../services/raffleService");

// Get Create Raffle Modal dropdown options
router.get(
	"/options",
	authenticate,
	raffleService.validateFields,
	raffleController.getDropdownOptions,
);

// Raffle API (Not a giveaway)
router
	.route("")
	.post(
		authenticate,
		raffleService.validateFields,
		raffleService.checkUserBalances(),
		raffleController.createNewRaffle,
	)
	// GET Live Raffles
	.get(
		optionalAuthenticate,
		raffleService.validateFields,
		raffleController.getRaffles,
	);

router.get(
	"/allowlists",
	optionalAuthenticate,
	raffleController.getAllowlistRaffles,
);

// Get Raffle Summary
router.get("/new/summary", authenticate, raffleController.getNewRaffleSummary);

// GET Raffle Details
router
	.route("/:raffleId")
	.get(optionalAuthenticate, raffleController.getRaffleDetails);

// GET Raffle by id
router
	.route("/:raffleId/ticket-sales-history")
	.get(optionalAuthenticate, raffleController.getTicketSalesHistory);

//Buy raffle tickets
router
	.route("/:raffleId/ticket-purchase")
	.post(
		authenticate,
		raffleService.validateFields,
		raffleService.checkUserBalances("ticketPurchase"),
		raffleService.checkAvailableTickets,
		raffleController.buyRaffleTickets,
	);

// Draw raffle winner
router
	.route("/:raffleId/draw")
	.post(
		authenticate,
		raffleService.validateFields,
		raffleService.verifyAndCheckDraw,
		raffleController.drawRaffleWinner,
	);

// WIP (for NFT raffles use)
router.post(
	"/:raffleId/claim",
	authenticate,
	// Check if the user is winner
	raffleService.validateFields,
	raffleService.verifyClaim,
	raffleController.claimRafflePrize,
);

router.post(
	"/:raffleId/cancel-and-refund",
	authenticate,
	raffleService.validateFields,
	raffleService.verifyCancelPermissions,
	raffleController.cancelAndRefundRaffle,
);

router.get(
	"/jackpot/current/:prizePoolType",
	optionalAuthenticate,
	raffleController.getTotalJackpot,
);

router.post(
	"/jackpot/win",
	authenticate,
	requireRole(["admin", "super"]),
	raffleController.winJackpot,
);

router.get(
	"/jackpot/history/all",
	optionalAuthenticate,
	raffleController.getJackpotHistory,
);

// Url exclusively for admin giveaways
router
	.route("/giveaways")
	.post(
		authenticate,
		validatePermission, // Validate raffle creation permission
		requireRole(["admin", "super"]),
		raffleController.createGiveaway,
	)
	.get(optionalAuthenticate, raffleController.getGiveaways);

router
	.route("/giveaways/draw")
	.post(authenticate, requireRole(["super"]), raffleController.handleDraw);

router.route("/winner-history").get(raffleController.getLotteryWinners);

module.exports = router;
