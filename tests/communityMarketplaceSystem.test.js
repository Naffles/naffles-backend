const mongoose = require('mongoose');
const communityMarketplaceService = require('../services/communityMarketplaceService');
const DigitalProduct = require('../models/community/digitalProduct');
const ProductPurchase = require('../models/community/productPurchase');
const Community = require('../models/community/community');
const CommunityMember = require('../models/community/communityMember');
const CommunityPointsBalance = require('../models/points/communityPointsBalance');

describe('Community Marketplace System', () => {
  let testCommunity, testUser, testProduct, testMembership;

  beforeAll(async () => {
    // Setup test database connection
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/naffles_test');
    }
  });

  beforeEach(async () => {
    // Clean up test data
    await DigitalProduct.deleteMany({});
    await ProductPurchase.deleteMany({});
    await Community.deleteMany({});
    await CommunityMember.deleteMany({});
    await CommunityPointsBalance.deleteMany({});

    // Create test community with marketplace enabled
    testCommunity = new Community({
      name: 'Test Marketplace Community',
      slug: 'test-marketplace',
      creatorId: new mongoose.Types.ObjectId(),
      pointsConfiguration: {
        pointsName: 'Test Points',
        pointsSymbol: 'TP'
      },
      features: {
        enableMarketplace: true,
        enableGaming: true,
        enableRaffles: true
      }
    });
    await testCommunity.save();

    // Create test user
    testUser = {
      id: new mongoose.Types.ObjectId(),
      username: 'testuser',
      email: 'test@example.com'
    };

    // Create test membership with permissions
    testMembership = new CommunityMember({
      userId: testUser.id,
      communityId: testCommunity._id,
      role: 'admin',
      permissions: {
        canManagePoints: true,
        canManageAchievements: true,
        canManageMembers: true,
        canModerateContent: true,
        canViewAnalytics: true
      }
    });
    await testMembership.save();

    // Create test points balance
    const pointsBalance = new CommunityPointsBalance({
      userId: testUser.id,
      communityId: testCommunity._id,
      balance: 1000,
      tier: 'gold'
    });
    await pointsBalance.save();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Digital Product Creation and Management', () => {
    test('should create digital product with valid data', async () => {
      const productData = {
        title: 'Test Digital Art',
        description: 'A beautiful digital artwork for testing',
        category: 'digital_art',
        type: 'digital_download',
        pricing: {
          communityPoints: {
            enabled: true,
            price: 100
          },
          cryptocurrency: {
            enabled: false,
            prices: []
          }
        },
        inventory: {
          type: 'limited',
          totalQuantity: 10
        },
        content: {
          files: [{
            name: 'artwork.jpg',
            url: 'https://example.com/artwork.jpg',
            size: 1024000,
            format: 'jpg'
          }]
        },
        media: {
          images: ['https://example.com/preview.jpg'],
          thumbnailUrl: 'https://example.com/thumb.jpg'
        },
        tags: ['art', 'digital', 'nft']
      };

      const product = await communityMarketplaceService.createDigitalProduct(
        testCommunity._id,
        testUser.id,
        productData
      );

      expect(product).toBeDefined();
      expect(product.title).toBe('Test Digital Art');
      expect(product.communityId.toString()).toBe(testCommunity._id.toString());
      expect(product.createdBy.toString()).toBe(testUser.id.toString());
      expect(product.pricing.communityPoints.price).toBe(100);
      expect(product.inventory.totalQuantity).toBe(10);
      expect(product.status).toBe('draft');
    });

    test('should fail to create product in community without marketplace enabled', async () => {
      // Disable marketplace
      testCommunity.features.enableMarketplace = false;
      await testCommunity.save();

      const productData = {
        title: 'Test Product',
        description: 'Test description',
        category: 'digital_art',
        type: 'digital_download'
      };

      await expect(
        communityMarketplaceService.createDigitalProduct(
          testCommunity._id,
          testUser.id,
          productData
        )
      ).rejects.toThrow('Marketplace is not enabled for this community');
    });

    test('should fail to create product without permissions', async () => {
      // Remove permissions
      testMembership.permissions.canManagePoints = false;
      await testMembership.save();

      const productData = {
        title: 'Test Product',
        description: 'Test description',
        category: 'digital_art',
        type: 'digital_download'
      };

      await expect(
        communityMarketplaceService.createDigitalProduct(
          testCommunity._id,
          testUser.id,
          productData
        )
      ).rejects.toThrow('Insufficient permissions to create marketplace products');
    });

    test('should update digital product', async () => {
      // Create product first
      const productData = {
        title: 'Original Title',
        description: 'Original description',
        category: 'digital_art',
        type: 'digital_download',
        pricing: {
          communityPoints: {
            enabled: true,
            price: 100
          }
        }
      };

      const product = await communityMarketplaceService.createDigitalProduct(
        testCommunity._id,
        testUser.id,
        productData
      );

      // Update product
      const updates = {
        title: 'Updated Title',
        pricing: {
          communityPoints: {
            enabled: true,
            price: 150
          }
        }
      };

      const updatedProduct = await communityMarketplaceService.updateDigitalProduct(
        product._id,
        testUser.id,
        updates
      );

      expect(updatedProduct.title).toBe('Updated Title');
      expect(updatedProduct.pricing.communityPoints.price).toBe(150);
    });
  });

  describe('Product Purchase System', () => {
    beforeEach(async () => {
      // Create test product
      const productData = {
        title: 'Test Purchase Product',
        description: 'Product for purchase testing',
        category: 'digital_art',
        type: 'digital_download',
        pricing: {
          communityPoints: {
            enabled: true,
            price: 200
          }
        },
        inventory: {
          type: 'limited',
          totalQuantity: 5
        },
        content: {
          files: [{
            name: 'test-file.pdf',
            url: 'https://example.com/test-file.pdf'
          }]
        },
        status: 'active',
        availability: {
          isActive: true,
          isPaused: false
        }
      };

      testProduct = await communityMarketplaceService.createDigitalProduct(
        testCommunity._id,
        testUser.id,
        productData
      );
    });

    test('should purchase product with community points', async () => {
      const purchaseData = {
        quantity: 1,
        currency: 'community_points'
      };

      const purchase = await communityMarketplaceService.purchaseProduct(
        testProduct._id,
        testUser.id,
        purchaseData
      );

      expect(purchase).toBeDefined();
      expect(purchase.productId.toString()).toBe(testProduct._id.toString());
      expect(purchase.buyerId.toString()).toBe(testUser.id.toString());
      expect(purchase.purchaseDetails.totalPrice).toBe(200);
      expect(purchase.purchaseDetails.currency).toBe('community_points');
      expect(purchase.status).toBe('confirmed');

      // Check inventory was updated
      const updatedProduct = await DigitalProduct.findById(testProduct._id);
      expect(updatedProduct.inventory.soldQuantity).toBe(1);
      expect(updatedProduct.stats.purchases).toBe(1);
    });

    test('should fail to purchase with insufficient points', async () => {
      // Reduce user's points balance
      await CommunityPointsBalance.findOneAndUpdate(
        { userId: testUser.id, communityId: testCommunity._id },
        { balance: 50 }
      );

      const purchaseData = {
        quantity: 1,
        currency: 'community_points'
      };

      await expect(
        communityMarketplaceService.purchaseProduct(
          testProduct._id,
          testUser.id,
          purchaseData
        )
      ).rejects.toThrow();
    });

    test('should fail to purchase sold out product', async () => {
      // Set product as sold out
      testProduct.inventory.soldQuantity = testProduct.inventory.totalQuantity;
      await testProduct.save();

      const purchaseData = {
        quantity: 1,
        currency: 'community_points'
      };

      await expect(
        communityMarketplaceService.purchaseProduct(
          testProduct._id,
          testUser.id,
          purchaseData
        )
      ).rejects.toThrow('Product is sold out');
    });

    test('should apply bulk discount for multiple quantity purchase', async () => {
      // Add bulk discount to product
      testProduct.pricing.discounts = [{
        type: 'bulk',
        value: 10, // 10% discount
        condition: {
          minQuantity: 2
        }
      }];
      await testProduct.save();

      const purchaseData = {
        quantity: 3,
        currency: 'community_points'
      };

      const purchase = await communityMarketplaceService.purchaseProduct(
        testProduct._id,
        testUser.id,
        purchaseData
      );

      // Original price: 200 * 3 = 600
      // With 10% discount: 600 * 0.9 = 540
      expect(purchase.purchaseDetails.totalPrice).toBe(540);
      expect(purchase.purchaseDetails.appliedDiscount).toBeDefined();
      expect(purchase.purchaseDetails.appliedDiscount.type).toBe('bulk');
    });
  });

  describe('Product Search and Discovery', () => {
    beforeEach(async () => {
      // Create multiple test products
      const products = [
        {
          title: 'Digital Art Masterpiece',
          description: 'Beautiful digital artwork',
          category: 'digital_art',
          type: 'digital_download',
          pricing: { communityPoints: { enabled: true, price: 100 } },
          tags: ['art', 'digital', 'masterpiece'],
          status: 'active',
          availability: { isActive: true, isPaused: false }
        },
        {
          title: 'Music Track Collection',
          description: 'Amazing music tracks',
          category: 'music',
          type: 'digital_download',
          pricing: { communityPoints: { enabled: true, price: 50 } },
          tags: ['music', 'tracks', 'collection'],
          status: 'active',
          availability: { isActive: true, isPaused: false }
        },
        {
          title: 'Premium Course Access',
          description: 'Access to premium course content',
          category: 'course',
          type: 'access_grant',
          pricing: { communityPoints: { enabled: true, price: 300 } },
          tags: ['course', 'premium', 'education'],
          featured: true,
          status: 'active',
          availability: { isActive: true, isPaused: false }
        }
      ];

      for (const productData of products) {
        await communityMarketplaceService.createDigitalProduct(
          testCommunity._id,
          testUser.id,
          productData
        );
      }
    });

    test('should get all marketplace products', async () => {
      const products = await communityMarketplaceService.getMarketplaceProducts(
        testCommunity._id
      );

      expect(products).toHaveLength(3);
      expect(products.every(p => p.status === 'active')).toBe(true);
    });

    test('should get featured products only', async () => {
      const products = await communityMarketplaceService.getMarketplaceProducts(
        testCommunity._id,
        { featured: true }
      );

      expect(products).toHaveLength(1);
      expect(products[0].title).toBe('Premium Course Access');
      expect(products[0].featured).toBe(true);
    });

    test('should search products by category', async () => {
      const products = await communityMarketplaceService.getMarketplaceProducts(
        testCommunity._id,
        { category: 'music' }
      );

      expect(products).toHaveLength(1);
      expect(products[0].category).toBe('music');
      expect(products[0].title).toBe('Music Track Collection');
    });

    test('should search products by text', async () => {
      const products = await communityMarketplaceService.getMarketplaceProducts(
        testCommunity._id,
        { search: 'digital' }
      );

      expect(products).toHaveLength(1);
      expect(products[0].title).toBe('Digital Art Masterpiece');
    });

    test('should search products by price range', async () => {
      const products = await communityMarketplaceService.getMarketplaceProducts(
        testCommunity._id,
        { 
          priceRange: {
            min: 100,
            max: 200
          }
        }
      );

      expect(products).toHaveLength(1);
      expect(products[0].pricing.communityPoints.price).toBe(100);
    });

    test('should search products by tags', async () => {
      const products = await communityMarketplaceService.getMarketplaceProducts(
        testCommunity._id,
        { tags: ['premium'] }
      );

      expect(products).toHaveLength(1);
      expect(products[0].tags).toContain('premium');
    });
  });

  describe('Purchase Management', () => {
    let testPurchase;

    beforeEach(async () => {
      // Create test product and purchase
      const productData = {
        title: 'Test Product for Purchase Management',
        description: 'Product for testing purchase management',
        category: 'digital_art',
        type: 'digital_download',
        pricing: {
          communityPoints: {
            enabled: true,
            price: 150
          }
        },
        status: 'active',
        availability: { isActive: true, isPaused: false }
      };

      testProduct = await communityMarketplaceService.createDigitalProduct(
        testCommunity._id,
        testUser.id,
        productData
      );

      const purchaseData = {
        quantity: 1,
        currency: 'community_points'
      };

      testPurchase = await communityMarketplaceService.purchaseProduct(
        testProduct._id,
        testUser.id,
        purchaseData
      );
    });

    test('should get user purchases', async () => {
      const purchases = await communityMarketplaceService.getUserPurchases(
        testUser.id,
        testCommunity._id
      );

      expect(purchases).toHaveLength(1);
      expect(purchases[0].productId.toString()).toBe(testProduct._id.toString());
      expect(purchases[0].buyerId.toString()).toBe(testUser.id.toString());
    });

    test('should get seller sales', async () => {
      const sales = await communityMarketplaceService.getSellerSales(
        testUser.id,
        testCommunity._id
      );

      expect(sales).toHaveLength(1);
      expect(sales[0].sellerId.toString()).toBe(testUser.id.toString());
      expect(sales[0].productId.toString()).toBe(testProduct._id.toString());
    });

    test('should add product review', async () => {
      // Complete the purchase first
      testPurchase.status = 'completed';
      await testPurchase.save();

      const review = await testPurchase.addReview(5, 'Excellent product!');

      expect(review.rating).toBe(5);
      expect(review.comment).toBe('Excellent product!');
      expect(review.reviewedAt).toBeDefined();

      // Check product rating was updated
      const updatedProduct = await DigitalProduct.findById(testProduct._id);
      expect(updatedProduct.stats.rating.average).toBe(5);
      expect(updatedProduct.stats.rating.count).toBe(1);
    });

    test('should request refund', async () => {
      // Complete the purchase first
      testPurchase.status = 'completed';
      await testPurchase.save();

      const refund = await testPurchase.requestRefund('Product not as described');

      expect(refund.requested).toBe(true);
      expect(refund.reason).toBe('Product not as described');
      expect(refund.status).toBe('pending');
      expect(refund.requestedAt).toBeDefined();
    });
  });

  describe('Marketplace Analytics', () => {
    beforeEach(async () => {
      // Create products and purchases for analytics
      const productData = {
        title: 'Analytics Test Product',
        description: 'Product for analytics testing',
        category: 'digital_art',
        type: 'digital_download',
        pricing: {
          communityPoints: {
            enabled: true,
            price: 100
          }
        },
        status: 'active',
        availability: { isActive: true, isPaused: false }
      };

      testProduct = await communityMarketplaceService.createDigitalProduct(
        testCommunity._id,
        testUser.id,
        productData
      );

      // Create multiple purchases
      for (let i = 0; i < 3; i++) {
        const purchaseData = {
          quantity: 1,
          currency: 'community_points'
        };

        await communityMarketplaceService.purchaseProduct(
          testProduct._id,
          testUser.id,
          purchaseData
        );
      }
    });

    test('should get marketplace analytics', async () => {
      const analytics = await communityMarketplaceService.getMarketplaceAnalytics(
        testCommunity._id,
        testUser.id,
        '30d'
      );

      expect(analytics).toBeDefined();
      expect(analytics.purchases).toBeDefined();
      expect(analytics.products).toBeDefined();
      expect(analytics.topProducts).toBeDefined();
      expect(analytics.timeframe).toBe('30d');
    });

    test('should fail to get analytics without permissions', async () => {
      // Remove analytics permission
      testMembership.permissions.canViewAnalytics = false;
      await testMembership.save();

      await expect(
        communityMarketplaceService.getMarketplaceAnalytics(
          testCommunity._id,
          testUser.id,
          '30d'
        )
      ).rejects.toThrow('Insufficient permissions to view marketplace analytics');
    });
  });

  describe('Product Validation', () => {
    test('should validate product data correctly', async () => {
      const validProductData = {
        title: 'Valid Product',
        description: 'Valid description',
        category: 'digital_art',
        type: 'digital_download',
        pricing: {
          communityPoints: {
            enabled: true,
            price: 100
          }
        }
      };

      const validated = communityMarketplaceService.validateProductData(validProductData);

      expect(validated.title).toBe('Valid Product');
      expect(validated.category).toBe('digital_art');
      expect(validated.pricing.communityPoints.price).toBe(100);
    });

    test('should reject invalid product data', async () => {
      const invalidProductData = {
        title: '', // Empty title
        description: 'Valid description',
        category: 'invalid_category', // Invalid category
        type: 'digital_download'
      };

      expect(() => {
        communityMarketplaceService.validateProductData(invalidProductData);
      }).toThrow();
    });

    test('should validate pricing data', async () => {
      const pricingData = {
        communityPoints: {
          enabled: true,
          price: 150
        },
        cryptocurrency: {
          enabled: true,
          prices: [{
            currency: 'ETH',
            price: '0.1',
            network: 'ethereum'
          }]
        }
      };

      const validated = communityMarketplaceService.validatePricing(pricingData);

      expect(validated.communityPoints.enabled).toBe(true);
      expect(validated.communityPoints.price).toBe(150);
      expect(validated.cryptocurrency.enabled).toBe(true);
      expect(validated.cryptocurrency.prices).toHaveLength(1);
    });
  });
});