const Raffle = require("../models/raffle/raffle");
const Jackpot = require("../models/jackpot/jackpot");
const { validatePrizePoolType } = require("../utils/validatePrizePoolType");
const Giveaway = require("../models/raffle/giveaway");
const User = require("../models/user/user");
const moment = require("moment");
const { calculateAndUpdateJackpot } = require("./jackpotAccumulation");
const { convertToBigInt, convertToNum } = require("../utils/convert");
const LotteryWinner = require("../models/raffle/lotteryWinner");
const sendResponse = require("../utils/responseHandler");
const TicketDiscount = require("../utils/enums/ticketDiscounts");
const WalletBalance = require("../models/user/walletBalance");
const RaffleWinner = require("../models/raffle/raffleWinner");
const { userRoles, LOTTERY_TYPES, RAFFLE_TYPES } = require("../config/config");
const RaffleConstants = require("../utils/constants/RaffleConstants");
const LotteryEventCategory = require("../utils/enums/lotteryEventCategory");
const RaffleTicket = require("../models/raffle/raffleTicket");
const { AdminSettings } = require("../models/admin/adminSettings");
const sequenceUtil = require("../utils/sequenceUtil");
const SequenceConstants = require("../utils/constants/SequenceConstants");
const { getSupportedTokenDecimalMultiplier } = require("../utils/helpers");
const {
	selectRandomEntry,
	requestForRandomNumber,
} = require("../utils/random");
const { pointsEarnedByActivity } = require("./pointsService");
const Allowlist = require("../models/client/allowlist/allowlist");
const ClientMemberProfile = require("../models/client/clientMemberProfile");
const userService = require("./userService");
const ClientAdminActivityManagement = require("../models/client/clientAdminActivityManagement");
const { requestForRandomNumberVrfQueue } = require("../config/queue");

// Open entry ticket percentage
const OPEN_ENTRY_PERCENT = 0.05;

// ++++++++++++++++++ VALIDATORS SECTION ++++++++++++++++++

exports.validateLotteryTypes = (options = {}) => {
	const { lotteryTypeEnum, lotteryTypes } = options;
	var types =
		lotteryTypeEnum ||
		(lotteryTypes
			? lotteryTypes
				.split(",")
				.map((type) => type.trim())
				.filter((type) => type)
			: []);

	console.log("VALIDATING LOTTERY TYPES:", types);
	let error = null;
	if (Array.isArray(types)) {
		const invalidTypes = types.filter(
			(type) => !LOTTERY_TYPES.includes(type.toUpperCase()),
		);
		if (invalidTypes.length > 0) {
			error = invalidTypes;
		}
	} else {
		if (!LOTTERY_TYPES.includes(types.toUpperCase())) {
			error = types;
		}
	}
	return error;
};

exports.validateRaffleTypes = (options = {}) => {
	const { raffleTypeEnum, raffleTypes } = options;

	var types =
		raffleTypeEnum ||
		(raffleTypes
			? // Ignore whitespaces (Don't insert in types list)
			raffleTypes
				.split(",")
				.map((type) => type.trim())
				.filter((type) => type)
			: []);

	console.log("VALIDATING RAFFLE TYPES:", types);
	let error = null;
	if (Array.isArray(types)) {
		const invalidTypes = types.filter(
			(type) => !RAFFLE_TYPES.includes(type.toUpperCase()),
		);
		if (invalidTypes.length > 0) {
			error = invalidTypes;
		}
	} else {
		if (!RAFFLE_TYPES.includes(types.toUpperCase())) {
			error = types;
		}
	}
	return error;
};

exports.validateFields = async (req, res, next) => {
	const { originalUrl: urlPath, method } = req;
	const { raffleId } = req.params;
	try {
		let raffle = {};
		// Check if Raffle exists by raffleId or eventId
		if (urlPath.includes(`/${raffleId}/`)) {
			// Validate raffleId format
			if (!mongoose.Types.ObjectId.isValid(raffleId)) {
				return sendResponse(res, 400, "Invalid raffle ID format");
			}
			
			const { eventId } = req.body;
			raffle = await checkRaffleIfExists(raffleId, eventId);
			if (!raffle) {
				return sendResponse(res, 404, "Raffle not found");
			}
			req.raffle = raffle;
		}

		// Create Raffle endpoint request validator
		if (urlPath === "/raffle" && method === "POST") {
			// Validate lotteryTypeEnum and raffleTypeEnum
			const { lotteryTypeEnum, raffleTypeEnum, coinType } = req.body;
			if (!coinType) {
				return sendResponse(
					res,
					400,
					"Property `coinType` must not be null or empty",
				);
			}
			let error;
			error = this.validateLotteryTypes({ lotteryTypeEnum });
			if (error) {
				return sendResponse(res, 400, "Invalid lotteryType value", {
					error: error,
				});
			}
			if (raffleTypeEnum) {
				error = this.validateRaffleTypes({ raffleTypeEnum });
				if (error) {
					return sendResponse(res, 400, "Invalid raffleType value", {
						error: error,
					});
				}
			}

			// Validate discountCode
			const { discountCode } = req.body;
			if (discountCode && !TicketDiscount.isValidCode(discountCode)) {
				return sendResponse(res, 400, "Invalid discountCode");
			}
			req.body["lotteryTypeEnum"] = lotteryTypeEnum.toUpperCase();
			req.body["raffleTypeEnum"] = raffleTypeEnum?.toUpperCase();
			req.raffle = {
				lotteryTypeEnum: lotteryTypeEnum.toUpperCase().trim(),
				coinType: coinType.toLowerCase().trim(),
			};
		}

		// Get all live raffles request validator
		if (
			(urlPath === "/raffle" || urlPath.includes("/raffle?")) &&
			method === "GET"
		) {
			// Validate lotteryTypes and raffleTypes
			const { lotteryTypes, raffleTypes } = req.query;
			let error;
			error = this.validateLotteryTypes({ lotteryTypes });
			if (error) {
				return sendResponse(res, 400, "Invalid lotteryType value", {
					error: error,
				});
			}
			error = this.validateRaffleTypes({ raffleTypes });
			if (error) {
				return sendResponse(res, 400, "Invalid raffleType value", {
					error: error,
				});
			}
		}

		// Buy Raffle Tickets request validator
		if (urlPath.includes(`/${raffleId}/ticket-purchase`)) {
			const { userId, eventId } = req.body;

			if (userId) {
				const user = await User.findById(userId);
				if (!user) {
					return sendResponse(res, 404, "User not found");
				}
			}
			if (!raffleId && !eventId)
				return sendResponse(res, 400, "raffleId or eventId is required.");

			if (raffle && !raffle.status.isActive) {
				return sendResponse(
					res,
					400,
					"Unable to buy tickets. Raffle has already ended.",
				);
			}
		}

		// Draw Raffle winner
		if (urlPath.includes(`/${raffleId}/draw`)) {
		}

		// Cancel and refund
		if (urlPath.includes(`/${raffleId}/cancel-and-refund`)) {
			// Check if raffle is already cancelled
			if (raffle && raffle.isCancelled) {
				return sendResponse(res, 400, "Raffle has already been cancelled.");
			}
		}

		next();
	} catch (err) {
		console.log("Error validating fields:", err);
		return sendResponse(res, 500, "Failed to validate fields", { error: err });
	}
};

