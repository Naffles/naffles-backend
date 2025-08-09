const mongoose = require("mongoose");
const User = require("../../../models/user/user");
const ActiveGame = require("../../../models/game/activeGame");
const GameHistory = require("../../../models/game/gameHistory");
const { getAsync, setAsync, delAsync } = require("../../../config/redisClient");
const { authenticateSocket } = require("../authentication");
const { isUserHasEnoughBalance, calculateChallengerBuyInAmount, saveGlobalChatMessage, removeLastMessage } = require("../helpers");
const { GAME_TIMEOUT, COIN_TOSS_PLAYER_PICK_TIMEOUT, JOIN_REQUEST_TIMEOUT, GENERAL_REDIS_TIMEOUT } = require("../../../config/config");
const {
  evaluateGameResults,
  initializeGameChoices,
  coinFlipGame,
  evaluateCoinTossGameResults
} = require("../gameLogic");
const { updateUserStats } = require("../../../utils/updateUserStats");
const WalletBalance = require("../../../models/user/walletBalance");
const { getUserProfileImage } = require("../../../utils/image");
const GameAnalytics = require("../../../models/analytics/gameAnalytics");

function challengerJoinRequest(socket) {
  return async ({ gameId }) => {
    try {
      let userId = await authenticateSocket(socket);
      if (!userId) return;
      const game = await ActiveGame.findOne({
        _id: mongoose.Types.ObjectId(gameId),
        status: "waiting",
      });
      if (!game) {
        socket.emit("errorJoinRequest", "Game not found or not available");
        return;
      }
      // make sure that the `userId` has enough tokens
      const balanceEnough = await isUserHasEnoughBalance(userId, game.coinType.toLowerCase(), game.challengerBuyInAmount)
      if (!balanceEnough) {
        socket.emit("errorJoinRequest", "User does not have enough balance");
        return;
      }

      const isRoomOccupiedKey = `joinRequestIsRoomOccupied:${gameId}`;
      const isRoomOccupied = await getAsync(isRoomOccupiedKey);
      if (isRoomOccupied) {
        socket.emit("roomStatus", false);
        return;
      }

      // Set a Redis key for join request validity
      const joinRequestKey = `joinRequest:${gameId}:${userId}`;
      await setAsync(joinRequestKey, true, "EX", JOIN_REQUEST_TIMEOUT);
      await setAsync(isRoomOccupiedKey, true, "EX", JOIN_REQUEST_TIMEOUT);

      const creatorRoom = `user:${game.creator.toString()}`;
      // Notify the game creator that someone wants to join
      socket.to(creatorRoom).emit("gameJoinRequest", {
        game: game,
        message: `User wants to join your game.`,
        challengerId: userId,
      });
      socket.emit("roomStatus", true);
      console.log(
        `Notified creator of game ${gameId} about join request from user ${userId}`
      );
    } catch (error) {
      console.error("Error handling joinGame:", error);
      socket.emit("errorJoinRequest", "Error processing join game request.");
    }
  };
}

function challengerCancelJoinRequest(socket) {
  return async ({ gameId }) => {
    try {
      const userId = await authenticateSocket(socket);
      if (!userId) return;
      const game = await ActiveGame.findById(gameId);
      if (!game) {
        socket.emit("error", "Game not found.");
        return;
      }

      const joinRequestKey = `joinRequest:${gameId}:${userId}`;
      const isRoomOccupiedKey = `joinRequestIsRoomOccupied:${gameId}`;
      await delAsync(joinRequestKey);
      await delAsync(isRoomOccupiedKey);
      socket.emit("joinRequestCancelled", {
        message: "Join request cancelled successfully.",
        challenger: userId,
      });

      // Notify the game creator that the play cancelled join request
      const creatorRoom = `user:${game.creator.toString()}`;
      socket.to(creatorRoom).emit("joinRequestCancelled", {
        message: `Join request cancelled.`,
      });

      console.log(`Cancelled join request for game ${gameId} by user ${userId}`);
    } catch (error) {
      console.error("Error cancelling join request:", error);
      socket.emit("error", "Error cancelling join request.");
    }
  }
}

