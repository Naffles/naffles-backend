const mongoose = require('mongoose');

const discordAccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  discordUserId: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true
  },
  discriminator: {
    type: String,
    required: true
  },
  avatar: {
    type: String
  },
  email: {
    type: String
  },
  verified: {
    type: Boolean,
    default: false
  },
  accessToken: {
    type: String,
    required: true
  },
  refreshToken: {
    type: String,
    required: true
  },
  tokenExpiresAt: {
    type: Date,
    required: true
  },
  scopes: [{
    type: String
  }],
  linkedAt: {
    type: Date,
    default: Date.now
  },
  lastVerified: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
discordAccountSchema.index({ userId: 1 });
discordAccountSchema.index({ discordUserId: 1 });
discordAccountSchema.index({ tokenExpiresAt: 1 });
discordAccountSchema.index({ isActive: 1 });

// Method to check if token needs refresh
discordAccountSchema.methods.needsTokenRefresh = function() {
  return Date.now() >= this.tokenExpiresAt.getTime() - (5 * 60 * 1000); // 5 minutes buffer
};

// Method to update token information
discordAccountSchema.methods.updateTokens = function(tokenData) {
  this.accessToken = tokenData.access_token;
  this.refreshToken = tokenData.refresh_token;
  this.tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
  this.scopes = tokenData.scope ? tokenData.scope.split(' ') : this.scopes;
  this.lastVerified = new Date();
  return this.save();
};

// Method to update Discord user information
discordAccountSchema.methods.updateDiscordInfo = function(discordUser) {
  this.username = discordUser.username;
  this.discriminator = discordUser.discriminator;
  this.avatar = discordUser.avatar;
  this.email = discordUser.email;
  this.verified = discordUser.verified;
  this.lastVerified = new Date();
  return this.save();
};

// Static method to find by Discord user ID
discordAccountSchema.statics.findByDiscordId = function(discordUserId) {
  return this.findOne({ discordUserId, isActive: true });
};

// Static method to find by user ID
discordAccountSchema.statics.findByUserId = function(userId) {
  return this.findOne({ userId, isActive: true });
};

// Static method to create or update Discord account link
discordAccountSchema.statics.createOrUpdateLink = async function(userId, discordUser, tokenData) {
  const existingLink = await this.findByUserId(userId);
  
  if (existingLink) {
    // Update existing link
    existingLink.discordUserId = discordUser.id;
    existingLink.username = discordUser.username;
    existingLink.discriminator = discordUser.discriminator;
    existingLink.avatar = discordUser.avatar;
    existingLink.email = discordUser.email;
    existingLink.verified = discordUser.verified;
    existingLink.accessToken = tokenData.access_token;
    existingLink.refreshToken = tokenData.refresh_token;
    existingLink.tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
    existingLink.scopes = tokenData.scope ? tokenData.scope.split(' ') : [];
    existingLink.lastVerified = new Date();
    existingLink.isActive = true;
    
    return await existingLink.save();
  } else {
    // Create new link
    return await this.create({
      userId,
      discordUserId: discordUser.id,
      username: discordUser.username,
      discriminator: discordUser.discriminator,
      avatar: discordUser.avatar,
      email: discordUser.email,
      verified: discordUser.verified,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: new Date(Date.now() + (tokenData.expires_in * 1000)),
      scopes: tokenData.scope ? tokenData.scope.split(' ') : []
    });
  }
};

module.exports = mongoose.model('DiscordAccount', discordAccountSchema);