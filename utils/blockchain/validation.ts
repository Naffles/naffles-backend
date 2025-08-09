import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import { SUPPORTED_CHAINS, SUPPORTED_TOKENS } from './constants';
import { SupportedChain, TokenAmount } from './types';

/**
 * Blockchain validation utilities
 */

/**
 * Validate Ethereum address
 */
export function isValidEthereumAddress(address: string): boolean {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

/**
 * Validate Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate address based on chain
 */
export function isValidAddress(address: string, chainId: string): boolean {
  const chain = Object.values(SUPPORTED_CHAINS).find(c => c.chainId === chainId);
  
  if (!chain) {
    return false;
  }

  if (chain.isEVM) {
    return isValidEthereumAddress(address);
  } else if (chainId === 'solana-mainnet') {
    return isValidSolanaAddress(address);
  }

  return false;
}

/**
 * Enhanced wallet address validation with type checking
 */
export function validateWalletAddress(address: string, walletType: string, chainId?: string): { isValid: boolean; error?: string } {
  if (!address || typeof address !== 'string') {
    return { isValid: false, error: 'Address is required and must be a string' };
  }

  // Normalize address
  const normalizedAddress = address.trim();
  
  if (normalizedAddress.length === 0) {
    return { isValid: false, error: 'Address cannot be empty' };
  }

  switch (walletType.toLowerCase()) {
    case 'metamask':
    case 'ethereum':
      if (!isValidEthereumAddress(normalizedAddress)) {
        return { isValid: false, error: 'Invalid Ethereum address format' };
      }
      break;
      
    case 'phantom':
    case 'solana':
      if (!isValidSolanaAddress(normalizedAddress)) {
        return { isValid: false, error: 'Invalid Solana address format' };
      }
      break;
      
    default:
      return { isValid: false, error: `Unsupported wallet type: ${walletType}` };
  }

  // Additional chain-specific validation
  if (chainId && !isSupportedChain(chainId)) {
    return { isValid: false, error: 'Invalid or unsupported chain ID' };
  }

  return { isValid: true };
}

/**
 * Validate signature format
 */
export function isValidSignature(signature: string, walletType: string): { isValid: boolean; error?: string } {
  if (!signature || typeof signature !== 'string') {
    return { isValid: false, error: 'Signature is required and must be a string' };
  }

  switch (walletType.toLowerCase()) {
    case 'metamask':
    case 'ethereum':
      // Ethereum signatures are 65 bytes (130 hex chars + 0x prefix)
      if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) {
        return { isValid: false, error: 'Invalid Ethereum signature format' };
      }
      break;
      
    case 'phantom':
    case 'solana':
      // Solana signatures are base58 encoded
      if (!/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(signature)) {
        return { isValid: false, error: 'Invalid Solana signature format' };
      }
      break;
      
    default:
      return { isValid: false, error: `Unsupported wallet type for signature validation: ${walletType}` };
  }

  return { isValid: true };
}

/**
 * Validate timestamp for signature expiration
 */
export function isValidTimestamp(timestamp: string, maxAgeMinutes: number = 5): { isValid: boolean; error?: string } {
  try {
    const signTime = new Date(timestamp);
    const currentTime = new Date();
    const maxAge = maxAgeMinutes * 60 * 1000; // Convert to milliseconds
    
    if (isNaN(signTime.getTime())) {
      return { isValid: false, error: 'Invalid timestamp format' };
    }
    
    if (signTime.getTime() > currentTime.getTime()) {
      return { isValid: false, error: 'Timestamp cannot be in the future' };
    }
    
    if (currentTime.getTime() - signTime.getTime() > maxAge) {
      return { isValid: false, error: `Timestamp is too old (max age: ${maxAgeMinutes} minutes)` };
    }
    
    return { isValid: true };
  } catch {
    return { isValid: false, error: 'Invalid timestamp format' };
  }
}

/**
 * Validate transaction hash format
 */
export function isValidTransactionHash(hash: string, chainId: string): boolean {
  const chain = Object.values(SUPPORTED_CHAINS).find(c => c.chainId === chainId);
  
  if (!chain) {
    return false;
  }

  if (chain.isEVM) {
    // Ethereum-style transaction hash (0x + 64 hex characters)
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  } else if (chainId === 'solana-mainnet') {
    // Solana transaction signature (base58, typically 87-88 characters)
    return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(hash);
  }

  return false;
}

/**
 * Validate token amount
 */
