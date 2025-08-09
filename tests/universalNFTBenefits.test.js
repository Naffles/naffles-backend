const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mock the smart contract service before importing the main service
jest.mock('../services/smartContractService', () => ({
  isNFTStaked: jest.fn(),
  getStakingPosition: jest.fn(),
  stakeNFT: jest.fn(),
  claimNFT: jest.fn(),
  getContractStats: jest.fn()
}));

// Mock blockchain verification service
jest.mock('../services/blockchainVerificationService', () => ({
  verifyNFTOwnership: jest.fn(),
  verifyStakingPosition: jest.fn(),
  validateContractAddress: jest.fn()
}));

// Mock Alchemy SDK
jest.mock('alchemy-sdk', () => ({
  Alchemy: jest.fn().mockImplementation(() => ({
    nft: {
      getNftsForOwner: jest.fn()
    }
  })),
  Network: {
    ETH_MAINNET: 'eth-mainnet'
  }
}));

const UniversalNFTBenefitsService = require('../services/universalNFTBenefitsService');

describe('Universal NFT Benefits System', () => {
  test('should pass basic test', () => {
    expect(true).toBe(true);
  });

  test('should have service available', () => {
    expect(UniversalNFTBenefitsService).toBeDefined();
    expect(typeof UniversalNFTBenefitsService.aggregateUserBenefits).toBe('function');
  });

  test('should have tier multiplier method', () => {
    expect(typeof UniversalNFTBenefitsService.getTierMultiplier).toBe('function');
    const multiplier = UniversalNFTBenefitsService.getTierMultiplier(2, 'founders_keys');
    expect(typeof multiplier).toBe('number');
    expect(multiplier).toBeGreaterThan(0);
  });

  test('should have staking multiplier method', () => {
    expect(typeof UniversalNFTBenefitsService.getStakingMultiplier).toBe('function');
    const multiplier = UniversalNFTBenefitsService.getStakingMultiplier(365, 'founders_keys');
    expect(typeof multiplier).toBe('number');
    expect(multiplier).toBeGreaterThan(0);
  });

  test('should have collection hierarchy method', () => {
    expect(typeof UniversalNFTBenefitsService.getCollectionHierarchy).toBe('function');
    const hierarchy = UniversalNFTBenefitsService.getCollectionHierarchy('founders_keys');
    expect(typeof hierarchy).toBe('number');
    expect(hierarchy).toBeGreaterThan(0);
  });
});