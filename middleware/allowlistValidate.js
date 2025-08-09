const Allowlist = require("../models/client/allowlist/allowlist");
const ClientMemberClaimedTask = require("../models/client/items/earn/clientMemberClaimedTask");
const WalletAddress = require("../models/user/walletAddress");
const WalletBalance = require("../models/user/walletBalance");
const sendResponse = require("../utils/responseHandler");
const { Long } = require("bson");
const {
	isBotInGuildFunction,
	isUserInGuildFunction,
	isBotInTelegramChannelFunction,
	isUserInTelegramChannel,
} = require("./validate");
const { checkAndChangeTaskStatus } = require("../controllers/clientController");
const { checkTwitterTaskQueue } = require("../config/queue");
const AllowlistTicket = require("../models/client/allowlist/allowlistTicket");

exports.validateAllowlistCreation = async (req, res, next) => {
	const {
		winnerCount,
		everyoneWins,
		blockchain,
		raffleName,
		description,
		startTime,
		endTime,
	} = req.body;

	let invalidFields = [];
	// Validate winner count
	if (!winnerCount) {
		invalidFields.push("`winnerCount` must not be empty");
	}

	if (everyoneWins) {
		const everyoneWinsBool = everyoneWins === "true" ? true : false;
		if (winnerCount > 0 && everyoneWinsBool) {
			invalidFields.push(`'winnerCount' must be 0 if 'everyoneWins' is true`);
		}

		if (winnerCount <= 0 && !everyoneWinsBool) {
			invalidFields.push(
				`'winnerCount' must not be 0 if 'everyoneWins' is false`,
			);
		}
	}

	if (!blockchain) {
		invalidFields.push("`blockchain` must not be empty");
	}

	if (!raffleName) {
		invalidFields.push("`raffleName` must not be empty");
	}

	if (!description) {
		invalidFields.push("`description` must not be empty");
	}

	if (!startTime) {
		invalidFields.push("`startTime` must not be empty");
	}

	if (!endTime) {
		invalidFields.push("`endTime` must not be empty");
	}

	if (startTime && endTime) {
		let normalizedStartTime, normalizedEndTime;
		let res = normalizeToTimestamp(startTime);
		if (res.error) {
			invalidFields.push(`${res.error} for \`startTime\``);
		} else {
			normalizedStartTime = res.value;
		}

		res = normalizeToTimestamp(endTime);
		if (res.error) {
			invalidFields.push(`${res.error} for \`endTime\``);
		} else {
			normalizedEndTime = res.value;
		}

		if (normalizedStartTime >= normalizedEndTime) {
			invalidFields.push("`startTime` must not be later than `endTime`.");
		}
	}

	if (invalidFields.length > 0) {
		return sendResponse(res, 400, "Invalid fields", {
			error: invalidFields,
		});
	}

	next();
};

function normalizeToTimestamp(value) {
	if (typeof value === "string") {
		// Check if the string is a ISO Date (which contains T)
		if (value.includes("T")) {
			const date = new Date(value);
			if (!isNaN(date.getTime())) {
				return { value: date.getTime() };
			}
		} else {
			return { value: Number(value) }; // Convert to a number
		}
	} else if (typeof value === "number") {
		// Already a Unix timestamp in numeric form
		return { value };
	} else if (value instanceof Date) {
		// Date object: convert to timestamp
		return { value: value.getTime() };
	}

	return { error: "Invalid format" };
}

exports.allowlistExists = (options = {}) => {
	const {
		purchaseTicketFlag = false,
		populateTasks = false,
		populateClientProfile = false,
		fetchLean = true,
	} = options;
	return async (req, res, next) => {
		const allowlistId = req.params?.allowlistId || req.query?.allowlistId;

		let query = Allowlist.findById(allowlistId);
		// Populate necessary references
		if (populateTasks) {
			// if populateTasks = true
			query = query.populate(
				"joinDiscord.clientTaskRef twitterTasks.clientTaskRef joinTelegram.clientTaskRef",
			);
		}
		populateClientProfile &&
			(query = query.populate({
				path: "clientProfileRef",
				select: "icon name socials pointSystem",
			}));
		if (fetchLean) {
			query = query.lean();
		}

		const allowlist = await query;

		if (!allowlist) {
			return sendResponse(res, 404, "Allowlist not found", { allowlistId });
		}

		if (purchaseTicketFlag && allowlist.status !== "live") {
			return sendResponse(res, 400, "You can no longer enter this allowlist");
		}

		req.allowlist = allowlist;

		next();
	};
};