export function isValidTokenAmount(amount: string, decimals: number): boolean {
  try {
    const num = parseFloat(amount);
    if (isNaN(num) || num < 0) {
      return false;
    }

    // Check if the amount has more decimal places than allowed
    const decimalPlaces = (amount.split('.')[1] || '').length;
    return decimalPlaces <= decimals;
  } catch {
    return false;
  }
}

/**
 * Validate TokenAmount object
 */
export function isValidTokenAmountObject(tokenAmount: TokenAmount): boolean {
  if (!tokenAmount || typeof tokenAmount !== 'object') {
    return false;
  }

  const { amount, tokenContract, chainId, decimals, symbol } = tokenAmount;

  // Validate required fields
  if (!amount || !chainId || !symbol || decimals === undefined) {
    return false;
  }

  // Validate amount
  if (!isValidTokenAmount(amount, decimals)) {
    return false;
  }

  // Validate chain
  const chain = Object.values(SUPPORTED_CHAINS).find(c => c.chainId === chainId);
  if (!chain) {
    return false;
  }

  // Validate token contract address if not native token
  if (tokenContract && tokenContract !== 'native') {
    if (!isValidAddress(tokenContract, chainId)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate supported chain
 */
export function isSupportedChain(chainId: string): boolean {
  return Object.values(SUPPORTED_CHAINS).some(chain => chain.chainId === chainId);
}

/**
 * Validate supported token
 */
export function isSupportedToken(symbol: string, chainId: string): boolean {
  const chainName = Object.entries(SUPPORTED_CHAINS).find(([_, config]) => config.chainId === chainId)?.[0] as SupportedChain;
  
  if (!chainName || !(chainName in SUPPORTED_TOKENS)) {
    return false;
  }

  const tokens = SUPPORTED_TOKENS[chainName as keyof typeof SUPPORTED_TOKENS];
  return tokens?.some((token: any) => token.symbol.toLowerCase() === symbol.toLowerCase()) || false;
}

/**
 * Validate private key format
 */
export function isValidPrivateKey(privateKey: string, chainId: string): boolean {
  const chain = Object.values(SUPPORTED_CHAINS).find(c => c.chainId === chainId);
  
  if (!chain) {
    return false;
  }

  if (chain.isEVM) {
    // Ethereum private key (64 hex characters, optionally prefixed with 0x)
    const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
    return /^[a-fA-F0-9]{64}$/.test(cleanKey);
  } else if (chainId === 'solana-mainnet') {
    // Solana private key (base58 encoded, typically 88 characters)
    return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(privateKey);
  }

  return false;
}

/**
 * Validate gas price (for EVM chains)
 */
export function isValidGasPrice(gasPrice: string): boolean {
  try {
    const price = parseFloat(gasPrice);
    return !isNaN(price) && price > 0;
  } catch {
    return false;
  }
}

/**
 * Validate gas limit (for EVM chains)
 */
export function isValidGasLimit(gasLimit: string): boolean {
  try {
    const limit = parseInt(gasLimit);
    return !isNaN(limit) && limit > 0 && limit <= 10000000; // Reasonable upper bound
  } catch {
    return false;
  }
}

/**
 * Validate nonce (for EVM chains)
 */
export function isValidNonce(nonce: number): boolean {
  return Number.isInteger(nonce) && nonce >= 0;
}

/**
 * Sanitize and validate user input
 */
export function sanitizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Sanitize transaction hash
 */
export function sanitizeTransactionHash(hash: string): string {
  return hash.trim();
}

/**
 * Validate withdrawal request
 */
export function validateWithdrawalRequest(
  amount: TokenAmount,
  destinationAddress: string,
  userId: string
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate user ID
  if (!userId || typeof userId !== 'string') {
    errors.push('Invalid user ID');
  }

  // Validate token amount
  if (!isValidTokenAmountObject(amount)) {
    errors.push('Invalid token amount');
  }

  // Validate destination address
  if (!isValidAddress(destinationAddress, amount.chainId)) {
    errors.push('Invalid destination address');
  }

  // Validate supported token
  if (!isSupportedToken(amount.symbol, amount.chainId)) {
    errors.push('Unsupported token');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate deposit address generation request
 */
export function validateDepositAddressRequest(
  userId: string,
  chainId: string,
  tokenContract?: string
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate user ID
  if (!userId || typeof userId !== 'string') {
    errors.push('Invalid user ID');
  }

  // Validate chain
  if (!isSupportedChain(chainId)) {
    errors.push('Unsupported chain');
  }

  // Validate token contract if provided
  if (tokenContract && tokenContract !== 'native') {
    if (!isValidAddress(tokenContract, chainId)) {
      errors.push('Invalid token contract address');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}