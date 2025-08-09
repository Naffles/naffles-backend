const mongoose = require('mongoose');

const stakingContractSchema = new mongoose.Schema({
  contractAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  blockchain: {
    type: String,
    required: true,
    enum: ['ethereum', 'solana', 'polygon', 'base'],
    lowercase: true
  },
  contractName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Duration-based reward structures
  rewardStructures: {
    sixMonths: {
      openEntryTicketsPerMonth: {
        type: Number,
        default: 5,
        min: 0
      },
      bonusMultiplier: {
        type: Number,
        default: 1.1,
        min: 1
      },
      additionalBenefits: [{
        type: String,
        description: String
      }]
    },
    twelveMonths: {
      openEntryTicketsPerMonth: {
        type: Number,
        default: 12,
        min: 0
      },
      bonusMultiplier: {
        type: Number,
        default: 1.25,
        min: 1
      },
      additionalBenefits: [{
        type: String,
        description: String
      }]
    },
    threeYears: {
      openEntryTicketsPerMonth: {
        type: Number,
        default: 30,
        min: 0
      },
      bonusMultiplier: {
        type: Number,
        default: 1.5,
        min: 1
      },
      additionalBenefits: [{
        type: String,
        description: String
      }]
    }
  },
  // Contract validation data
  contractValidation: {
    isValidated: {
      type: Boolean,
      default: false
    },
    validatedAt: Date,
    validatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    validationNotes: String
  },
  // Analytics and tracking
  totalStaked: {
    type: Number,
    default: 0
  },
  totalRewardsDistributed: {
    type: Number,
    default: 0
  },
  averageStakingDuration: {
    type: Number,
    default: 0
  },
  // Admin configuration
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
stakingContractSchema.index({ contractAddress: 1, blockchain: 1 });
stakingContractSchema.index({ isActive: 1 });
stakingContractSchema.index({ blockchain: 1, isActive: 1 });

// Virtual for contract identifier
stakingContractSchema.virtual('contractId').get(function() {
  return `${this.blockchain}:${this.contractAddress}`;
});

// Method to get reward structure for specific duration
stakingContractSchema.methods.getRewardStructure = function(duration) {
  const durationMap = {
    6: 'sixMonths',
    12: 'twelveMonths',
    36: 'threeYears'
  };
  
  const durationKey = durationMap[duration];
  if (!durationKey) {
    throw new Error(`Invalid staking duration: ${duration} months`);
  }
  
  return this.rewardStructures[durationKey];
};

// Method to calculate monthly rewards for duration
stakingContractSchema.methods.calculateMonthlyRewards = function(duration, nftCount = 1) {
  const rewardStructure = this.getRewardStructure(duration);
  return rewardStructure.openEntryTicketsPerMonth * nftCount;
};

// Static method to get default reward structure based on existing contracts
stakingContractSchema.statics.getDefaultRewardStructure = async function(blockchain) {
  const existingContracts = await this.find({ 
    blockchain, 
    isActive: true,
    'contractValidation.isValidated': true 
  }).limit(5);
  
  if (existingContracts.length === 0) {
    // Return default structure if no existing contracts
    return {
      sixMonths: { openEntryTicketsPerMonth: 5, bonusMultiplier: 1.1 },
      twelveMonths: { openEntryTicketsPerMonth: 12, bonusMultiplier: 1.25 },
      threeYears: { openEntryTicketsPerMonth: 30, bonusMultiplier: 1.5 }
    };
  }
  
  // Calculate averages from existing contracts
  const avgStructure = {
    sixMonths: { openEntryTicketsPerMonth: 0, bonusMultiplier: 0 },
    twelveMonths: { openEntryTicketsPerMonth: 0, bonusMultiplier: 0 },
    threeYears: { openEntryTicketsPerMonth: 0, bonusMultiplier: 0 }
  };
  
  existingContracts.forEach(contract => {
    Object.keys(avgStructure).forEach(duration => {
      avgStructure[duration].openEntryTicketsPerMonth += 
        contract.rewardStructures[duration].openEntryTicketsPerMonth;
      avgStructure[duration].bonusMultiplier += 
        contract.rewardStructures[duration].bonusMultiplier;
    });
  });
  
  // Calculate averages
  Object.keys(avgStructure).forEach(duration => {
    avgStructure[duration].openEntryTicketsPerMonth = Math.round(
      avgStructure[duration].openEntryTicketsPerMonth / existingContracts.length
    );
    avgStructure[duration].bonusMultiplier = 
      avgStructure[duration].bonusMultiplier / existingContracts.length;
  });
  
  return avgStructure;
};

// Static method to validate contract address format
stakingContractSchema.statics.validateContractAddress = function(address, blockchain) {
  switch (blockchain.toLowerCase()) {
    case 'ethereum':
    case 'polygon':
    case 'base':
      // Ethereum-style address validation
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    case 'solana':
      // Solana address validation (base58, 32-44 characters)
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    default:
      return false;
  }
};

module.exports = mongoose.model('StakingContract', stakingContractSchema);