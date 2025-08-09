/**
 * Migration: Enhance User Authentication System
 * 
 * This migration updates existing users to support the enhanced authentication system:
 * - Adds new profile data fields
 * - Sets up authentication methods tracking
 * - Initializes tier system
 * - Updates wallet address relationships
 */

const { ObjectId } = require('mongodb');

module.exports = {
  async up(db, client) {
    console.log('Starting user authentication enhancement migration...');

    // Update Users collection
    const usersCollection = db.collection('users');
    const walletAddressesCollection = db.collection('walletaddresses');

    // Get all existing users
    const users = await usersCollection.find({}).toArray();
    console.log(`Found ${users.length} users to migrate`);

    for (const user of users) {
      const updates = {
        // Initialize profile data if not exists
        profileData: user.profileData || {
          preferences: {
            notifications: {
              email: true,
              push: true,
              marketing: false
            },
            privacy: {
              showProfile: true,
              showActivity: true
            }
          }
        },

        // Initialize founders keys array
        foundersKeys: user.foundersKeys || [],

        // Set initial tier
        tier: user.tier || 'bronze',

        // Initialize authentication methods
        authMethods: {
          wallet: false,
          email: false
        },

        // Initialize account status
        isVerified: user.isVerified || false,
        isBlocked: user.isBlocked || false,

        // Initialize activity tracking
        lastActiveAt: user.lastActiveAt || user.updatedAt || user.createdAt,
        loginCount: user.loginCount || 0
      };

      // Set auth methods based on existing data
      if (user.email && user.password) {
        updates.authMethods.email = true;
      }

      // Check if user has wallet addresses
      const userWallets = await walletAddressesCollection.find({ userRef: user._id }).toArray();
      if (userWallets.length > 0) {
        updates.authMethods.wallet = true;

        // Set primary wallet from first wallet
        const primaryWallet = userWallets[0];
        updates.primaryWallet = {
          address: primaryWallet.address,
          walletType: primaryWallet.walletType,
          chainId: primaryWallet.chainId || '1'
        };
      }

      // Update the user
      await usersCollection.updateOne(
        { _id: user._id },
        { $set: updates }
      );
    }

    // Update WalletAddresses collection
    console.log('Updating wallet addresses...');
    const walletAddresses = await walletAddressesCollection.find({}).toArray();
    console.log(`Found ${walletAddresses.length} wallet addresses to migrate`);

    for (const wallet of walletAddresses) {
      const updates = {
        // Ensure address is lowercase
        address: wallet.address.toLowerCase(),
        
        // Add chainId if not exists
        chainId: wallet.chainId || '1',
        
        // Set first wallet as primary
        isPrimary: false,
        
        // Initialize verification status
        isVerified: wallet.isVerified || true,
        
        // Initialize timestamps
        connectedAt: wallet.connectedAt || wallet.createdAt,
        
        // Initialize metadata
        metadata: wallet.metadata || {}
      };

      await walletAddressesCollection.updateOne(
        { _id: wallet._id },
        { $set: updates }
      );
    }

    // Set primary wallet for each user (first wallet becomes primary)
    const usersWithWallets = await usersCollection.find({ 
      'authMethods.wallet': true 
    }).toArray();

    for (const user of usersWithWallets) {
      const firstWallet = await walletAddressesCollection.findOne({ 
        userRef: user._id 
      });
      
      if (firstWallet) {
        await walletAddressesCollection.updateOne(
          { _id: firstWallet._id },
          { $set: { isPrimary: true } }
        );
      }
    }

    // Create indexes for new fields
    console.log('Creating new indexes...');
    
    // User indexes
    await usersCollection.createIndex({ 'primaryWallet.address': 1 });
    await usersCollection.createIndex({ tier: 1 });
    await usersCollection.createIndex({ isBlocked: 1 });
    await usersCollection.createIndex({ lastActiveAt: -1 });

    // WalletAddress indexes
    await walletAddressesCollection.createIndex({ userRef: 1, walletType: 1 });
    await walletAddressesCollection.createIndex({ userRef: 1, isPrimary: 1 });

    console.log('User authentication enhancement migration completed successfully');
  },

  async down(db, client) {
    console.log('Rolling back user authentication enhancement migration...');

    const usersCollection = db.collection('users');
    const walletAddressesCollection = db.collection('walletaddresses');

    // Remove new fields from users
    await usersCollection.updateMany({}, {
      $unset: {
        profileData: '',
        foundersKeys: '',
        tier: '',
        authMethods: '',
        primaryWallet: '',
        isVerified: '',
        isBlocked: '',
        blockReason: '',
        lastLoginAt: '',
        lastActiveAt: '',
        loginCount: '',
        geolocation: ''
      }
    });

    // Remove new fields from wallet addresses
    await walletAddressesCollection.updateMany({}, {
      $unset: {
        chainId: '',
        isPrimary: '',
        isVerified: '',
        connectedAt: '',
        lastUsedAt: '',
        metadata: ''
      }
    });

    // Drop new indexes
    try {
      await usersCollection.dropIndex({ 'primaryWallet.address': 1 });
      await usersCollection.dropIndex({ tier: 1 });
      await usersCollection.dropIndex({ isBlocked: 1 });
      await usersCollection.dropIndex({ lastActiveAt: -1 });
      await walletAddressesCollection.dropIndex({ userRef: 1, walletType: 1 });
      await walletAddressesCollection.dropIndex({ userRef: 1, isPrimary: 1 });
    } catch (error) {
      console.warn('Some indexes may not exist:', error.message);
    }

    console.log('User authentication enhancement migration rollback completed');
  }
};