exports.checkIfUserHasBalance = async (req, res, next) => {
	const allowlist = req.allowlist;
	const currentUser = req.user;

	if (allowlist.paymentTerms.enabled) {
		const ticketPrice = BigInt(allowlist.paymentTerms.totalTicketPrice);

		const userWalletBalance = await WalletBalance.findOne({
			userRef: currentUser._id,
		});
		const token = allowlist.paymentTerms.token;
		const currentBalance = BigInt(
			userWalletBalance.balances?.get(token.toLowerCase()) || 0,
		);

		if (currentBalance < ticketPrice) {
			return sendResponse(
				res,
				400,
				`You have not enough ${token.toUpperCase()} balance`,
				{
					currentBalance: currentBalance.toString(),
					ticketPrice: ticketPrice.toString(),
				},
			);
		}
		req.userWalletBalance = userWalletBalance;
	}
	next();
};

exports.allowlistHasStarted = async (req, res, next) => {
	const allowlist = req.allowlist;

	if (allowlist.startTime > new Date()) {
		return sendResponse(
			res,
			400,
			"Unable to enter. Allowlist has not yet started.",
		);
	}

	next();
};

exports.checkAllowlistStatus = async (req, res, next) => {
	const allowlist = req.allowlist;

	if (allowlist.status === "live") {
		return sendResponse(res, 400, "This allowlist has not yet ended.");
	}

	if (allowlist.status === "drawing") {
		return sendResponse(
			res,
			400,
			"This allowlist is already scheduled for winner draw. Please try again later.",
		);
	}

	if (allowlist.status.includes("cancelled")) {
		return sendResponse(res, 400, "This allowlist has been cancelled.");
	}

	next();
};

exports.checkUserClaimedTasks = async (req, res, next) => {
	let allowlist = req.allowlist;
	const user = req.user;
	try {
		if (allowlist.status === "live") {
			allowlist = await allowlist
				.populate(
					"joinDiscord.clientTaskRef twitterTasks.clientTaskRef joinTelegram.clientTaskRef",
				)
				.execPopulate();
			let allowlistTasks = [];
			allowlist.joinDiscord?.clientTaskRef &&
				allowlistTasks.push(allowlist.joinDiscord.clientTaskRef);
			allowlist.twitterTasks?.clientTaskRef &&
				allowlistTasks.push(allowlist.twitterTasks.clientTaskRef);
			allowlist.joinTelegram?.clientTaskRef &&
				allowlistTasks.push(allowlist.joinTelegram.clientTaskRef);

			const taskClaims = await Promise.all(
				allowlistTasks.map(async (data) => {
					const task = data.toObject();
					const taskClaim = {
						taskId: task._id,
						earnType: task.earnType,
						claimStatus: false,
					};

					// Set default values for discord, twitter, and telegram in the task object
					if (user && user._id) {
						const userClaimed = await ClientMemberClaimedTask.findOne({
							taskId: task._id,
							claimedBy: user._id,
						});
						taskClaim.claimStatus =
							userClaimed?.status === "completed" ? true : false;
						taskClaim.claimDetails = task.claimDetails || {};
						if (task.earnType === "telegram") {
							taskClaim.claimDetails.joined =
								userClaimed?.task?.telegram?.joined || false;
						}
						if (task.earnType === "twitter") {
							taskClaim.claimDetails.comment =
								userClaimed?.task?.twitter?.comment || false;
							taskClaim.claimDetails.retweet =
								userClaimed?.task?.twitter?.retweet || false;
						}
						if (task.earnType === "discord") {
							taskClaim.claimDetails.joined =
								userClaimed?.task?.discord?.joined || false;
						}
					}
					return taskClaim;
				}),
			);

			req.taskClaimStatus = taskClaims;
		}
		next();
	} catch (err) {
		console.error("Error checking user claimed tasks for allowlist:", err);
		return sendResponse(
			res,
			500,
			"Error checking user claimed tasks for allowlist.",
			{ error: err },
		);
	}
};