function creatorRejectJoinRequest(io, socket) {
  return async ({ gameId, challengerId }) => {
    try {
      const userId = await authenticateSocket(socket);
      if (!userId) return;
      const game = await ActiveGame.findById(gameId);
      if (!game) {
        console.error("game not found");
        socket.emit("error", "game not found");
        return;
      }
      if (userId !== game.creator.toString()) {
        console.error("Caller not the game creator");
        socket.emit("error", "Caller not the game creator");
        return;
      }

      const joinRequestKey = `joinRequest:${gameId}:${challengerId}`;
      const isRoomOccupiedKey = `joinRequestIsRoomOccupied:${gameId}`;
      await delAsync(joinRequestKey);
      await delAsync(isRoomOccupiedKey);

      // Retrieve challenger's socket ID to notify them directly
      const challengerSocketId = await getAsync(`userId:${challengerId}`);
      if (challengerSocketId) {
        io.to(challengerSocketId).emit("joinRequestRejected", {
          message: "Your join request has been rejected.",
          gameId: gameId,
        });
      }
      console.log(`Rejected join request for game ${gameId} by user ${challengerId}`);
    } catch (error) {
      console.error("Error rejecting join request:", error);
      socket.emit("error", "Error processing reject join request.");
    }
  }
}

function creatorAcceptJoinRequest(io, socket) {
  return async ({ gameId, challengerId }) => {
    try {
      console.log("Accepted join request: ", gameId, challengerId);

      const game = await ActiveGame.findOne({
        _id: mongoose.Types.ObjectId(gameId),
        status: "waiting",
      }); //
      if (!game) {
        socket.emit("error", "Game not found or not available");
        return;
      }

      // make sure that the `userId` has enough tokens
      const balanceEnough = await isUserHasEnoughBalance(challengerId, game.coinType.toLowerCase(), game.challengerBuyInAmount)
      if (!balanceEnough) {
        socket.emit("error", "User does not have enough balance");
        return;
      }
      console.log("challenger buy in amount: ", game.challengerBuyInAmount);
      const joinRequestKey = `joinRequest:${gameId}:${challengerId}`;
      const isValidRequest = await getAsync(joinRequestKey);
      if (!isValidRequest) {
        socket.emit("error", "Join request no longer valid or expired.");
        return;
      }

      const challengerSocketId = await getAsync(`userId:${challengerId}`);
      const creatorSocketId = await getAsync(`userId:${game.creator.toString()}`);

      // Check that the correct user (the creator) is accepting the join request
      if (game && creatorSocketId === socket.id && challengerSocketId) {
        // Update the game with the challenger ID and change status
        // deduct balances
        if (game.coinType.toLowerCase() == "points") {
          target = "temporaryPoints";
          const creator = await User.findById(game.creator);
          const challenger = await User.findById(challengerId);
          const creatorBalance = BigInt(creator[target].toString()) - BigInt(game.betAmount);
          creator[target] = creatorBalance.toString();
          await creator.save();

          const challengerBalance = BigInt(challenger[target].toString()) - BigInt(game.challengerBuyInAmount);
          challenger[target] = challengerBalance.toString();
          await challenger.save();
        } else {
          const creatorBalances = await WalletBalance.findOne({
            userRef: mongoose.Types.ObjectId(game.creator)
          });
          const coinType = game.coinType.toLowerCase();
          const creatorCurrentBalance = BigInt(creatorBalances?.balances?.get(coinType) || 0);
          const creatorTotalBalance = creatorCurrentBalance - BigInt(game.betAmount);
          creatorBalances.balances.set(coinType, creatorTotalBalance.toString());
          await creatorBalances.save();

          const challengerBalances = await WalletBalance.findOne({
            userRef: mongoose.Types.ObjectId(challengerId)
          });
          const challengerCurrentBalance = BigInt(challengerBalances?.balances?.get(coinType) || 0);
          const challengerTotalBalance = challengerCurrentBalance - BigInt(game.challengerBuyInAmount);
          challengerBalances.balances.set(coinType, challengerTotalBalance.toString());
          await challengerBalances.save();
        }

        const challengerRoom = `user:${challengerId}`;
        // socket.emit("realtimePoints", creatorBalance);
        // socket.to(challengerRoom).emit("realtimePoints", challengerBalance);

        socket.emit("updateTokenBalance", true);
        socket.to(challengerRoom).emit("updateTokenBalance", true);

        game.challenger = challengerId;
        game.status = "inProgress";
        await game.save();

        const roomName = `gameRoom:${gameId}`;
        socket.join(roomName); // Add the creator to the room
        io.to(challengerSocketId).socketsJoin(roomName); // Add the challenger to the room

        // add both to private chat room
        const privateChatRoom = `privateChatRoom:${gameId}`;
        socket.join(privateChatRoom);
        io.to(challengerSocketId).socketsJoin(privateChatRoom);

        if (game.gameType == "rockPaperScissors") {
          // Set initial choices in Redis with a timeout
          const gameTimeout = GAME_TIMEOUT; // seconds
          const { creatorChoice, challengerChoice } =
            await initializeGameChoices(
              gameId,
              game.creator.toString(),
              game.challenger.toString(),
              gameTimeout
            );

          const timeoutDate = new Date();
          timeoutDate.setSeconds(timeoutDate.getSeconds() + gameTimeout);

          const broadcastData = {
            message:
              "The game has started between creator and challenger. Chat is now enabled.",
            gameId: gameId,
            creator: game.creator.toString(),
            initialChoices: {
              creator: creatorChoice,
              challenger: challengerChoice,
            }
          }
          const challengerRoom = `user:${challengerId}`;
          socket.emit("gameStarted", broadcastData);
          socket.to(challengerRoom).emit("gameStarted", broadcastData);
          // io.in(roomName).emit("gameStarted", broadcastData)

          console.log("game started: ", creatorChoice, challengerChoice);

          // Emitting the remaining time every second
          let intervalId = setInterval(async () => {
            const currentTime = new Date();
            const timeLeft = Math.max(0, timeoutDate - currentTime);
            if (timeLeft <= 0) {
              clearInterval(intervalId);
              intervalId = null;
              await evaluateGameResults(io, socket, game, GAME_TIMEOUT);
            }
            // time left in seconds
            // io.in(roomName).emit("timerUpdate", { timeLeft: Math.ceil(timeLeft / 1000) });
            const timerLeft = { timeLeft: Math.ceil(timeLeft / 1000) }
            socket.to(challengerRoom).emit("timerUpdate", timerLeft)
            socket.emit("timerUpdate", timerLeft);

          }, 1000);
        } else {

          const challengerRoom = `user:${game.challenger?.toString()}`;
          socket.to(challengerRoom).emit("gameStarted", { gameId: gameId });
          socket.emit("gameStarted", { gameId: gameId });

          const timeoutDate = new Date();
          timeoutDate.setSeconds(timeoutDate.getSeconds() + COIN_TOSS_PLAYER_PICK_TIMEOUT);
          console.log("gameStarted CT code block");
          // Emitting the remaining time every second
          let intervalId = setInterval(async () => {
            const currentTime = new Date();
            const timeLeft = Math.max(0, timeoutDate - currentTime);
            if (timeLeft <= 0) {
              clearInterval(intervalId);
              intervalId = null;
            }

            socket.to(challengerRoom).emit("timerUpdate", { timeLeft: Math.ceil(timeLeft / 1000) });
            socket.emit("timerUpdate", { timeLeft: Math.ceil(timeLeft / 1000) });
          }, 1000);
        }
      } else {
        socket.emit("error", "Invalid game details or you do not have permission.");
      }
    } catch (error) {
      console.error("Error updating game status:", error);
      socket.emit("error", "Error processing join game request.");
    }
  }
}

