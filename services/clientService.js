const { GCS_PROFILE_PICTURE_TTL } = require("../config/config");
const ClientTask = require("../models/client/items/earn/clientTask");
const Allowlist = require("../models/client/allowlist/allowlist");
const {
	GcsConstants,
	AllowlistTypes,
} = require("../utils/constants/CommonConstants");
const { handleImageUpdate } = require("../utils/helpers");
const { getAndOrSetCachedSignedUrl, uploadFile } = require("./gcs");
const AllowlistTicket = require("../models/client/allowlist/allowlistTicket");
const mongoose = require("mongoose");
const SequenceUtil = require("../utils/sequenceUtil");
const SequenceConstants = require("../utils/constants/SequenceConstants");
const { Parser } = require("@json2csv/plainjs");
const WalletBalance = require("../models/user/walletBalance");
const TicketNumberCounter = require("../models/utils/ticketNumberCounter");
const { requestForRandomNumber } = require("../utils/random");
const WalletAddress = require("../models/user/walletAddress");
const {
	checkTaskCompletion,
	checkAllowlistTaskStatus,
} = require("../middleware/allowlistValidate");

exports.createDiscordTask = async (session, clientProfile, options = {}) => {
	const newTask = new ClientTask({
		clientProfileRef: clientProfile._id,
		adminRef: clientProfile.adminRef,
		points: options.points || 0,
		earnType: "discord",
		discord: {
			server: {
				name: options.guildName,
				id: options.guildId,
			},
			inviteLink: options.discordInviteLink,
		},
		durationInDays: options.durationInDays,
	});
	return await newTask.save({ session });
};

exports.createTwitterTask = async (session, clientProfile, options = {}) => {
	const newTask = new ClientTask({
		clientProfileRef: clientProfile._id,
		adminRef: clientProfile.adminRef,
		points: options.points || 0,
		earnType: "twitter",
		twitter: {
			link: options.tweetUrl,
			minimumFollowers: options.minimumFollowers || 0,
			accountsToFollow: options.accountsToFollow,
			action: {
				retweet: options.isRetweet,
				comment: options.isComment,
				like: options.isLike,
				follow: options.isFollow,
			},
		},
		durationInDays: options.durationInDays,
	});

	// Save the task to the database
	return await newTask.save({ session });
};

exports.createTelegramTask = async (session, clientProfile, options = {}) => {
	const newTask = new ClientTask({
		clientProfileRef: clientProfile._id,
		adminRef: clientProfile.adminRef,
		points: options.points || 0,
		earnType: "telegram",
		telegram: {
			channel: options.telegramChannel,
			inviteLink: options.inviteLink,
		},
		durationInDays: options.durationInDays,
	});

	return await newTask.save({ session });
};