async function checkRaffleIfExists(raffleId, eventId) {
	const raffle = raffleId
		? await Raffle.findById(raffleId)
		: await Raffle.findOne({ eventId: eventId });
	return raffle;
}

exports.checkUserBalances = (route = "newRaffle") => {
	return async (req, res, next) => {
		const { raffle, user } = req;
		try {
			let totalCost = 0,
				currentBalance = 0,
				userWalletBalance,
				convertedAmount,
				responseData = {};

			const { rafflePrize = {} } = req.body;
			switch (route) {
				case "newRaffle":
					if (raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_TOKEN) {
						totalCost = BigInt(rafflePrize.amount);

						const token = rafflePrize.token.toLowerCase().trim();
						userWalletBalance = await WalletBalance.findOne({
							userRef: user._id,
						});
						currentBalance = BigInt(
							userWalletBalance?.balances?.get(token) || 0,
						);
						convertedAmount = await convertToNum(currentBalance, token);

						responseData = {
							token,
							amount: currentBalance.toString(),
						};
					}
					if (
						raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_NAFFLINGS
					) {
						totalCost = BigInt(rafflePrize.nafflings);
						currentBalance = BigInt(user.temporaryPoints || 0);
						convertedAmount = user.temporaryPointsAsNumber;

						responseData = {
							nafflings: currentBalance.toString(),
						};
					}
					break;
				case "ticketPurchase":
					const { clientProfileRef, coinType } = raffle;
					const { quantity } = req.body;

					responseData = { token: coinType };

					if (clientProfileRef) {
						totalCost = raffle.perTicketPrice * quantity;
						const memberProfile = await ClientMemberProfile.findOne({
							clientProfileRef,
							memberRef: user._id,
						});
						req.memberProfile = memberProfile;
						currentBalance = memberProfile?.points?.balance || 0;
						convertedAmount = currentBalance;
						responseData.amount = currentBalance.toString();
					} else if (coinType === "nafflings") {
						const totalTicketPrice =
							await this.calculateTotalTicketPriceWithMultiplier(
								raffle.perTicketPrice,
								quantity,
								coinType,
							);
						totalCost = BigInt(totalTicketPrice.toString());
						currentBalance = BigInt(user.temporaryPoints || 0);
						convertedAmount = user.temporaryPointsAsNumber;
						responseData = { nafflings: currentBalance.toString() };
					} else {
						const totalTicketPrice =
							await this.calculateTotalTicketPriceWithMultiplier(
								raffle.perTicketPrice,
								quantity,
								coinType,
							);
						totalCost = BigInt(totalTicketPrice.toString());
						userWalletBalance = await WalletBalance.findOne({
							userRef: user._id,
						});
						currentBalance = BigInt(
							userWalletBalance?.balances?.get(coinType) || 0,
						);
						convertedAmount = await convertToNum(currentBalance, coinType);
						responseData.amount = currentBalance.toString();
					}
					req.totalTicketPrice = totalCost;
					break;
				default:
					console.error("Error checking user balances, invalid route.");
					return sendResponse(
						res,
						400,
						"Error checking user balances, invalid route.",
					);
			}
			responseData.convertedAmount = convertedAmount;

			if (totalCost > currentBalance) {
				return sendResponse(
					res,
					400,
					"You have not enough balance!",
					responseData,
				);
			}
			req.walletBalances = userWalletBalance;
			next();
		} catch (err) {
			console.log("Failed to check user wallet balance:", err);
			return sendResponse(res, 500, "Failed to check user wallet balance", {
				error: err.message,
			});
		}
	};
};

exports.calculateTotalTicketPriceWithMultiplier = async (
	perTicketPrice,
	quantity,
	coinType,
) => {
	const multiplier = await getSupportedTokenDecimalMultiplier(
		coinType.toLowerCase(),
	);
	return (
		(await convertToNum(perTicketPrice, coinType.toLowerCase())) *
		multiplier *
		quantity
	);
};

exports.checkAvailableTickets = (req, res, next) => {
	const { raffle } = req;
	const { quantity } = req.body;
	// Check if there are enough available tickets (for RESERVE)
	if (
		raffle.raffleTypeEnum !== "UNLIMITED" &&
		quantity > raffle.ticketsAvailable
	) {
		return sendResponse(
			res,
			500,
			raffle.ticketsAvailable > 0
				? `Transaction failed. Only ${raffle.ticketsAvailable} ${raffle.ticketsAvailable === 1 ? "ticket" : "tickets"} left.`
				: "Raffle is closed. No more tickets available.",
		);
	}
	next();
};

exports.verifyAndCheckDraw = async (req, res, next) => {
	// Ensure only seller/creator is allowed to draw winner
	if (!req.raffle.createdBy.equals(req.user._id)) {
		return sendResponse(res, 401, "You are not allowed to draw this raffle");
	}
	const { raffle } = req;
	const winnerDrawn = await RaffleWinner.findOne({ raffle: raffle._id });
	if (winnerDrawn) {
		const responseData = {
			eventId: raffle.eventId,
			winner: winnerDrawn.user,
		};
		return sendResponse(
			res,
			200,
			"This raffle has been decided!",
			responseData,
		);
	}
	if (!raffle.status.isActive) {
		return sendResponse(
			res,
			200,
			"Raffle is no longer active or has been cancelled.",
		);
	}
	next();
};

exports.verifyClaim = async (req, res, next) => {
	const { raffle } = req;

	const raffleWinningEntry = await RaffleWinner.findOne({ raffle: raffle._id });
	if (!raffleWinningEntry)
		return sendResponse(
			res,
			404,
			raffle.status.isActive
				? "No raffle winner has been drawn yet"
				: "Raffle is no longer active or has been cancelled.",
		);

	// Check if raffleWinner.user is req.user
	const currentUser = req.user;
	if (
		!raffleWinningEntry.user.equals(currentUser._id) &&
		currentUser.role === "user"
	) {
		return sendResponse(
			res,
			401,
			"Sorry, you are not allowed to claim this prize.",
		);
	}
	// If admin is calling the API, bypass
	// and set a flag to determine
	// This way, we give the prize to the
	// entry winner set in raffleWinner
	const adminRoles = userRoles.slice(1);
	req.isAdminOrSuper = adminRoles.some((role) => req.user.role === role);

	next();
};

// - For RESERVE and UNLIMITED raffles only. UNCONDITIONAL raffles will always draw.
// - If RESERVE raffle is not sold out by the end. Seller can cancel/refund.
// - Admin/Super can cancel raffle anytime
exports.verifyCancelPermissions = async (req, res, next) => {
	const { raffle } = req;
	// console.log("raffleTypeEnum:", raffle.raffleTypeEnum);
	if (raffle.raffleTypeEnum === RaffleConstants.RAFFLE_TYPE_UNCONDITIONAL) {
		return sendResponse(res, 400, "Unconditional raffles cannot be cancelled!");
	}

	const currentUser = req.user;
	const adminRoles = userRoles.slice(1);
	const isAdminOrSuper = adminRoles.some((role) => req.user.role === role);
	if (!isAdminOrSuper && !raffle.createdBy.equals(currentUser._id)) {
		return sendResponse(
			res,
			401,
			"Action denied. You cannot cancel this raffle.",
		);
	}

	const currentDate = new Date();
	if (!isAdminOrSuper && currentDate < raffle.raffleEndDate) {
		const resData = {
			currentDate,
			raffleEndDate: raffle.raffleEndDate,
		};
		return sendResponse(
			res,
			400,
			"Unable to cancel raffle at the moment.",
			resData,
		);
	}

	next();
};