function updatePlayerChoice(io, socket) {
  return async ({ gameId, choice }) => {
    try {
      const userId = await authenticateSocket(socket);
      if (!userId) return;
      const game = await ActiveGame.findById(gameId);
      if (!game) {
        socket.emit("error", "Game not found.");
        return;
      }
      if (game.status == "waiting") {
        socket.emit("error", "Game is not in a state to accept choices.");
        return;
      }
      console.log("player picked: ", gameId, choice);

      if (game.gameType == "rockPaperScissors") {
        console.log("rps: ");
        // Define allowed choices
        const validChoices = ["rock", "paper", "scissors"];
        if (!validChoices.includes(choice)) {
          socket.emit(
            "error",
            "Invalid choice. Please select rock, paper, or scissors."
          );
          return;
        }
        const playerChoiceKey = `game:${gameId}:choice:${userId}`;
        await setAsync(playerChoiceKey, choice, "EX", 2 * GAME_TIMEOUT);
        socket.emit("rpsPlayerChoiceSelected", choice);
      } else {
        console.log("cointoss: ");
        const validChoices = ["heads", "tails"];
        if (!validChoices.includes(choice)) {
          socket.emit(
            "error",
            "Invalid choice. Please select rock, paper, or scissors."
          );
          return;
        }

        if (game.status == "awaitingRematch") {
          const balanceEnough = await isUserHasEnoughBalance(userId, game.coinType.toLowerCase(), game.betAmount)
          if (!balanceEnough) {
            console.error("User does not have enough balance");
            socket.emit("error", "User does not have enough balance");
            return;
          }

          console.log("AWAITING REMATCH: ");
          const choiceData = {
            choice: choice,
            initiator: userId
          }
          const playerChoiceKey = `game:${gameId}:currentPlayerChoice`;
          await setAsync(playerChoiceKey, JSON.stringify(choiceData), "EX", 2 * GAME_TIMEOUT);
          // SET rematch key
          const rematchKey = `rematchRequested:${gameId}`;
          const existingRequests = await getAsync(rematchKey);
          // Track which players have requested a rematch
          let rematchRequests;
          if (existingRequests) {
            rematchRequests = new Set(JSON.parse(existingRequests));
          } else {
            rematchRequests = new Set();
          }
          // Add the current user's request
          rematchRequests.add(userId);
          // Save updated rematch requests in Redis, using the original timeout duration to keep track
          await setAsync(rematchKey, JSON.stringify([...rematchRequests]), "EX", GENERAL_REDIS_TIMEOUT);
          console.log("player picked: ", playerChoiceKey, choice);
          if (
            rematchRequests.size === 2 &&
            rematchRequests.has(game.creator.toString()) &&
            rematchRequests.has(game.challenger.toString())
          ) {
            if (game.gameType == "coinToss") {
              const playerChoiceKey = `game:${gameId}:currentPlayerChoice`;
              const choice = await getAsync(playerChoiceKey);
              await evaluateCoinTossGameResults(io, choice, userId, game);
              await delAsync(playerChoiceKey);
              return;
            }
          }
        } else {
          console.log("ELSE : ", choice, userId);
          await evaluateCoinTossGameResults(io, choice, userId, game);
        }
      }
    } catch (error) {
      console.error("Error handling player choice:", error);
      socket.emit("error", "Error processing your choice.");
    }
  }
}

