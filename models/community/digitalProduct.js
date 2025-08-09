const mongoose = require('mongoose');

const digitalProductSchema = new mongoose.Schema({
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  category: {
    type: String,
    required: true,
    enum: [
      'digital_art',
      'music',
      'video',
      'ebook',
      'course',
      'template',
      'software',
      'game_asset',
      'nft',
      'access_pass',
      'subscription',
      'other'
    ]
  },
  type: {
    type: String,
    required: true,
    enum: ['digital_download', 'access_grant', 'subscription', 'nft_mint', 'service']
  },
  pricing: {
    communityPoints: {
      enabled: {
        type: Boolean,
        default: true
      },
      price: {
        type: Number,
        min: 0
      }
    },
    cryptocurrency: {
      enabled: {
        type: Boolean,
        default: false
      },
      prices: [{
        currency: {
          type: String,
          enum: ['ETH', 'USDC', 'USDT', 'SOL', 'MATIC']
        },
        price: {
          type: String, // Store as string to handle decimals precisely
          required: true
        },
        network: {
          type: String,
          enum: ['ethereum', 'solana', 'polygon', 'base']
        }
      }]
    },
    discounts: [{
      type: {
        type: String,
        enum: ['percentage', 'fixed_amount', 'bulk']
      },
      value: Number,
      condition: {
        minQuantity: Number,
        memberTier: String,
        validUntil: Date
      }
    }]
  },
  inventory: {
    type: {
      type: String,
      enum: ['unlimited', 'limited', 'unique'],
      default: 'unlimited'
    },
    totalQuantity: {
      type: Number,
      default: 0 // 0 means unlimited
    },
    soldQuantity: {
      type: Number,
      default: 0
    },
    reservedQuantity: {
      type: Number,
      default: 0
    }
  },
  content: {
    // For digital downloads
    files: [{
      name: String,
      url: String,
      size: Number, // in bytes
      format: String,
      isPreview: {
        type: Boolean,
        default: false
      }
    }],
    
    // For access grants
    accessDetails: {
      type: String,
      enum: ['discord_role', 'private_channel', 'exclusive_content', 'early_access', 'custom'],
      description: String,
      duration: Number, // in days, 0 = permanent
      autoGrant: {
        type: Boolean,
        default: false
      }
    },
    
    // For subscriptions
    subscriptionDetails: {
      duration: Number, // in days
      renewalPrice: Number,
      benefits: [String],
      autoRenewal: {
        type: Boolean,
        default: false
      }
    },
    
    // For NFT minting
    nftDetails: {
      contractAddress: String,
      network: String,
      metadata: {
        name: String,
        description: String,
        image: String,
        attributes: [{
          trait_type: String,
          value: String
        }]
      },
      royalties: {
        percentage: {
          type: Number,
          min: 0,
          max: 10 // Max 10% royalties
        },
        recipient: String // Wallet address
      }
    }
  },
  media: {
    images: [String], // URLs to product images
    videos: [String], // URLs to product videos
    thumbnailUrl: String,
    previewUrl: String // For previews/demos
  },
  requirements: {
    membershipRequired: {
      type: Boolean,
      default: true
    },
    minimumTier: String,
    completedTasks: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SocialTask'
    }],
    ageRestriction: {
      type: Number,
      min: 0,
      max: 21
    }
  },
  availability: {
    startDate: Date,
    endDate: Date,
    timezone: {
      type: String,
      default: 'UTC'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isPaused: {
      type: Boolean,
      default: false
    }
  },
  stats: {
    views: {
      type: Number,
      default: 0
    },
    purchases: {
      type: Number,
      default: 0
    },
    revenue: {
      communityPoints: {
        type: Number,
        default: 0
      },
      cryptocurrency: {
        type: Map,
        of: String, // Currency -> amount mapping
        default: new Map()
      }
    },
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
      },
      count: {
        type: Number,
        default: 0
      }
    }
  },
  tags: [String],
  featured: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['draft', 'pending_review', 'active', 'paused', 'sold_out', 'expired', 'removed'],
    default: 'draft'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
