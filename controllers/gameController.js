const User = require("../models/user/user");
const sendResponse = require("../utils/responseHandler");
const ActiveGame = require("../models/game/activeGame");
const GameHistory = require("../models/game/gameHistory");
const { calculateChallengerBuyInAmount, isUserHasEnoughBalance } = require("../services/socket/helpers");
const { convertToBigInt, convertToNum, convertToUsd } = require("../utils/convert");
const { getAsync } = require("../config/redisClient");
const Message = require("../models/chat/message");
const { updateUserStats } = require("../utils/updateUserStats");
const { AdminSettings, PointsEarningActivitiesSettings } = require("../models/admin/adminSettings");
const { givePoints, pointsEarnedByActivity } = require("../services/pointsService");
const updateGameAnalytics = require("../utils/updateGameAnalytics");
const { getAllValidTickers } = require("../utils/helpers");

const vrfWrapper = require("../services/vrfWrapper");

const initializeDemoSession = (req) => {
  if (!req.session.demo) {
    req.session.demo = {
      score: 0,
      rockPaperScissorsTries: 0,
      coinTossTries: 0,
      maxAgeSet: false,
    };
  }
};

exports.demoGameRockPaperScissors = async (req, res) => {
  initializeDemoSession(req);
  const gameResult = await vrfWrapper.getRandomChoice(["win", "lose", "draw"]);

  if (req.user && req.user._id) {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        // If the user ID from the session doesn't correspond to any user in the database
        return sendResponse(res, 404, "User not found.");
      }

      // Earn points based on setting: perSystemGamePlayed
      await pointsEarnedByActivity(user._id, "perSystemGamePlayed");

      const pointsToAdd = await convertToBigInt("1");
      if (gameResult === "win") {
        const currentPoints = BigInt(user?.temporaryPoints || 0);
        const totalPoints = pointsToAdd + currentPoints;
        user.temporaryPoints = totalPoints.toString();

        // Earn points based on setting: perGameWin
        await pointsEarnedByActivity(user._id, "perGameWin");
      }
      var demoScore = req.session.demo.score;
      if (demoScore > 0) {
        const pointsToAdd = await convertToBigInt(demoScore.toString());
        const currentPoints = BigInt(user?.temporaryPoints || 0);
        const totalPoints = pointsToAdd + currentPoints;
        user.temporaryPoints = totalPoints.toString();
        req.session.demo.score = 0; // Reset session score after applying to the user's profile
      }

      // Update UserStats
      let winnerId = null, loserId = null;
      if (gameResult === "win")
        winnerId = user._id;
      else
        loserId = user._id;
      await updateUserStats(winnerId, loserId, { coinType: "points" })

      // Update Game Analytics
      await updateGameAnalytics("rockPaperScissorsGames");

      await user.save();
      return sendResponse(
        res,
        200,
        `Game result: ${gameResult}. Unlimited plays for logged-in users.`,
        {
          result: gameResult,
          score: await convertToNum(user.temporaryPoints), // Show the updated score
        }
      );
    } catch (error) {
      console.error("Error updating user's score:", error);
      return sendResponse(
        res,
        500,
        "An error occurred while updating the score."
      );
    }
  } else {
    // For non-logged-in users: enforce tries limit
    if (!req.session.demo.maxAgeSet) {
      req.session.cookie.maxAge = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
      req.session.demo.maxAgeSet = true;
    }

    if (req.session.demo.rockPaperScissorsTries >= 10) {
      return sendResponse(
        res,
        429,
        "Demo limit for Rock-Paper-Scissors reached. Try our other games or register/login to continue playing."
      );
    }

    req.session.demo.rockPaperScissorsTries += 1;
    if (gameResult === "win") {
      req.session.demo.score += 1; // Only increase score on win
    }

    return sendResponse(res, 200, `Game result: ${gameResult}`, {
      triesLeft: 10 - req.session.demo.rockPaperScissorsTries,
      score: req.session.demo.score,
      result: gameResult,
    });
  }
};