function playerLeaveGame(socket) {
  return async ({ gameId }) => {
    const userId = await authenticateSocket(socket);
    if (!userId) return;

    const game = await ActiveGame.findById(gameId);
    if (!game) {
      socket.emit("error", "No game found.");
      return;
    }
    // delete redis data
    await delAsync(`game:${game._id}:choice:${game.creator.toString()}`);
    await delAsync(`game:${game._id}:choice:${game.challenger?.toString()}`);
    await delAsync(
      `gameDrawTimeout:${game._id
      }:creator:${game.creator.toString()}:challenger:${game.challenger?.toString()}`
    );
    await delAsync(`rematchRequested:${game._id}`);
    await delAsync(`joinRequest:${game._id}:${game.challenger?.toString()}`);
    await delAsync(`joinRequestIsRoomOccupied:${game._id}`);
    await delAsync(`game:${game._id}:choice:${game.challenger?.toString()}`);
    await delAsync(`game:${game._id}:choice:${game.creator.toString()}`);
    await delAsync(`gameRoomRequestUpdate:${game._id}`);

    const challenger = game?.challenger;
    game.status = "waiting";
    game.challenger = null;
    game.draw = false;
    game.save();

    const creatorRoom = `user:${game.creator.toString()}`;
    // Notify the game creator that someone wants to join
    socket.to(creatorRoom).emit("playerLeft", {
      message: `Other player left the game`,
    });

    if (challenger) {
      const challengerRoom = `user:${challenger?.toString()}`;
      // Notify the game creator that someone wants to join
      socket.to(challengerRoom).emit("playerLeft", {
        message: `Other player left the game`,
      });
    }
    console.log("User disconnected:", socket.id);
  }
}

