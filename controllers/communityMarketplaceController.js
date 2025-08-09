const communityMarketplaceService = require('../services/communityMarketplaceService');

class CommunityMarketplaceController {
  // Create digital product
  async createProduct(req, res) {
    try {
      const { communityId } = req.params;
      const creatorId = req.user.id;
      const productData = req.body;

      const product = await communityMarketplaceService.createDigitalProduct(
        communityId,
        creatorId,
        productData
      );

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: product
      });
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create product',
        error: error.message
      });
    }
  }

  // Update digital product
  async updateProduct(req, res) {
    try {
      const { productId } = req.params;
      const userId = req.user.id;
      const updates = req.body;

      const product = await communityMarketplaceService.updateDigitalProduct(
        productId,
        userId,
        updates
      );

      res.json({
        success: true,
        message: 'Product updated successfully',
        data: product
      });
    } catch (error) {
      console.error('Error updating product:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update product',
        error: error.message
      });
    }
  }

  // Purchase product
  async purchaseProduct(req, res) {
    try {
      const { productId } = req.params;
      const buyerId = req.user.id;
      const purchaseData = req.body;

      const purchase = await communityMarketplaceService.purchaseProduct(
        productId,
        buyerId,
        purchaseData
      );

      res.json({
        success: true,
        message: 'Product purchased successfully',
        data: purchase
      });
    } catch (error) {
      console.error('Error purchasing product:', error);
      const statusCode = error.message.includes('not found') ? 404 : 
                         error.message.includes('permissions') || error.message.includes('membership') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to purchase product',
        error: error.message
      });
    }
  }

  // Get marketplace products
  async getMarketplaceProducts(req, res) {
    try {
      const { communityId } = req.params;
      const options = {
        category: req.query.category,
        type: req.query.type,
        search: req.query.search,
        tags: req.query.tags ? req.query.tags.split(',') : undefined,
        featured: req.query.featured === 'true',
        sortBy: req.query.sortBy,
        limit: parseInt(req.query.limit) || 20,
        skip: parseInt(req.query.skip) || 0,
        priceRange: req.query.minPrice || req.query.maxPrice ? {
          min: req.query.minPrice ? parseFloat(req.query.minPrice) : undefined,
          max: req.query.maxPrice ? parseFloat(req.query.maxPrice) : undefined
        } : undefined
      };

      const products = await communityMarketplaceService.getMarketplaceProducts(
        communityId,
        options
      );

      res.json({
        success: true,
        data: products
      });
    } catch (error) {
      console.error('Error getting marketplace products:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get marketplace products',
        error: error.message
      });
    }
  }

  // Get single product details
  async getProduct(req, res) {
    try {
      const { productId } = req.params;
      
      const DigitalProduct = require('../models/community/digitalProduct');
      const product = await DigitalProduct.findById(productId)
        .populate('createdBy', 'username')
        .populate('communityId', 'name');

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Increment view count
      product.stats.views += 1;
      await product.save();

      res.json({
        success: true,
        data: product
      });
    } catch (error) {
      console.error('Error getting product:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get product',
        error: error.message
      });
    }
  }

  // Get user's purchases
  async getUserPurchases(req, res) {
    try {
      const userId = req.user.id;
      const { communityId } = req.params;
      const options = {
        status: req.query.status,
        limit: parseInt(req.query.limit) || 50,
        skip: parseInt(req.query.skip) || 0
      };

      const purchases = await communityMarketplaceService.getUserPurchases(
        userId,
        communityId,
        options
      );

      res.json({
        success: true,
        data: purchases
      });
    } catch (error) {
      console.error('Error getting user purchases:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user purchases',
        error: error.message
      });
    }
  }

  // Get seller's sales
  async getSellerSales(req, res) {
    try {
      const sellerId = req.user.id;
      const { communityId } = req.params;
      const options = {
        status: req.query.status,
        limit: parseInt(req.query.limit) || 50,
        skip: parseInt(req.query.skip) || 0
      };

      const sales = await communityMarketplaceService.getSellerSales(
        sellerId,
        communityId,
        options
      );

      res.json({
        success: true,
        data: sales
      });
    } catch (error) {
      console.error('Error getting seller sales:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get seller sales',
        error: error.message
      });
    }
  }

  // Get marketplace analytics
  async getMarketplaceAnalytics(req, res) {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;
      const timeframe = req.query.timeframe || '30d';

      const analytics = await communityMarketplaceService.getMarketplaceAnalytics(
        communityId,
        userId,
        timeframe
      );

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Error getting marketplace analytics:', error);
      const statusCode = error.message.includes('permissions') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: 'Failed to get marketplace analytics',
        error: error.message
      });
    }
  }

  // Add product review
  async addProductReview(req, res) {
    try {
      const { purchaseId } = req.params;
      const { rating, comment } = req.body;
      const userId = req.user.id;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be between 1 and 5'
        });
      }

      const ProductPurchase = require('../models/community/productPurchase');
      const purchase = await ProductPurchase.findOne({
        _id: purchaseId,
        buyerId: userId
      });

      if (!purchase) {
        return res.status(404).json({
          success: false,
          message: 'Purchase not found'
        });
      }

      const review = await purchase.addReview(rating, comment);

      res.json({
        success: true,
        message: 'Review added successfully',
        data: review
      });
    } catch (error) {
      console.error('Error adding product review:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add review',
        error: error.message
      });
    }
  }

  // Request refund
  async requestRefund(req, res) {
    try {
      const { purchaseId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Refund reason is required'
        });
      }

      const ProductPurchase = require('../models/community/productPurchase');
      const purchase = await ProductPurchase.findOne({
        _id: purchaseId,
        buyerId: userId
      });

      if (!purchase) {
        return res.status(404).json({
          success: false,
          message: 'Purchase not found'
        });
      }

      const refund = await purchase.requestRefund(reason);

      res.json({
        success: true,
        message: 'Refund requested successfully',
        data: refund
      });
    } catch (error) {
      console.error('Error requesting refund:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to request refund',
        error: error.message
      });
    }
  }

  // Get product categories
  async getProductCategories(req, res) {
    try {
      const categories = [
        { value: 'digital_art', label: 'Digital Art' },
        { value: 'music', label: 'Music' },
        { value: 'video', label: 'Video' },
        { value: 'ebook', label: 'E-Book' },
        { value: 'course', label: 'Course' },
        { value: 'template', label: 'Template' },
        { value: 'software', label: 'Software' },
        { value: 'game_asset', label: 'Game Asset' },
        { value: 'nft', label: 'NFT' },
        { value: 'access_pass', label: 'Access Pass' },
        { value: 'subscription', label: 'Subscription' },
        { value: 'other', label: 'Other' }
      ];

      res.json({
        success: true,
        data: categories
      });
    } catch (error) {
      console.error('Error getting product categories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get product categories',
        error: error.message
      });
    }
  }

  // Get product types
  async getProductTypes(req, res) {
    try {
      const types = [
        { value: 'digital_download', label: 'Digital Download' },
        { value: 'access_grant', label: 'Access Grant' },
        { value: 'subscription', label: 'Subscription' },
        { value: 'nft_mint', label: 'NFT Mint' },
        { value: 'service', label: 'Service' }
      ];

      res.json({
        success: true,
        data: types
      });
    } catch (error) {
      console.error('Error getting product types:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get product types',
        error: error.message
      });
    }
  }
}

module.exports = new CommunityMarketplaceController();