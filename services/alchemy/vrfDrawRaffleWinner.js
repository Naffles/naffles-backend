const mongoose = require("mongoose");
const cron = require("node-cron");
const Raffle = require("../../models/raffle/raffle");
const { redlock } = require("../../config/redisClient");
const raffleService = require("../raffleService");
const {
	WEB3_VRF,
	VRF_CONTRACT_ABI,
	VRF_CONTRACT_ADDRESS,
	VRF_WALLET,
} = require("../../config/vrf");

const prepareRaffle = async () => {
	try {
		await redlock.acquire(["checking-for-soldout-raffles"], 28 * 1000);
		const soldoutRaffles = await Raffle.find({
			raffleTypeEnum: { $ne: "UNLIMITED" },
			"status.isActive": true,
			ticketsAvailable: 0,
		});

		if (soldoutRaffles?.length > 0) {
			for (const raffle of soldoutRaffles) {
				const session = await mongoose.startSession();
				session.startTransaction();
				try {
					await raffleService.drawRaffleWinner(raffle, { session });

					await session.commitTransaction();
				} catch (err) {
					await session.abortTransaction();
					console.error("Error preparing raffle:", err);
				} finally {
					session.endSession();
				}
			}
		}
	} catch (err) {
		console.error("Error encountered during prepareRaffle function:", err);
	}
};

const getRandomNumberInVrfContract = async () => {
	try {
		await redlock.acquire(["getting-random-number-in-vrf-contract"], 28 * 1000); // 28 seconds
		const contract = new WEB3_VRF.eth.Contract(
			VRF_CONTRACT_ABI,
			VRF_CONTRACT_ADDRESS,
		);

		// Fetch raffles and populate rafflePrize and clientProfile (if community raffle)
		const raffles = await Raffle.find({
			"vrf.status": "Fulfilled",
			"status.isActive": true
		})
			.populate("rafflePrize")
			.populate({
				path: "clientProfileRef",
				select: "_id name pointSystem",
			})
			.lean();
		// for loop here, get the raffles.eventId, make it naffleId variable.
		for (const raffle of raffles) {
			const naffleId = raffle.eventId;
			const chainLinkId = await contract.methods
				.naffleIdToChainlinkRequestId(naffleId)
				.call();
			const { randomNumber, fulfilled } = await contract.methods
				.chainlinkRequestStatus(chainLinkId)
				.call();
			const winningTicketNumber = randomNumber.toString();
			if (!fulfilled) continue;

			const session = await mongoose.startSession();
			session.startTransaction();
			// edit starts here
			try {
				await raffleService.fulfillRaffleDraw(
					session,
					raffle,
					winningTicketNumber,
				);
				await session.commitTransaction();
			} catch (err) {
				await session.abortTransaction();
				console.log("Error fulfilling raffle draw", err);
			} finally {
				session.endSession();
			}
		}
	} catch (err) {
		// throw new Error(`Error fetching vrf result: ${err.message}`);
	}
};

const checkForSoldOutRaffles = async () => {
	const cronJob = async () => {
		await prepareRaffle();
	};

	await cronJob();

	cron.schedule("*/30 * * * * *", cronJob);
};

const drawRaffleWinners = async () => {
	const cronJob = async () => {
		await getRandomNumberInVrfContract();
	};

	// Immediate execution at runtime with lock
	await cronJob();
	// Schedule the task to run every 30 seconds
	cron.schedule("*/30 * * * * *", cronJob);
};

module.exports = { checkForSoldOutRaffles, drawRaffleWinners };