function emitGlobalMessageForNewGameCreated(io, socket) {
  return async ({ gameId }) => {
    try {
      const userId = await getAsync(`socketId:${socket.id}`);
      const user = await User.findById(userId).select("username profileImage");
      if (!user) {
        console.log("user not found");
        socket.emit("error", "user not found");
        return;
      }

      const profileImageUrl = await getUserProfileImage(user.profileImage);
      var sender = {
        username: user.username,
        profileImage: profileImageUrl,
        _id: user._id,
      };

      const game = await ActiveGame.findOne({
        _id: mongoose.Types.ObjectId(gameId),
        status: "waiting",
      });
      if (!game) {
        socket.emit("errorJoinRequest", "Game not found or not available");
        return;
      }

      const timestamp = new Date().toISOString();
      // Save message to the database
      const newMessage = {
        userRef: user._id,
        username: user.username,
        profileImage: user.profileImage ? user.profileImage : "",
        message: "",
        timestamp: timestamp,
        game: game,
      }
      await saveGlobalChatMessage(newMessage);
      await removeLastMessage();

      let GLOBAL_CHAT_ROOM = "globalChatRoom";
      io.in(GLOBAL_CHAT_ROOM).emit("receiveGlobalChatMessage", {
        sender: sender,
        message: "",
        timestamp: timestamp,
        game: game
      });
      socket.broadcast.emit("newGameCreated", true);
    } catch (error) {
      console.error("Error handling global chat message:", error);
      socket.emit("error", "Error processing your global chat message.");
    }
  }
}