exports.fetchUserWalletBalanceByToken = async (userId, token) => {
	const userWalletBalance = await WalletBalance.findOne({ userRef: userId });
	const currentBalance = BigInt(userWalletBalance?.balances?.get(token) || 0);
	const convertedAmount = await convertToNum(currentBalance, token);
	return { userWalletBalance, currentBalance, convertedAmount };
};

// ++++++++++++++++++ END OF VALIDATORS ++++++++++++++++++

exports.createNewRaffle = async (rafflePrizeId, options = {}) => {
	const {
		session,
		lotteryTypeEnum,
		raffleTypeEnum,
		coinType,
		ticketsAvailable,
		ticketsAvailableOpenEntry,
		perTicketPrice,
		discountCode,
		raffleDurationDays,
		sellerId,
		clientProfileId,
	} = options;
	const newRaffle = new Raffle({
		rafflePrize: rafflePrizeId,
		eventId: await sequenceUtil.generateId(session, {
			prefix: SequenceConstants.RAFFLE_EVENT_PREFIX,
			name: SequenceConstants.RAFFLE_EVENT_ID,
		}),
		lotteryTypeEnum: lotteryTypeEnum,
		raffleTypeEnum: raffleTypeEnum,
		coinType: coinType || "nafflings",
		ticketsAvailable: ticketsAvailable || 0,
		ticketsAvailableOpenEntry: ticketsAvailableOpenEntry,
		perTicketPrice: perTicketPrice,
		discountCode: discountCode,
		raffleDurationDays: raffleDurationDays,
		createdBy: sellerId,
		clientProfileRef: clientProfileId,
	});
	console.log("creating new raffle...");
	return await newRaffle.save({ session });
};

exports.createAllowlistRaffle = async (session, user, reqBody = {}) => {
	const {
		lotteryTypeEnum,
		raffleTypeEnum,
		token,
		mintPrice,
		reserveStake,
		clientProfileId,
	} = reqBody;

	// Calculate total ticket price
	let perTicketPrice = 0;
	if (mintPrice) {
		const mintPriceNum = parseFloat(mintPrice);
		if (!isNaN(mintPriceNum)) {
			perTicketPrice += mintPriceNum;

			if (reserveStake) {
				perTicketPrice += mintPrice * reserveStake;
			}
		}
	}

	const newRaffle = new Raffle({
		eventId: await sequenceUtil.generateId(session, {
			prefix: SequenceConstants.RAFFLE_EVENT_PREFIX,
			name: SequenceConstants.RAFFLE_EVENT_ID,
		}),
		lotteryTypeEnum,
		raffleTypeEnum,
		coinType: token?.toLowerCase() || null,
		perTicketPrice,
		createdBy: user._id,
		clientProfileRef: clientProfileId,
	});
	console.log("newRaffle:", newRaffle);

	// Setup presale payment, if provided
	let presaleRequirePayment = {};
	if (mintPrice) {
		presaleRequirePayment.enabled = true;
		presaleRequirePayment.token = token.toLowerCase();
		presaleRequirePayment.mintPrice = mintPrice;
		if (reqBody.refundLosingEntries) {
			presaleRequirePayment.refundLosingEntries = true;
		}
		const applyProfitGuarantee = {};
		if (reqBody.pgPct) {
			applyProfitGuarantee.pgPct = reqBody.pgPct;
		}
		if (reqBody.reserveStake) {
			applyProfitGuarantee.reserveStake = reqBody.reserveStake;
		}
		presaleRequirePayment.applyProfitGuarantee = applyProfitGuarantee;
	}

	let submitWalletAddress = {};
	if (reqBody.walletConstraints) {
		submitWalletAddress.constraints = reqBody.walletConstraints;
		submitWalletAddress.enabled = true;
	}

	let joinDiscord = {};
	if (reqBody.joinDiscord) {
		joinDiscord = reqBody.joinDiscord;
		joinDiscord.enabled = true;
	}

	let twitterTasks = {};
	if (reqBody.twitterTasks) {
		twitterTasks = reqBody.twitterTasks;
		twitterTasks.enabled = true;
	}

	let joinTelegram = {};
	if (reqBody.joinTelegram) {
		joinTelegram = reqBody.joinTelegram;
		joinTelegram.enabled = true;
	}

	const allowlistRaffle = new Allowlist({
		raffle: newRaffle._id,
		raffleName: reqBody.raffleName,
		blockchain: reqBody.blockchain,
		description: reqBody.description,
		banner: reqBody.banner,
		winnerCount: reqBody.winnerCount,
		everyoneWins: reqBody.everyoneWins,
		startTime: reqBody.startTime,
		endTime: reqBody.endTime,
		submitVerifiedEmail: reqBody.submitVerifiedEmail,
		presaleRequirePayment,
		submitWalletAddress,
		joinDiscord,
		twitterTasks,
		joinTelegram,
		requireCaptcha: reqBody.requireCaptcha,
	});
	newRaffle.allowlistRaffle = allowlistRaffle._id;

	await newRaffle.save({ session });
	return await allowlistRaffle.save({ session });
};

exports.findRaffles = async (req, isGiveaway = null) => {
	const { prizePoolType = "nafflings", isActive = true } = req.query;
	try {
		// Validate query parameters
		const isValid = validatePrizePoolType(prizePoolType);
		if (!isValid) {
			console.log("Invalid prizePoolType:", prizePoolType);
			return;
		}

		let query = {
			prizePoolType: prizePoolType,
			isActive: isActive,
		};
		if (isGiveaway !== null) {
			query.isGiveaway = isGiveaway;
		}

		// Find jackpots based on query parameters
		const jackpots = await Jackpot.find(query).select("_id");

		// Extract jackpot IDs
		const jackpotIds = jackpots.map((jackpot) => jackpot._id);

		// Find giveaways with matching jackpot IDs
		const raffles = await Raffle.find({
			// jackpot: { $in: jackpotIds }
		}).populate("jackpot");

		return raffles;
	} catch (error) {
		console.error("Error finding active raffles:", error);
	}
};