exports.createNewAllowlist = async (session, clientProfile, options = {}) => {
	const { token, mintPrice } = options;
	console.log("creating new allowlist...");

	// Handle banner
	let bannerImgKey = null;
	if (options.banner) {
		bannerImgKey = await handleImageUpdate(
			options.banner,
			GcsConstants.ALLOWLIST_BANNER_DIR,
		);
	}

	// Setup payment terms, if provided
	let paymentTerms = {};
	let allowlistType = AllowlistTypes.FREE;
	if (mintPrice) {
		// console.log("handling payment...");
		paymentTerms.enabled = true;
		paymentTerms.token = token.toLowerCase();
		paymentTerms.mintPrice = mintPrice;
		if (options.refundLosingEntries) {
			paymentTerms.refundLosingEntries = true;
		}
		const applyProfitGuarantee = {};
		if (options.pgPct) {
			applyProfitGuarantee.pgPct = options.pgPct;
		}
		if (options.reserveStakePct) {
			applyProfitGuarantee.reserveStakePct = options.reserveStakePct;
		}
		paymentTerms.applyProfitGuarantee = applyProfitGuarantee;
		allowlistType = AllowlistTypes.PRE_SALE;
	}

	let submitWalletAddress = { enabled: true };
	if (options.walletConstraints) {
		submitWalletAddress.constraints = options.walletConstraints;
	}

	const calculateDuration = () => {
		const endTimeIsNaN = isNaN(options.endTime);
		let utcNow, endDate;
		if (endTimeIsNaN) {
			utcNow = new Date(new Date().toISOString());
			endDate = new Date(options.endTime);
		} else {
			utcNow = Date.now();
			endDate = options.endTime;
		}

		const durationMs = endDate - utcNow; // Calculate difference in milliseconds
		const days = Math.floor(durationMs / (1000 * 60 * 60 * 24)); // Convert milliseconds to days
		return days;
	};

	const durationInDays = calculateDuration();

	// Handle creation of Discord task
	let joinDiscord = {};
	if (options.joinDiscord) {
		joinDiscord.enabled = true;
		const { guild } = options;
		const discordInviteLink = options.joinDiscord?.inviteLink;
		const discordTask = await this.createDiscordTask(session, clientProfile, {
			discordInviteLink,
			durationInDays,
			...guild,
		});
		joinDiscord.clientTaskRef = discordTask._id;
	}

	// Handle creation of Twitter task(s)
	let twitterTasks = {};
	if (options.twitterTasks) {
		twitterTasks.enabled = true;
		const { retweet, comment, like, follow, ...request } = options.twitterTasks;
		// Strictly parse actions as booleans, defaulting to `false` if invalid
		request.isRetweet = retweet === true || retweet === "true";
		request.isComment = comment === true || comment === "true";
		request.isLike = like === true || like === "true";
		request.isFollow = follow === true || follow === "true";

		const twitterTask = await this.createTwitterTask(session, clientProfile, {
			durationInDays,
			...request,
		});
		twitterTasks.clientTaskRef = twitterTask._id;
	}

	// Handle creation of Telegram task
	let joinTelegram = {};
	if (options.joinTelegram) {
		joinTelegram.enabled = true;
		const telegramChannel = options.joinTelegram?.tgName;
		const inviteLink = options.joinTelegram?.inviteLink;
		const telegramTask = await this.createTelegramTask(session, clientProfile, {
			durationInDays,
			telegramChannel,
			inviteLink,
		});
		joinTelegram.clientTaskRef = telegramTask._id;
	}

	const allowlist = new Allowlist({
		raffleName: options.raffleName,
		blockchain: options.blockchain.toLowerCase().trim(),
		description: options.description,
		banner: bannerImgKey,
		winnerCount: options.winnerCount ?? 0,
		everyoneWins:
			options.everyoneWins ?? (options.winnerCount > 0 ? false : true),
		startTime: options.startTime,
		endTime: options.endTime,
		submitVerifiedEmail: options.submitVerifiedEmail,
		paymentTerms,
		submitWalletAddress,
		joinDiscord,
		twitterTasks,
		joinTelegram,
		requireCaptcha: options.requireCaptcha,
		allowlistType,
		clientProfileRef: clientProfile._id,
		createdBy: options.user._id,
		eventId: await SequenceUtil.generateId(session, {
			prefix: `1${SequenceConstants.RAFFLE_EVENT_PREFIX}`,
			name: SequenceConstants.ALLOWLIST_EVENT_ID,
		}),
	});

	return await allowlist.save({ session });
};

