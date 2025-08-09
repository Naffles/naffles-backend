const sendResponse = require("../utils/responseHandler");
const Jackpot = require("../models/jackpot/jackpot");
const JackpotHistory = require("../models/jackpot/jackpotHistory");
const {
	AdminSettings,
	PointsEarningActivitiesSettings,
} = require("../models/admin/adminSettings");
const {
	calculateAndUpdateJackpot,
	getPointsAccumulated,
	updateJackpot,
} = require("../services/jackpotAccumulation");
const Raffle = require("../models/raffle/raffle");
const { validatePrizePoolType } = require("../utils/validatePrizePoolType");
const { getUserProfileImage } = require("../utils/image");
const Giveaway = require("../models/raffle/giveaway");
const raffleService = require("../services/raffleService");
const RafflePrize = require("../models/raffle/rafflePrize");
const {
	NEW_RAFFLE_CREATED,
} = require("../utils/constants/JackpotAccumulationConstants");
const LotteryWinner = require("../models/raffle/lotteryWinner");
const mongoose = require("mongoose");
const RaffleTicket = require("../models/raffle/raffleTicket");
const raffleDropdownConfigs = require("../config/raffleDropdownConfigs");
const sequenceUtil = require("../utils/sequenceUtil");
const TicketSale = require("../models/raffle/ticketSale");
const WalletBalance = require("../models/user/walletBalance");
const RaffleWinner = require("../models/raffle/raffleWinner");
const RaffleConstants = require("../utils/constants/RaffleConstants");
const SequenceConstants = require("../utils/constants/SequenceConstants");
const LotteryEventCategory = require("../utils/enums/lotteryEventCategory");
const User = require("../models/user/user");
const TicketNumberCounter = require("../models/utils/ticketNumberCounter");
const {
	AllowableTokenContractsForLotteries,
} = require("../models/admin/fileUploadSettings/uploadableContent");
const WalletAddress = require("../models/user/walletAddress");
const Allowlist = require("../models/client/allowlist/allowlist");
const { generateSignedUrl } = require("../middleware/helpers");

exports.getDropdownOptions = async (req, res) => {
	return sendResponse(
		res,
		200,
		"Successfully fetched dropdown options!",
		raffleDropdownConfigs,
	);
};