exports.demoGameCoinToss = async (req, res) => {
  initializeDemoSession(req);
  const gameResult = await vrfWrapper.getRandomChoice(["win", "lose"]);
  if (req.user && req.user._id) {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        return sendResponse(res, 404, "User not found.");
      }

      // Earn points based on setting: perSystemGamePlayed
      await pointsEarnedByActivity(user._id, "perSystemGamePlayed");

      const pointsToAdd = await convertToBigInt("1");
      if (gameResult === "win") {
        const currentPoints = BigInt(user?.temporaryPoints || 0);
        const totalPoints = pointsToAdd + currentPoints;
        user.temporaryPoints = totalPoints.toString();

        // Earn points based on setting: perGameWin
        await pointsEarnedByActivity(user._id, "perGameWin");
      }
      var demoScore = req.session.demo.score;
      if (demoScore > 0) {
        const pointsToAdd = await convertToBigInt(demoScore.toString());
        const currentPoints = BigInt(user?.temporaryPoints || 0);
        const totalPoints = pointsToAdd + currentPoints;
        user.temporaryPoints = totalPoints.toString();
        req.session.demo.score = 0; // Reset session score after applying to the user's profile
      }

      // Update UserStats
      let winnerId = null, loserId = null;
      if (gameResult === "win")
        winnerId = user._id;
      else
        loserId = user._id;
      await updateUserStats(winnerId, loserId, { coinType: "points" })

      // Update Game Analytics
      await updateGameAnalytics("coinTossGames");

      await user.save();
      return sendResponse(
        res,
        200,
        `Game result: ${gameResult}. Unlimited plays for logged-in users.`,
        {
          result: gameResult,
          score: await convertToNum(user.temporaryPoints),
        }
      );
    } catch (error) {
      console.error("Error updating user's score:", error);
      return sendResponse(
        res,
        500,
        "An error occurred while updating the score."
      );
    }
  } else {
    // For non-logged-in users: enforce tries limit and manage score in session
    if (!req.session.demo.maxAgeSet) {
      req.session.cookie.maxAge = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
      req.session.demo.maxAgeSet = true;
    }

    if (req.session.demo.coinTossTries >= 10) {
      return sendResponse(
        res,
        429,
        "Demo limit for Coin Toss reached. Try our other games or register/login to continue playing."
      );
    }

    req.session.demo.coinTossTries += 1;
    if (gameResult === "win") {
      req.session.demo.score += 1; // Update the score for win
    }

    return sendResponse(res, 200, `Game result: ${gameResult}`, {
      triesLeft: 10 - req.session.demo.coinTossTries,
      score: req.session.demo.score,
      result: gameResult,
    });
  }
};

exports.createGame = async (req, res) => {
  try {
    const { gameType, coinType, betAmount, odds } = req.body;
    const tokenType = coinType.toLowerCase();

    // Check for existing games that are in "waiting" or "inProgress" status where the user is the creator or challenger
    const pendingGamesCount = await ActiveGame.countDocuments({
      $or: [{ creator: req.user._id }, { challenger: req.user._id }],
    });

    if (pendingGamesCount > 0) {
      // User already has a pending game
      return sendResponse(
        res,
        400,
        "You already have an active or pending game. Please complete it before creating a new one."
      );
    }

    // Validate tokenType
    const validCoinTypes = await getAllValidTickers();
    if (!validCoinTypes.includes(tokenType)) {
      return sendResponse(res, 400, "Invalid token type");
    }

    const balanceEnough = await isUserHasEnoughBalance(req.user._id, tokenType, betAmount);
    if (!balanceEnough) {
      console.error("User does not have enough balance");
      return sendResponse(res, 400, "User does not have enough balance");
    }

    const challengerBuyInAmount = calculateChallengerBuyInAmount(odds, betAmount);
    const payout = BigInt(betAmount.toString()) + challengerBuyInAmount;
    const betAmountForFilter = await convertToNum(betAmount.toString(), tokenType);

    const newGame = new ActiveGame({
      creator: req.user._id,
      gameType,
      coinType: tokenType,
      betAmount,
      odds,
      payout: payout.toString(),
      challengerBuyInAmount: challengerBuyInAmount.toString(),
      betAmountForFilter,
      status: "waiting", // Initial status
    });

    await newGame.save();
    // Respond to the client with the newly created game details
    return sendResponse(res, 201, "Game created successfully", {
      game: newGame,
    });
  } catch (error) {
    console.error("Error creating the game:", error);
    return sendResponse(res, 500, "Error creating the game", {
      error: error.message,
    });
  }
};