// will be called after getting randomnumber in vrf
exports.fulfillRaffleDraw = async (session, raffle, winningTicketNumber) => {
	const isTokenRaffle =
		raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_TOKEN;
	const isNafflingsRaffle =
		raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_NAFFLINGS;

	const winningTicket = await RaffleTicket.findOne({
		raffle: raffle._id,
		ticketNumber: winningTicketNumber
	})
		.session(session)
		.populate({
			path: "raffle",
			select: "rafflePrize eventId isFree",
		})
		.exec();

	if (!winningTicket) {
		throw new Error(
			`Cannot fulfill raffle, no winning ticket. ${raffle._id}, ${winningTicketNumber}`,
		);
	}

	// Count the number of total raffle tickets
	var totalPaidRaffleTickets = await RaffleTicket.countDocuments({
		raffle: raffle._id,
		isFree: false
	});

	// Distribute prize to winner and earnings to seller (if token or nafflings raffle)
	if (isTokenRaffle || isNafflingsRaffle) {
		const raffleTicketsCount = totalPaidRaffleTickets;
		try {
			await distributePrizeAndEarnings(
				winningTicket.purchasedBy, // Winner ID
				raffle.createdBy, // Seller/Creator ID
				raffle,
				{ raffleTicketsCount, isNafflingsRaffle, session },
			);
		} catch (err) {
			throw new Error(`Error distributing prize and earnings: ${err.message}`);
		}
	}

	const raffleWinner = new RaffleWinner({
		user: winningTicket.purchasedBy,
		raffle: winningTicket.raffle._id,
		eventId: winningTicket.raffle.eventId,
		winningTicket: winningTicket._id,
		winningTicketId: winningTicket.naffleTicketId,
		rafflePrize: winningTicket.raffle.rafflePrize,
		isClaimed: isTokenRaffle || isNafflingsRaffle,
	});
	await raffleWinner.save({ session });

	var raffle = await Raffle.findById(raffle._id)
		.populate("rafflePrize")
		.session(session);
	// Set raffle isActive to false and update wonBy
	raffle.status["isActive"] = false;
	raffle.status["wonBy"] = raffleWinner.user;
	raffle.vrf.winningTicketNumber = winningTicketNumber;
	raffle.vrf.status = "Completed";
	await raffle.save({ session });

	const lotteryWinnerObj = {
		session,
		eventId: raffle.eventId,
		winnerId: winningTicket.purchasedBy,
	};
	// Append winner to lottery winners
	if (isTokenRaffle) {
		lotteryWinnerObj.category = LotteryEventCategory.CRYPTO_RAFFLE;
		lotteryWinnerObj.prize = { crypto: raffle.rafflePrize.tokenPrize };
	} else if (raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_NFT) {
		lotteryWinnerObj.category = LotteryEventCategory.NFT_RAFFLE;
		lotteryWinnerObj.prize = { nft: raffle.rafflePrize.nftPrize };
	} else {
		// Nafflings Raffle (if requested)
		lotteryWinnerObj.category = LotteryEventCategory.NAFFLINGS_RAFFLE;
		lotteryWinnerObj.prize = { nafflings: raffle.rafflePrize.nafflings };
	}
	await this.saveLotteryWinner(lotteryWinnerObj);
};

exports.drawRaffleWinner = async (raffle, options = {}) => {
	console.log("Drawing raffle winner...");
	const { session, sellerId } = options;
	const isTokenRaffle =
		raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_TOKEN;
	const isNafflingsRaffle =
		raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_NAFFLINGS;

	console.log("isTokenRaffle?", isTokenRaffle ? "YES" : "NO");
	// Fetch all raffleTickets purchased for a particular raffle
	const raffleTickets = await RaffleTicket.find({ raffle: raffle._id })
		.session(session)
		.populate({
			path: "raffle",
			select: "rafflePrize eventId isFree",
		})
		.exec();

	// Check if any raffle tickets are found
	if (raffleTickets.length === 0) {
		throw new Error("Cannot draw raffle winner, no raffle tickets found.");
	}
	if (raffle.vrf.status !== "Pending") {
		throw new Error("Cannot draw raffle winner multiple times.");
	}

	// // TODO Use VRF chainlink instead of system-based random selector
	// let winningTicket;
	try {
		const randomRange = raffleTickets.length;
		// Check if the queue has more than 1000 waiting tasks
		const waitingCount = await requestForRandomNumberVrfQueue.getWaitingCount();
		if (waitingCount >= 5000) {
			throw new Error(`Queue is full. Please try drawing again later.`);
		}

		// add twitter task on queu
		const jobId = `${raffle._id}-${raffle.createdBy}`; // Create a unique job ID
		// Check if a job with the same jobId already exists
		const existingJob = await requestForRandomNumberVrfQueue.getJob(jobId);
		if (existingJob) {
			throw new Error(`Job already exists for raffle ${raffle._id}. Skipping addition.`);
		} else {
			// Update vrf status to "In Progress"
			raffle.vrf.status = "In Progress";
			await raffle.save({ session });

			// Add the VRF task to the queue
			requestForRandomNumberVrfQueue
				.add(
					{ raffleId: raffle._id, randomRange },
					{
						jobId,
						attempts: 1,
						removeOnComplete: true,
						removeOnFail: true,
					},
				)
				.then((job) =>
					console.log(`Added VRF task to queue with jobId: ${jobId}`),
				)
				.catch((err) =>
					console.error("Error adding VRF task to queue:", err),
				);
		}
	} catch (err) {
		throw new Error(`Error selecting random entry: ${err.message}`);
	}
};

// Distributes prize to winner and earnings to seller
const distributePrizeAndEarnings = async (
	winnerId,
	sellerId,
	raffle,
	options = {},
) => {
	console.log("Distributing prize and earnings...");
	const { raffleTicketsCount, isNafflingsRaffle, session } = options;
	const { rafflePrize } = raffle;
	console.log("RAFFLE PRIZE : ", rafflePrize);

	// Give out raffle prize to winner
	if (raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_TOKEN) {
		const { token, amount } = rafflePrize.tokenPrize;
		// Find wallet balance of winner
		const winnerWalletBalance = await WalletBalance.findOne({
			userRef: winnerId,
		});
		const winnerCurrentBalance = BigInt(
			winnerWalletBalance?.balances?.get(token.toLowerCase()) || 0,
		);

		// Add raffle prize to winner wallet balance ()
		const winnerTotalBalance = winnerCurrentBalance + BigInt(amount);
		winnerWalletBalance.balances.set(
			token.toLowerCase(),
			winnerTotalBalance.toString(),
		);
		await winnerWalletBalance.save({ session });
	} else if (raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_NFT) {
		// TODO implement distribution for NFT raffles
	} else {
		// Nafflings raffle (to be added, if requested)
	}

	// Calculate total earnings
	let totalEarnings = raffleTicketsCount * parseFloat(raffle.perTicketPrice) || 0;

	// Deduct raffle fee from settings
	const { raffleFeePercentage: raffleServiceFee } = await AdminSettings.findOne(
		{},
	).select("raffleFeePercentage -_id");
	const raffleFeeDecimal = raffleServiceFee / 100; // Convert 3 to 0.03
	totalEarnings -= totalEarnings * raffleFeeDecimal;
	totalEarnings = Math.round(totalEarnings);
	if (!isNafflingsRaffle) {
		// NFT or Token raffles
		const clientProfile = raffle.clientProfileRef;
		if (clientProfile) {
			// Logic for community raffles
			const clientMemberProfile = await ClientMemberProfile.findOne({
				clientProfileRef: clientProfile._id,
				memberRef: sellerId,
			}).session(session);
			clientMemberProfile.points.earned += Number(totalEarnings);
			await clientMemberProfile.save({ session });
		} else {
			// Logic for standard raffles
			const sellerWalletBalance = await WalletBalance.findOne({ userRef: sellerId }).session(session);
			const sellerCurrentBalance = BigInt(sellerWalletBalance?.balances?.get(raffle.coinType.toLowerCase()) || 0);
			const sellerTotalBalance = sellerCurrentBalance + BigInt(totalEarnings.toString());
			sellerWalletBalance.balances.set(
				raffle.coinType.toLowerCase(),
				sellerTotalBalance.toString(),
			);
			await sellerWalletBalance.save({ session });
		}
	} else {
		// Nafflings raffle (if added)
		const seller = await User.findById(sellerId).session(session);
		const sellerCurrentPoints = BigInt(seller.temporaryPoints);
		const updatedBalance =
			sellerCurrentPoints + BigInt(totalEarnings.toString());
		seller.temporaryPoints = updatedBalance.toString();
		await seller.save({ session });
	}
};