digitalProductSchema.index({ communityId: 1, status: 1 });
digitalProductSchema.index({ createdBy: 1 });
digitalProductSchema.index({ category: 1, type: 1 });
digitalProductSchema.index({ 'availability.isActive': 1, 'availability.isPaused': 1 });
digitalProductSchema.index({ featured: 1, createdAt: -1 });
digitalProductSchema.index({ tags: 1 });
digitalProductSchema.index({ 'stats.purchases': -1 });
digitalProductSchema.index({ 'stats.rating.average': -1 });

// Virtual for available quantity
digitalProductSchema.virtual('availableQuantity').get(function() {
  if (this.inventory.type === 'unlimited') {
    return Infinity;
  }
  return this.inventory.totalQuantity - this.inventory.soldQuantity - this.inventory.reservedQuantity;
});

// Virtual for sold out status
digitalProductSchema.virtual('isSoldOut').get(function() {
  if (this.inventory.type === 'unlimited') {
    return false;
  }
  return this.availableQuantity <= 0;
});

// Method to check if product is available for purchase
digitalProductSchema.methods.isAvailableForPurchase = function(userId = null, userTier = null) {
  // Check basic availability
  if (!this.availability.isActive || this.availability.isPaused || this.status !== 'active') {
    return { available: false, reason: 'Product is not currently available' };
  }

  // Check date availability
  const now = new Date();
  if (this.availability.startDate && now < this.availability.startDate) {
    return { available: false, reason: 'Product is not yet available' };
  }
  
  if (this.availability.endDate && now > this.availability.endDate) {
    return { available: false, reason: 'Product availability has expired' };
  }

  // Check inventory
  if (this.isSoldOut) {
    return { available: false, reason: 'Product is sold out' };
  }

  // Check user-specific requirements
  if (userId) {
    if (this.requirements.membershipRequired && !userId) {
      return { available: false, reason: 'Community membership required' };
    }

    if (this.requirements.minimumTier && userTier) {
      const tierOrder = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
      const requiredIndex = tierOrder.indexOf(this.requirements.minimumTier);
      const userIndex = tierOrder.indexOf(userTier);
      
      if (requiredIndex > userIndex) {
        return { available: false, reason: `${this.requirements.minimumTier} tier required` };
      }
    }
  }

  return { available: true };
};

// Method to calculate price with discounts
digitalProductSchema.methods.calculatePrice = function(currency, quantity = 1, userTier = null) {
  let basePrice;
  
  if (currency === 'community_points') {
    if (!this.pricing.communityPoints.enabled) {
      throw new Error('Community points payment not enabled for this product');
    }
    basePrice = this.pricing.communityPoints.price;
  } else {
    if (!this.pricing.cryptocurrency.enabled) {
      throw new Error('Cryptocurrency payment not enabled for this product');
    }
    
    const cryptoPrice = this.pricing.cryptocurrency.prices.find(p => p.currency === currency);
    if (!cryptoPrice) {
      throw new Error(`Price not set for currency: ${currency}`);
    }
    basePrice = parseFloat(cryptoPrice.price);
  }

  let finalPrice = basePrice * quantity;
  let appliedDiscount = null;

  // Apply discounts
  for (const discount of this.pricing.discounts) {
    let discountApplies = false;

    switch (discount.type) {
      case 'bulk':
        if (discount.condition.minQuantity && quantity >= discount.condition.minQuantity) {
          discountApplies = true;
        }
        break;
      case 'percentage':
        if (discount.condition.memberTier === userTier) {
          discountApplies = true;
        }
        break;
      case 'fixed_amount':
        if (!discount.condition.validUntil || new Date() <= discount.condition.validUntil) {
          discountApplies = true;
        }
        break;
    }

    if (discountApplies) {
      if (discount.type === 'percentage') {
        finalPrice = finalPrice * (1 - discount.value / 100);
      } else if (discount.type === 'fixed_amount') {
        finalPrice = Math.max(0, finalPrice - discount.value);
      }
      appliedDiscount = discount;
      break; // Apply only the first applicable discount
    }
  }

  return {
    basePrice,
    finalPrice,
    quantity,
    currency,
    appliedDiscount
  };
};