exports.createNewRaffle = async (req, res) => {
	const {
		rafflePrize,
		lotteryTypeEnum,
		raffleTypeEnum,
		perTicketPrice,
		ticketsAvailable,
		discountCode,
		raffleDurationDays,
		clientProfileId,
		coinType,
	} = req.body;
	let newRafflePrize = new RafflePrize();
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// Input validation for ticketsAvailable
		if (
			lotteryTypeEnum !== "ALLOWLIST" &&
			raffleTypeEnum !== "UNLIMITED" &&
			(!Number.isInteger(ticketsAvailable) || ticketsAvailable <= 0)
		) {
			await session.abortTransaction();
			return sendResponse(res, 400, "Number of tickets invalid.");
		}
		// Fetch rafflePrize
		// TODO validate rafflePrize based on lotteryTypeEnum
		newRafflePrize.lotteryTypeEnum = lotteryTypeEnum;
		if (lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_NFT)
			newRafflePrize.nftPrize = rafflePrize;
		if (lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_TOKEN)
			newRafflePrize.tokenPrize = rafflePrize;
		if (lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_NAFFLINGS)
			newRafflePrize.nafflings = rafflePrize.nafflings;

		let newRaffle = {};
		if (lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_ALLOWLIST) {
			newRaffle = await raffleService.createAllowlistRaffle(
				session,
				req.user,
				req.body,
			);
		} else {
			let ticketsAvailableOpenEntry = 0;
			if (raffleTypeEnum !== RaffleConstants.RAFFLE_TYPE_UNLIMITED)
				ticketsAvailableOpenEntry =
					raffleService.calculateOpenEntryTickets(ticketsAvailable);

			newRaffle = await raffleService.createNewRaffle(newRafflePrize._id, {
				session,
				lotteryTypeEnum,
				raffleTypeEnum,
				coinType,
				ticketsAvailable,
				ticketsAvailableOpenEntry,
				perTicketPrice,
				discountCode,
				raffleDurationDays,
				sellerId: req.user._id,
				clientProfileId,
			});

			newRafflePrize.raffle = newRaffle._id;
			await newRafflePrize.save({ session });

			// Deduct raffle prize from wallet balance (if token raffle)
			if (lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_TOKEN) {
				const { walletBalances } = req;
				const userCurrentBalance = BigInt(
					walletBalances?.balances?.get(rafflePrize.token),
				);
				const userTotalBalance =
					userCurrentBalance - BigInt(rafflePrize.amount);
				walletBalances.balances.set(
					rafflePrize.token,
					userTotalBalance.toString(),
				);
				await walletBalances.save({ session });
			}
			// Deduct points from seller (if nafflings raffle)
			if (lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_NAFFLINGS) {
				const { user } = req;
				const currentPoints = BigInt(user.temporaryPoints);
				const updatedBalance = currentPoints - BigInt(rafflePrize.nafflings);
				user.temporaryPoints = updatedBalance.toString();
				await user.save({ session });
			}
		}
		// Accumulate Jackpot based on newRaffleCreated
		await updateJackpot(NEW_RAFFLE_CREATED);

		// Give out points earned thru activity (EXCLUDE ALLOWLIST FOR NOW)
		// (perReserveRaffleCreated, perUnconditionalRaffleCreated, perUnlimitedRaffleCreated)
		if (lotteryTypeEnum !== RaffleConstants.LOTTERY_TYPE_ALLOWLIST) {
			await raffleService.givePointsForNewRaffle(
				session,
				req.user,
				raffleTypeEnum,
			);
		}

		// Create ClientProfileAdminActivity (if CommunityRaffle)
		if (
			lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_TOKEN &&
			clientProfileId
		) {
			await raffleService.createClientProfileAdminActivity(session, newRaffle, {
				lotteryTypeEnum,
				rafflePrize: newRafflePrize,
			});
		}

		await session.commitTransaction();
		return sendResponse(res, 201, "Raffle created successfully!", newRaffle);
	} catch (error) {
		await session.abortTransaction();
		console.log("Something went wrong:", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	} finally {
		session.endSession();
	}
};