exports.getAllowlists = async (options = {}) => {
	const {
		userId,
		presale,
		free,
		blockchain,
		status,
		clientProfileId,
		sortBy = "createdAt",
		sortOrder = "desc",
		page = 1,
		limit = 30,
	} = options;

	const allowlistTypes = [];
	const presaleBool = presale === "true";
	const freeBool = free === "true";
	if (presaleBool) {
		allowlistTypes.push("pre-sale");
	}
	if (freeBool) {
		allowlistTypes.push("free");
	}
	// Build query
	const query = {
		// Only query allowlists that have started already
		startTime: { $lte: new Date() },
		...(allowlistTypes && {
			allowlistType: { $in: allowlistTypes },
		}),
		...(blockchain && { blockchain: blockchain.toLowerCase().trim() }),
		...(clientProfileId && {
			clientProfileRef: mongoose.Types.ObjectId(clientProfileId),
		}),
		...(status && { status: { $in: status } }),
	};

	// Setup pagination
	const skip = (page - 1) * limit;

	const sortOptions = {};
	sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

	const allowlists = await Allowlist.find(query)
		.populate({
			path: "clientProfileRef",
			select: "name socials -_id",
		})
		.sort(sortOptions)
		.skip(skip)
		.limit(limit)
		.lean();

	const response = await Promise.all(
		allowlists.map(async (allowlist) => {
			const {
				clientProfileRef,
				raffleName,
				endTime,
				blockchain,
				winnerCount,
				allowlistType,
			} = allowlist;

			const responseData = {
				id: allowlist._id,
				clientProfile: clientProfileRef,
				raffleName,
				endTime,
				blockchain,
				winnerCount,
				allowlistType,
			};
			// If banner exists, get signed url
			if (allowlist.banner) {
				responseData.banner = await getAndOrSetCachedSignedUrl(
					allowlist.banner,
					process.env.GCS_BUCKET_NAME,
					GCS_PROFILE_PICTURE_TTL,
				);
			}
			return responseData;
		}),
	);

	const total = await Allowlist.countDocuments(query);

	return {
		page,
		limit,
		totalPages: Math.ceil(total / limit),
		allowlists: response,
	};
};

exports.getMyAllowlists = async (user, options = {}) => {
	const {
		presale,
		free,
		blockchain,
		status,
		sortBy = "createdAt",
		sortOrder = "desc",
		page = 1,
		limit = 30,
	} = options;
	const myAllowlistTickets = await AllowlistTicket.find({
		purchasedBy: user._id,
	})
		.select("allowlistRef -_id")
		.lean();

	const allowlistRefs = myAllowlistTickets.map((ticket) => ticket.allowlistRef);

	const allowlistTypes = [];
	if (presale) {
		allowlistTypes.push("pre-sale");
	}
	if (free) {
		allowlistTypes.push("free");
	}
	const query = {
		_id: { $in: allowlistRefs },
		...(allowlistTypes?.length > 0 && {
			allowlistType: { $in: allowlistTypes },
		}),
		...(blockchain && { blockchain: blockchain.toLowerCase().trim() }),
		...(status && { status: { $in: status } }),
	};

	const skip = (page - 1) * limit;

	const sortOptions = {};
	sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

	const myAllowlists = await Allowlist.find(query)
		.populate({
			path: "clientProfileRef",
			select: "name socials -_id",
		})
		.sort(sortOptions)
		.skip(skip)
		.limit(limit)
		.lean();

	const response = await Promise.all(
		myAllowlists.map(async (allowlist) => {
			const {
				clientProfileRef,
				raffleName,
				endTime,
				blockchain,
				winnerCount,
				allowlistType,
			} = allowlist;

			const responseData = {
				id: allowlist._id,
				clientProfile: clientProfileRef,
				raffleName,
				endTime,
				blockchain,
				winnerCount,
				allowlistType,
			};

			if (allowlist.banner) {
				responseData.banner = await getAndOrSetCachedSignedUrl(
					allowlist.banner,
					process.env.GCS_BUCKET_NAME,
					GCS_PROFILE_PICTURE_TTL,
				);
			}

			return responseData;
		}),
	);

	const total = await Allowlist.countDocuments(query);

	return {
		page,
		limit,
		totalPages: Math.ceil(total / limit),
		allowlists: response,
	};
};

exports.buyAllowlistTicket = async (session, options = {}) => {
	const { allowlist, userWalletBalances } = options;

	// Happy scenario only
	// All requirements are already validated through middlewares

	// Deduct balance with ticket price (if payment terms is setup)
	if (allowlist.paymentTerms.enabled) {
		const token = allowlist.paymentTerms.token.toLowerCase();
		const currentBalance = BigInt(userWalletBalances.balances?.get(token));

		const ticketPrice = BigInt(allowlist.paymentTerms.totalTicketPrice);
		const newBalance = currentBalance - ticketPrice;
		userWalletBalances.balances.set(token, newBalance.toString());
		await userWalletBalances.save({ session });
	}

	// Atomically increment the ticket number
	const counter = await TicketNumberCounter.findOneAndUpdate(
		{ allowlist: allowlist._id, eventType: "allowlist" },
		{ $inc: { ticketNumber: 1 } },
		{ new: true, upsert: true, session },
	);
	// Generate and assign id
	const allowlistTicketId = await SequenceUtil.generateTicketId(session, {
		name: SequenceConstants.ALLOWLIST_TICKET_ID,
	});

	const allowlistTicket = new AllowlistTicket({
		allowlistRef: allowlist._id,
		ticketNumber: counter.ticketNumber,
		allowlistTicketId,
		emailAddress: options.reqBody.email,
		walletAddressRef: options.walletAddressId,
		purchasedBy: options.currentUser._id,
	});

	await allowlistTicket.save({ session });
	return { allowlistTicket };
};