exports.fetchAggregatedRaffleTickets = async (raffleId, options = {}) => {
	const { session, isFree } = options;

	const aggregatedTickets = await RaffleTicket.aggregate([
		// Match all raffle tickets (excluding free)
		{ $match: { raffle: raffleId, isFree: isFree } },
		{
			$group: {
				_id: "$purchasedBy", // Group by the purchasedBy field
				numberOfTickets: { $sum: 1 }, // Count the number of tickets for each user
			},
		},
		{
			$lookup: {
				from: "users", // The name of the users collection
				localField: "_id", // Field from the input documents (purchasedBy)
				foreignField: "_id", // Field from the users collection
				as: "purchasedBy", // Output array field
			},
		},
		{
			$unwind: "$purchasedBy", // Deconstruct the user array
		},
		{
			// Unselect sensitive data
			$project: {
				"purchasedBy.password": 0,
			},
		},
	]).session(session);
	const totalNumberOfTickets = aggregatedTickets.reduce(
		(acc, ticket) => acc + ticket.numberOfTickets,
		0,
	);
	return { totalNumberOfTickets, aggregatedTickets };
};

exports.findGiveaways = async (prizePoolType, isActive) => {
	try {
		const giveaways = Giveaway.find({
			prizePoolType: prizePoolType,
			"status.isActive": isActive,
		}).populate("jackpot");

		if (!giveaways) {
			console.log("No giveaway found");
			return;
		}

		return giveaways;
	} catch (error) {
		console.error("Error finding active raffles:", error);
	}
};

exports.drawWinner = async (roles = ["user"]) => {
	try {
		const users = await User.find({ role: { $in: roles } }); // Adjust the query to select eligible users
		const randomIndex = Math.floor(Math.random() * users.length);
		return users[randomIndex];
	} catch (error) {
		console.error("Error selecting random winner:", error);
		return null;
	}
};

exports.createGiveaway = async (params = {}, previousGiveaway = null) => {
	const { session, jackpot } = params;
	try {
		let newStartDate;
		let newEndDate;
		let newScheduledDrawDate;
		let homepageDurationDays;
		let createdBy;

		if (previousGiveaway) {
			// Build dates
			const giveawayDurationDays = moment(previousGiveaway.endDate).diff(
				moment(previousGiveaway.startDate),
				"days",
			);
			newStartDate = new Date();
			newEndDate = new Date(newStartDate);
			newEndDate.setDate(newEndDate.getDate() + giveawayDurationDays);
			const drawDateScheduleDays = moment(
				previousGiveaway.scheduledDrawDate,
			).diff(moment(previousGiveaway.endDate), "days");
			newScheduledDrawDate = new Date(newEndDate);
			newScheduledDrawDate.setDate(
				newScheduledDrawDate.getDate() + drawDateScheduleDays,
			);

			createdBy = previousGiveaway.createdBy;
			homepageDurationDays = previousGiveaway.homepageDurationDays;
		} else {
			newStartDate = req.startDate;
			newEndDate = req.endDate;
			newScheduledDrawDate = req.scheduledDrawDate;
			homepageDurationDays = req.homepageDurationDays;
			createdBy = req.createdBy;
		}

		const newJackpotGiveaway = new Giveaway({
			jackpot: jackpot._id,
			startDate: newStartDate,
			endDate: newEndDate,
			scheduledDrawDate: newScheduledDrawDate,
			createdBy: createdBy,
			homepageDurationDays: homepageDurationDays,
		});

		await newJackpotGiveaway.save({ session });
		await newJackpotGiveaway.populate("jackpot").execPopulate();
		return newJackpotGiveaway;
	} catch (error) {
		console.error("Encountered error during new giveaway creation:", error);
		throw error;
	}
};

exports.handleGiveawayDraw = async (params = {}) => {
	const { session, jackpot, giveaway, roles } = params;
	try {
		const winner = await this.drawWinner(roles);
		if (!winner) {
			throw new Error("Winner must not be null");
		}

		// Reset jackpot and distribute winnings to winner
		const totalWinnings = await convertToBigInt(
			await calculateAndUpdateJackpot(jackpot, { winner: winner._id, session }),
		);
		const currentPoints = winner.temporaryPoints
			? BigInt(winner.temporaryPoints)
			: BigInt(0);
		const newTotalPoints = currentPoints + totalWinnings;
		winner.temporaryPoints = newTotalPoints.toString();
		await winner.save({ session });

		giveaway.status["isActive"] = false;
		giveaway.status["wonBy"] = winner._id;
		await giveaway.save({ session });

		const jackpotPrize = {
			prizePoolType: jackpot.prizePoolType.toUpperCase(),
			amount: totalWinnings,
		};
		const lotteryWinnerObj = {
			session,
			eventId: giveaway.eventId,
			category: LotteryEventCategory.JACKPOT,
			winnerId: winner,
			prize: { jackpot: jackpotPrize },
		};
		await this.saveLotteryWinner(lotteryWinnerObj);

		return winner;
	} catch (err) {
		console.error("Error executing jackpot winner.", err);
		throw err;
	}
};

exports.saveLotteryWinner = async (options = {}) => {
	const { session, category, eventId, winnerId, prize = {} } = options;
	try {
		const lotteryWinner = new LotteryWinner({
			lotteryEventCategory: category,
			eventId: eventId,
			user: winnerId,
			prizeWon: prize,
		});
		await lotteryWinner.save({ session });
	} catch (err) {
		console.error("Error saving lottery winner:", err);
		throw err;
	}
};

exports.calculateOpenEntryTickets = (totalTickets) => {
	return Math.ceil(totalTickets * OPEN_ENTRY_PERCENT);
};

exports.countFreeTicketsEarned = (purchasedQty, discountCode) => {
	console.log("Calculating free tickets...");
	let freeTickets = 0;
	let highs = 0,
		moderates = 0,
		lows = 0;
	// 1/5/10 free per 5/20/50
	if (discountCode === TicketDiscount.MIN_DISCOUNT.value) {
		highs = Math.floor(purchasedQty / 50);
		purchasedQty %= 50;
		moderates = Math.floor(purchasedQty / 20);
		purchasedQty %= 20;
		lows = Math.floor(purchasedQty / 5);
		freeTickets = highs * 10 + moderates * 5 + lows * 1;
	}
	// 2/5/20 free per 5/10/25
	if (discountCode === TicketDiscount.MAX_DISCOUNT.value) {
		highs = Math.floor(purchasedQty / 25);
		purchasedQty %= 25;
		moderates = Math.floor(purchasedQty / 10);
		purchasedQty %= 10;
		lows = Math.floor(purchasedQty / 5);
		freeTickets = highs * 20 + moderates * 5 + lows * 2;
	}
	return freeTickets;
};

exports.givePointsForNewRaffle = async (session, user, raffleTypeEnum) => {
	const newRaffleActivity = {
		RESERVE: "perReserveRaffleCreated",
		UNCONDITIONAL: "perUnconditionalRaffleCreated",
		UNLIMITED: "perUnlimitedRaffleCreated",
	};
	const activityName = newRaffleActivity[raffleTypeEnum];
	await pointsEarnedByActivity(user._id, activityName, { session });
};

