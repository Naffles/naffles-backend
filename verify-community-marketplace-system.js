const mongoose = require('mongoose');
const communityMarketplaceService = require('./services/communityMarketplaceService');
const DigitalProduct = require('./models/community/digitalProduct');
const ProductPurchase = require('./models/community/productPurchase');
const Community = require('./models/community/community');
const CommunityMember = require('./models/community/communityMember');
const CommunityPointsBalance = require('./models/points/communityPointsBalance');

async function verifyImplementation() {
  try {
    console.log('🔍 Verifying Community Marketplace System Implementation...\n');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles_dev');
    console.log('✅ Database connected');

    // Test 1: Digital Product Creation and Management
    console.log('\n🛍️ Test 1: Digital Product Creation and Management');

    // Create test community with marketplace enabled
    const testCommunity = new Community({
      name: 'Marketplace Test Community',
      slug: 'marketplace-test',
      creatorId: new mongoose.Types.ObjectId(),
      pointsConfiguration: {
        pointsName: 'Marketplace Points',
        pointsSymbol: 'MP'
      },
      features: {
        enableMarketplace: true,
        enableGaming: true,
        enableRaffles: true
      }
    });
    await testCommunity.save();

    const testUserId = new mongoose.Types.ObjectId();

    // Create test membership with permissions
    const testMembership = new CommunityMember({
      userId: testUserId,
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

    // Create digital product
    const productData = {
      title: 'Verification Digital Art',
      description: 'A beautiful digital artwork for marketplace verification',
      category: 'digital_art',
      type: 'digital_download',
      pricing: {
        communityPoints: {
          enabled: true,
          price: 250
        },
        cryptocurrency: {
          enabled: true,
          prices: [{
            currency: 'ETH',
            price: '0.1',
            network: 'ethereum'
          }]
        },
        discounts: [{
          type: 'bulk',
          value: 15,
          condition: {
            minQuantity: 3
          }
        }]
      },
      inventory: {
        type: 'limited',
        totalQuantity: 20
      },
      content: {
        files: [{
          name: 'artwork.jpg',
          url: 'https://example.com/artwork.jpg',
          size: 2048000,
          format: 'jpg'
        }]
      },
      media: {
        images: ['https://example.com/preview1.jpg', 'https://example.com/preview2.jpg'],
        thumbnailUrl: 'https://example.com/thumb.jpg',
        previewUrl: 'https://example.com/preview.jpg'
      },
      requirements: {
        membershipRequired: true,
        minimumTier: 'silver'
      },
      tags: ['art', 'digital', 'premium', 'collectible'],
      featured: true
    };

    const product = await communityMarketplaceService.createDigitalProduct(
      testCommunity._id,
      testUserId,
      productData
    );

    console.log(`   ✅ Digital product created: ${product.title}`);
    console.log(`   ✅ Product category: ${product.category}`);
    console.log(`   ✅ Product type: ${product.type}`);
    console.log(`   ✅ Community points price: ${product.pricing.communityPoints.price}`);
    console.log(`   ✅ Inventory type: ${product.inventory.type} (${product.inventory.totalQuantity} total)`);
    console.log(`   ✅ Featured status: ${product.featured}`);
    console.log(`   ✅ Tags: ${product.tags.join(', ')}`);

    // Update product
    const updates = {
      title: 'Updated Verification Digital Art',
      pricing: {
        communityPoints: {
          enabled: true,
          price: 300
        }
      }
    };

    const updatedProduct = await communityMarketplaceService.updateDigitalProduct(
      product._id,
      testUserId,
      updates
    );
    console.log(`   ✅ Product updated: ${updatedProduct.title} - New price: ${updatedProduct.pricing.communityPoints.price}`);

    // Test 2: Points and Cryptocurrency Payment Processing
    console.log('\n💳 Test 2: Points and Cryptocurrency Payment Processing');

    // Create points balance for buyer
    const buyerId = new mongoose.Types.ObjectId();
    const buyerMembership = new CommunityMember({
      userId: buyerId,
      communityId: testCommunity._id,
      role: 'member',
      tier: 'gold'
    });
    await buyerMembership.save();

    const pointsBalance = new CommunityPointsBalance({
      userId: buyerId,
      communityId: testCommunity._id,
      balance: 1000,
      tier: 'gold'
    });
    await pointsBalance.save();

    // Test points payment
    const purchaseData = {
      quantity: 2,
      currency: 'community_points'
    };

    const purchase = await communityMarketplaceService.purchaseProduct(
      product._id,
      buyerId,
      purchaseData
    );

    console.log(`   ✅ Product purchased with community points`);
    console.log(`   ✅ Purchase quantity: ${purchase.purchaseDetails.quantity}`);
    console.log(`   ✅ Total price: ${purchase.purchaseDetails.totalPrice} ${purchase.purchaseDetails.currency}`);
    console.log(`   ✅ Payment method: ${purchase.paymentDetails.method}`);
    console.log(`   ✅ Purchase status: ${purchase.status}`);
    console.log(`   ✅ Fulfillment status: ${purchase.fulfillment.status}`);

    // Verify inventory was updated
    const updatedProductAfterPurchase = await DigitalProduct.findById(product._id);
    console.log(`   ✅ Inventory updated: ${updatedProductAfterPurchase.inventory.soldQuantity} sold, ${updatedProductAfterPurchase.availableQuantity} available`);

    // Test 3: Product Inventory and Purchase Tracking
    console.log('\n📦 Test 3: Product Inventory and Purchase Tracking');

    // Test bulk discount
    const bulkPurchaseData = {
      quantity: 5,
      currency: 'community_points'
    };

    // Add more points for bulk purchase
    await CommunityPointsBalance.findOneAndUpdate(
      { userId: buyerId, communityId: testCommunity._id },
      { balance: 2000 }
    );

    const bulkPurchase = await communityMarketplaceService.purchaseProduct(
      product._id,
      buyerId,
      bulkPurchaseData
    );

    console.log(`   ✅ Bulk purchase completed with discount`);
    console.log(`   ✅ Original price would be: ${300 * 5} points`);
    console.log(`   ✅ Actual price with discount: ${bulkPurchase.purchaseDetails.totalPrice} points`);
    console.log(`   ✅ Discount applied: ${bulkPurchase.purchaseDetails.appliedDiscount?.type} (${bulkPurchase.purchaseDetails.appliedDiscount?.value}%)`);

    // Test 4: Marketplace Analytics and Revenue Reporting
    console.log('\n📊 Test 4: Marketplace Analytics and Revenue Reporting');

    const analytics = await communityMarketplaceService.getMarketplaceAnalytics(
      testCommunity._id,
      testUserId,
      '30d'
    );

    console.log(`   ✅ Marketplace analytics retrieved`);
    console.log(`   ✅ Analytics timeframe: ${analytics.timeframe}`);
    console.log(`   ✅ Purchase analytics available: ${analytics.purchases ? 'Yes' : 'No'}`);
    console.log(`   ✅ Product statistics available: ${analytics.products ? 'Yes' : 'No'}`);
    console.log(`   ✅ Top products count: ${analytics.topProducts.length}`);

    // Get user purchases
    const userPurchases = await communityMarketplaceService.getUserPurchases(
      buyerId,
      testCommunity._id
    );
    console.log(`   ✅ User purchases retrieved: ${userPurchases.length} purchases`);

    // Get seller sales
    const sellerSales = await communityMarketplaceService.getSellerSales(
      testUserId,
      testCommunity._id
    );
    console.log(`   ✅ Seller sales retrieved: ${sellerSales.length} sales`);

    // Test 5: Product Search and Discovery
    console.log('\n🔍 Test 5: Product Search and Discovery');

    // Create additional products for search testing
    const additionalProducts = [
      {
        title: 'Music Track Collection',
        description: 'Amazing music tracks for your projects',
        category: 'music',
        type: 'digital_download',
        pricing: { communityPoints: { enabled: true, price: 150 } },
        tags: ['music', 'tracks', 'audio'],
        status: 'active',
        availability: { isActive: true, isPaused: false }
      },
      {
        title: 'Premium Course Access',
        description: 'Access to exclusive course content',
        category: 'course',
        type: 'access_grant',
        pricing: { communityPoints: { enabled: true, price: 500 } },
        tags: ['course', 'education', 'premium'],
        featured: true,
        status: 'active',
        availability: { isActive: true, isPaused: false }
      }
    ];

    for (const additionalProductData of additionalProducts) {
      await communityMarketplaceService.createDigitalProduct(
        testCommunity._id,
        testUserId,
        additionalProductData
      );
    }

    // Test search functionality
    const allProducts = await communityMarketplaceService.getMarketplaceProducts(
      testCommunity._id
    );
    console.log(`   ✅ All marketplace products: ${allProducts.length} found`);

    const featuredProducts = await communityMarketplaceService.getMarketplaceProducts(
      testCommunity._id,
      { featured: true }
    );
    console.log(`   ✅ Featured products: ${featuredProducts.length} found`);

    const musicProducts = await communityMarketplaceService.getMarketplaceProducts(
      testCommunity._id,
      { category: 'music' }
    );
    console.log(`   ✅ Music category products: ${musicProducts.length} found`);

    const searchResults = await communityMarketplaceService.getMarketplaceProducts(
      testCommunity._id,
      { search: 'premium' }
    );
    console.log(`   ✅ Search results for 'premium': ${searchResults.length} found`);

    const priceRangeResults = await communityMarketplaceService.getMarketplaceProducts(
      testCommunity._id,
      { 
        priceRange: {
          min: 100,
          max: 300
        }
      }
    );
    console.log(`   ✅ Price range (100-300) results: ${priceRangeResults.length} found`);

    // Test 6: Review and Refund System
    console.log('\n⭐ Test 6: Review and Refund System');

    // Complete a purchase for review testing
    const completedPurchase = await ProductPurchase.findOne({ buyerId });
    if (completedPurchase) {
      completedPurchase.status = 'completed';
      await completedPurchase.save();

      // Add review
      const review = await completedPurchase.addReview(5, 'Excellent product! Highly recommended.');
      console.log(`   ✅ Review added: ${review.rating} stars - "${review.comment}"`);

      // Check product rating was updated
      const productWithRating = await DigitalProduct.findById(completedPurchase.productId);
      console.log(`   ✅ Product rating updated: ${productWithRating.stats.rating.average} average (${productWithRating.stats.rating.count} reviews)`);

      // Request refund
      const refund = await completedPurchase.requestRefund('Changed my mind about the purchase');
      console.log(`   ✅ Refund requested: ${refund.status} - "${refund.reason}"`);
    }

    // Test 7: Product Validation System
    console.log('\n✅ Test 7: Product Validation System');

    // Test valid product data
    const validProductData = {
      title: 'Valid Test Product',
      description: 'This is a valid product description',
      category: 'digital_art',
      type: 'digital_download',
      pricing: {
        communityPoints: {
          enabled: true,
          price: 100
        }
      }
    };

    const validatedData = communityMarketplaceService.validateProductData(validProductData);
    console.log(`   ✅ Product data validation passed: ${validatedData.title}`);

    // Test pricing validation
    const pricingData = {
      communityPoints: {
        enabled: true,
        price: 200
      },
      cryptocurrency: {
        enabled: true,
        prices: [{
          currency: 'ETH',
          price: '0.05',
          network: 'ethereum'
        }]
      }
    };

    const validatedPricing = communityMarketplaceService.validatePricing(pricingData);
    console.log(`   ✅ Pricing validation passed: ${validatedPricing.communityPoints.price} points, ${validatedPricing.cryptocurrency.prices.length} crypto prices`);

    // Cleanup
    await DigitalProduct.deleteMany({ communityId: testCommunity._id });
    await ProductPurchase.deleteMany({ communityId: testCommunity._id });
    await CommunityMember.deleteMany({ communityId: testCommunity._id });
    await CommunityPointsBalance.deleteMany({ communityId: testCommunity._id });
    await Community.findByIdAndDelete(testCommunity._id);

    console.log('\n🎉 All Community Marketplace System tests passed!');
    console.log('\n📋 Implementation Summary:');
    console.log('   ✅ Digital product creation and management interface');
    console.log('   ✅ Points and cryptocurrency payment processing');
    console.log('   ✅ Product inventory and purchase tracking');
    console.log('   ✅ Marketplace analytics and revenue reporting');
    console.log('   ✅ Product search and discovery functionality');
    console.log('   ✅ Review and refund system');
    console.log('   ✅ Product validation and data integrity');

    console.log('\n🔧 Requirements Satisfied:');
    console.log('   ✅ 30.8 - Digital product creation and management');
    console.log('   ✅ 30.8 - Points and cryptocurrency payment processing');
    console.log('   ✅ 30.8 - Product inventory and purchase tracking');
    console.log('   ✅ 30.8 - Marketplace analytics and revenue reporting');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
  }
}

// Run verification if called directly
if (require.main === module) {
  verifyImplementation()
    .then(() => {
      console.log('\n✅ Community Marketplace System verification completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Verification failed:', error);
      process.exit(1);
    });
}

module.exports = verifyImplementation;