exports.getAllowlistById = async (allowlist, user) => {
	let entryDetails;
	if (allowlist.status === "live") {
		allowlist = await allowlist
			.populate(
				"joinDiscord.clientTaskRef twitterTasks.clientTaskRef joinTelegram.clientTaskRef",
			)
			.execPopulate();

		allowlist = allowlist.toObject();
		// Calculate staking cost (mintPrice * reserveStakePct)
		if (
			allowlist.paymentTerms &&
			allowlist.paymentTerms.applyProfitGuarantee &&
			allowlist.paymentTerms.applyProfitGuarantee.reserveStakePct
		) {
			const mintPrice = BigInt(allowlist.paymentTerms.mintPrice);
			const reserveStake = BigInt(
				allowlist.paymentTerms.applyProfitGuarantee.reserveStakePct * 100,
			);
			const cost = (mintPrice * reserveStake) / BigInt(100);
			allowlist.paymentTerms.stakingCost = cost.toString();
		}
	} else {
		allowlist = allowlist.toObject();
		// First, check if there's user
		// If user logged in, check if he entered, won, or lost
		entryDetails = { entered: false };

		if (user) {
			// Check if user entered. Then fetch user's entries for this allowlist
			const myEntriesForThisAllowlist = await AllowlistTicket.find({
				allowlistRef: allowlist._id,
				purchasedBy: user._id,
			})
				.populate({ path: "walletAddressRef", select: "address -_id" })
				.select("ticketNumber -_id")
				.lean();

			if (myEntriesForThisAllowlist?.length > 0) {
				// Set entered to `true` if user has ticket/s
				entryDetails.entered = true;

				// Check if user won or not
				const winningTicketNumbers = new Set(
					allowlist.vrf.winningTicketNumbers,
				);

				let myWinningWalletAddresses = [];
				for (const {
					ticketNumber,
					walletAddressRef,
				} of myEntriesForThisAllowlist) {
					if (winningTicketNumbers.has(ticketNumber)) {
						myWinningWalletAddresses.push(walletAddressRef.address);
					}
				}
				if (myWinningWalletAddresses.length > 0) {
					entryDetails.result = "won";
					entryDetails.winningAddresses = myWinningWalletAddresses;
				} else {
					// If user didn't win the allowlist
					entryDetails.result = "lost";

					let totalRefundAmount = BigInt(0);

					if (allowlist.paymentTerms?.enabled) {
						// Check if there is staking cost put in place
						// Calculate staking cost
						const stakingAmount =
							BigInt(allowlist.paymentTerms.totalTicketPrice) -
							BigInt(allowlist.paymentTerms.mintPrice);
						totalRefundAmount += stakingAmount;

						const totalProfitGuarantee = BigInt(
							allowlist.paymentTerms.totalProfitGuarantee,
						);
						if (
							allowlist.paymentTerms.refundLosingEntries &&
							totalProfitGuarantee > 0n
						) {
							// Add the ticket mintPrice to totalRefundAmount
							totalRefundAmount += BigInt(allowlist.paymentTerms.mintPrice);

							const totalEntries = await AllowlistTicket.countDocuments({
								allowlistRef: allowlist._id,
							});
							// Calculate profit guarantee share and stringify
							const profitGuaranteeShare =
								totalProfitGuarantee /
								// losingEntries = totalEntries - winnerCount
								BigInt(totalEntries - allowlist.winnerCount);
							entryDetails.profitGuaranteeShare =
								profitGuaranteeShare.toString();
							totalRefundAmount += profitGuaranteeShare;
						}
					}
					entryDetails.totalRefundAmount = totalRefundAmount.toString();
				}
			}
		}
	}

	// Get signed url for banner
	if (allowlist.banner) {
		const bannerSignedUrl = await getAndOrSetCachedSignedUrl(
			allowlist.banner,
			process.env.GCS_BUCKET_NAME,
			GCS_PROFILE_PICTURE_TTL,
		);
		allowlist.banner = bannerSignedUrl;
	}

	// Get signed url for clientProfile icon
	if (allowlist.clientProfileRef.icon) {
		const iconSignedUrl = await getAndOrSetCachedSignedUrl(
			allowlist.clientProfileRef.icon,
			process.env.GCS_BUCKET_NAME,
			GCS_PROFILE_PICTURE_TTL,
		);
		allowlist.clientProfileRef.icon = iconSignedUrl;
	}

	// Count entries
	const entries = await AllowlistTicket.countDocuments({
		allowlistRef: allowlist._id,
	});

	const responseData = {
		...allowlist,
		entries,
		entryDetails,
	};

	return responseData;
};

