const express = require("express");
const router = express.Router();

const gameController = require("../controllers/gameController");
const chatController = require("../controllers/chatController");
const optionalAuthenticate = require("../middleware/optionalAuthenticate");
const { authenticate } = require("../middleware/authenticate");

router.post(
  "/demo/rock-paper-scissors",
  optionalAuthenticate,
  gameController.demoGameRockPaperScissors
);

router.post(
  "/demo/cointoss",
  optionalAuthenticate,
  gameController.demoGameCoinToss
);

router
  .route("/")
  .post(authenticate, gameController.createGame)
  .get(optionalAuthenticate, gameController.listGames);

router.get(
  "/get-highest-betamount",
  gameController.getHighestBetAmount
);

router.delete("/:gameId", authenticate, gameController.deleteGame);

router.get(
  "/user/get-pending-game",
  authenticate,
  gameController.getUserPendingGame
);

router.get("/history", gameController.getGameHistory);
router.get("/messages/global", chatController.getChatHistory)

module.exports = router;