exports.listGames = async (req, res) => {
  try {
    const { page = 1, gameType, minBet, maxBet, coinType } = req.query;
    const user = req.user;
    // Extract the limit from the query parameters and convert it to an integer
    let limit = parseInt(req.query.limit || "10", 10);
    // Ensure the limit is positive, if not, default to 10, and also ensure it does not exceed 10
    limit = limit > 0 ? Math.min(limit, 10) : 10;
    // Building the query for filtering
    let queryFilters = {
      status: "waiting",
      ...(gameType && gameType != "all" && { gameType }),
      ...(coinType && coinType != "all" && { coinType }),
      // ...(odds && { odds }),
      ...(minBet &&
        maxBet && {
        betAmountForFilter: {
          $gte: minBet,
          $lte: maxBet,
        },
      }),
    };

    if (gameType != "rockPaperScissors" && gameType != "coinToss") {
      delete queryFilters.gameType;
    }

    let userGame = null;
    if (user && page == 1) {
      userGame = await ActiveGame.findOne({
        creator: req.user._id,
        ...queryFilters,
      })
        .populate("creator", "username profileImage _id")
        .sort({ createdAt: -1 })
        .exec();
    }

    const otherGames = await ActiveGame.find({
      creator: { $ne: user ? req.user._id : null },
      ...queryFilters,
    })
      .populate("creator", "username profileImage _id")
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    // Combine the user's game with other games, if it exists
    const combinedGames = userGame ? [userGame, ...otherGames] : otherGames;
    // Count total games excluding user's own games for pagination
    const count = await ActiveGame.countDocuments({
      ...queryFilters,
    });

    return sendResponse(res, 200, "Success", {
      games: combinedGames,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      totalGames: count,
    });
  } catch (error) {
    console.error("Error retrieving games:", error);
    return sendResponse(res, 500, "Error retrieving games", {
      error: error.message,
    });
  }
};

exports.getHighestBetAmount = async (req, res) => {
  try {
    const { gameType, coinType } = req.query;

    // Create filter based on query parameters
    let filter = {
      status: "waiting",
      ...(gameType && { gameType }),
      ...(coinType && { coinType })
    };

    // Find the game with the highest betAmountForFilter
    const game = await ActiveGame.findOne(filter).sort({ betAmountForFilter: -1 });

    // If no game is found, return a bet amount of 10
    if (!game) {
      return sendResponse(res, 200, "No active game found. Default bet amount returned.", {
        betAmount: 10,
      });
    }

    // Return the game with the highest betAmountForFilter
    return sendResponse(res, 200, "Highest bet amount retrieved successfully.", {
      betAmount: game.betAmountForFilter,
      game,
    });
  } catch (error) {
    console.error("Error getHighestBetAmount:", error);
    return sendResponse(res, 500, "Error retrieving highest bet amount", {
      error: error.message,
    });
  }
};

exports.deleteGame = async (req, res) => {
  const { gameId } = req.params; // Assuming gameId is passed as a URL parameter

  try {
    // First, find the game by ID and ensure the requester is the creator
    const game = await ActiveGame.findOne({
      _id: gameId,
      creator: req.user._id, // Ensure only the creator can delete
      status: "waiting", // Additional check to ensure game is deletable
    });

    if (!game) {
      return sendResponse(
        res,
        404,
        "Game not found or not eligible for deletion."
      );
    }

    // Delete the game
    await ActiveGame.deleteOne({ _id: gameId });

    // Delete the message
    const message = await Message.findOne({ game: gameId });
    if (message) {
      await message.remove();
    }

    return sendResponse(res, 200, "Game deleted successfully");
  } catch (error) {
    console.error("Error deleting the game:", error);
    return sendResponse(res, 500, "Error deleting the game", {
      error: error.message,
    });
  }
};

exports.getUserPendingGame = async (req, res) => {
  try {
    // Fetch the first game where the user is either the creator or challenger and the game is not cancelled or completed
    const pendingGame = await ActiveGame.findOne({
      $or: [{ creator: req.user._id }, { challenger: req.user._id }],
    }).exec();

    if (!pendingGame) {
      return sendResponse(res, 404, "No pending game found.");
    }

    return sendResponse(res, 200, "Pending game retrieved successfully", {
      gameId: pendingGame._id,
    });
  } catch (error) {
    console.error("Error retrieving user's pending game:", error);
    return sendResponse(res, 500, "Error retrieving the pending game", {
      error: error.message,
    });
  }
};

exports.getGameHistory = async (req, res) => {
  try {
    const games = await GameHistory.find({
      // coinType: { $ne: "points" }
    })
      .sort({ createdAt: -1 })
      .populate("creator", "username _id")
      .populate("challenger", "username _id")
      .populate("winner", "username _id")
      .limit(10)
      .exec();

    const gameData = await Promise.all(games.map(async (game) => {
      const payout = game.payout;
      const payoutConverted = await convertToUsd(payout, game.coinType);
      return {
        game: game,
        payoutConverted: payoutConverted.toString()
      }
    }));
    return sendResponse(res, 200, "success", { gameData });
  } catch (error) {
    console.error("Error retrieving game history:", error);
    return sendResponse(res, 500, "Error retrieving game history", {
      error: error.message,
    });
  }
}