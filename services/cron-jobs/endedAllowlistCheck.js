const mongoose = require("mongoose");
const cron = require("node-cron");
const { redlock } = require("../../config/redisClient");
const Allowlist = require("../../models/client/allowlist/allowlist");
const clientService = require("../clientService");
const AllowlistTicket = require("../../models/client/allowlist/allowlistTicket");
const { VRF_CONTRACT_ADDRESS, VRF_NETWORK_API_KEY, VRF_MANAGER_PRIVATE_KEY } =
	process.env;
const { Web3 } = require("web3");
const { generateUniqueRandomNumbers } = require("../../utils/random");
const { VRF_CONTRACT_ABI } = require("../../config/vrf");
const web3 = new Web3(VRF_NETWORK_API_KEY);
const contract = new web3.eth.Contract(VRF_CONTRACT_ABI, VRF_CONTRACT_ADDRESS);

async function checkAndUpdateAllowlistStatus() {
	try {
		await redlock.acquire(["checking-for-ended-allowlists"], 28 * 1000); // 28 seconds
		const endedAllowlists = await Allowlist.find({
			endTime: { $lt: new Date() },
			status: "live",
		});

		if (endedAllowlists?.length > 0) {
			// Run code here
			for (const allowlist of endedAllowlists) {
				const session = await mongoose.startSession();
				session.startTransaction();
				try {
					const numberOfEntries = await AllowlistTicket.countDocuments({
						allowlistRef: allowlist._id,
					});

					if (
						allowlist.winnerCount > 0 &&
						numberOfEntries > allowlist.winnerCount
					) {
						if (allowlist.vrf.status !== "Pending") {
							throw new Error("Cannot draw winner multiple times.");
						}
						await clientService.prepareAllowlist(session, allowlist);
					} else {
						if (numberOfEntries > 0) {
							await clientService.concludeAllowlist(session, allowlist);
						} else {
							console.error(
								`No entries for this allowlist (eventId: ${allowlist.eventId}), cancelling...`,
							);
							await clientService.cancelAllowlist(session, allowlist);
						}
					}
					await session.commitTransaction();
				} catch (err) {
					await session.abortTransaction();
					console.error("Error preparing allowlist:", err);
				} finally {
					session.endSession();
				}
			}
		}
	} catch (err) {
		console.error("Error running checkAndUpdateAllowlistStatus:", err);
		// throw new Error();
	}
}

async function handleAllowlistWinnerDraw() {
	try {
		await redlock.acquire(["getting-random-words-in-vrf-contract"], 28 * 1000); // 28 seconds

		const allowlists = await Allowlist.find({ "vrf.status": "In Progress" });

		if (allowlists?.length > 0) {
			for (const allowlist of allowlists) {
				// Fetch number of entries first
				const numberOfEntries = await AllowlistTicket.countDocuments({
					allowlistRef: allowlist._id,
				});

				const naffleId = allowlist.eventId;
				const chainLinkId = await contract.methods
					.naffleIdToChainlinkRequestId(naffleId)
					.call();
				const { randomWords, fulfilled } = await contract.methods
					.chainlinkRequestStatus(chainLinkId)
					.call();
				if (!fulfilled) continue;

				const winningTicketNumbers = generateUniqueRandomNumbers(
					randomWords,
					allowlist.winnerCount,
					1,
					numberOfEntries,
				);

				if (winningTicketNumbers.length != allowlist.winnerCount) {
					console.error(
						`winningTicketNumbers=${winningTicketNumbers} and winnerCount=${allowlist.winnerCount} does not match`,
					);
					continue;
				}

				const session = await mongoose.startSession();
				session.startTransaction();
				try {
					await clientService.concludeAllowlist(
						session,
						allowlist,
						winningTicketNumbers,
					);
					await session.commitTransaction();
				} catch (err) {
					await session.abortTransaction();
					console.error("Error concluding allowlist:", err);
				} finally {
					session.endSession();
				}
			}
		}
	} catch (err) {
		console.error("Error running handleAllowlistWinnerDraw:", err);
		// throw new Error();
	}
}

exports.checkForEndedAllowlists = async () => {
	const cronJob = async () => {
		await checkAndUpdateAllowlistStatus();
	};

	await cronJob();

	// runs every 30 secs
	cron.schedule("*/30 * * * * *", cronJob);
};

exports.drawAllowlistWinners = async () => {
	const cronJob = async () => {
		await handleAllowlistWinnerDraw();
	};

	await cronJob();

	// runs every 30 secs
	cron.schedule("*/30 * * * * *", cronJob);
};
