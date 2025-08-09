const mongoose = require("mongoose");
const User = require("../../models/user/user");
const GameHistory = require("../../models/game/gameHistory");
const { GENERAL_REDIS_TIMEOUT } = require("../../config/config");
const { getAsync, setAsync, delAsync } = require("../../config/redisClient");
const { calculateChallengerBuyInAmount } = require("./helpers");
const { updateUserStats } = require("../../utils/updateUserStats");
const WalletBalance = require("../../models/user/walletBalance");
const createWalletBalance = require("../../utils/createWalletBalance");
const { updateJackpot } = require("../jackpotAccumulation");
const { POINTS_GAME_COMPLETED, TOKEN_GAME_COMPLETED } = require("../../utils/constants/JackpotAccumulationConstants");
const { pointsEarnedByActivity } = require("../pointsService");
const { convertToUsd } = require("../../utils/convert");
const updateGameAnalytics = require("../../utils/updateGameAnalytics");
const { calculateAndSaveGameFee } = require("../../utils/fee");

function determineWinner(creatorChoice, challengerChoice) {
  const outcomes = {
    rock: { scissors: "win", paper: "lose", rock: "draw" },
    paper: { rock: "win", scissors: "lose", paper: "draw" },
    scissors: { paper: "win", rock: "lose", scissors: "draw" },
  };

  if (outcomes[creatorChoice][challengerChoice] === "win") {
    return { winner: "creator", loser: "challenger" };
  } else if (outcomes[creatorChoice][challengerChoice] === "lose") {
    return { winner: "challenger", loser: "creator" };
  } else {
    return { winner: "draw" }; // Handle draw scenario
  }
};

// rps
async function evaluateGameResults(io, socket, game, originalTimeout) {
  console.log("game started");
  const creatorChoice = (await getAsync(`game:${game._id}:choice:${game.creator.toString()}`)) || "paper";
  const challengerChoice = (await getAsync(`game:${game._id}:choice:${game.challenger.toString()}`)) || "rock";
  const result = determineWinner(creatorChoice, challengerChoice);
  const roomName = `gameRoom:${game._id}`;
  const coinType = game.coinType.toLowerCase();
  if (result.winner !== "draw") {
    // deduct balances
    // Fetch winner and loser User models
    const winner = await User.findById(result.winner === "creator" ? game.creator : game.challenger);
    const loser = await User.findById(result.winner === "creator" ? game.challenger : game.creator);
    var systemFee;
    // Update balances
    if (winner && coinType == 'points') {
      const target = "temporaryPoints";
      const gamePayout = BigInt(game.payout.toString());
      const currentBalance = BigInt(winner[target].toString());
      winner[target] = (currentBalance + gamePayout).toString();
      await winner.save();
    } else if (winner) {
      var winnerBalances = await WalletBalance.findOne({
        userRef: mongoose.Types.ObjectId(winner._id)
      });
      if (!winnerBalances) {
        winnerBalances = await createWalletBalance(winner._id);
      }
      const winnerCurrentBalance = BigInt(winnerBalances?.balances?.get(coinType) || 0);
      const { netAmount, totalFee } = await calculateAndSaveGameFee(coinType, game.payout.toString());
      systemFee = totalFee;
      const winnerTotalBalance = winnerCurrentBalance + BigInt(netAmount);
      winnerBalances.balances.set(coinType, winnerTotalBalance.toString());
      await winnerBalances.save()
    }
    // Earn points based on setting: perGameWin
    await pointsEarnedByActivity(winner._id, "perGameWin");
    const historyData = {
      creator: game.creator,
      challenger: game.challenger,
      gameType: game.gameType,
      coinType: game.coinType.toLowerCase(),
      betAmount: game.betAmount.toString(),
      odds: game.odds.toString(),
      winner: winner._id,
      payout: game.payout.toString(),
    }
    if (systemFee) historyData.systemFee = systemFee;

    // Save the game result to GameHistory
    const history = new GameHistory(historyData);
    await history.save();

    // Update UserStats for both winner and loser
    await updateUserStats(winner._id, loser._id, game);

    // Update Game Analytics
    await updateGameAnalytics("rockPaperScissorsGames");

    // Update jackpot based on coinType
    await updateJackpot(coinType === "points" ? POINTS_GAME_COMPLETED : TOKEN_GAME_COMPLETED);

    game.status = "awaitingRematch";
    game.draw = false;
    await game.save();

    io.in(roomName).emit("gameResult", {
      message: `Game has concluded.`,
      winner: winner._id,
      loser: loser._id,
      creatorChoice,
      challengerChoice,
    });

    // Clear Redis keys
    await delAsync(`game:${game._id}:choice:${game.creator.toString()}`);
    await delAsync(`game:${game._id}:choice:${game.challenger.toString()}`);
    await delAsync(`gameDrawTimeout:${game._id}:creator:${game.creator.toString()}:challenger:${game.challenger.toString()}`);
    await delAsync(`rematchRequested:${game._id}`);
    // adjust room time so that no users can join
    // they can chat and chill
    await setAsync(`joinRequestIsRoomOccupied:${game._id}`, true, "EX", GENERAL_REDIS_TIMEOUT);
    console.log("game ended");
  } else {
    io.in(roomName).emit("gameResult", {
      message: `Game has concluded.`,
      winner: "NA",
      loser: "NA",
      creatorChoice,
      challengerChoice,
    });

    // Handle draw by scheduling another evaluation with reduced timeout
    const gameTimeout = Math.max(3, originalTimeout - 1); // Ensures timeout doesn't go below 3 seconds
    game.draw = true;
    game.status = "awaitingRematch";
    await game.save();

    await setAsync(
      `gameDrawTimeout:${game._id
      }:creator:${game.creator.toString()}:challenger:${game.challenger.toString()}`,
      gameTimeout,
      "EX",
      GENERAL_REDIS_TIMEOUT
    );
    const rematchKey = `rematchRequested:${game._id}`;
    await delAsync(rematchKey)
    console.log("game ended draw");
  }
  // Earned points via activity: perPlayerGamePlayed
  // Creator
  await pointsEarnedByActivity(game.creator, "perPlayerGamePlayed");
  // Challenger
  await pointsEarnedByActivity(game.challenger, "perPlayerGamePlayed");

  if (coinType === "points") {
    // Earn points based on setting: perNaffBetAmount
    await pointsEarnedByActivity(game.creator, "perNaffBetAmount");
    await pointsEarnedByActivity(game.challenger, "perNaffBetAmount");
  } else {
    // Check if bet amount is >= $10
    const totalPayout = game.payout;
    console.log("totalPayout:", totalPayout);
    if (convertToUsd(totalPayout, coinType)) {
      // Earn points based on setting: perUsd10BetAmount
      await pointsEarnedByActivity(game.creator, "perUsd10BetAmount");
      await pointsEarnedByActivity(game.challenger, "perUsd10BetAmount");
    }
  }
}

