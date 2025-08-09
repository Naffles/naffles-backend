const express = require('express');
const router = express.Router();
const universalNFTBenefitsAdminController = require('../../controllers/admin/universalNFTBenefitsAdminController');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

/**
 * Admin routes for Universal NFT Benefits Management
 */

// Get all approved NFT collections
router.get('/collections', 
  requireAuth, 
  requireAdmin, 
  universalNFTBenefitsAdminController.getAllCollections
);

// Add new NFT collection
router.post('/collections', 
  requireAuth, 
  requireAdmin, 
  universalNFTBenefitsAdminController.addCollection
);

// Update existing NFT collection
router.put('/collections/:collectionId', 
  requireAuth, 
  requireAdmin, 
  universalNFTBenefitsAdminController.updateCollection
);

// Remove NFT collection
router.delete('/collections/:collectionId', 
  requireAuth, 
  requireAdmin, 
  universalNFTBenefitsAdminController.removeCollection
);

// Get benefit configuration templates
router.get('/benefit-templates', 
  requireAuth, 
  requireAdmin, 
  universalNFTBenefitsAdminController.getBenefitTemplates
);

// Test user benefits across all collections
router.post('/test-user-benefits', 
  requireAuth, 
  requireAdmin, 
  universalNFTBenefitsAdminController.testUserBenefits
);

// Get collection hierarchy and precedence rules
router.get('/collection-hierarchy', 
  requireAuth, 
  requireAdmin, 
  universalNFTBenefitsAdminController.getCollectionHierarchy
);

// Bulk import collections from CSV
router.post('/collections/bulk-import', 
  requireAuth, 
  requireAdmin, 
  universalNFTBenefitsAdminController.bulkImportCollections
);

module.exports = router;