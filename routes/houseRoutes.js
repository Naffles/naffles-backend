const express = require("express");
const router = express.Router();
const houseController = require("../controllers/houseController");
const { authenticate } = require("../middleware/authenticate");

// House slot management routes
router.post("/slots", authenticate, houseController.createHouseSlot);
router.get("/slots/my", authenticate, houseController.getMyHouseSlots);
router.get("/slots/available", authenticate, houseController.getAvailableHouseSlots);
router.get("/slots/:houseSlotId/stats", authenticate, houseController.getHouseSlotStats);

// House slot fund management
router.post("/slots/:houseSlotId/add-funds", authenticate, houseController.addFunds);
router.post("/slots/:houseSlotId/withdraw-funds", authenticate, houseController.withdrawFunds);
router.post("/slots/:houseSlotId/deactivate", authenticate, houseController.deactivateHouseSlot);

module.exports = router;