exports.getRaffles = async (req, res) => {
	const {
		cursor,
		isActive,
		lotteryTypes,
		raffleTypes,
		coinType,
		sortField = "createdAt",
		sortOrder = "desc",
		personal,
		hasOpenEntry,
		clientProfileId,
	} = req.query;
	const limit = Math.min(parseInt(req.query.limit || "20", 10), 40); // Enforce max limit of 20
	try {
		var createdBy;

		const personalBool = personal === "true";
		if (personalBool && req.user._id) {
			createdBy = req.user._id;
		}

		const isActiveBool = isActive || isActive === "true";
		const currentUtcTime = new Date().toISOString();
		// Build query
		const query = {
			...(cursor && { _id: { $gt: mongoose.Types.ObjectId(cursor) } }),
			...(isActive && { "status.isActive": isActiveBool }),
			...(lotteryTypes && { lotteryTypeEnum: { $in: lotteryTypes } }),
			...(raffleTypes && { raffleTypeEnum: { $in: raffleTypes } }),
			...(coinType && { coinType: coinType.toLowerCase() }),
			...(personal && { createdBy: mongoose.Types.ObjectId(createdBy) }),
			...(hasOpenEntry && { ticketsAvailableOpenEntry: { $gt: 0 } }),
			...(clientProfileId && {
				clientProfileRef: mongoose.Types.ObjectId(clientProfileId),
			}),
		};
		if (isActive) {
			query.raffleEndDate = { $gt: currentUtcTime };
		}
		// Build sort
		const sort = {};
		if (sortField) {
			sort[sortField] = sortOrder.toLowerCase() === "asc" ? 1 : -1;
		} else {
			sort._id = 1; // Default sorting by _id in ascending order
		}

		// Fetch raffles
		let raffles = await Raffle.find(query)
			.populate("rafflePrize")
			.populate({
				path: "clientProfileRef",
				select: "_id icon",
			})
			.sort(sort)
			.limit(limit + 1)
			.lean();

		const hasNextPage = raffles.length > limit;
		if (hasNextPage) {
			raffles.pop(); // Remove the extra document from the results
		}

		raffles = await Promise.all(
			raffles.map(async (raffle) => {
				if (raffle.clientProfileRef) {
					const clientProfile = raffle.clientProfileRef;
					if (clientProfile.icon) {
						raffle.clientProfileRef.iconUrl = await generateSignedUrl(
							clientProfile.icon,
						);
					}
				}

				return raffle;
			}),
		);

		const nextCursor = hasNextPage ? raffles[raffles.length - 1]._id : null;
		const responseData = { raffles, nextCursor };

		return sendResponse(res, 200, "Successfully fetched raffles", responseData);
	} catch (error) {
		console.log("ERROR: ", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	}
};

exports.getAllowlistRaffles = async (req, res) => {
	const { cursor } = req.query;
	const limit = Math.min(parseInt(req.query.limit || "20", 10), 40);
	try {
		// TODO query and sorting
		const query = {
			...(cursor && { _id: { $gt: mongoose.Types.ObjectId(cursor) } }),
		};

		const allowlistRaffles = await Allowlist.find(query)
			.sort()
			.limit(limit + 1)
			.lean();

		const hasNextPage = allowlistRaffles.length > limit;
		if (hasNextPage) {
			allowlistRaffles.pop(); // Remove the extra document from the results
		}

		const nextCursor = hasNextPage
			? allowlistRaffles[allowlistRaffles.length - 1]._id
			: null;
		const responseData = { allowlistRaffles, nextCursor };
		return sendResponse(res, 200, "Successfully fetched raffles", responseData);
	} catch (error) {
		console.error("ERROR:", error);
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	}
};

exports.getNewRaffleSummary = async (req, res) => {
	const { perTicketPrice, numberOfTickets, token, prizeValue } = req.query;
	try {
		// Fetch fee % for raffles from admin settings
		const { raffleFeePercentage } = await AdminSettings.findOne({})
			.select("raffleFeePercentage -_id")
			.lean();
		const grossEarnings = perTicketPrice * numberOfTickets;
		const potentialEarnings =
			grossEarnings - grossEarnings * raffleFeePercentage;
		const responseData = {
			token,
			prizeValue,
			serviceFee: raffleFeePercentage,
			potentialEarnings,
		};
		return sendResponse(
			res,
			200,
			"Successfully calculated summary!",
			responseData,
		);
	} catch (err) {
		console.error("Error getting summary:", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	}
};

exports.getRaffleDetails = async (req, res) => {
	const { raffleId } = req.params;
	try {
		// Populate rafflePrize and status.wonBy
		let raffleDetails = await Raffle.findById(raffleId)
			.populate("rafflePrize")
			.populate({ path: "winner", select: "username" })
			.populate({ path: "clientProfileRef", select: "_id icon" });
		if (!raffleDetails) {
			return sendResponse(res, 404, "Raffle not found.");
		}

		// Convert to plain JavaScript object
		raffleDetails = raffleDetails.toObject();

		if (raffleDetails.clientProfileRef) {
			const clientProfile = raffleDetails.clientProfileRef;
			if (clientProfile.icon) {
				raffleDetails.clientProfileRef.iconUrl = await generateSignedUrl(
					clientProfile.icon,
				);
			}
		}

		const { lotteryTypeEnum } = raffleDetails;
		if (lotteryTypeEnum !== RaffleConstants.LOTTERY_TYPE_ALLOWLIST) {
			// Store the username from the populated status.wonBy
			const winnerUsername = raffleDetails.status.wonBy?.username;

			// Unpopulate status.wonBy by setting it to the ObjectId again
			raffleDetails.status.wonBy = raffleDetails.status.wonBy?._id;

			const coinType = raffleDetails?.coinType;
			if (coinType && raffleDetails.status.wonBy) {
				const token = await AllowableTokenContractsForLotteries.findOne({
					ticker: coinType.toLowerCase(),
				});
				if (token) {
					const tokenType = token.tokenType;
					let walletType;
					if (tokenType === "sol" || tokenType === "spl") {
						walletType = "phantom";
					} else if (tokenType === "erc20" || tokenType === "evm-native") {
						walletType = "metamask";
					}

					if (walletType) {
						const winnerAddress = await WalletAddress.findOne({
							userRef: raffleDetails.status.wonBy,
							walletType: walletType,
						}).select("address");
						raffleDetails.status.winnerAddress = winnerAddress
							? `address-${winnerAddress.address}`
							: `username-${winnerUsername}`;
					}
				}
			}
		} else {
			const allowlistRaffleDetails = {};
		}

		return sendResponse(
			res,
			200,
			"Successfully fetched raffle details!",
			raffleDetails,
		);
	} catch (err) {
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	}
};

exports.getTicketSalesHistory = async (req, res) => {
	const { raffleId } = req.params;
	const { max = 4 } = req.query;
	try {
		const ticketSaleHistories = await TicketSale.find({ raffle: raffleId })
			.populate({
				path: "raffleTickets",
				select: "naffleTicketId isFree purchasedBy",
				populate: {
					path: "purchasedBy",
					select: "username",
				},
			})
			.sort({ createdAt: -1 })
			.limit(max)
			.exec();
		const responseData = ticketSaleHistories.map((ticketSale) => {
			const username = ticketSale.raffleTickets[0]?.purchasedBy?.username;
			const quantity = ticketSale.raffleTickets.length;
			const ticketsBought = ticketSale.raffleTickets.map(
				(ticket) => ticket.naffleTicketId,
			);
			const isFree = ticketSale.raffleTickets[0]?.isFree;
			const datePurchased = ticketSale.createdAt;

			return {
				username,
				quantity,
				ticketsBought,
				isFree,
				datePurchased,
			};
		});

		return sendResponse(
			res,
			200,
			"Successfully fetch ticket sales history!",
			responseData,
		);
	} catch (err) {
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	}
};

exports.buyRaffleTickets = async (req, res) => {
	const {
		userId,
		// TODO implement buy open entry tickets
		isOpenEntry = false,
		quantity = 1,
	} = req.body;
	const { raffle, totalTicketPrice } = req;
	if (!quantity) {
		return sendResponse(
			res,
			400,
			"Invalid request: Quantity must be greater than zero.",
		);
	}
	if (raffle.vrf.status !== "Pending") {
		return sendResponse(res, 500, "Raffle not active, unable to buy more.");
	}
	const buyerId = userId || req.user._id;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// Deduct ticket price from wallet balance (if token raffle)
		const clientProfileRef = raffle.clientProfileRef;
		if (raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_TOKEN) {
			// Check if community raffle
			const coinType = raffle.coinType.toLowerCase().trim();
			if (clientProfileRef && coinType !== "nafflings") {
				const { memberProfile } = req;
				memberProfile.points.used += Number(totalTicketPrice);
				await memberProfile.save({ session });
			} else if (coinType === "nafflings") {
				const currentUser = req.user;
				const currentNafflingsBalance = BigInt(currentUser.temporaryPoints);
				const updatedBalance = currentNafflingsBalance - totalTicketPrice;
				currentUser.temporaryPoints = updatedBalance.toString();
				await currentUser.save({ session });
			} else {
				const { walletBalances } = req;
				const userCurrentBalance = BigInt(
					walletBalances?.balances?.get(raffle.coinType.toLowerCase()),
				);
				const userTotalBalance = userCurrentBalance - totalTicketPrice;
				walletBalances.balances.set(
					raffle.coinType.toLowerCase(),
					userTotalBalance.toString(),
				);
				await walletBalances.save({ session });
			}
		}
		// Deduct points from naffling balance (if nafflings raffle)
		if (raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_NAFFLINGS) {
			const { user } = req;
			const currentPoints = BigInt(user.temporaryPoints);
			const updatedBalance = currentPoints - totalTicketPrice;
			user.temporaryPoints = updatedBalance.toString();
			await user.save({ session });
		}
		// Deduct wallet balance based on allowlist price
		// TODO move this condition, ALLOWLIST now have its own route
		if (raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_ALLOWLIST) {
			// TODO create separate function to check for the requirements:
			// - Submit verified email address
			// - submit wallet address
			// - Socials

			// TODO additional check if allowlist is free or presale
			// - if free, no need to deduct from wallet
			const allowlistRaffle = raffle.allowlistRaffle;
			const token = allowlistRaffle.presaleRequirePayment?.token;
			const { walletBalances } = req;
			const userCurrentBalance = BigInt(
				walletBalances?.balances?.get(token.toLowerCase()),
			);
			const userTotalBalance = userCurrentBalance - totalTicketPrice;
			walletBalances.balances.set(
				token.toLowerCase(),
				userTotalBalance.toString(),
			);
			await walletBalances.save({ session });
		}

		const createdTickets = await Promise.all(
			Array.from({ length: quantity }, async () => {
				const naffleTicketId = await sequenceUtil.generateId(session, {
					prefix: SequenceConstants.NAFFLE_TICKET_PREFIX,
					name: SequenceConstants.NAFFLE_TICKET_ID,
					max: 999999,
				});
				// Atomically increment the ticket number
				const counter = await TicketNumberCounter.findOneAndUpdate(
					{ raffle: raffle._id, eventType: "raffle" },
					{ $inc: { ticketNumber: 1 } },
					{ new: true, upsert: true, session },
				);

				return {
					purchasedBy: buyerId,
					raffle: raffle._id,
					naffleTicketId,
					ticketNumber: counter.ticketNumber,
				};
			}),
		);
		const purchasedTickets = await RaffleTicket.insertMany(createdTickets, {
			session,
		});

		// Check if raffle is not UNLIMITED and deduct availableTickets
		// Also update tickets sold for all raffles
		const purchasedQty = purchasedTickets.length;
		if (raffle.raffleTypeEnum !== "UNLIMITED") {
			let currentAvailableTickets = raffle.ticketsAvailable;
			currentAvailableTickets -= purchasedQty;
			raffle.ticketsAvailable = currentAvailableTickets;
		}
		raffle.ticketsSold += purchasedQty;
		await raffle.save({ session });

		// Add to ticket sale history
		const ticketSales = new TicketSale({
			raffle: raffle._id,
			raffleTickets: purchasedTickets.map((ticket) => ticket._id),
			total: totalTicketPrice.toString(),
			buyerRef: buyerId,
		});
		await ticketSales.save({ session });

		// Once all tickets are created, append to user history transaction
		await raffleService.createRaffleTransactionHistory(session, buyerId, {
			raffle,
			eventId: ticketSales._id,
			totalTicketPrice,
			clientProfileRef,
		});

		// Count free tickets (for UNLIMITED raffles) and create
		const discountCode = raffle.discountCode || 0;
		let purchasedFreeTickets = [];
		if (discountCode > 0 && quantity > 4) {
			const freeTicketsEarned = raffleService.countFreeTicketsEarned(
				quantity,
				discountCode,
			);
			console.log("Free tickets earned:", freeTicketsEarned);

			if (freeTicketsEarned > 0) {
				const createdFreeTickets = await Promise.all(
					Array.from({ length: freeTicketsEarned }, async () => {
						const naffleTicketId = await sequenceUtil.generateId(session, {
							prefix: SequenceConstants.NAFFLE_TICKET_PREFIX,
							name: SequenceConstants.NAFFLE_TICKET_ID,
							max: 999999,
						});
						// Atomically increment the ticket number
						const counter = await TicketNumberCounter.findOneAndUpdate(
							{ raffle: raffle._id, eventType: "raffle" },
							{ $inc: { ticketNumber: 1 } },
							{ new: true, upsert: true, session },
						);
						return {
							purchasedBy: buyerId,
							raffle: raffle._id,
							naffleTicketId,
							isFree: true,
							ticketNumber: counter.ticketNumber,
						};
					}),
				);
				purchasedFreeTickets = await RaffleTicket.insertMany(
					createdFreeTickets,
					{ session },
				);

				// Save free ticket sales
				const freeTicketSales = new TicketSale({
					raffle: raffle._id,
					raffleTickets: purchasedFreeTickets.map((ticket) => ticket._id),
					saleType: "free",
					buyerRef: buyerId,
				});
				await freeTicketSales.save({ session });
			}
		}

		const responseData = {
			purchasedTicketsCount: purchasedQty,
			freeTicketsCount: purchasedFreeTickets.length,
			total: purchasedQty + purchasedFreeTickets.length,
			purchasedTickets,
			freeTickets: purchasedFreeTickets,
		};

		await session.commitTransaction();
		return sendResponse(
			res,
			201,
			"Successfully bought raffle tickets!",
			responseData,
		);
	} catch (err) {
		await session.abortTransaction();
		console.log("Error buying raffle ticket:", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	} finally {
		// End session
		session.endSession();
	}
};

exports.drawRaffleWinner = async (req, res) => {
	const { raffle } = req;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		await raffleService.drawRaffleWinner(raffle, {
			sellerId: raffle.createdBy,
			session,
		});
		await session.commitTransaction();
		return sendResponse(res, 200, "Successfully requested for raffle draw!");
		// wait for vrf response
	} catch (err) {
		await session.abortTransaction();
		console.log("Error drawing raffle winner:", err);
		return sendResponse(res, 500, err.message);
	} finally {
		session.endSession();
	}
};

// WIP
exports.claimRafflePrize = async (req, res) => {
	const { raffle, isAdminOrSuper } = req;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// Give out raffle prize to winner
		if (raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_TOKEN) {
			// Find wallet balance of winner
			const raffleWinnerEntry = await RaffleWinner.findOne({
				raffle: raffle._id,
			});
			const winnerWalletBalance = await WalletBalance.findOne({
				userRef: raffleWinnerEntry.user,
			});
			const winnerCurrentBalance = BigInt(
				winnerWalletBalance?.balances?.get(raffle.coinType.toLowerCase()) || 0,
			);

			// Add raffle prize to winner wallet balance ()
			const { tokenPrize: rafflePrize } = await RafflePrize.findById(
				raffle.rafflePrize,
			).select("tokenPrize -_id");
			console.log("rafflePrize:", rafflePrize);
			const winnerTotalBalance =
				winnerCurrentBalance + BigInt(rafflePrize.amount);
			winnerWalletBalance.balances.set(
				raffle.coinType.toLowerCase(),
				winnerTotalBalance.toString(),
			);
			// await winnerWalletBalance.save({ session });
			raffleWinnerEntry.isClaimed = true;
			// await raffleWinnerEntry.save({ session })
		}

		console.log(
			"LotteryEventCategory.values(): ",
			LotteryEventCategory.values(),
		);
		console.log("LotteryEventCategory.JACKPOT:", LotteryEventCategory.JACKPOT);
		console.log(
			"LotteryEventCategory.NFT_RAFFLE:",
			LotteryEventCategory.NFT_RAFFLE,
		);
		console.log(
			"LotteryEventCategory.CRYPTO_RAFFLE:",
			LotteryEventCategory.CRYPTO_RAFFLE,
		);
		console.log(
			"LotteryEventCategory.NAFFLINGS_RAFFLE:",
			LotteryEventCategory.NAFFLINGS_RAFFLE,
		);

		// Distribute earnings to seller
		const raffleTickets = await RaffleTicket.find({});

		await session.commitTransaction();
		return sendResponse(res, 200, "Success!");
	} catch (err) {
		await session.abortTransaction();
		console.log("Error claiming raffle prize:", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	} finally {
		session.endSession();
	}
};

exports.cancelAndRefundRaffle = async (req, res) => {
	const { raffle } = req;
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		// Return all ticket purchases
		if (raffle.lotteryTypeEnum !== RaffleConstants.LOTTERY_TYPE_NAFFLINGS) {
			const groupedPurchasedRaffleTickets =
				await raffleService.fetchAggregatedRaffleTickets(raffle._id, {
					isFree: false,
				});
			const { aggregatedTickets } = groupedPurchasedRaffleTickets;

			// Fetch all user wallet balances;
			const buyerUserIds = aggregatedTickets.map((agg) => agg._id);
			const buyerWalletBalances = await WalletBalance.find({
				userRef: { $in: buyerUserIds },
			});

			await Promise.all(
				buyerWalletBalances.map(async (walletBalance) => {
					const currentBalance = BigInt(
						walletBalance?.balances?.get(raffle.coinType.toLowerCase()) || 0,
					);
					// Calculate total purchased amount
					const { numberOfTickets } = aggregatedTickets.find((agg) =>
						agg._id.equals(walletBalance.userRef),
					);
					const totalPurchasedAmount = BigInt(
						raffle.perTicketPrice * numberOfTickets,
					);
					const totalBalance = currentBalance + totalPurchasedAmount;
					walletBalance.balances.set(
						raffle.coinType.toLowerCase(),
						totalBalance.toString(),
					);
					await walletBalance.save({ session });
				}),
			);

			// Return raffle prize to seller (if Token raffle)
			if (raffle.lotteryTypeEnum === RaffleConstants.LOTTERY_TYPE_TOKEN) {
				const { rafflePrize } = await raffle
					.populate("rafflePrize")
					.execPopulate();
				const sellerWalletBalance = await WalletBalance.findOne({
					userRef: req.user._id,
				});
				const currentBalance = BigInt(
					sellerWalletBalance?.balances?.get(raffle.coinType.toLowerCase()) ||
						0,
				);
				const totalBalance =
					currentBalance + BigInt(rafflePrize.tokenPrize.amount);
				sellerWalletBalance.balances.set(
					raffle.coinType.toLowerCase(),
					totalBalance.toString(),
				);
				await sellerWalletBalance.save({ session });
			} else {
				// For NFT raffle
				// TODO logic here
			}
		} else {
			// TODO nafflings raffle to be added
			/* LOGIC HERE */
		}
		raffle.isCancelled = true;
		raffle.cancelledBy = req.user._id;
		raffle.status["isActive"] = false;
		await raffle.save({ session });

		await session.commitTransaction();
		return sendResponse(
			res,
			200,
			"Raffle has been successfully cancelled and refunded!",
			raffle,
		);
	} catch (err) {
		await session.abortTransaction();
		console.log("Error cancel/refund raffle:", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	} finally {
		session.endSession();
	}
};

exports.getTotalJackpot = async (req, res) => {
	const { prizePoolType } = req.params;
	const { isGiveaway, calculated } = req.query;
	try {
		const isValid = await validatePrizePoolType(prizePoolType);
		if (!isValid) {
			return sendResponse(res, 400, "Token Type not Found.", {
				error: "Incorrect prizePoolType.",
			});
		}

		let jackpot = await Jackpot.findOne({ prizePoolType, isGiveaway });

		if (!jackpot) {
			return sendResponse(res, 404, `Jackpot not found.`);
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

		// TODO add jackpot to winner and log to jackpotHistory

		return sendResponse(
			res,
			200,
			`Congratulations! You won the jackpot prize of ${jackpotPrizeTotal}!`,
		);
	} catch (error) {
		console.error("Error occured:", error);
	}
};

exports.getJackpotHistory = async (req, res) => {
	const { query, page = 1 } = req.query;
	const limit = parseInt(req.query.limit || "10", 10);
	const skip = (page - 1) * limit;

	try {
		const jackpotHistories = await JackpotHistory.find()
			.sort({ _id: -1 }) // Sort by latest
			.skip(skip)
			.limit(limit)
			.populate("user")
			.populate("walletAddress");

		const mappedJackpotHistories = await Promise.all(
			jackpotHistories.map(async (history) => {
				const user = history.user;
				const wallet = history.walletAddress;

				return {
					id: user._id.toString(),
					userProfileImage: await getUserProfileImage(user.profileImage),
					walletAddress: wallet.address,
					wonAmount: history.wonAmount,
					tokenType: history.tokenType.toLowerCase(),
					isGiveaway: history.isGiveaway,
				};
			}),
		);

		const totalLogs = await JackpotHistory.countDocuments();

		return sendResponse(res, 200, "success", {
			jackpotHistory: mappedJackpotHistories,
			totalPages: Math.ceil(totalLogs / limit),
			currentPage: parseInt(page),
			totalJackpotCount: totalLogs,
		});
	} catch (error) {
		console.error("Error occured:", error);
	}
};

// +++++++++++++++++ ADMIN GIVEAWAY SECTION +++++++++++++++++

exports.createGiveaway = async (req, res) => {
	try {
		const {
			jackpotPrizeType,
			jackpotBaseAmount,
			startDate,
			endDate,
			scheduledDrawDate,
			homepageDurationDays,
		} = req.body;

		const jackpot = await Jackpot.findOne({
			prizePoolType: jackpotPrizeType,
			isGiveaway: true,
		});
		if (!jackpot) {
			return sendResponse(res, 500, "Jackpot may have not been initialized");
		}

		// Check for any active giveaway with prizePoolType
		const activeGiveaway = await Giveaway.findOne({
			jackpot: jackpot._id,
			"status.isActive": true,
		});

		if (activeGiveaway) {
			return sendResponse(
				res,
				409,
				`Giveaway with prizeType: '${jackpotPrizeType}' is already active`,
			);
		}

		const request = {
			jackpot,
			jackpotBaseAmount,
			startDate,
			endDate,
			createdBy: req.user._id,
			scheduledDrawDate,
			homepageDurationDays,
		};

		const giveawayRaffle = await raffleService.createGiveaway(request);

		sendResponse(res, 200, "Giveaway created successfully!", giveawayRaffle);
	} catch (error) {
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	}
};

exports.getGiveaways = async (req, res) => {
	const { prizePoolType, isActive = true } = req.query;
	try {
		// Validate query parameters
		const isValid = validatePrizePoolType(prizePoolType);
		if (!isValid) {
			console.log("Invalid prizePoolType:", prizePoolType);
			return;
		}
		const raffleGiveaways = await raffleService.findGiveaways(
			prizePoolType,
			isActive,
		);

		if (!raffleGiveaways) {
			return sendResponse(res, 404, "No giveaways found");
		}

		return sendResponse(
			res,
			200,
			"Successfully fetched giveaways",
			raffleGiveaways,
		);
	} catch (error) {
		return sendResponse(res, 500, "Something went wrong.", {
			error: error.message,
		});
	}
};

exports.handleDraw = async (req, res) => {
	// Enable transation in case of rollback
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		const jackpotWinners = [];

		const activeGiveaways = await Giveaway.find({
			"status.isActive": true,
			scheduledDrawDate: { $lte: new Date() },
		});
		if (activeGiveaways.length === 0) {
			await session.abortTransaction();
			return sendResponse(
				res,
				200,
				"There are currently no active giveaways that are on due.",
			);
		}
		if (activeGiveaways.length > 0) {
			for (const giveaway of activeGiveaways) {
				// Fetch jackpot object
				const jackpot = await Jackpot.findById(giveaway.jackpot);

				const winner = await raffleService.handleGiveawayDraw({
					session,
					jackpot,
					giveaway,
				});
				jackpotWinners.push(winner);

				// After jackpot giveaway has been won
				// Create a new one
				await raffleService.createGiveaway({ session, jackpot }, giveaway);
				await session.commitTransaction();
			}
		}
		sendResponse(
			res,
			200,
			"Successfully drawn jackpot winner!",
			jackpotWinners,
		);
	} catch (err) {
		await session.abortTransaction();
		console.log("Error occured", err);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	} finally {
		session.endSession();
	}
};

exports.getLotteryWinners = async (req, res) => {
	const { query, page = 1 } = req.query;
	const limit = parseInt(req.query.limit || "10", 10);
	const skip = (page - 1) * limit;

	try {
		const lotteryWinners = await LotteryWinner.find()
			.sort({ _id: -1 }) // Sort by latest
			.skip(skip)
			.limit(limit)
			.populate("user")
			.lean();

		const mappedLotteryWinnersHistory = await Promise.all(
			lotteryWinners.map(async (history) => {
				const user = history.user;

				return {
					id: user._id.toString(),
					username: user.username,
					userProfileImage: await getUserProfileImage(user.profileImage),
					lotteryEventCategory: history.lotteryEventCategory,
					prizeWon: history.prizeWon,
				};
			}),
		);

		const totalLogs = await LotteryWinner.countDocuments();

		return sendResponse(res, 200, "success", {
			winnerHistory: mappedLotteryWinnersHistory,
			totalPages: Math.ceil(totalLogs / limit),
			currentPage: parseInt(page),
			totalWinnersCount: totalLogs,
		});
	} catch (error) {
		console.error("Error occured:", error);
	}
};