// Deprecated
exports.validateRequirements = async (req, res, next) => {
	const { email, walletAddress } = req.body;
	const currentUser = req.user;

	let validationResponse = { isValid: true };
	// TODO
	// - check for 'submit wallet address'
	// - check tasks?
	const allowlist = req.allowlist;
	// console.log("allowlist:", allowlist);
	// - check for 'submit email address'
	if (allowlist.submitVerifiedEmail) {
		validationResponse.submitVerifiedEmail = true;
		if (email !== currentUser.email) {
			validationResponse.submitVerifiedEmail = false;
			validationResponse.isValid = false;
		}
	}

	const submitWalletAddress = allowlist.submitWalletAddress;
	if (submitWalletAddress.enabled) {
		if (!validationResponse) validationResponse = {};
		validationResponse.submitWalletAddress = true;
		const walletAddressDoc = await WalletAddress.findOne({
			address: walletAddress,
		}).lean();
		if (!walletAddressDoc) {
			validationResponse.submitWalletAddress = false;
			validationResponse.isValid = false;
		} else {
			req.walletAddressId = walletAddressDoc._id;
			// First check if walletAddress has already been added
			// Check if any address matches the request
			const walletIsValid = walletAddressDoc.userRef.equals(currentUser._id);

			// TODO validate contraints
			if (!walletIsValid) {
				validationResponse.submitWalletAddress = false;
				validationResponse.isValid = false;
			} else {
				const duplicateEntry = await AllowlistTicket.findOne({
					walletAddressRef: walletAddressDoc._id,
					allowlistRef: allowlist._id,
				});
				if (duplicateEntry) {
					validationResponse.duplicateWalletAddress = true;
					validationResponse.isValid = false;
					// return sendResponse(
					// 	res,
					// 	200,
					// 	"Wallet address already entered. Please use another one",
					// 	validationResponse
					// );
				}
				if (submitWalletAddress.constraints) {
					// Check if wallet address has contract addresses
					const { nft, token } = submitWalletAddress.constraints;
				}
			}
		}
	}

	// ============ CHECK TASKS ============
	// Check Discord Task
	if (allowlist.joinDiscord.enabled) {
		const task = allowlist.joinDiscord.clientTaskRef;
		const response = await checkTaskCompletion(
			task,
			currentUser,
			validationResponse,
		);
		if (response?.error) {
			// return sendResponse(res, response.error.code, response.error.message);
			validationResponse.discordTaskError = response.error.message;
			validationResponse.isValid = false;
		}
	}

	// Check Twitter Task
	if (allowlist.twitterTasks.enabled) {
		const task = allowlist.twitterTasks.clientTaskRef;
		const response = await checkTaskCompletion(
			task,
			currentUser,
			validationResponse,
		);
		if (response?.error) {
			// return sendResponse(res, response.error.code, response.error.message);
			validationResponse.twitterTaskError = response.error.message;
			validationResponse.isValid = false;
		}
	}

	// Check Telegram Task
	if (allowlist.joinTelegram.enabled) {
		const task = allowlist.joinTelegram.clientTaskRef;
		const response = await checkTaskCompletion(
			task,
			currentUser,
			validationResponse,
		);
		if (response?.error) {
			// return sendResponse(res, response.error.code, response.error.message);
			validationResponse.telegramTaskError = response.error.message;
			validationResponse.isValid = false;
		}
	}

	// if (!validationResponse.isValid) {
	// 	// req.validationResponse = validationResponse;
	// 	return sendResponse(
	// 		res,
	// 		200,
	// 		"You did not meet the requirements to enter this allowlist",
	// 		validationResponse,
	// 	);
	// }

	// ========== Final Validation Check ==========
	if (!validationResponse.isValid) {
		return sendResponse(
			res,
			200,
			"You did not meet the requirements to enter this allowlist",
			validationResponse,
		);
	}

	req.validationResponse = validationResponse;

	next();
};

