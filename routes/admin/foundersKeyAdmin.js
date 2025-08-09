const express = require("express");
const router = express.Router();
const foundersKeyAdminController = require("../../controllers/admin/foundersKeyAdminController");
const { authenticate, requireRole } = require("../../middleware/authenticate");

// Apply authentication and admin role requirement to all routes
router.use(authenticate);
router.use(requireRole(['admin', 'super_admin']));

// Contract Management Routes
router.post("/contracts", foundersKeyAdminController.createFoundersKeyContract);
router.get("/contracts", foundersKeyAdminController.getFoundersKeyContracts);
router.put("/contracts/:contractId", foundersKeyAdminController.updateFoundersKeyContract);
router.delete("/contracts/:contractId", foundersKeyAdminController.deleteFoundersKeyContract);

// Tier Management Routes
router.put("/contracts/:contractId/tiers", foundersKeyAdminController.updateTierMapping);

// Staking Management Routes
router.get("/staking", foundersKeyAdminController.getStakingOverview);
router.post("/staking/:stakingId/force-end", foundersKeyAdminController.forceEndStaking);

// Open Entry Allocation Management Routes
router.get("/allocations", foundersKeyAdminController.getAllocationsOverview);
router.post("/allocations/manual", foundersKeyAdminController.createManualAllocation);
router.post("/allocations/process-monthly", foundersKeyAdminController.processMonthlyAllocations);
router.post("/allocations/expire-old", foundersKeyAdminController.expireOldAllocations);

// Analytics and Reporting Routes
router.get("/analytics", foundersKeyAdminController.getFoundersKeyAnalytics);
router.get("/export/snapshot", foundersKeyAdminController.exportFoundersKeySnapshot);

// Configuration Management Routes
router.get("/config", foundersKeyAdminController.getFoundersKeyConfig);
router.put("/config", foundersKeyAdminController.updateFoundersKeyConfig);
router.post("/config/reset", foundersKeyAdminController.resetFoundersKeyConfig);
router.post("/config/preview-benefits", foundersKeyAdminController.previewBenefitsCalculation);
router.get("/config/history", foundersKeyAdminController.getConfigurationHistory);

// Utility Routes
router.post("/scan-wallets", foundersKeyAdminController.scanAllWalletsForKeys);

module.exports = router;