exports.verifyAllowlistEntryStatus = async (
	session,
	currentUser,
	allowlist,
	options = {},
) => {
	const { email, walletAddress } = options;
	let entryStatus = { isQualified: true };

	if (allowlist.submitVerifiedEmail) {
		entryStatus.submitVerifiedEmail = true;
		if (email !== currentUser.email) {
			entryStatus.submitVerifiedEmail = false;
			entryStatus.isQualified = false;
		}
	}

	const submitWalletAddress = allowlist.submitWalletAddress;
	if (submitWalletAddress.enabled) {
		entryStatus.submitWalletAddress = true;
		const walletAddressDoc = await WalletAddress.findOne({
			address: walletAddress,
		}).lean();
		if (!walletAddressDoc) {
			entryStatus.submitWalletAddress = false;
			entryStatus.isQualified = false;
		} else {
			// First check if walletAddress has already been added
			// Check if any address matches the request
			const walletIsValid = walletAddressDoc.userRef.equals(currentUser._id);

			// TODO validate contraints
			if (!walletIsValid) {
				entryStatus.submitWalletAddress = false;
				entryStatus.isQualified = false;
			} else {
				const duplicateEntry = await AllowlistTicket.findOne({
					walletAddressRef: walletAddressDoc._id,
					allowlistRef: allowlist._id,
				});
				if (duplicateEntry) {
					entryStatus.duplicateWalletAddress = true;
					entryStatus.isQualified = false;
					// return sendResponse(
					// 	res,
					// 	200,
					// 	"Wallet address already entered. Please use another one",
					// 	entryStatus
					// );
				}
				if (submitWalletAddress.constraints) {
					// Check if wallet address has contract addresses
					const { nft, token } = submitWalletAddress.constraints;
				}
			}
		}
	}

	// Validate tasks
	let allowlistTasks = [];
	allowlist.joinDiscord?.clientTaskRef &&
		allowlistTasks.push(allowlist.joinDiscord.clientTaskRef);
	allowlist.twitterTasks?.clientTaskRef &&
		allowlistTasks.push(allowlist.twitterTasks.clientTaskRef);
	allowlist.joinTelegram?.clientTaskRef &&
		allowlistTasks.push(allowlist.joinTelegram.clientTaskRef);

	let taskIsQualified;
	const taskStatuses = await Promise.all(
		allowlistTasks.map(async (task) => {
			const earnType = task.earnType;

			let userTaskStatus = {
				taskId: task._id,
				earnType,
				claimStatus: false,
				taskMessage: null,
			};

			const response = await checkAllowlistTaskStatus(
				session,
				task,
				currentUser,
			);
			if (response?.error) {
				if (earnType === "discord") {
					entryStatus.discordTaskError = response.error.message;
				}
				if (earnType === "twitter") {
					entryStatus.twitterTaskError = response.error.message;
				}
				if (earnType === "telegram") {
					entryStatus.telegramTaskError = response.error.message;
				}
			}
			response.taskMessage &&
				(userTaskStatus.taskMessage = response.taskMessage);
			userTaskStatus.claimStatus = response.claimStatus;
			userTaskStatus.claimDetails = response.claimDetails;

			if (!response.isQualified) {
				taskIsQualified = false;
			}

			return userTaskStatus;
		}),
	);

	entryStatus.taskStatuses = taskStatuses;
	taskIsQualified !== undefined && (entryStatus.isQualified = taskIsQualified);

	return entryStatus;
};