// for rps only
function rematch(io, socket) {
  return async ({ gameId }) => {
    const userId = await authenticateSocket(socket);
    if (!userId) return;
    // Fetch game data
    const game = await ActiveGame.findOne({
      _id: gameId,
      status: "awaitingRematch",
    });
    if (
      !game ||
      (userId !== game.creator.toString() &&
        userId !== game.challenger.toString())
    ) {
      console.log("triggered block");
      socket.emit(
        "error",
        "Invalid game details or user not part of the game."
      );
      return;
    }
    const balanceEnough = await isUserHasEnoughBalance(userId, game.coinType.toLowerCase(), game.betAmount)
    if (!balanceEnough) {
      console.error("User does not have enough balance");
      socket.emit("error", "User does not have enough balance");
      return;
    }
    const roomName = `gameRoom:${game._id}`;
    const rematchKey = `rematchRequested:${gameId}`;
    const existingRequests = await getAsync(rematchKey);

    // Track which players have requested a rematch
    let rematchRequests;
    if (existingRequests) {
      rematchRequests = new Set(JSON.parse(existingRequests));
    } else {
      rematchRequests = new Set();
    }

    // Add the current user's request
    rematchRequests.add(userId);
    // Save updated rematch requests in Redis, using the original timeout duration to keep track
    await setAsync(rematchKey, JSON.stringify([...rematchRequests]), "EX", GENERAL_REDIS_TIMEOUT);

    if (
      rematchRequests.size === 2 &&
      rematchRequests.has(game.creator.toString()) &&
      rematchRequests.has(game.challenger.toString())
    ) {
      if (game.gameType == "coinToss") {
        const playerChoiceKey = `game:${gameId}:currentPlayerChoice`;
        const jsonData = await getAsync(playerChoiceKey);
        const { choice, initiator } = JSON.parse(jsonData);
        await evaluateCoinTossGameResults(io, choice, initiator, game);
        await delAsync(playerChoiceKey);
        return;
      } else { // gameType == "rockPaperScissors"
        // Notify all clients in the game room that both players are ready for a rematch
        const gameDrawTimeout = `gameDrawTimeout:${gameId}:creator:${game.creator.toString()}:challenger:${game.challenger.toString()}`;
        const gameTimeout = game?.draw
          ? parseInt(await getAsync(gameDrawTimeout))
          : GAME_TIMEOUT;
        const timeoutDate = new Date();
        timeoutDate.setSeconds(timeoutDate.getSeconds() + gameTimeout);
        const {
          creatorChoice: newCreatorChoice,
          challengerChoice: newChallengerChoice,
        } = await initializeGameChoices(
          game._id.toString(),
          game.creator.toString(),
          game.challenger.toString(),
          gameTimeout
        );
        const broadcastData = {
          message: "Game started again because it was a draw",
          gameId: gameId,
          creator: game.creator.toString(),
          initialChoices: {
            creator: newCreatorChoice,
            challenger: newChallengerChoice,
          },
        }
        io.in(roomName).emit("gameStarted", broadcastData);

        if (!game?.draw) {
          // if (game.coinType == "points") {
          //   target = "temporaryPoints";
          // };
          // const creator = await User.findById(game.creator);
          // const challenger = await User.findById(game.challenger);
          // const creatorBalance = parseFloat(creator[target].toString()) - game.betAmount;
          // creator[target] = creatorBalance;
          // await creator.save();

          // const challengerBalance = parseFloat(challenger[target].toString()) - game.challengerBuyInAmount;
          // challenger[target] = challengerBalance;
          // await challenger.save();

          if (game.coinType.toLowerCase() == "points") {
            target = "temporaryPoints";
            const creator = await User.findById(game.creator);
            const challenger = await User.findById(game.challenger);
            const creatorBalance = BigInt(creator[target].toString()) - BigInt(game.betAmount);
            creator[target] = creatorBalance.toString();
            await creator.save();

            const challengerBalance = BigInt(challenger[target].toString()) - BigInt(game.challengerBuyInAmount);
            challenger[target] = challengerBalance.toString();
            await challenger.save();
            // Check if the caller is the creator
            if (userId === game.creator.toString()) {
              socket.emit("realtimePoints", creatorBalance); // Send balance update directly to the creator
              socket.to(`user:${game.challenger}`).emit("realtimePoints", challengerBalance); // Send challenger's balance update to the challenger
            } else {
              socket.emit("realtimePoints", challengerBalance); // Send balance update directly to the challenger
              socket.to(`user:${game.creator}`).emit("realtimePoints", creatorBalance); // Send creator's balance update to the creator
            }
          } else {
            const creatorBalances = await WalletBalance.findOne({
              userRef: mongoose.Types.ObjectId(game.creator)
            });
            const coinType = game.coinType.toLowerCase();
            const creatorCurrentBalance = BigInt(creatorBalances?.balances?.get(coinType) || 0);
            const creatorTotalBalance = creatorCurrentBalance - BigInt(game.betAmount);
            creatorBalances.balances.set(coinType, creatorTotalBalance.toString());
            await creatorBalances.save();

            const challengerBalances = await WalletBalance.findOne({
              userRef: mongoose.Types.ObjectId(game.challenger)
            });
            const challengerCurrentBalance = BigInt(challengerBalances?.balances?.get(coinType) || 0);
            const challengerTotalBalance = challengerCurrentBalance - BigInt(game.challengerBuyInAmount);
            challengerBalances.balances.set(coinType, challengerTotalBalance.toString());
            await challengerBalances.save();

            if (userId === game.creator.toString()) {
              socket.emit("realtimePoints", creatorTotalBalance.toString()); // Send balance update directly to the creator
              socket.to(`user:${game.challenger}`).emit("realtimePoints", challengerTotalBalance.toString()); // Send challenger's balance update to the challenger
            } else {
              socket.emit("realtimePoints", challengerTotalBalance.toString()); // Send balance update directly to the challenger
              socket.to(`user:${game.creator}`).emit("realtimePoints", creatorTotalBalance.toString()); // Send creator's balance update to the creator
            }
          }
        }
        // Emitting the remaining time every second
        let intervalId = setInterval(async () => {
          const currentTime = new Date();
          const timeLeft = Math.max(0, timeoutDate - currentTime);
          if (timeLeft <= 0) {
            clearInterval(intervalId);
            intervalId = null;
            await evaluateGameResults(io, socket, game, gameTimeout);
          }

          const timerLeft = { timeLeft: Math.ceil(timeLeft / 1000) }
          io.in(roomName).emit("timerUpdate", timerLeft);
        }, 1000);

        // Handle logic for starting a new game or resetting game state
        console.log("Both players agreed to a rematch for game", gameId);
      }

    } else {
      // Inform the current user that we are waiting for the other player
      socket.emit("rematchPending", {
        message: "Waiting for the other player to agree to a rematch.",
        gameId: gameId,
      });
    }
  }
}