exports.createRaffleTransactionHistory = async (
	session,
	userId,
	options = {},
) => {
	const {
		raffle,
		eventId,
		totalTicketPrice,
		clientProfileRef = null,
	} = options;

	let amount;
	if (clientProfileRef) {
		amount = `- ${totalTicketPrice} ${raffle.coinType.toUpperCase()}`;
	} else {
		const convertedAmount = await convertToNum(
			totalTicketPrice,
			raffle.coinType,
		);
		amount = `- ${raffle.coinType.toUpperCase()} ${convertedAmount}`;
	}

	let details;
	await raffle.populate("rafflePrize").execPopulate();
	switch (raffle.lotteryTypeEnum) {
		case RaffleConstants.LOTTERY_TYPE_NFT:
			// TODO modify details
			details = `NFT Raffle: `;
			break;
		case RaffleConstants.LOTTERY_TYPE_TOKEN:
			const token = raffle.rafflePrize.tokenPrize.token;
			const amount = raffle.rafflePrize.tokenPrize.amount;
			const totalPrizeConvertedAmount = await convertToNum(amount, token);
			details = `Token Raffle: ${token.toUpperCase()} ${totalPrizeConvertedAmount}`;
			console.log("details:", details);
			break;
		case RaffleConstants.LOTTERY_TYPE_NAFFLINGS:
			// TODO modify details
			details = `NAF Raffle: `;
			break;
		default:
			details = "Unknown Raffle";
	}

	await userService.createUserHistory(session, userId, {
		eventType: "raffle",
		eventId,
		status: "live",
		amount,
		details: `${details} #${raffle.eventId}`,
	});
};

exports.createClientProfileAdminActivity = async (
	session,
	raffle,
	options = {},
) => {
	const { lotteryTypeEnum, rafflePrize } = options;
	if (lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_TOKEN) {
		const { token, amount } = rafflePrize?.tokenPrize;
		const convertedAmount = await convertToNum(amount, token);

		let details = `${token.toUpperCase()} ${convertedAmount}`;

		const activity = new ClientAdminActivityManagement({
			clientProfileRef: raffle.clientProfileRef,
			adminRef: raffle.createdBy,
			itemType: "token-raffle",
			eventId: raffle._id,
			details,
			startDate: raffle.createdAt,
			endDate: raffle.raffleEndDate,
		});
		await activity.save({ session });
	}
};

// Enhanced raffle creation with asset validation and escrow
const { validateRafflePrizeAsset, getEscrowAddress, verifyNFTEscrow } = require('./assetValidationService');
const { requestVRFRandomness, checkVRFFulfillment, getVerifiableResult } = require('./vrfService');

/**
 * Creates a new raffle with enhanced validation and escrow
 * @param {Object} raffleData - Raffle creation data
 * @param {Object} session - Database session
 * @returns {Object} Created raffle
 */
exports.createEnhancedRaffle = async (raffleData, session) => {
    try {
        const {
            rafflePrize,
            lotteryTypeEnum,
            raffleTypeEnum,
            perTicketPrice,
            ticketsAvailable,
            raffleDurationDays,
            sellerId,
            clientProfileId,
            coinType,
            reservePrice
        } = raffleData;

        // Generate unique event ID
        const eventId = await sequenceUtil.getNextSequenceValue(
            SequenceConstants.RAFFLE_EVENT_ID,
            session
        );

        // Create raffle prize first
        const newRafflePrize = new RafflePrize({
            lotteryTypeEnum,
            validationStatus: "pending"
        });

        // Set prize data based on type
        switch (lotteryTypeEnum) {
            case RaffleConstants.LOTTERY_TYPE_NFT:
                newRafflePrize.nftPrize = {
                    contractAddress: rafflePrize.contractAddress,
                    tokenId: rafflePrize.tokenId,
                    chainId: rafflePrize.chainId,
                    collection: rafflePrize.collection,
                    validated: false,
                    ownershipVerified: false
                };
                break;
            case RaffleConstants.LOTTERY_TYPE_TOKEN:
                newRafflePrize.tokenPrize = {
                    token: rafflePrize.token,
                    amount: rafflePrize.amount,
                    chainId: rafflePrize.chainId,
                    validated: false
                };
                break;
            case RaffleConstants.LOTTERY_TYPE_NAFFLINGS:
                newRafflePrize.nafflings = rafflePrize.nafflings;
                break;
        }

        // Calculate open entry tickets for non-unlimited raffles
        let ticketsAvailableOpenEntry = 0;
        if (raffleTypeEnum !== RaffleConstants.RAFFLE_TYPE_UNLIMITED) {
            ticketsAvailableOpenEntry = this.calculateOpenEntryTickets(ticketsAvailable);
        }

        // Create raffle
        const newRaffle = new Raffle({
            eventId: eventId.toString(),
            rafflePrize: newRafflePrize._id,
            lotteryTypeEnum,
            raffleTypeEnum,
            coinType,
            ticketsAvailable: raffleTypeEnum === RaffleConstants.RAFFLE_TYPE_UNLIMITED ? 0 : ticketsAvailable,
            ticketsAvailableOpenEntry,
            perTicketPrice,
            raffleDurationDays,
            createdBy: sellerId,
            clientProfileRef: clientProfileId,
            assetValidated: false,
            escrowStatus: "pending"
        });

        // Set reserve price for unlimited raffles
        if (raffleTypeEnum === RaffleConstants.RAFFLE_TYPE_UNLIMITED && reservePrice) {
            newRaffle.reservePrice = reservePrice;
        }

        // Save raffle prize with raffle reference
        newRafflePrize.raffle = newRaffle._id;
        await newRafflePrize.save({ session });
        await newRaffle.save({ session });

        return newRaffle;

    } catch (error) {
        console.error("Enhanced raffle creation error:", error);
        throw error;
    }
};

/**
 * Validates raffle assets and handles escrow
 * @param {String} raffleId - Raffle ID
 * @param {String} ownerAddress - Asset owner address
 * @returns {Object} Validation result
 */
exports.validateAndEscrowAssets = async (raffleId, ownerAddress) => {
    try {
        const raffle = await Raffle.findById(raffleId).populate('rafflePrize');
        if (!raffle) {
            throw new Error("Raffle not found");
        }

        // Validate the asset
        const validationResult = await validateRafflePrizeAsset(raffleId, ownerAddress);
        
        if (!validationResult.isValid) {
            raffle.assetValidated = false;
            raffle.escrowStatus = "failed";
            await raffle.save();
            return validationResult;
        }

        // Mark asset as validated
        raffle.assetValidated = true;
        
        // Handle escrow based on lottery type
        if (raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_NFT) {
            // For NFT raffles, require transfer to escrow wallet
            const escrowAddress = getEscrowAddress(raffle.rafflePrize.nftPrize.chainId);
            raffle.escrowStatus = "pending";
            
            // Return escrow instructions
            validationResult.escrowRequired = true;
            validationResult.escrowAddress = escrowAddress;
            validationResult.instructions = `Please transfer your NFT to the escrow address: ${escrowAddress}`;
        } else {
            // For token raffles, funds are already deducted from balance
            raffle.escrowStatus = "escrowed";
        }

        await raffle.save();
        return validationResult;

    } catch (error) {
        console.error("Asset validation and escrow error:", error);
        throw error;
    }
};

/**
 * Verifies NFT escrow completion
 * @param {String} raffleId - Raffle ID
 * @returns {Boolean} Whether escrow is complete
 */