exports.pickRandomTicketNumbers = async (allowlist) => {
	const allowlistEntries = await AllowlistTicket.find({
		allowlistRef: allowlist._id,
	});

	let winners = [];
	if (allowlistEntries.length > allowlist.winnerCount) {
		const shuffledEntries = allowlistEntries
			.map((entry) => entry.ticketNumber)
			.sort(() => 0.5 - Math.random());

		winners = shuffledEntries.slice(0, allowlist.winnerCount);
	}
	return winners;
};

// Prepares the allowlist to be picked for winners via vrf
exports.prepareAllowlist = async (session, allowlist) => {
	const naffleId = allowlist.eventId;
	const transactionHash = await requestForRandomNumber(naffleId, 0, {
		isAllowlist: true,
	});
	if (transactionHash !== null) {
		allowlist.vrf.status = "In Progress";
		allowlist.vrf.transactionHash = transactionHash;
		allowlist.status = "drawing";
		await allowlist.save({ session });
	}
};

exports.concludeAllowlist = async (session, allowlist, winningNumbers = []) => {
	// OK 1. fetch all entries from allowlist
	// OK 2. filter entries if winning numbers are provided
	// OK 3. create a file then upload to gcs bucket
	// OK 4. if allowlistType = 'pre-sale', calculate profit and handle creator payment
	// OK 5. for limited winners, check if refund losing entries is set
	// OK 6. if true, check for refund, apply profit guarantee if set
	const winningTicketNumbers = new Set(winningNumbers);
	console.log("1 - concluding allowlists...");

	const allowlistEntries = await AllowlistTicket.find({
		allowlistRef: allowlist._id,
	})
		.populate("walletAddressRef")
		.session(session);

	let winningEntries = allowlistEntries;
	// FOR LIMITED WINNERS
	if (winningTicketNumbers.size > 0) {
		console.log("2 - filtering winners...:", winningNumbers);
		winningEntries = allowlistEntries.filter((ticket) =>
			winningTicketNumbers.has(ticket.ticketNumber),
		);
	}

	// Prepare the csv file
	const csvData = winningEntries.map((entry) => ({
		walletAddress: entry.walletAddressRef?.address || "N/A",
	}));

	let csvContent;
	try {
		const parser = new Parser();
		console.log("3 - parsing json to csvData=", csvData);
		csvContent = parser.parse(csvData);
	} catch (err) {
		console.error("Error creating CSV:", err);
		throw err;
	}

	const fileBuffer = {
		filename: `${allowlist._id}-${allowlist.raffleName}-winners.csv`,
		buffer: Buffer.from(csvContent),
		mimetype: "text/csv",
	};

	console.log("4 - updloading file...");
	const fileKey = await uploadFile(
		fileBuffer,
		GcsConstants.ALLOWLIST_WINNERS_DIR,
		process.env.GCS_BUCKET_NAME,
	);

	// Update allowlist status and winners file key
	allowlist.status = "ended";
	allowlist.vrf.status = "Fulfilled";
	allowlist.vrf.winningTicketNumbers = winningEntries.map(
		(entry) => entry.ticketNumber,
	);
	allowlist.winnersGcsKey = fileKey;
	console.log("5 - updating and saving allowlist...");
	await allowlist.save({ session });

	// ******************************************* //
	// ******* Payment and Refunds Section ******* //
	// ******************************************* //
	if (allowlist.allowlistType === AllowlistTypes.PRE_SALE) {
		console.log("6 - handling payments...");
		const token = allowlist.paymentTerms.token.toLowerCase();
		const mintPrice = BigInt(allowlist.paymentTerms.mintPrice);
		const totalProfitGuarantee = BigInt(
			allowlist.paymentTerms.totalProfitGuarantee,
		);
		// Calculate stakingAmount
		const stakingAmount =
			BigInt(allowlist.paymentTerms.totalTicketPrice) - mintPrice;

		let creatorTotalSales = BigInt(0);
		// Initiate refund handling if set
		if (
			winningTicketNumbers.size == 0 &&
			!allowlist.paymentTerms.refundLosingEntries
		) {
			const totalPayableSales = mintPrice * BigInt(allowlistEntries.length);
			creatorTotalSales += totalPayableSales;

			if (stakingAmount > 0n) {
				console.log("9 refunding staking amount...");
				await refundStakingAmount(session, {
					allowlistEntries,
					token,
					stakingAmount,
				});
			}
		} else {
			// Calculate creator sales - total amount of winning ticket price minus total profit guarantee
			const totalPayableSales = mintPrice * BigInt(winningEntries.length);
			const deductedAmount = totalPayableSales - totalProfitGuarantee;
			creatorTotalSales += deductedAmount;

			console.log("7 - filtering losing entries...");
			const losingEntries = allowlistEntries.filter(
				(ticket) => !winningTicketNumbers.has(ticket.ticketNumber),
			);

			// Only refund if there are losing entries
			if (losingEntries.length > 0) {
				console.log("8 - refunding loses...");
				await refundLosingEntries(session, allowlist, {
					losingEntries,
					token,
					totalProfitGuarantee,
				});
			}

			// Initiate staking refund for winners
			if (stakingAmount > 0n) {
				console.log("9 - refunding staking amount...");
				await refundStakingAmount(session, {
					allowlistEntries: winningEntries,
					token,
					stakingAmount,
				});
			}
		}

		// Initiate creator payment
		console.log("10 - paying creator...");
		await handleCreatorPayment(session, allowlist, {
			creatorTotalSales,
			token,
		});
	}
};

