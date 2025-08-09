const express = require('express');
const router = express.Router();
const communityMarketplaceController = require('../controllers/communityMarketplaceController');
const authMiddleware = require('../middleware/auth'); // Assuming auth middleware exists

// Public routes
router.get('/categories', communityMarketplaceController.getProductCategories);
router.get('/types', communityMarketplaceController.getProductTypes);
router.get('/:communityId/products', communityMarketplaceController.getMarketplaceProducts);
router.get('/products/:productId', communityMarketplaceController.getProduct);

// Protected routes (require authentication)
router.use(authMiddleware);

// Product management
router.post('/:communityId/products', communityMarketplaceController.createProduct);
router.put('/products/:productId', communityMarketplaceController.updateProduct);

// Purchase management
router.post('/products/:productId/purchase', communityMarketplaceController.purchaseProduct);
router.get('/:communityId/purchases', communityMarketplaceController.getUserPurchases);
router.get('/:communityId/sales', communityMarketplaceController.getSellerSales);

// Reviews and refunds
router.post('/purchases/:purchaseId/review', communityMarketplaceController.addProductReview);
router.post('/purchases/:purchaseId/refund', communityMarketplaceController.requestRefund);

// Analytics (admin only)
router.get('/:communityId/analytics', communityMarketplaceController.getMarketplaceAnalytics);

module.exports = router;