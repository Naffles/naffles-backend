import { ChainConfig, SupportedChain } from './types';

/**
 * Blockchain constants and configuration
 */

export const SUPPORTED_CHAINS: Record<SupportedChain, ChainConfig> = {
  ethereum: {
    chainId: '1',
    name: 'Ethereum Mainnet',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.alchemyapi.io/v2/',
    explorerUrl: 'https://etherscan.io',
    nativeToken: {
      symbol: 'ETH',
      decimals: 18,
      coingeckoId: 'ethereum'
    },
    isEVM: true,
    isTestnet: false,
    blockTime: 12,
    confirmations: 12
  },
  solana: {
    chainId: 'solana-mainnet',
    name: 'Solana Mainnet',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    explorerUrl: 'https://explorer.solana.com',
    nativeToken: {
      symbol: 'SOL',
      decimals: 9,
      coingeckoId: 'solana'
    },
    isEVM: false,
    isTestnet: false,
    blockTime: 0.4,
    confirmations: 32
  },
  polygon: {
    chainId: '137',
    name: 'Polygon',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    nativeToken: {
      symbol: 'MATIC',
      decimals: 18,
      coingeckoId: 'matic-network'
    },
    isEVM: true,
    isTestnet: false,
    blockTime: 2,
    confirmations: 20
  },
  base: {
    chainId: '8453',
    name: 'Base',
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    nativeToken: {
      symbol: 'ETH',
      decimals: 18,
      coingeckoId: 'ethereum'
    },
    isEVM: true,
    isTestnet: false,
    blockTime: 2,
    confirmations: 10
  },
  bsc: {
    chainId: '56',
    name: 'BNB Smart Chain',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    explorerUrl: 'https://bscscan.com',
    nativeToken: {
      symbol: 'BNB',
      decimals: 18,
      coingeckoId: 'binancecoin'
    },
    isEVM: true,
    isTestnet: false,
    blockTime: 3,
    confirmations: 15
  },
  arbitrum: {
    chainId: '42161',
    name: 'Arbitrum One',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    nativeToken: {
      symbol: 'ETH',
      decimals: 18,
      coingeckoId: 'ethereum'
    },
    isEVM: true,
    isTestnet: false,
    blockTime: 0.25,
    confirmations: 5
  },
  optimism: {
    chainId: '10',
    name: 'Optimism',
    rpcUrl: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeToken: {
      symbol: 'ETH',
      decimals: 18,
      coingeckoId: 'ethereum'
    },
    isEVM: true,
    isTestnet: false,
    blockTime: 2,
    confirmations: 10
  },
  avalanche: {
    chainId: '43114',
    name: 'Avalanche C-Chain',
    rpcUrl: process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
    explorerUrl: 'https://snowtrace.io',
    nativeToken: {
      symbol: 'AVAX',
      decimals: 18,
      coingeckoId: 'avalanche-2'
    },
    isEVM: true,
    isTestnet: false,
    blockTime: 2,
    confirmations: 10
  }
};

export const TOKEN_DECIMAL_MULTIPLIERS = {
  points: 10 ** 18,
  nafflings: 10 ** 18,
  eth: 10 ** 18,
  sol: 10 ** 9,
  beth: 10 ** 18,
  matic: 10 ** 18,
  bnb: 10 ** 18,
  avax: 10 ** 18
};

export const MINIMUM_CONFIRMATIONS = {
  ethereum: 12,
  solana: 32,
  polygon: 20,
  base: 10,
  bsc: 15,
  arbitrum: 5,
  optimism: 10,
  avalanche: 10
};

export const GAS_LIMITS = {
  ETH_TRANSFER: '21000',
  ERC20_TRANSFER: '65000',
  ERC721_TRANSFER: '85000',
  CONTRACT_INTERACTION: '200000'
};

export const CHAINLINK_VRF_CONFIG = {
  ethereum: {
    coordinator: process.env.ETH_VRF_COORDINATOR || '',
    keyHash: process.env.ETH_VRF_KEY_HASH || '',
    subscriptionId: process.env.ETH_VRF_SUBSCRIPTION_ID || '',
    callbackGasLimit: '100000',
    requestConfirmations: 3
  },
  polygon: {
    coordinator: process.env.POLYGON_VRF_COORDINATOR || '',
    keyHash: process.env.POLYGON_VRF_KEY_HASH || '',
    subscriptionId: process.env.POLYGON_VRF_SUBSCRIPTION_ID || '',
    callbackGasLimit: '100000',
    requestConfirmations: 3
  },
  base: {
    coordinator: process.env.BASE_VRF_COORDINATOR || '',
    keyHash: process.env.BASE_VRF_KEY_HASH || '',
    subscriptionId: process.env.BASE_VRF_SUBSCRIPTION_ID || '',
    callbackGasLimit: '100000',
    requestConfirmations: 3
  }
};

export const TREASURY_WALLETS = {
  ethereum: process.env.ETH_TREASURY_WALLET || '',
  solana: process.env.SOL_TREASURY_WALLET || '',
  polygon: process.env.POLYGON_TREASURY_WALLET || '',
  base: process.env.BASE_TREASURY_WALLET || '',
  bsc: process.env.BSC_TREASURY_WALLET || '',
  arbitrum: process.env.ARBITRUM_TREASURY_WALLET || '',
  optimism: process.env.OPTIMISM_TREASURY_WALLET || '',
  avalanche: process.env.AVALANCHE_TREASURY_WALLET || ''
};

export const SUPPORTED_TOKENS = {
  ethereum: [
    { symbol: 'ETH', address: 'native', decimals: 18 },
    { symbol: 'USDC', address: '0xA0b86a33E6441b8C4505B7C0c6b0b8e8b0b8e8b0', decimals: 6 },
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 }
  ],
  solana: [
    { symbol: 'SOL', address: 'native', decimals: 9 },
    { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 }
  ],
  polygon: [
    { symbol: 'MATIC', address: 'native', decimals: 18 },
    { symbol: 'USDC', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 }
  ],
  base: [
    { symbol: 'ETH', address: 'native', decimals: 18 },
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 }
  ]
};

export const ERROR_CODES = {
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  UNSUPPORTED_CHAIN: 'UNSUPPORTED_CHAIN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  GAS_ESTIMATION_FAILED: 'GAS_ESTIMATION_FAILED',
  NONCE_TOO_LOW: 'NONCE_TOO_LOW',
  REPLACEMENT_UNDERPRICED: 'REPLACEMENT_UNDERPRICED'
};