exports.cancelAllowlist = async (session, allowlist) => {
	allowlist.status = "cancelled_zero_entries";
	allowlist.vrf.status = "Cancelled";
	allowlist.cancelledAt = new Date();
	await allowlist.save({ session });
};

async function refundStakingAmount(session, options = {}) {
	const { allowlistEntries, token, stakingAmount } = options;
	await Promise.all(
		allowlistEntries.map(async (entry) => {
			const userWallet = await WalletBalance.findOne({
				userRef: entry.purchasedBy,
			}).session(session);

			const currentBalance = BigInt(userWallet.balances.get(token) || "0");
			const newBalance = currentBalance + stakingAmount;
			userWallet.balances.set(token, newBalance.toString());
			await userWallet.save({ session });
		}),
	);
}

async function refundLosingEntries(session, allowlist, options = {}) {
	const { losingEntries, token, totalProfitGuarantee } = options;

	// First, calculate overall refund cost
	// Refund cost consists of totalTicketPrice (mintPrice + reserveStake)
	// and a percentage of the total profit guarantee

	// calculate profit guarantee (if set)
	let refundAmount = BigInt(allowlist.paymentTerms.totalTicketPrice);
	if (totalProfitGuarantee > 0n) {
		const profitGuaranteeShare =
			totalProfitGuarantee / BigInt(losingEntries.length);
		refundAmount += profitGuaranteeShare;
	}

	await Promise.all(
		losingEntries.map(async (entry) => {
			// Get walletbalances of user, add refund cost based on allowlist token
			const userWallet = await WalletBalance.findOne({
				userRef: entry.purchasedBy,
			}).session(session);

			const currentBalance = BigInt(userWallet.balances.get(token) || "0");
			const newBalance = currentBalance + refundAmount;
			userWallet.balances.set(token, newBalance.toString());
			await userWallet.save({ session });
		}),
	);
}

async function handleCreatorPayment(session, allowlist, options = {}) {
	const { creatorTotalSales, token } = options;

	const creatorWallet = await WalletBalance.findOne({
		userRef: allowlist.createdBy,
	}).session(session);

	const currentBalance = BigInt(creatorWallet.balances.get(token) || "0");
	const newBalance = currentBalance + creatorTotalSales;
	creatorWallet.balances.set(token, newBalance.toString());
	await creatorWallet.save({ session });
}