function creatorRequestBetUpdate(socket) {
  return async ({ gameId, betAmount, odds }) => {
    const userId = await authenticateSocket(socket);
    if (!userId) return;
    let success = true;

    const game = await ActiveGame.findById(gameId);
    if (!game) {
      console.error("game not found");
      success = false;
    }

    if (game.creator.toString() !== userId) {
      console.error("caller is not the game creator");
      success = false;
    }

    const balanceEnough = await isUserHasEnoughBalance(userId, game.coinType.toLowerCase(), betAmount);
    if (!balanceEnough) {
      success = false;
      console.error("User does not have enough balance");
    }

    if (!success) {
      socket.emit("changeBetRequestSent", false);
      return;
    }

    let update = {};
    if (betAmount) update.betAmount = betAmount.toString();
    if (odds) update.odds = odds.toString();

    const requestGameUpdateKey = `gameRoomRequestUpdate:${game._id}`;
    const stringifiedUpdate = JSON.stringify(update);
    await setAsync(requestGameUpdateKey, stringifiedUpdate, "EX", GENERAL_REDIS_TIMEOUT);
    update.tokenType = game.coinType.toLowerCase();
    try {
      const challengerRoom = `user:${game.challenger?.toString()}`;
      socket.to(challengerRoom).emit("betRequest", {
        game: update,
        message: `Game has been updated.`,
      });
      socket.emit("changeBetRequestSent", true);
      console.log("request has been sent");
    } catch (error) {
      console.error("Failed to update the game:", error);
      socket.emit("error", "Failed to update the game");
    }
  }
}

function challengerRejectBetUpdate(io, socket) {
  return async ({ gameId }) => {
    const userId = await authenticateSocket(socket);
    if (!userId) return;

    const game = await ActiveGame.findById(gameId);
    if (!game) {
      console.error("game not found");
      socket.emit("error", "game not found");
      return;
    }

    if (game.challenger?.toString() !== userId) {
      console.error("caller is not the challenger");
      socket.emit("error", "caller is not the challenger");
      return;
    }
    await delAsync(`gameRoomRequestUpdate:${game._id}`);
    const roomName = `gameRoom:${game._id}`;
    io.in(roomName).emit("betUpdated", {
      message: "The bet has been updated",
      status: false,
      game: game,
    });
    console.log("change bet request rejected by the challenger");
  }
}

function challengerAcceptBetChangeRequest(io, socket) {
  return async ({ gameId }) => {
    const userId = await authenticateSocket(socket);
    if (!userId) return;

    const game = await ActiveGame.findById(gameId);
    if (!game) {
      console.error("game not found");
      socket.emit("error", "game not found");
      return;
    }

    if (game.challenger?.toString() !== userId) {
      console.error("caller is not the challenger");
      socket.emit("error", "caller is not the challenger");
      return;
    }

    const requestGameUpdateKey = `gameRoomRequestUpdate:${game._id}`;
    let update = await getAsync(requestGameUpdateKey);
    if (!update) {
      console.error("no updated data in redis");
      socket.emit("error", "no updated data");
      return;
    }
    update = JSON.parse(update);
    try {
      const balanceEnough = await isUserHasEnoughBalance(userId, game.coinType.toLowerCase(), update.betAmount);
      if (!balanceEnough) {
        console.error("User does not have enough balance");
        socket.emit("error", "User does not have enough balance");
        return;
      }

      const challengerBuyInAmount = calculateChallengerBuyInAmount(update.odds, update.betAmount);
      update.payout = BigInt(update.betAmount.toString()) + challengerBuyInAmount;
      update.challengerBuyInAmount = challengerBuyInAmount.toString();

      // Update the game document with new betAmount and/or odds
      const updatedGame = await ActiveGame.findByIdAndUpdate(gameId, update, {
        new: true,
      });
      const roomName = `gameRoom:${game._id}`;
      io.in(roomName).emit("betUpdated", {
        message: "The bet has been updated",
        status: true,
        game: updatedGame
      });
      console.log("change bet request accepted by the challenger");
    } catch (error) {
      console.error("Failed to update the game:", error);
      socket.emit("error", "Failed to update the game");
    }
  }
}

module.exports = {
  challengerJoinRequest,
  challengerCancelJoinRequest,
  creatorRejectJoinRequest,
  creatorAcceptJoinRequest,
  updatePlayerChoice,
  playerLeaveGame,
  emitGlobalMessageForNewGameCreated,
  rematch,
  creatorRequestBetUpdate,
  challengerRejectBetUpdate,
  challengerAcceptBetChangeRequest,
}