exports.checkAllowlistTaskStatus = async (session, task, user) => {
	let isQualified = true,
		claimStatus = false,
		taskMessage,
		claimDetails = {};

	// Initialize values
	if (task.earnType === "discord") {
		claimDetails.linkedDiscord = true;
		claimDetails.joined = true;
	} else if (task.earnType === "twitter") {
		claimDetails = {
			linkedTwitter: false,
			retweet: false,
			comment: false,
		};
	} else if (task.earnType === "telegram") {
		claimDetails.linkedTelegram = true;
		claimDetails.joined = true;
	}

	const userClaimed = await ClientMemberClaimedTask.findOne({
		taskId: task._id,
		claimedBy: user._id,
	});

	if (userClaimed && userClaimed.status === "completed") {
		claimStatus = true;
	}

	if (userClaimed) {
		if (task.earnType === "telegram") {
			const joined = userClaimed?.task?.telegram?.joined || false;
			claimDetails.joined = joined;
			if (!joined) {
				isQualified = false;
			}
		}
		if (task.earnType === "twitter") {
			claimDetails.linkedTwitter = true;
			const comment = userClaimed?.task?.twitter?.comment || false;
			claimDetails.comment = comment;
			const retweet = userClaimed?.task?.twitter?.retweet || false;
			claimDetails.retweet = retweet;
			if (!comment && !retweet) {
				isQualified = false;
			}
		}
		if (task.earnType === "discord") {
			const joined = userClaimed?.task?.discord?.joined || false;
			claimDetails.joined = joined;
			if (!joined) {
				isQualified = false;
			}
		}
	} else {
		if (task.earnType === "discord") {
			const guildId = task.discord.server.id;
			const discordId = user.socials?.discord?.id;
			if (!discordId) {
				console.log("");
				claimDetails.linkedDiscord = false;
				claimDetails.joined = false;
				isQualified = false;
			} else {
				const botInChannel = await isBotInGuildFunction(guildId);
				if (!botInChannel) {
					const error = {
						code: 400,
						message:
							"Naffles bot not on discord community channel, contact community admin",
					};
					return { error };
				}

				const userInChannel = await isUserInGuildFunction(guildId, discordId);
				const joined = userInChannel ? true : false;
				if (!joined) {
					claimDetails.joined = false;
					isQualified = false;
				} else {
					await checkAndChangeTaskStatus(
						session, // session
						task,
						user,
						"discord",
						{ discord: { joined } },
						"completed",
					);
				}
			}
		}
		if (task.earnType === "twitter") {
			const twitterUsername = user.socials?.twitter?.username;
			if (!twitterUsername) {
				claimDetails.linkedTwitter = false;
				claimDetails.retweet = false;
				claimDetails.comment = false;
				isQualified = false;
			} else {
				claimDetails.linkedTwitter = true;
				// Check if the queue has more than 1000 waiting tasks
				const waitingCount = await checkTwitterTaskQueue.getWaitingCount();
				if (waitingCount >= 1000) {
					const error = {
						code: 429,
						message: "Twitter Task Queue is full. Please try again later.",
					};
					return { error };
				}

				// Add twitter task on queue
				taskMessage = "Your request is being processed.";
				const jobId = `${user._id}-${task._id}`;
				// Check if a job with the same jobId already exists
				const existingJob = await checkTwitterTaskQueue.getJob(jobId);
				if (existingJob) {
					console.log(
						`Job already exists for user ${user._id} and task ${task._id}. Skipping addition.`,
					);
				} else {
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
			}
		}
		if (task.earnType === "telegram") {
			const telegramChannel = task.telegram.inviteLink?.split("/").pop();
			if (!telegramChannel) {
				const error = {
					code: 500,
					message: "Telegram channel was either not found or saved.",
				};
				return { error };
			}
			const telegramId = user.socials?.telegram?.id;
			if (!telegramId) {
				claimDetails.linkedTelegram = false;
				claimDetails.joined = false;
				isQualified = false;
			} else {
				const botInChannel =
					await isBotInTelegramChannelFunction(telegramChannel);
				if (!botInChannel) {
					const error = {
						code: 400,
						message: `Naffles bot not on tg channel: ${telegramChannel}, contact community admin`,
					};
					return { error };
				}

				const userInChannel = await isUserInTelegramChannel(
					telegramChannel,
					telegramId,
				);
				const joined = userInChannel ? true : false;
				if (!joined) {
					claimDetails.joined = false;
					isQualified = false;
				} else {
					await checkAndChangeTaskStatus(
						session, // session
						task,
						user,
						"telegram",
						{ telegram: { joined } },
						"completed",
					);
				}
			}
		}
	}

	return { isQualified, claimStatus, claimDetails, taskMessage };
};

// Deprecated
async function checkTaskCompletion(task, user, validationResponse) {
	// Initialize values
	if (task.earnType === "discord") {
		validationResponse.linkedDiscord = true;
		validationResponse.joinDiscord = true;
	} else if (task.earnType === "twitter") {
		validationResponse.linkedTwitter = true;
		validationResponse.twitterTasks = true;
	} else if (task.earnType === "telegram") {
		validationResponse.linkedTelegram = true;
		validationResponse.joinTelegram = true;
	}

	let isAlreadyClaimed = await ClientMemberClaimedTask.findOne({
		taskId: task._id,
		claimedBy: user._id,
	});

	if (isAlreadyClaimed && isAlreadyClaimed.status === "completed") {
		return;
	}

	if (!validationResponse) validationResponse = {};
	if (task.earnType === "discord") {
		const guildId = task.discord.server.id;
		const discordId = user.socials?.discord?.id;
		if (!discordId) {
			console.log("");
			validationResponse.linkedDiscord = false;
			validationResponse.joinDiscord = false;
			validationResponse.isValid = false;
		} else {
			const botInChannel = await isBotInGuildFunction(guildId);
			if (!botInChannel) {
				const error = {
					code: 400,
					message:
						"Naffles bot not on discord community channel, contact community admin",
				};
				return { error };
			}

			const userInChannel = await isUserInGuildFunction(guildId, discordId);
			const joined = userInChannel ? true : false;
			if (!joined) {
				validationResponse.joinDiscord = false;
				validationResponse.isValid = false;
			} else {
				await checkAndChangeTaskStatus(
					null, // session
					task,
					user,
					"discord",
					{ discord: { joined } },
					"completed",
				);
			}
		}
	} else if (task.earnType === "twitter") {
		const twitterUsername = user.socials?.twitter?.username;
		if (!twitterUsername) {
			validationResponse.linkedTwitter = false;
			validationResponse.twitterTasks = false;
			validationResponse.isValid = false;
		} else {
			// TODO enhance this twitter task checker
			// Check if the queue has more than 1000 waiting tasks
			const waitingCount = await checkTwitterTaskQueue.getWaitingCount();
			if (waitingCount >= 1000) {
				const error = {
					code: 429,
					message: "Twitter Task Queue is full. Please try again later.",
				};
				return { error };
			}

			// Add twitter task on queue
			// Immediately response to the client
			const jobId = `${user._id}-${task._id}`;
			// Check if a job with the same jobId already exists
			const existingJob = await checkTwitterTaskQueue.getJob(jobId);
			if (existingJob) {
				console.log(
					`Job already exists for user ${user._id} and task ${task._id}. Skipping addition.`,
				);
			} else {
				checkTwitterTaskQueue
					.add(
						{ twitterTask: task, user },
						{ jobId, attempts: 1, removeOnComplete: true, removeOnFail: true },
					)
					.then((job) =>
						console.log(`Added Twitter task to queue with jobId: ${jobId}`),
					)
					.catch((err) =>
						console.error("Error adding Twitter task to queue:", err),
					);
			}
		}
	} else if (task.earnType === "telegram") {
		const telegramChannel = task.telegram.inviteLink?.split("/").pop();
		if (!telegramChannel) {
			const error = {
				code: 500,
				message: "Telegram channel was either not found or saved.",
			};
			return { error };
		}
		const telegramId = user.socials?.telegram?.id;
		if (!telegramId) {
			validationResponse.linkedTelegram = false;
			validationResponse.joinTelegram = false;
			validationResponse.isValid = false;
		} else {
			const botInChannel =
				await isBotInTelegramChannelFunction(telegramChannel);
			if (!botInChannel) {
				const error = {
					code: 400,
					message: `Naffles bot not on tg channel: ${telegramChannel}, contact community admin`,
				};
				return { error };
			}

			const userInChannel = await isUserInTelegramChannel(
				telegramChannel,
				telegramId,
			);
			const joined = userInChannel ? true : false;
			if (!joined) {
				validationResponse.joinTelegram = false;
				validationResponse.isValid = false;
			} else {
				await checkAndChangeTaskStatus(
					null, // session
					task,
					user,
					"telegram",
					{ telegram: { joined } },
					"completed",
				);
			}
		}
	}
}
