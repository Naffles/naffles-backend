const express = require('express');
const router = express.Router();
const communityManualPointsController = require('../controllers/communityManualPointsController');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// CSV Template and Validation Routes
router.get('/template/download', communityManualPointsController.downloadSampleCSV);
router.post('/csv/validate', communityManualPointsController.validateCSV);

// Bulk Points Crediting Routes
router.post('/:communityId/bulk-credit', communityManualPointsController.uploadCSVForBulkCrediting);

// Individual Points Crediting Routes
router.post('/:communityId/individual-credit', communityManualPointsController.creditPointsToIndividualUser);
router.get('/:communityId/search-user', communityManualPointsController.searchUserByIdentifier);

// Audit and Statistics Routes
router.get('/:communityId/audit-history', communityManualPointsController.getAuditHistory);
router.get('/:communityId/stats', communityManualPointsController.getCommunityPointsCreditingStats);

// Utility Routes
router.get('/identifier-types', communityManualPointsController.getSupportedIdentifierTypes);

module.exports = router;