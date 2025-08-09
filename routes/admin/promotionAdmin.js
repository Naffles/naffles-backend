const express = require('express');
const router = express.Router();
const promotionAdminController = require('../../controllers/admin/promotionAdminController');
const { authenticateToken, requireAdmin } = require('../../middleware/auth');

// Apply authentication and admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Dashboard and overview routes
router.get('/dashboard', promotionAdminController.getDashboard);
router.get('/fee-types', promotionAdminController.getAvailableFeeTypes);
router.post('/maintenance', promotionAdminController.performMaintenance);

// Promotion CRUD routes
router.post('/promotions', promotionAdminController.createPromotion);
router.get('/promotions', promotionAdminController.listPromotions);
router.get('/promotions/:promotionId', promotionAdminController.getPromotion);
router.put('/promotions/:promotionId', promotionAdminController.updatePromotion);
router.post('/promotions/:promotionId/activate', promotionAdminController.activatePromotion);
router.post('/promotions/:promotionId/deactivate', promotionAdminController.deactivatePromotion);

// Promotion assignment and analytics
router.post('/promotions/:promotionId/assign', promotionAdminController.assignPromotionToUser);
router.get('/promotions/:promotionId/analytics', promotionAdminController.getPromotionAnalytics);
router.get('/promotions/:promotionId/export', promotionAdminController.exportPromotionData);

// User promotion management
router.get('/users/:userId/promotions', promotionAdminController.getUserPromotions);
router.post('/users/:userId/bonus-credits', promotionAdminController.manageBonusCredits);

// Fraud prevention and monitoring
router.get('/fraud/dashboard', promotionAdminController.getFraudDashboard);
router.get('/fraud/analyze/:userId', promotionAdminController.analyzeUserForFraud);
router.post('/fraud/flag/:userPromotionId', promotionAdminController.flagUserPromotionForFraud);
router.post('/fraud/resolve/:userPromotionId/:flagId', promotionAdminController.resolveFraudFlag);

// Testing and simulation
router.post('/simulate', promotionAdminController.simulatePromotion);

module.exports = router;