function getRandomChoiceRPS() {
  const choices = ["rock", "paper", "scissors"];
  return choices[Math.floor(Math.random() * choices.length)];
}

async function initializeGameChoices(gameId, creatorId, challengerId, timeout) {
  const creatorInitialChoice = getRandomChoiceRPS();
  const challengerInitialChoice = getRandomChoiceRPS();

  // Set initial choices in Redis with a timeout
  await setAsync(`game:${gameId}:choice:${creatorId}`, creatorInitialChoice, "EX", 2 * timeout);
  await setAsync(`game:${gameId}:choice:${challengerId}`, challengerInitialChoice, "EX", 2 * timeout);

  return {
    creatorChoice: creatorInitialChoice,
    challengerChoice: challengerInitialChoice,
  };
}

function getRandomChoiceRPS() {
  const choices = ["rock", "paper", "scissors"];
  return choices[Math.floor(Math.random() * choices.length)];
}

function coinFlipGame(userChoice, userId, game) {
  // Randomize the coin flip (0 or 1)
  const validChoices = ["heads", "tails"];
  const randomIndex = Math.floor(Math.random() * 2);
  const coinResult = validChoices[randomIndex];

  // Determine if the user won
  const didUserWin = userChoice === coinResult;

  // Determine the winner based on the coin flip
  const winnerId = didUserWin
    ? userId
    : userId === game.creator.toString()
      ? game.challenger?.toString()
      : game.creator.toString();

  // Log the result for clarity
  console.log(`The coin landed on: ${coinResult}`);
  console.log(
    didUserWin
      ? `Congratulations! The winner is ${winnerId}.`
      : `Sorry, ${winnerId} won instead.`
  );

  // Return the userId of the winner
  return { gameWinner: winnerId, winnerChoice: coinResult };
}

