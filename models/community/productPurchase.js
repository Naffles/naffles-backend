const mongoose = require('mongoose');

const productPurchaseSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DigitalProduct',
    required: true
  },
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  purchaseDetails: {
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      required: true
    },
    appliedDiscount: {
      type: {
        type: String,
        enum: ['percentage', 'fixed_amount', 'bulk']
      },
      value: Number,
      description: String
    }
  },
  paymentDetails: {
    method: {
      type: String,
      enum: ['community_points', 'cryptocurrency'],
      required: true
    },
    transactionId: String, // For crypto payments
    blockchainTxHash: String, // For crypto payments
    network: String, // For crypto payments
    confirmations: {
      type: Number,
      default: 0
    },
    processingFee: {
      type: Number,
      default: 0
    }
  },
  fulfillment: {
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    method: {
      type: String,
      enum: ['automatic', 'manual', 'external'],
      default: 'automatic'
    },
    deliveredAt: Date,
    deliveryDetails: {
      downloadLinks: [String],
      accessGranted: [{
        type: String, // discord_role, private_channel, etc.
        identifier: String,
        grantedAt: Date,
        expiresAt: Date
      }],
      nftMinted: {
        contractAddress: String,
        tokenId: String,
        network: String,
        txHash: String
      },
      customInstructions: String
    },
    failureReason: String
  },
  review: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    reviewedAt: Date
  },
  refund: {
    requested: {
      type: Boolean,
      default: false
    },
    requestedAt: Date,
    reason: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'denied', 'processed']
    },
    processedAt: Date,
    refundAmount: Number,
    refundMethod: String
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    referrer: String,
    affiliateCode: String
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'refunded'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
productPurchaseSchema.index({ productId: 1, buyerId: 1 });
productPurchaseSchema.index({ communityId: 1, status: 1 });
productPurchaseSchema.index({ buyerId: 1, createdAt: -1 });
productPurchaseSchema.index({ sellerId: 1, createdAt: -1 });
productPurchaseSchema.index({ 'paymentDetails.transactionId': 1 });
productPurchaseSchema.index({ 'paymentDetails.blockchainTxHash': 1 });
productPurchaseSchema.index({ status: 1, createdAt: -1 });

// Virtual for total revenue
productPurchaseSchema.virtual('revenue').get(function() {
  return this.purchaseDetails.totalPrice - (this.paymentDetails.processingFee || 0);
});

// Method to process fulfillment
productPurchaseSchema.methods.processFulfillment = async function() {
  try {
    this.fulfillment.status = 'processing';
    await this.save();

    const product = await mongoose.model('DigitalProduct').findById(this.productId);
    if (!product) {
      throw new Error('Product not found');
    }

    const fulfillmentResult = await this.fulfillProduct(product);
    
    if (fulfillmentResult.success) {
      this.fulfillment.status = 'completed';
      this.fulfillment.deliveredAt = new Date();
      this.fulfillment.deliveryDetails = fulfillmentResult.deliveryDetails;
      this.status = 'completed';
    } else {
      this.fulfillment.status = 'failed';
      this.fulfillment.failureReason = fulfillmentResult.error;
    }

    await this.save();
    return fulfillmentResult;
  } catch (error) {
    this.fulfillment.status = 'failed';
    this.fulfillment.failureReason = error.message;
    await this.save();
    throw error;
  }
};

