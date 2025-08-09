const express = require("express");
const router = express.Router();
const betLimitsController = require("../../controllers/admin/betLimitsController");
const { authenticate, requireRole } = require("../../middleware/authenticate");

// Apply authentication and admin middleware to all routes
router.use(authenticate);
router.use(requireRole(["admin", "super"]));

// Get all bet limits
router.get("/", betLimitsController.getAllBetLimits);

// Update bet limit for specific game and token
router.put("/", betLimitsController.updateBetLimit);

// Get bet limit for specific game and token
router.get("/:gameType/:tokenType", betLimitsController.getBetLimit);

// Remove bet limit for specific game and token
router.delete("/:gameType/:tokenType", betLimitsController.removeBetLimit);

module.exports = router;