async function evaluateCoinTossGameResults(io, choice, userId, game) {
  const { gameWinner, winnerChoice } = coinFlipGame(choice, userId, game);
  console.log("winner: ", gameWinner);

  // const creatorRoom = `user:${game.creator.toString()}`;
  // const challengerRoom = `user:${game.challenger?.toString()}`;
  // const userRole = userId == game.creator.toString() ? creatorRoom : challengerRoom;
  // const otherUser = userRole == creatorRoom ? challengerRoom : creatorRoom;

  const socketData = {
    message: `Game has concluded.`,
    winner: gameWinner,
    winnerChoice
  }

  const roomName = `gameRoom:${game._id}`;
  io.in(roomName).emit("gameResult", socketData)

  // socket.to(creatorRoom).emit("gameResult", socketData);
  // socket.to(challengerRoom).emit("gameResult", socketData)

  const winner = await User.findById(gameWinner);
  const coinType = game.coinType.toLowerCase();
  var systemFee;
  // Update balances
  if (winner && coinType == 'points') {
    const target = "temporaryPoints";
    const gamePayout = BigInt(game.payout.toString());
    const currentBalance = BigInt(winner[target].toString());
    winner[target] = (currentBalance + gamePayout).toString();
    await winner.save();
  } else if (winner) {
    var winnerBalances = await WalletBalance.findOne({
      userRef: mongoose.Types.ObjectId(winner._id)
    });
    if (!winnerBalances) {
      winnerBalances = await createWalletBalance(winner._id);
    }
    const winnerCurrentBalance = BigInt(winnerBalances?.balances?.get(coinType) || 0);
    const { netAmount, totalFee } = await calculateAndSaveGameFee(coinType, game.payout.toString());
    systemFee = totalFee;
    const winnerTotalBalance = winnerCurrentBalance + BigInt(netAmount);
    winnerBalances.balances.set(coinType, winnerTotalBalance.toString());
    await winnerBalances.save();
  }
  const rematchKey = `rematchRequested:${game._id}`;
  await delAsync(rematchKey);

  // Earn points based on setting: perGameWin
  await pointsEarnedByActivity(winner._id, "perGameWin");
  const historyData = {
    creator: game.creator,
    challenger: game.challenger,
    gameType: game.gameType,
    coinType: game.coinType.toLowerCase(),
    betAmount: game.betAmount.toString(),
    odds: game.odds.toString(),
    winner: winner._id,
    payout: game.payout.toString()
  }
  if (systemFee) historyData.systemFee = systemFee;

  // Save the game result to GameHistory
  const history = new GameHistory(historyData);
  await history.save();

  // Determine loser
  const loserId = game.creator.toString() === gameWinner ? game.challenger : game.creator;

  // Update UserStats for both winner and loser
  await updateUserStats(winner._id, loserId, game);

  // Update Game Analytics
  await updateGameAnalytics("coinTossGames");

  // Update jackpot based on coinType
  await updateJackpot(coinType === "points" ? POINTS_GAME_COMPLETED : TOKEN_GAME_COMPLETED);

  await setAsync(`joinRequestIsRoomOccupied:${game._id}`, true, "EX", GENERAL_REDIS_TIMEOUT);
  game.status = "awaitingRematch";
  await game.save();

  // Earned points via activity: perPlayerGamePlayed
  // Creator
  await pointsEarnedByActivity(game.creator, "perPlayerGamePlayed");
  // Challenger
  await pointsEarnedByActivity(game.challenger, "perPlayerGamePlayed");

  if (coinType === "points") {
    // Earn points based on setting: perNaffBetAmount
    await pointsEarnedByActivity(game.creator, "perNaffBetAmount");
    await pointsEarnedByActivity(game.challenger, "perNaffBetAmount");
  } else {
    // Check if bet amount is >= $10
    const totalPayout = game.payout;
    console.log("totalPayout:", totalPayout);
    if (convertToUsd(totalPayout, coinType) >= 10.0) {
      // Earn points based on setting: perUsd10BetAmount
      await pointsEarnedByActivity(game.creator, "perUsd10BetAmount");
      await pointsEarnedByActivity(game.challenger, "perUsd10BetAmount");
    }
  }
}

module.exports = {
  evaluateGameResults,
  initializeGameChoices,
  coinFlipGame,
  evaluateCoinTossGameResults
}

