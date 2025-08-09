const express = require("express");
const router = express.Router();
const wageringApiController = require("../controllers/wageringApiController");
const { authenticate } = require("../middleware/authenticate");

// Wagering API routes for external third-party games
router.post("/validate-balance", authenticate, wageringApiController.validateBalance);
router.post("/sessions", authenticate, wageringApiController.createWagerSession);
router.post("/sessions/:sessionId/payout", authenticate, wageringApiController.processPayout);
router.get("/sessions/:sessionId/status", authenticate, wageringApiController.getWagerSessionStatus);
router.delete("/sessions/:sessionId", authenticate, wageringApiController.cancelWagerSession);
router.post("/sessions/:sessionId/extend", authenticate, wageringApiController.extendWagerSession);

// Player wager management
router.get("/sessions/active", authenticate, wageringApiController.getActiveWagerSessions);
router.get("/history", authenticate, wageringApiController.getWagerHistory);

// External game provider routes
router.get("/games/:thirdPartyGameId/sessions", authenticate, wageringApiController.getSessionsByGameId);

// Session-based house slot routes
router.post("/sessions/slot", authenticate, wageringApiController.initializeSlotSession);
router.post("/sessions/:sessionId/sync", authenticate, wageringApiController.syncSlotSession);
router.post("/sessions/:sessionId/complete", authenticate, wageringApiController.completeSlotSession);

module.exports = router;