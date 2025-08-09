const mongoose = require('mongoose');

const communityMemberSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true
  },
  role: {
    type: String,
    enum: ['member', 'moderator', 'admin', 'creator'],
    default: 'member'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  permissions: {
    canManagePoints: {
      type: Boolean,
      default: false
    },
    canManageAchievements: {
      type: Boolean,
      default: false
    },
    canManageMembers: {
      type: Boolean,
      default: false
    },
    canModerateContent: {
      type: Boolean,
      default: false
    },
    canViewAnalytics: {
      type: Boolean,
      default: false
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for unique membership
communityMemberSchema.index({ userId: 1, communityId: 1 }, { unique: true });
communityMemberSchema.index({ communityId: 1, role: 1 });
communityMemberSchema.index({ userId: 1 });
communityMemberSchema.index({ lastActivity: -1 });

// Method to check if member has specific permission
communityMemberSchema.methods.hasPermission = function(permission) {
  // Creator and admin roles have all permissions
  if (this.role === 'creator' || this.role === 'admin') {
    return true;
  }
  
  // Moderators have limited permissions
  if (this.role === 'moderator') {
    const moderatorPermissions = ['canModerateContent', 'canViewAnalytics'];
    return moderatorPermissions.includes(permission);
  }
  
  // Check specific permission
  return this.permissions[permission] || false;
};

// Method to update last activity
communityMemberSchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save();
};

// Static method to get user's communities
communityMemberSchema.statics.getUserCommunities = async function(userId) {
  return await this.find({ userId, isActive: true })
    .populate('communityId')
    .sort({ joinedAt: -1 });
};

// Static method to get community members
communityMemberSchema.statics.getCommunityMembers = async function(communityId, options = {}) {
  const query = { communityId, isActive: true };
  
  if (options.role) {
    query.role = options.role;
  }
  
  return await this.find(query)
    .populate('userId', 'username email walletAddresses')
    .sort({ joinedAt: -1 })
    .limit(options.limit || 100)
    .skip(options.skip || 0);
};

module.exports = mongoose.model('CommunityMember', communityMemberSchema);