exports.verifyEscrowCompletion = async (raffleId) => {
    try {
        const raffle = await Raffle.findById(raffleId).populate('rafflePrize');
        if (!raffle) {
            throw new Error("Raffle not found");
        }

        if (raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_NFT) {
            const isEscrowed = await verifyNFTEscrow(raffle.rafflePrize.nftPrize);
            
            if (isEscrowed) {
                raffle.escrowStatus = "escrowed";
                await raffle.save();
                return true;
            }
        }

        return false;

    } catch (error) {
        console.error("Escrow verification error:", error);
        return false;
    }
};

/**
 * Enhanced ticket purchase with validation
 * @param {String} raffleId - Raffle ID
 * @param {String} userId - User ID
 * @param {Number} quantity - Number of tickets
 * @param {Object} session - Database session
 * @returns {Object} Purchase result
 */
exports.purchaseRaffleTickets = async (raffleId, userId, quantity, session) => {
    try {
        const raffle = await Raffle.findById(raffleId);
        if (!raffle) {
            throw new Error("Raffle not found");
        }

        // Validate raffle is active and not sold out
        if (!raffle.status.isActive) {
            throw new Error("Raffle is not active");
        }

        if (raffle.isCancelled) {
            throw new Error("Raffle has been cancelled");
        }

        // Check if raffle has ended
        if (raffle.raffleEndDate && new Date() > raffle.raffleEndDate) {
            throw new Error("Raffle has ended");
        }

        // Check ticket availability for non-unlimited raffles
        if (raffle.raffleTypeEnum !== RaffleConstants.RAFFLE_TYPE_UNLIMITED) {
            if (raffle.ticketsAvailable < quantity) {
                throw new Error("Not enough tickets available");
            }
        }

        // Generate ticket numbers
        const startingTicketNumber = raffle.ticketsSold + 1;
        const ticketNumbers = [];
        
        for (let i = 0; i < quantity; i++) {
            ticketNumbers.push(startingTicketNumber + i);
        }

        // Create raffle tickets
        const tickets = [];
        for (let i = 0; i < quantity; i++) {
            const ticketId = await sequenceUtil.getNextSequenceValue(
                SequenceConstants.RAFFLE_TICKET_ID,
                session
            );
            
            const ticket = new RaffleTicket({
                purchasedBy: userId,
                raffle: raffleId,
                naffleTicketId: ticketId.toString(),
                ticketNumber: ticketNumbers[i],
                isFree: false,
                isOpenEntry: false
            });
            
            tickets.push(ticket);
        }

        // Save all tickets
        await RaffleTicket.insertMany(tickets, { session });

        // Update raffle ticket counts
        raffle.ticketsSold += quantity;
        if (raffle.raffleTypeEnum !== RaffleConstants.RAFFLE_TYPE_UNLIMITED) {
            raffle.ticketsAvailable -= quantity;
        }

        await raffle.save({ session });

        // Check if raffle is sold out (for non-unlimited raffles)
        if (raffle.raffleTypeEnum !== RaffleConstants.RAFFLE_TYPE_UNLIMITED && 
            raffle.ticketsAvailable === 0) {
            // Trigger winner selection
            await this.executeRaffleDraw(raffleId, session);
        }

        return {
            success: true,
            tickets,
            ticketNumbers,
            totalTickets: raffle.ticketsSold
        };

    } catch (error) {
        console.error("Ticket purchase error:", error);
        throw error;
    }
};

/**
 * Executes raffle draw using VRF
 * @param {String} raffleId - Raffle ID
 * @param {Object} session - Database session
 * @returns {Object} Draw result
 */
exports.executeRaffleDraw = async (raffleId, session) => {
    try {
        const raffle = await Raffle.findById(raffleId);
        if (!raffle) {
            throw new Error("Raffle not found");
        }

        // Check if draw is already in progress or completed
        if (raffle.vrf.status !== "Pending") {
            return {
                success: false,
                error: "Draw already in progress or completed"
            };
        }

        // Request VRF randomness
        const vrfResult = await requestVRFRandomness(
            raffleId, 
            raffle.ticketsSold,
            { 
                isAllowlist: raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_ALLOWLIST 
            }
        );

        if (vrfResult.success) {
            return {
                success: true,
                transactionHash: vrfResult.transactionHash,
                requestId: vrfResult.requestId
            };
        } else {
            // VRF failed, but failsafe was used
            if (vrfResult.failsafeUsed) {
                await this.processRaffleCompletion(raffleId, vrfResult.winningTicketNumber, session);
                return {
                    success: true,
                    winningTicketNumber: vrfResult.winningTicketNumber,
                    failsafeUsed: true
                };
            }
            
            throw new Error(vrfResult.error || "Failed to execute raffle draw");
        }

    } catch (error) {
        console.error("Raffle draw execution error:", error);
        throw error;
    }
};

/**
 * Processes raffle completion after winner selection
 * @param {String} raffleId - Raffle ID
 * @param {Number} winningTicketNumber - Winning ticket number
 * @param {Object} session - Database session
 * @returns {Object} Completion result
 */
exports.processRaffleCompletion = async (raffleId, winningTicketNumber, session) => {
    try {
        const raffle = await Raffle.findById(raffleId).populate('rafflePrize');
        if (!raffle) {
            throw new Error("Raffle not found");
        }

        // Find winning ticket
        const winningTicket = await RaffleTicket.findOne({
            raffle: raffleId,
            ticketNumber: winningTicketNumber
        });

        if (!winningTicket) {
            throw new Error("Winning ticket not found");
        }

        // Update raffle status
        raffle.status.wonBy = winningTicket.purchasedBy;
        raffle.status.isActive = false;
        raffle.status.isCompleted = true;
        raffle.status.completedAt = new Date();
        raffle.vrf.status = "Completed";

        await raffle.save({ session });

        // Create raffle winner record
        const raffleWinner = new RaffleWinner({
            raffle: raffleId,
            winner: winningTicket.purchasedBy,
            winningTicketNumber,
            prizeType: raffle.lotteryTypeEnum,
            winningDate: new Date()
        });

        await raffleWinner.save({ session });

        // Handle prize distribution based on type
        await this.distributePrize(raffle, winningTicket.purchasedBy, session);

        // Handle creator earnings
        await this.processCreatorEarnings(raffle, session);

        return {
            success: true,
            winner: winningTicket.purchasedBy,
            winningTicketNumber,
            prizeType: raffle.lotteryTypeEnum
        };

    } catch (error) {
        console.error("Raffle completion processing error:", error);
        throw error;
    }
};

/**
 * Distributes prize to winner
 * @param {Object} raffle - Raffle object
 * @param {String} winnerId - Winner user ID
 * @param {Object} session - Database session
 */
exports.distributePrize = async (raffle, winnerId, session) => {
    try {
        switch (raffle.lotteryTypeEnum) {
            case RaffleConstants.LOTTERY_TYPE_NFT:
                // NFT prizes require manual claim process
                // Update escrow status to indicate ready for claim
                raffle.escrowStatus = "ready_for_claim";
                await raffle.save({ session });
                break;
                
            case RaffleConstants.LOTTERY_TYPE_TOKEN:
                // Credit token balance to winner
                const tokenPrize = raffle.rafflePrize.tokenPrize;
                const winnerBalance = await WalletBalance.findOne({ userRef: winnerId });
                
                if (winnerBalance) {
                    const currentBalance = BigInt(winnerBalance.balances.get(tokenPrize.token) || "0");
                    const newBalance = currentBalance + BigInt(tokenPrize.amount);
                    winnerBalance.balances.set(tokenPrize.token, newBalance.toString());
                    await winnerBalance.save({ session });
                }
                break;
                
            case RaffleConstants.LOTTERY_TYPE_NAFFLINGS:
                // Credit Nafflings to winner
                const winner = await User.findById(winnerId);
                if (winner) {
                    const currentPoints = BigInt(winner.temporaryPoints || "0");
                    const prizePoints = BigInt(raffle.rafflePrize.nafflings);
                    winner.temporaryPoints = (currentPoints + prizePoints).toString();
                    await winner.save({ session });
                }
                break;
        }
    } catch (error) {
        console.error("Prize distribution error:", error);
        throw error;
    }
};

