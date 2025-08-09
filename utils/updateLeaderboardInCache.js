const UserStats = require("../models/analytics/userStats");
const { setAsync } = require("../config/redisClient");

async function fetchTopNafflers(page, limit) {
	limit = parseInt(limit || "10", 10);
	const skip = (page - 1) * limit;

	return await UserStats.find({})
		.sort({ rafflesEntered: -1 })
		.skip(skip)
		.limit(limit)
		.populate({
			path: "user",
			select: "username profileImage temporaryPoints temporaryPointsAsNumber",
			options: { lean: true },
		})
		.lean();
}

async function fetchTopGamers(page, limit) {
	limit = parseInt(limit || "10", 10);
	const skip = (page - 1) * limit;

	return await UserStats.find({})
		.sort({ temporaryPointsAsNumber: -1 })
		.skip(skip)
		.limit(limit, 10)
		.populate({
			path: "user",
			select:
				"_id username profileImage temporaryPoints temporaryPointsAsNumber",
			options: { lean: true },
		})
		.lean();
}

// Format the leaderboard for caching
function formatLeaderboard(type, userStats) {
	let leaderboard;

	if (type === "topNafflersLeaderboard") {
		userStats.sort((a, b) => {
			if (a.rafflesEntered === b.rafflesEntered) {
				return b.user.temporaryPointsAsNumber - a.user.temporaryPointsAsNumber;
			}
			return b.rafflesEntered - a.rafflesEntered;
		});
		leaderboard = userStats.map((stat, index) => ({
			rank: index + 1,
			user: stat.user,
			rafflesEntered: stat.rafflesEntered,
			gamesPlayed: stat.gamesPlayed,
			nafflings: stat.user.temporaryPoints,
		}));
	}
	if (type === "topGamersLeaderboard") {
		userStats.sort(
			(a, b) => b.user.temporaryPointsAsNumber - a.user.temporaryPointsAsNumber,
		);
		leaderboard = userStats.map((stat, index) => ({
			rank: index + 1,
			user: stat.user,
			gamesPlayed: stat.gamesPlayed,
			gamesWon: stat.gamesWon,
			totalWinnings: stat.totalWinnings,
			totalWinningsAsString: stat.totalWinningsAsString,
			nafflings: stat.user.temporaryPoints,
		}));
	}
	return leaderboard;
}

async function updateLeaderboardType(type, paginate, leaderboard) {
	const { page, limit, totalCount } = paginate;
	const totalPages = Math.ceil(totalCount / limit);
	const cachedData = {
		totalPages,
		totalCount,
		currentPage: page,
		leaderboard,
	};
	await setAsync(`${type}:page:${page}`, JSON.stringify(cachedData));
}

// Main function to update the top gamers leaderboard
async function updateLeaderboardInCache(page = 1, limit = 100) {
	try {
		const leaderBoardTypes = ["topNafflersLeaderboard", "topGamersLeaderboard"];

		const totalCount = await UserStats.countDocuments({});

		const paginate = {
			page,
			limit,
			totalCount,
		};

		// Update Top Nafflers
		const topNafflers = await fetchTopNafflers(page, limit);
		let leaderboard = formatLeaderboard("topNafflersLeaderboard", topNafflers);
		await updateLeaderboardType(
			"topNafflersLeaderboard",
			paginate,
			leaderboard,
		);

		// Update Top Gamers
		const topGamers = await fetchTopGamers(page, limit);
		leaderboard = formatLeaderboard("topGamersLeaderboard", topGamers);
		await updateLeaderboardType("topGamersLeaderboard", paginate, leaderboard);
	} catch (error) {
		console.error("Error updating leaderboard in cache:", error);
	}
}

module.exports = {
	fetchTopNafflers,
	fetchTopGamers,
	formatLeaderboard,
	updateLeaderboardInCache,
};