// Method to fulfill different product types
productPurchaseSchema.methods.fulfillProduct = async function(product) {
  try {
    const deliveryDetails = {};

    switch (product.type) {
      case 'digital_download':
        // Generate download links
        deliveryDetails.downloadLinks = product.content.files
          .filter(file => !file.isPreview)
          .map(file => this.generateSecureDownloadLink(file));
        break;

      case 'access_grant':
        // Grant access based on access details
        const accessResult = await this.grantAccess(product.content.accessDetails);
        deliveryDetails.accessGranted = accessResult;
        break;

      case 'subscription':
        // Set up subscription
        const subscriptionResult = await this.setupSubscription(product.content.subscriptionDetails);
        deliveryDetails.subscriptionDetails = subscriptionResult;
        break;

      case 'nft_mint':
        // Mint NFT
        const nftResult = await this.mintNFT(product.content.nftDetails);
        deliveryDetails.nftMinted = nftResult;
        break;

      case 'service':
        // Custom service fulfillment
        deliveryDetails.customInstructions = product.content.serviceInstructions || 'Service will be provided as described';
        break;

      default:
        throw new Error(`Unknown product type: ${product.type}`);
    }

    return {
      success: true,
      deliveryDetails
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

// Method to generate secure download link
productPurchaseSchema.methods.generateSecureDownloadLink = function(file) {
  // Generate a secure, time-limited download link
  const token = require('crypto').randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  return {
    filename: file.name,
    url: `${process.env.BASE_URL}/api/downloads/${token}`,
    expiresAt,
    size: file.size,
    format: file.format
  };
};

// Method to grant access
productPurchaseSchema.methods.grantAccess = async function(accessDetails) {
  const accessGrants = [];
  
  switch (accessDetails.type) {
    case 'discord_role':
      // This would integrate with Discord API
      accessGrants.push({
        type: 'discord_role',
        identifier: accessDetails.roleId,
        grantedAt: new Date(),
        expiresAt: accessDetails.duration ? new Date(Date.now() + accessDetails.duration * 24 * 60 * 60 * 1000) : null
      });
      break;

    case 'private_channel':
      // Grant access to private channel/content
      accessGrants.push({
        type: 'private_channel',
        identifier: accessDetails.channelId,
        grantedAt: new Date(),
        expiresAt: accessDetails.duration ? new Date(Date.now() + accessDetails.duration * 24 * 60 * 60 * 1000) : null
      });
      break;

    case 'exclusive_content':
      // Grant access to exclusive content
      accessGrants.push({
        type: 'exclusive_content',
        identifier: accessDetails.contentId,
        grantedAt: new Date(),
        expiresAt: accessDetails.duration ? new Date(Date.now() + accessDetails.duration * 24 * 60 * 60 * 1000) : null
      });
      break;

    default:
      // Custom access type
      accessGrants.push({
        type: 'custom',
        identifier: accessDetails.description,
        grantedAt: new Date(),
        expiresAt: accessDetails.duration ? new Date(Date.now() + accessDetails.duration * 24 * 60 * 60 * 1000) : null
      });
  }

  return accessGrants;
};

// Method to setup subscription
productPurchaseSchema.methods.setupSubscription = async function(subscriptionDetails) {
  return {
    startDate: new Date(),
    endDate: new Date(Date.now() + subscriptionDetails.duration * 24 * 60 * 60 * 1000),
    benefits: subscriptionDetails.benefits,
    autoRenewal: subscriptionDetails.autoRenewal,
    renewalPrice: subscriptionDetails.renewalPrice
  };
};

// Method to mint NFT
productPurchaseSchema.methods.mintNFT = async function(nftDetails) {
  // This would integrate with NFT minting service
  // For now, return mock data
  return {
    contractAddress: nftDetails.contractAddress,
    tokenId: Math.floor(Math.random() * 10000).toString(),
    network: nftDetails.network,
    txHash: '0x' + require('crypto').randomBytes(32).toString('hex'),
    metadata: nftDetails.metadata
  };
};

// Method to add review
productPurchaseSchema.methods.addReview = async function(rating, comment) {
  if (this.status !== 'completed') {
    throw new Error('Can only review completed purchases');
  }

  this.review = {
    rating,
    comment,
    reviewedAt: new Date()
  };

  await this.save();

  // Update product rating
  const product = await mongoose.model('DigitalProduct').findById(this.productId);
  if (product) {
    await this.updateProductRating(product, rating);
  }

  return this.review;
};

// Method to update product rating
productPurchaseSchema.methods.updateProductRating = async function(product, newRating) {
  const currentAverage = product.stats.rating.average;
  const currentCount = product.stats.rating.count;
  
  const newCount = currentCount + 1;
  const newAverage = ((currentAverage * currentCount) + newRating) / newCount;
  
  product.stats.rating.average = Math.round(newAverage * 100) / 100; // Round to 2 decimal places
  product.stats.rating.count = newCount;
  
  await product.save();
};

// Method to request refund
productPurchaseSchema.methods.requestRefund = async function(reason) {
  if (this.status !== 'completed') {
    throw new Error('Can only request refund for completed purchases');
  }

  if (this.refund.requested) {
    throw new Error('Refund already requested');
  }

  this.refund = {
    requested: true,
    requestedAt: new Date(),
    reason,
    status: 'pending'
  };

  await this.save();
  return this.refund;
};

// Static method to get user's purchases
productPurchaseSchema.statics.getUserPurchases = async function(userId, communityId = null, options = {}) {
  const query = { buyerId: userId };
  
  if (communityId) {
    query.communityId = communityId;
  }

  if (options.status) {
    query.status = options.status;
  }

  return await this.find(query)
    .populate('productId', 'title category type media.thumbnailUrl')
    .populate('communityId', 'name')
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0);
};

// Static method to get seller's sales
productPurchaseSchema.statics.getSellerSales = async function(sellerId, communityId = null, options = {}) {
  const query = { sellerId };
  
  if (communityId) {
    query.communityId = communityId;
  }

  if (options.status) {
    query.status = options.status;
  }

  return await this.find(query)
    .populate('productId', 'title category type')
    .populate('buyerId', 'username')
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0);
};

// Static method to get community marketplace analytics
productPurchaseSchema.statics.getCommunityMarketplaceAnalytics = async function(communityId, timeframe = '30d') {
  const timeframeMs = {
    '1d': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000
  };
  
  const startDate = new Date(Date.now() - (timeframeMs[timeframe] || timeframeMs['30d']));
  
  const analytics = await this.aggregate([
    {
      $match: {
        communityId: new mongoose.Types.ObjectId(communityId),
        createdAt: { $gte: startDate },
        status: { $in: ['completed', 'confirmed'] }
      }
    },
    {
      $lookup: {
        from: 'digitalproducts',
        localField: 'productId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $group: {
        _id: {
          category: '$product.category',
          currency: '$purchaseDetails.currency'
        },
        totalSales: { $sum: 1 },
        totalRevenue: { $sum: '$purchaseDetails.totalPrice' },
        avgOrderValue: { $avg: '$purchaseDetails.totalPrice' },
        totalQuantity: { $sum: '$purchaseDetails.quantity' }
      }
    },
    {
      $group: {
        _id: '$_id.category',
        currencyBreakdown: {
          $push: {
            currency: '$_id.currency',
            totalSales: '$totalSales',
            totalRevenue: '$totalRevenue',
            avgOrderValue: '$avgOrderValue',
            totalQuantity: '$totalQuantity'
          }
        },
        totalSales: { $sum: '$totalSales' },
        totalQuantity: { $sum: '$totalQuantity' }
      }
    },
    {
      $sort: { totalSales: -1 }
    }
  ]);
  
  return analytics;
};

module.exports = mongoose.model('ProductPurchase', productPurchaseSchema);