/**
 * Processes creator earnings from raffle
 * @param {Object} raffle - Raffle object
 * @param {Object} session - Database session
 */
exports.processCreatorEarnings = async (raffle, session) => {
    try {
        // Calculate total revenue
        const totalRevenue = BigInt(raffle.perTicketPrice) * BigInt(raffle.ticketsSold);
        
        // Get platform fee percentage from admin settings
        const adminSettings = await AdminSettings.findOne({});
        const feePercentage = adminSettings?.raffleFeePercentage || 5; // Default 5%
        
        // Calculate platform fee and creator earnings
        const platformFee = (totalRevenue * BigInt(feePercentage)) / BigInt(100);
        const creatorEarnings = totalRevenue - platformFee;
        
        // Credit earnings to creator based on coin type
        if (raffle.coinType === "nafflings") {
            const creator = await User.findById(raffle.createdBy);
            if (creator) {
                const currentPoints = BigInt(creator.temporaryPoints || "0");
                creator.temporaryPoints = (currentPoints + creatorEarnings).toString();
                await creator.save({ session });
            }
        } else {
            // Credit token earnings to creator
            const creatorBalance = await WalletBalance.findOne({ userRef: raffle.createdBy });
            if (creatorBalance) {
                const currentBalance = BigInt(creatorBalance.balances.get(raffle.coinType) || "0");
                const newBalance = currentBalance + creatorEarnings;
                creatorBalance.balances.set(raffle.coinType, newBalance.toString());
                await creatorBalance.save({ session });
            }
        }
        
    } catch (error) {
        console.error("Creator earnings processing error:", error);
        throw error;
    }
};

/**
 * Cancels raffle and processes refunds
 * @param {String} raffleId - Raffle ID
 * @param {String} cancelledBy - User ID who cancelled
 * @param {Object} session - Database session
 * @returns {Object} Cancellation result
 */
exports.cancelRaffleAndRefund = async (raffleId, cancelledBy, session) => {
    try {
        const raffle = await Raffle.findById(raffleId).populate('rafflePrize');
        if (!raffle) {
            throw new Error("Raffle not found");
        }

        // Check if raffle can be cancelled
        if (raffle.isCancelled) {
            throw new Error("Raffle is already cancelled");
        }

        if (raffle.status.isCompleted) {
            throw new Error("Cannot cancel completed raffle");
        }

        if (raffle.vrf.status === "Completed") {
            throw new Error("Cannot cancel raffle with completed draw");
        }

        // Mark raffle as cancelled
        raffle.isCancelled = true;
        raffle.cancelledBy = cancelledBy;
        raffle.cancelledAt = new Date();
        raffle.status.isActive = false;
        await raffle.save({ session });

        // Process refunds for all ticket purchases
        const tickets = await RaffleTicket.find({ raffle: raffleId });
        const refundSummary = {};

        for (const ticket of tickets) {
            if (!ticket.isFree) {
                // Group refunds by user
                if (!refundSummary[ticket.purchasedBy]) {
                    refundSummary[ticket.purchasedBy] = {
                        userId: ticket.purchasedBy,
                        ticketCount: 0,
                        refundAmount: BigInt(0)
                    };
                }
                
                refundSummary[ticket.purchasedBy].ticketCount++;
                refundSummary[ticket.purchasedBy].refundAmount += BigInt(raffle.perTicketPrice);
            }
        }

        // Process refunds
        for (const userId in refundSummary) {
            const refund = refundSummary[userId];
            
            if (raffle.coinType === "nafflings") {
                // Refund Nafflings
                const user = await User.findById(userId);
                if (user) {
                    const currentPoints = BigInt(user.temporaryPoints || "0");
                    user.temporaryPoints = (currentPoints + refund.refundAmount).toString();
                    await user.save({ session });
                }
            } else {
                // Refund tokens
                const userBalance = await WalletBalance.findOne({ userRef: userId });
                if (userBalance) {
                    const currentBalance = BigInt(userBalance.balances.get(raffle.coinType) || "0");
                    const newBalance = currentBalance + refund.refundAmount;
                    userBalance.balances.set(raffle.coinType, newBalance.toString());
                    await userBalance.save({ session });
                }
            }
        }

        // Return escrowed assets
        if (raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_NFT) {
            raffle.escrowStatus = "returned";
            await raffle.save({ session });
        } else if (raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_TOKEN) {
            // Return tokens to creator
            const creatorBalance = await WalletBalance.findOne({ userRef: raffle.createdBy });
            if (creatorBalance) {
                const tokenPrize = raffle.rafflePrize.tokenPrize;
                const currentBalance = BigInt(creatorBalance.balances.get(tokenPrize.token) || "0");
                const newBalance = currentBalance + BigInt(tokenPrize.amount);
                creatorBalance.balances.set(tokenPrize.token, newBalance.toString());
                await creatorBalance.save({ session });
            }
        }

        raffle.refundProcessed = true;
        await raffle.save({ session });

        return {
            success: true,
            refundedUsers: Object.keys(refundSummary).length,
            totalRefundAmount: Object.values(refundSummary).reduce(
                (sum, refund) => sum + refund.refundAmount, 
                BigInt(0)
            ).toString()
        };

    } catch (error) {
        console.error("Raffle cancellation and refund error:", error);
        throw error;
    }
};

/**
 * Claims NFT prize for winner
 * @param {String} raffleId - Raffle ID
 * @param {String} claimantId - User ID claiming prize
 * @returns {Object} Claim result
 */
exports.claimNFTPrize = async (raffleId, claimantId) => {
    try {
        const raffle = await Raffle.findById(raffleId).populate('rafflePrize');
        if (!raffle) {
            throw new Error("Raffle not found");
        }

        // Verify claimant is the winner
        if (raffle.status.wonBy.toString() !== claimantId) {
            throw new Error("Only the winner can claim the prize");
        }

        // Check if NFT raffle
        if (raffle.lotteryTypeEnum !== RaffleConstants.LOTTERY_TYPE_NFT) {
            throw new Error("Prize claiming is only for NFT raffles");
        }

        // Check if prize is ready for claim
        if (raffle.escrowStatus !== "ready_for_claim") {
            throw new Error("Prize is not ready for claim");
        }

        // Update escrow status to indicate claim initiated
        raffle.escrowStatus = "claim_initiated";
        await raffle.save();

        // Return claim instructions (manual process for admin)
        return {
            success: true,
            message: "NFT claim initiated. Admin approval required for transfer.",
            nftDetails: raffle.rafflePrize.nftPrize,
            claimStatus: "pending_admin_approval"
        };

    } catch (error) {
        console.error("NFT prize claim error:", error);
        throw error;
    }
};