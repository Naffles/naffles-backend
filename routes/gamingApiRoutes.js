const express = require("express");
const router = express.Router();
const gamingApiController = require("../controllers/gamingApiController");
const { authenticate } = require("../middleware/authenticate");

// Gaming API routes for Naffles platform games with queue abstraction
router.post("/initialize", authenticate, gamingApiController.initializeGame);
router.post("/sessions/:sessionId/move", authenticate, gamingApiController.submitMove);
router.get("/sessions/:sessionId/state", authenticate, gamingApiController.getGameState);
router.post("/sessions/:sessionId/finalize", authenticate, gamingApiController.finalizeGame);
router.delete("/sessions/:sessionId", authenticate, gamingApiController.cancelGame);

// Player session management
router.get("/sessions/active", authenticate, gamingApiController.getActiveSession);
router.get("/queue", authenticate, gamingApiController.getQueuePosition);
router.get("/history", authenticate, gamingApiController.getGameHistory);

module.exports = router;