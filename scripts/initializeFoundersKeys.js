const mongoose = require('mongoose');
const FoundersKeyContract = require('../models/user/foundersKeyContract');
const User = require('../models/user/user');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/naffles', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

const initializeFoundersKeys = async () => {
  console.log('🔧 Initializing Founders Key System...\n');

  try {
    // Find or create system admin user
    let systemAdmin = await User.findOne({ role: 'super_admin' });
    if (!systemAdmin) {
      systemAdmin = await User.findOne({ role: 'admin' });
    }
    
    if (!systemAdmin) {
      console.log('⚠️  No admin user found. Creating system admin...');
      systemAdmin = new User({
        username: 'system-admin',
        email: 'admin@naffles.com',
        role: 'admin'
      });
      await systemAdmin.save();
      console.log('✅ System admin created');
    }

    // Default Founders Key contracts configuration
    const defaultContracts = [
      {
        name: 'Naffles Genesis Keys',
        contractAddress: '0x1234567890123456789012345678901234567890', // Replace with actual contract
        chainId: '1',
        network: 'ethereum',
        defaultTier: 3,
        baseBenefits: {
          feeDiscount: 15,
          priorityAccess: true,
          openEntryTickets: 3
        },
        metadata: {
          description: 'Original Naffles Founders Keys with premium benefits',
          imageUrl: 'https://naffles.com/images/genesis-keys.png',
          totalSupply: 1000,
          createdBy: 'Naffles Team'
        }
      },
      {
        name: 'Naffles Silver Keys',
        contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', // Replace with actual contract
        chainId: '1',
        network: 'ethereum',
        defaultTier: 2,
        baseBenefits: {
          feeDiscount: 10,
          priorityAccess: true,
          openEntryTickets: 2
        },
        metadata: {
          description: 'Silver tier Founders Keys with standard benefits',
          imageUrl: 'https://naffles.com/images/silver-keys.png',
          totalSupply: 2500,
          createdBy: 'Naffles Team'
        }
      },
      {
        name: 'Naffles Bronze Keys',
        contractAddress: '0x9876543210987654321098765432109876543210', // Replace with actual contract
        chainId: '1',
        network: 'ethereum',
        defaultTier: 1,
        baseBenefits: {
          feeDiscount: 5,
          priorityAccess: false,
          openEntryTickets: 1
        },
        metadata: {
          description: 'Entry-level Founders Keys with basic benefits',
          imageUrl: 'https://naffles.com/images/bronze-keys.png',
          totalSupply: 5000,
          createdBy: 'Naffles Team'
        }
      },
      {
        name: 'Naffles Solana Keys',
        contractAddress: 'SoLaNaKeYs123456789012345678901234567890', // Replace with actual Solana address
        chainId: 'solana',
        network: 'solana',
        defaultTier: 2,
        baseBenefits: {
          feeDiscount: 12,
          priorityAccess: true,
          openEntryTickets: 2
        },
        metadata: {
          description: 'Solana-based Founders Keys for cross-chain benefits',
          imageUrl: 'https://naffles.com/images/solana-keys.png',
          totalSupply: 1500,
          createdBy: 'Naffles Team'
        }
      }
    ];

    // Create or update contracts
    for (const contractData of defaultContracts) {
      const existingContract = await FoundersKeyContract.findOne({
        contractAddress: contractData.contractAddress,
        chainId: contractData.chainId
      });

      if (existingContract) {
        console.log(`⚠️  Contract ${contractData.name} already exists, skipping...`);
        continue;
      }

      const contract = new FoundersKeyContract({
        ...contractData,
        createdBy: systemAdmin._id
      });

      await contract.save();
      console.log(`✅ Created contract: ${contractData.name}`);
      
      // Add some example tier mappings for demonstration
      if (contractData.name === 'Naffles Genesis Keys') {
        contract.tierMapping.set('1', 5); // Token ID 1 = Tier 5 (Diamond)
        contract.tierMapping.set('2', 5);
        contract.tierMapping.set('3', 4); // Token ID 3 = Tier 4 (Platinum)
        contract.tierMapping.set('4', 4);
        contract.tierMapping.set('5', 3); // Token ID 5 = Tier 3 (Gold)
        await contract.save();
        console.log(`   ✅ Added tier mappings for ${contractData.name}`);
      }
    }

    // Create example tier benefit configurations
    console.log('\n📋 Tier Benefit Structure:');
    const sampleContract = await FoundersKeyContract.findOne();
    if (sampleContract) {
      for (let tier = 1; tier <= 5; tier++) {
        const benefits = sampleContract.getBenefitsForTier(tier);
        console.log(`   Tier ${tier}:`, benefits);
      }
    }

    // Display staking multipliers
    console.log('\n⏰ Staking Duration Multipliers:');
    const stakingDurations = [30, 90, 180, 365, 730];
    const foundersKeyService = require('../services/foundersKeyService');
    
    stakingDurations.forEach(duration => {
      const multiplier = foundersKeyService.getStakingMultiplier(duration);
      console.log(`   ${duration} days: ${multiplier}x multiplier`);
    });

    console.log('\n🎉 Founders Key System Initialization Complete!');
    console.log('\n📊 Summary:');
    console.log(`   • Created ${defaultContracts.length} default contracts`);
    console.log('   • Configured tier-based benefits system');
    console.log('   • Set up staking multipliers');
    console.log('   • Ready for NFT scanning and user integration');

    console.log('\n🔧 Next Steps:');
    console.log('   1. Update contract addresses with real deployed contracts');
    console.log('   2. Configure Alchemy API key for NFT scanning');
    console.log('   3. Set up automated monthly allocation processing');
    console.log('   4. Test with real wallet addresses');

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    throw error;
  }
};

const main = async () => {
  await connectDB();
  
  try {
    await initializeFoundersKeys();
  } catch (error) {
    console.error('Initialization failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
  }
};

// Run initialization if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { initializeFoundersKeys };