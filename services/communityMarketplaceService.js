const DigitalProduct = require('../models/community/digitalProduct');
const ProductPurchase = require('../models/community/productPurchase');
const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const communityPointsService = require('./communityPointsService');

class CommunityMarketplaceService {
  /**
   * Create digital product
   * @param {string} communityId - Community ID
   * @param {string} creatorId - Creator user ID
   * @param {Object} productData - Product data
   * @returns {Promise<Object>} Created product
   */
  async createDigitalProduct(communityId, creatorId, productData) {
    try {
      // Verify community exists and marketplace is enabled
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      if (!community.features.enableMarketplace) {
        throw new Error('Marketplace is not enabled for this community');
      }

      // Check creator permissions
      const membership = await CommunityMember.findOne({
        userId: creatorId,
        communityId,
        isActive: true
      });

      if (!membership || !membership.hasPermission('canManagePoints')) {
        throw new Error('Insufficient permissions to create marketplace products');
      }

      // Validate and create product
      const validatedProductData = this.validateProductData(productData);
      
      const product = new DigitalProduct({
        ...validatedProductData,
        communityId,
        createdBy: creatorId
      });

      await product.save();
      return product;
    } catch (error) {
      console.error('Error creating digital product:', error);
      throw error;
    }
  }

  /**
   * Update digital product
   * @param {string} productId - Product ID
   * @param {string} userId - User ID
   * @param {Object} updates - Product updates
   * @returns {Promise<Object>} Updated product
   */
  async updateDigitalProduct(productId, userId, updates) {
    try {
      const product = await DigitalProduct.findById(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      // Check permissions
      if (!await this.canUserManageProduct(userId, product)) {
        throw new Error('Insufficient permissions to manage this product');
      }

      // Validate updates
      const validatedUpdates = this.validateProductData(updates, true);
      
      // Apply updates
      Object.assign(product, validatedUpdates);
      await product.save();

      return product;
    } catch (error) {
      console.error('Error updating digital product:', error);
      throw error;
    }
  }

  /**
   * Purchase digital product
   * @param {string} productId - Product ID
   * @param {string} buyerId - Buyer user ID
   * @param {Object} purchaseData - Purchase details
   * @returns {Promise<Object>} Purchase record
   */
  async purchaseProduct(productId, buyerId, purchaseData) {
    try {
      const product = await DigitalProduct.findById(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      // Check if buyer is community member
      const membership = await CommunityMember.findOne({
        userId: buyerId,
        communityId: product.communityId,
        isActive: true
      });

      if (!membership && product.requirements.membershipRequired) {
        throw new Error('Community membership required to purchase this product');
      }

      // Check product availability
      const availability = product.isAvailableForPurchase(buyerId, membership?.tier);
      if (!availability.available) {
        throw new Error(availability.reason);
      }

      const quantity = purchaseData.quantity || 1;
      const currency = purchaseData.currency || 'community_points';

      // Calculate price
      const pricing = product.calculatePrice(currency, quantity, membership?.tier);

      // Reserve inventory
      await product.reserveInventory(quantity);

      try {
        // Process payment
        const paymentResult = await this.processPayment(
          buyerId,
          product.communityId,
          pricing,
          currency
        );

        // Create purchase record
        const purchase = new ProductPurchase({
          productId: product._id,
          communityId: product.communityId,
          buyerId,
          sellerId: product.createdBy,
          purchaseDetails: {
            quantity,
            unitPrice: pricing.basePrice,
            totalPrice: pricing.finalPrice,
            currency,
            appliedDiscount: pricing.appliedDiscount
          },
          paymentDetails: paymentResult,
          status: 'confirmed'
        });

        await purchase.save();

        // Complete sale
        await product.completeSale(quantity, pricing.finalPrice, currency);

        // Process fulfillment
        await purchase.processFulfillment();

        return purchase;
      } catch (error) {
        // Release reserved inventory on payment failure
        await product.releaseReservedInventory(quantity);
        throw error;
      }
    } catch (error) {
      console.error('Error purchasing product:', error);
      throw error;
    }
  }

  /**
   * Get marketplace products
   * @param {string} communityId - Community ID
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Products
   */
  async getMarketplaceProducts(communityId, options = {}) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error('Community not found');
      }

      if (!community.features.enableMarketplace) {
        throw new Error('Marketplace is not enabled for this community');
      }

      if (options.featured) {
        return await DigitalProduct.getFeaturedProducts(communityId, options.limit);
      }

      return await DigitalProduct.searchProducts(communityId, options);
    } catch (error) {
      console.error('Error getting marketplace products:', error);
      throw error;
    }
  }

  /**
   * Get user's purchases
   * @param {string} userId - User ID
   * @param {string} communityId - Community ID (optional)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Purchases
   */
  async getUserPurchases(userId, communityId = null, options = {}) {
    try {
      return await ProductPurchase.getUserPurchases(userId, communityId, options);
    } catch (error) {
      console.error('Error getting user purchases:', error);
      throw error;
    }
  }

  /**
   * Get seller's sales
   * @param {string} sellerId - Seller user ID
   * @param {string} communityId - Community ID (optional)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Sales
   */
  async getSellerSales(sellerId, communityId = null, options = {}) {
    try {
      return await ProductPurchase.getSellerSales(sellerId, communityId, options);
    } catch (error) {
      console.error('Error getting seller sales:', error);
      throw error;
    }
  }

  /**
   * Get marketplace analytics
   * @param {string} communityId - Community ID
   * @param {string} userId - User ID (for permission check)
   * @param {string} timeframe - Analytics timeframe
   * @returns {Promise<Object>} Analytics data
   */
  async getMarketplaceAnalytics(communityId, userId, timeframe = '30d') {
    try {
      // Check permissions
      const membership = await CommunityMember.findOne({
        userId,
        communityId,
        isActive: true
      });

      if (!membership || !membership.hasPermission('canViewAnalytics')) {
        throw new Error('Insufficient permissions to view marketplace analytics');
      }

      // Get purchase analytics
      const purchaseAnalytics = await ProductPurchase.getCommunityMarketplaceAnalytics(
        communityId,
        timeframe
      );

      // Get product statistics
      const productStats = await DigitalProduct.aggregate([
        { $match: { communityId: new require('mongoose').Types.ObjectId(communityId) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get top products
      const topProducts = await DigitalProduct.find({
        communityId,
        status: 'active'
      })
      .sort({ 'stats.purchases': -1 })
      .limit(10)
      .select('title stats.purchases stats.revenue');

      return {
        purchases: purchaseAnalytics,
        products: productStats,
        topProducts,
        timeframe
      };
    } catch (error) {
      console.error('Error getting marketplace analytics:', error);
      throw error;
    }
  }

  /**
   * Process payment for product purchase
   * @param {string} buyerId - Buyer user ID
   * @param {string} communityId - Community ID
   * @param {Object} pricing - Pricing details
   * @param {string} currency - Payment currency
   * @returns {Promise<Object>} Payment result
   */
  async processPayment(buyerId, communityId, pricing, currency) {
    try {
      if (currency === 'community_points') {
        // Process community points payment
        const result = await communityPointsService.deductCommunityPoints(
          buyerId,
          communityId,
          pricing.finalPrice,
          'marketplace_purchase'
        );

        return {
          method: 'community_points',
          transactionId: result.transactionId,
          confirmations: 1
        };
      } else {
        // Process cryptocurrency payment
        // This would integrate with the existing fund management service
        // For now, return mock payment result
        return {
          method: 'cryptocurrency',
          transactionId: 'crypto_' + Date.now(),
          blockchainTxHash: '0x' + require('crypto').randomBytes(32).toString('hex'),
          network: this.getCurrencyNetwork(currency),
          confirmations: 0
        };
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      throw error;
    }
  }

  /**
   * Validate product data
   * @param {Object} productData - Product data to validate
   * @param {boolean} isUpdate - Whether this is an update operation
   * @returns {Object} Validated product data
   */
  validateProductData(productData, isUpdate = false) {
    const validated = {};

    // Required fields for creation
    if (!isUpdate) {
      if (!productData.title || !productData.description || !productData.category || !productData.type) {
        throw new Error('Title, description, category, and type are required');
      }
    }

    // Validate title
    if (productData.title !== undefined) {
      if (typeof productData.title !== 'string' || productData.title.trim().length === 0) {
        throw new Error('Title must be a non-empty string');
      }
      validated.title = productData.title.trim();
    }

    // Validate description
    if (productData.description !== undefined) {
      if (typeof productData.description !== 'string' || productData.description.trim().length === 0) {
        throw new Error('Description must be a non-empty string');
      }
      validated.description = productData.description.trim();
    }

    // Validate category
    if (productData.category !== undefined) {
      const validCategories = [
        'digital_art', 'music', 'video', 'ebook', 'course', 'template',
        'software', 'game_asset', 'nft', 'access_pass', 'subscription', 'other'
      ];
      if (!validCategories.includes(productData.category)) {
        throw new Error('Invalid category');
      }
      validated.category = productData.category;
    }

    // Validate type
    if (productData.type !== undefined) {
      const validTypes = ['digital_download', 'access_grant', 'subscription', 'nft_mint', 'service'];
      if (!validTypes.includes(productData.type)) {
        throw new Error('Invalid product type');
      }
      validated.type = productData.type;
    }

    // Validate pricing
    if (productData.pricing !== undefined) {
      validated.pricing = this.validatePricing(productData.pricing);
    }

    // Validate inventory
    if (productData.inventory !== undefined) {
      validated.inventory = this.validateInventory(productData.inventory);
    }

    // Validate content
    if (productData.content !== undefined) {
      validated.content = this.validateContent(productData.content, validated.type || productData.type);
    }

    // Validate media
    if (productData.media !== undefined) {
      validated.media = this.validateMedia(productData.media);
    }

    // Validate requirements
    if (productData.requirements !== undefined) {
      validated.requirements = this.validateRequirements(productData.requirements);
    }

    // Validate availability
    if (productData.availability !== undefined) {
      validated.availability = this.validateAvailability(productData.availability);
    }

    // Validate tags
    if (productData.tags !== undefined) {
      if (!Array.isArray(productData.tags)) {
        throw new Error('Tags must be an array');
      }
      validated.tags = productData.tags.filter(tag => typeof tag === 'string' && tag.trim().length > 0);
    }

    // Validate featured status
    if (productData.featured !== undefined) {
      validated.featured = Boolean(productData.featured);
    }

    return validated;
  }

  /**
   * Validate pricing data
   * @param {Object} pricing - Pricing data
   * @returns {Object} Validated pricing
   */
  validatePricing(pricing) {
    const validated = {};

    if (pricing.communityPoints !== undefined) {
      validated.communityPoints = {
        enabled: Boolean(pricing.communityPoints.enabled),
        price: pricing.communityPoints.enabled ? Math.max(0, Number(pricing.communityPoints.price) || 0) : 0
      };
    }

    if (pricing.cryptocurrency !== undefined) {
      validated.cryptocurrency = {
        enabled: Boolean(pricing.cryptocurrency.enabled),
        prices: []
      };

      if (pricing.cryptocurrency.enabled && pricing.cryptocurrency.prices) {
        validated.cryptocurrency.prices = pricing.cryptocurrency.prices
          .filter(price => price.currency && price.price && price.network)
          .map(price => ({
            currency: price.currency,
            price: price.price.toString(),
            network: price.network
          }));
      }
    }

    if (pricing.discounts !== undefined && Array.isArray(pricing.discounts)) {
      validated.discounts = pricing.discounts
        .filter(discount => discount.type && discount.value !== undefined)
        .map(discount => ({
          type: discount.type,
          value: Number(discount.value),
          condition: discount.condition || {}
        }));
    }

    return validated;
  }

  /**
   * Validate inventory data
   * @param {Object} inventory - Inventory data
   * @returns {Object} Validated inventory
   */
  validateInventory(inventory) {
    const validated = {
      type: inventory.type || 'unlimited'
    };

    if (validated.type === 'limited' || validated.type === 'unique') {
      validated.totalQuantity = Math.max(1, Number(inventory.totalQuantity) || 1);
    } else {
      validated.totalQuantity = 0;
    }

    return validated;
  }

  /**
   * Validate content data based on product type
   * @param {Object} content - Content data
   * @param {string} productType - Product type
   * @returns {Object} Validated content
   */
  validateContent(content, productType) {
    const validated = {};

    switch (productType) {
      case 'digital_download':
        if (content.files && Array.isArray(content.files)) {
          validated.files = content.files.filter(file => file.name && file.url);
        }
        break;

      case 'access_grant':
        if (content.accessDetails) {
          validated.accessDetails = {
            type: content.accessDetails.type || 'custom',
            description: content.accessDetails.description || '',
            duration: Number(content.accessDetails.duration) || 0,
            autoGrant: Boolean(content.accessDetails.autoGrant)
          };
        }
        break;

      case 'subscription':
        if (content.subscriptionDetails) {
          validated.subscriptionDetails = {
            duration: Math.max(1, Number(content.subscriptionDetails.duration) || 30),
            renewalPrice: Number(content.subscriptionDetails.renewalPrice) || 0,
            benefits: Array.isArray(content.subscriptionDetails.benefits) ? content.subscriptionDetails.benefits : [],
            autoRenewal: Boolean(content.subscriptionDetails.autoRenewal)
          };
        }
        break;

      case 'nft_mint':
        if (content.nftDetails) {
          validated.nftDetails = {
            contractAddress: content.nftDetails.contractAddress || '',
            network: content.nftDetails.network || 'ethereum',
            metadata: content.nftDetails.metadata || {},
            royalties: {
              percentage: Math.min(10, Math.max(0, Number(content.nftDetails.royalties?.percentage) || 0)),
              recipient: content.nftDetails.royalties?.recipient || ''
            }
          };
        }
        break;

      case 'service':
        validated.serviceInstructions = content.serviceInstructions || '';
        break;
    }

    return validated;
  }

  /**
   * Validate media data
   * @param {Object} media - Media data
   * @returns {Object} Validated media
   */
  validateMedia(media) {
    const validated = {};

    if (media.images && Array.isArray(media.images)) {
      validated.images = media.images.filter(url => typeof url === 'string' && url.trim().length > 0);
    }

    if (media.videos && Array.isArray(media.videos)) {
      validated.videos = media.videos.filter(url => typeof url === 'string' && url.trim().length > 0);
    }

    if (media.thumbnailUrl && typeof media.thumbnailUrl === 'string') {
      validated.thumbnailUrl = media.thumbnailUrl.trim();
    }

    if (media.previewUrl && typeof media.previewUrl === 'string') {
      validated.previewUrl = media.previewUrl.trim();
    }

    return validated;
  }

  /**
   * Validate requirements data
   * @param {Object} requirements - Requirements data
   * @returns {Object} Validated requirements
   */
  validateRequirements(requirements) {
    const validated = {
      membershipRequired: Boolean(requirements.membershipRequired !== false) // Default to true
    };

    if (requirements.minimumTier && typeof requirements.minimumTier === 'string') {
      validated.minimumTier = requirements.minimumTier;
    }

    if (requirements.completedTasks && Array.isArray(requirements.completedTasks)) {
      validated.completedTasks = requirements.completedTasks;
    }

    if (requirements.ageRestriction !== undefined) {
      validated.ageRestriction = Math.max(0, Math.min(21, Number(requirements.ageRestriction) || 0));
    }

    return validated;
  }

  /**
   * Validate availability data
   * @param {Object} availability - Availability data
   * @returns {Object} Validated availability
   */
  validateAvailability(availability) {
    const validated = {
      isActive: Boolean(availability.isActive !== false), // Default to true
      isPaused: Boolean(availability.isPaused)
    };

    if (availability.startDate) {
      validated.startDate = new Date(availability.startDate);
    }

    if (availability.endDate) {
      validated.endDate = new Date(availability.endDate);
    }

    if (availability.timezone && typeof availability.timezone === 'string') {
      validated.timezone = availability.timezone;
    }

    return validated;
  }

  /**
   * Check if user can manage product
   * @param {string} userId - User ID
   * @param {Object} product - Product object
   * @returns {Promise<boolean>} Can manage
   */
  async canUserManageProduct(userId, product) {
    try {
      // Product creator can always manage
      if (product.createdBy.toString() === userId.toString()) {
        return true;
      }

      // Community admins can manage products
      const membership = await CommunityMember.findOne({
        userId,
        communityId: product.communityId,
        isActive: true
      });

      return membership && membership.hasPermission('canManagePoints');
    } catch (error) {
      console.error('Error checking product management permissions:', error);
      return false;
    }
  }

  /**
   * Get currency network
   * @param {string} currency - Currency code
   * @returns {string} Network name
   */
  getCurrencyNetwork(currency) {
    const networkMap = {
      'ETH': 'ethereum',
      'USDC': 'ethereum',
      'USDT': 'ethereum',
      'SOL': 'solana',
      'MATIC': 'polygon'
    };
    return networkMap[currency] || 'ethereum';
  }
}

module.exports = new CommunityMarketplaceService();