const express = require("express");
const router = express.Router();
const foundersKeyController = require("../controllers/foundersKeyController");
const { authenticate } = require("../middleware/authenticate");

// Apply authentication to all routes
router.use(authenticate);

// Founders Key Management Routes
router.get("/", foundersKeyController.getUserFoundersKeys);
router.post("/scan-wallet", foundersKeyController.scanWalletForKeys);
router.get("/benefits", foundersKeyController.getFoundersKeyBenefits);

// Staking Routes
router.post("/stake", foundersKeyController.startStaking);
router.post("/unstake", foundersKeyController.endStaking);
router.get("/staking", foundersKeyController.getUserStaking);

// Open Entry Allocation Routes
router.get("/allocations", foundersKeyController.getUserAllocations);
router.post("/allocations/use", foundersKeyController.useOpenEntryTickets);

// Fee Discount Routes
router.post("/apply-discount", foundersKeyController.applyFeeDiscount);
router.get("/priority-access", foundersKeyController.checkPriorityAccess);

module.exports = router;