// Method to reserve inventory
digitalProductSchema.methods.reserveInventory = async function(quantity = 1) {
  if (this.inventory.type === 'unlimited') {
    return true;
  }

  if (this.availableQuantity < quantity) {
    throw new Error('Insufficient inventory available');
  }

  this.inventory.reservedQuantity += quantity;
  await this.save();
  return true;
};

// Method to release reserved inventory
digitalProductSchema.methods.releaseReservedInventory = async function(quantity = 1) {
  this.inventory.reservedQuantity = Math.max(0, this.inventory.reservedQuantity - quantity);
  await this.save();
};

// Method to complete sale
digitalProductSchema.methods.completeSale = async function(quantity = 1, revenue = 0, currency = 'community_points') {
  if (this.inventory.type !== 'unlimited') {
    this.inventory.soldQuantity += quantity;
    this.inventory.reservedQuantity = Math.max(0, this.inventory.reservedQuantity - quantity);
  }

  this.stats.purchases += quantity;
  
  if (currency === 'community_points') {
    this.stats.revenue.communityPoints += revenue;
  } else {
    const currentRevenue = this.stats.revenue.cryptocurrency.get(currency) || '0';
    const newRevenue = (parseFloat(currentRevenue) + revenue).toString();
    this.stats.revenue.cryptocurrency.set(currency, newRevenue);
  }

  // Update sold out status
  if (this.isSoldOut && this.status === 'active') {
    this.status = 'sold_out';
  }

  await this.save();
};

// Static method to get featured products
digitalProductSchema.statics.getFeaturedProducts = async function(communityId, limit = 10) {
  return await this.find({
    communityId,
    featured: true,
    status: 'active',
    'availability.isActive': true,
    'availability.isPaused': false
  })
  .populate('createdBy', 'username')
  .sort({ createdAt: -1 })
  .limit(limit);
};

// Static method to search products
digitalProductSchema.statics.searchProducts = async function(communityId, searchOptions = {}) {
  const query = {
    communityId,
    status: 'active',
    'availability.isActive': true,
    'availability.isPaused': false
  };

  if (searchOptions.category) {
    query.category = searchOptions.category;
  }

  if (searchOptions.type) {
    query.type = searchOptions.type;
  }

  if (searchOptions.tags && searchOptions.tags.length > 0) {
    query.tags = { $in: searchOptions.tags };
  }

  if (searchOptions.search) {
    query.$or = [
      { title: { $regex: searchOptions.search, $options: 'i' } },
      { description: { $regex: searchOptions.search, $options: 'i' } },
      { tags: { $regex: searchOptions.search, $options: 'i' } }
    ];
  }

  if (searchOptions.priceRange) {
    if (searchOptions.priceRange.min !== undefined) {
      query['pricing.communityPoints.price'] = { $gte: searchOptions.priceRange.min };
    }
    if (searchOptions.priceRange.max !== undefined) {
      query['pricing.communityPoints.price'] = { 
        ...query['pricing.communityPoints.price'],
        $lte: searchOptions.priceRange.max 
      };
    }
  }

  const sortOptions = {};
  switch (searchOptions.sortBy) {
    case 'price_low':
      sortOptions['pricing.communityPoints.price'] = 1;
      break;
    case 'price_high':
      sortOptions['pricing.communityPoints.price'] = -1;
      break;
    case 'popular':
      sortOptions['stats.purchases'] = -1;
      break;
    case 'rating':
      sortOptions['stats.rating.average'] = -1;
      break;
    default:
      sortOptions.createdAt = -1;
  }

  return await this.find(query)
    .populate('createdBy', 'username')
    .sort(sortOptions)
    .limit(searchOptions.limit || 20)
    .skip(searchOptions.skip || 0);
};

module.exports = mongoose.model('DigitalProduct', digitalProductSchema);