const { body, validationResult } = require('express-validator');
const StakingContract = require('../models/staking/stakingContract');

const validateStakingRequest = [
  body('contractId')
    .notEmpty()
    .withMessage('Contract ID is required')
    .isMongoId()
    .withMessage('Invalid contract ID format'),
    
  body('nftData.contractAddress')
    .notEmpty()
    .withMessage('NFT contract address is required')
    .isLength({ min: 32, max: 44 })
    .withMessage('Invalid contract address format'),
    
  body('nftData.tokenId')
    .notEmpty()
    .withMessage('NFT token ID is required'),
    
  body('stakingDuration')
    .isInt({ min: 1 })
    .withMessage('Staking duration must be a positive integer')
    .custom((value) => {
      if (![6, 12, 36].includes(parseInt(value))) {
        throw new Error('Staking duration must be 6, 12, or 36 months');
      }
      return true;
    }),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateContractCreation = [
  body('contractAddress')
    .notEmpty()
    .withMessage('Contract address is required')
    .custom(async (value, { req }) => {
      const blockchain = req.body.blockchain;
      if (!StakingContract.validateContractAddress(value, blockchain)) {
        throw new Error(`Invalid contract address format for ${blockchain}`);
      }
      return true;
    }),
    
  body('blockchain')
    .isIn(['ethereum', 'solana', 'polygon', 'base'])
    .withMessage('Blockchain must be one of: ethereum, solana, polygon, base'),
    
  body('contractName')
    .notEmpty()
    .withMessage('Contract name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Contract name must be between 2 and 100 characters'),
    
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
    
  body('rewardStructures.sixMonths.openEntryTicketsPerMonth')
    .optional()
    .isInt({ min: 0, max: 1000 })
    .withMessage('Six months tickets per month must be between 0 and 1000'),
    
  body('rewardStructures.twelveMonths.openEntryTicketsPerMonth')
    .optional()
    .isInt({ min: 0, max: 1000 })
    .withMessage('Twelve months tickets per month must be between 0 and 1000'),
    
  body('rewardStructures.threeYears.openEntryTicketsPerMonth')
    .optional()
    .isInt({ min: 0, max: 1000 })
    .withMessage('Three years tickets per month must be between 0 and 1000'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateContractUpdate = [
  body('contractName')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Contract name must be between 2 and 100 characters'),
    
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
    
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateStakingContractData = [
  body('contractAddress')
    .notEmpty()
    .withMessage('Contract address is required')
    .custom(async (value, { req }) => {
      const blockchain = req.body.blockchain;
      if (!blockchain) {
        throw new Error('Blockchain is required for address validation');
      }
      if (!StakingContract.validateContractAddress(value, blockchain)) {
        throw new Error(`Invalid contract address format for ${blockchain}`);
      }
      return true;
    }),
    
  body('blockchain')
    .notEmpty()
    .withMessage('Blockchain is required')
    .isIn(['ethereum', 'solana', 'polygon', 'base'])
    .withMessage('Blockchain must be one of: ethereum, solana, polygon, base'),
    
  body('contractName')
    .notEmpty()
    .withMessage('Contract name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Contract name must be between 2 and 100 characters')
    .trim(),
    
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters')
    .trim(),
    
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
    
  // Reward structure validations
  body('rewardStructures.sixMonths.openEntryTicketsPerMonth')
    .optional()
    .isInt({ min: 0, max: 1000 })
    .withMessage('Six months tickets per month must be between 0 and 1000'),
    
  body('rewardStructures.sixMonths.bonusMultiplier')
    .optional()
    .isFloat({ min: 1, max: 10 })
    .withMessage('Six months bonus multiplier must be between 1 and 10'),
    
  body('rewardStructures.twelveMonths.openEntryTicketsPerMonth')
    .optional()
    .isInt({ min: 0, max: 1000 })
    .withMessage('Twelve months tickets per month must be between 0 and 1000'),
    
  body('rewardStructures.twelveMonths.bonusMultiplier')
    .optional()
    .isFloat({ min: 1, max: 10 })
    .withMessage('Twelve months bonus multiplier must be between 1 and 10'),
    
  body('rewardStructures.threeYears.openEntryTicketsPerMonth')
    .optional()
    .isInt({ min: 0, max: 1000 })
    .withMessage('Three years tickets per month must be between 0 and 1000'),
    
  body('rewardStructures.threeYears.bonusMultiplier')
    .optional()
    .isFloat({ min: 1, max: 10 })
    .withMessage('Three years bonus multiplier must be between 1 and 10'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

module.exports = {
  validateStakingRequest,
  validateContractCreation,
  validateContractUpdate,
  validateStakingContractData
};