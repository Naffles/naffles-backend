import { ethers } from 'ethers';
import { SUPPORTED_CHAINS, GAS_LIMITS, TREASURY_WALLETS } from './constants';
import { TransactionData, TokenAmount, SmartContractCall } from './types';

/**
 * Ethereum blockchain utilities
 */

/**
 * Get Ethereum provider for a specific chain
 */
export function getEthereumProvider(chainId: string): ethers.JsonRpcProvider {
  const chain = Object.values(SUPPORTED_CHAINS).find(c => c.chainId === chainId && c.isEVM);
  
  if (!chain) {
    throw new Error(`Unsupported EVM chain: ${chainId}`);
  }

  return new ethers.JsonRpcProvider(chain.rpcUrl);
}

/**
 * Get wallet instance for treasury operations
 */
export function getTreasuryWallet(chainId: string): ethers.Wallet {
  const provider = getEthereumProvider(chainId);
  const privateKey = process.env.TREASURY_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error('Treasury private key not configured');
  }

  return new ethers.Wallet(privateKey, provider);
}

/**
 * Get current gas price for a chain
 */
export async function getCurrentGasPrice(chainId: string): Promise<bigint> {
  const provider = getEthereumProvider(chainId);
  const feeData = await provider.getFeeData();
  
  if (!feeData.gasPrice) {
    throw new Error('Unable to fetch gas price');
  }
  
  return feeData.gasPrice;
}

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(
  chainId: string,
  transaction: {
    to: string;
    value?: string;
    data?: string;
  }
): Promise<bigint> {
  const provider = getEthereumProvider(chainId);
  
  try {
    return await provider.estimateGas(transaction);
  } catch (error) {
    console.error('Gas estimation failed:', error);
    
    // Fallback to default gas limits
    if (transaction.data) {
      return BigInt(GAS_LIMITS.CONTRACT_INTERACTION);
    } else {
      return BigInt(GAS_LIMITS.ETH_TRANSFER);
    }
  }
}

/**
 * Get native token balance
 */
export async function getNativeBalance(chainId: string, address: string): Promise<string> {
  const provider = getEthereumProvider(chainId);
  const balance = await provider.getBalance(address);
  return ethers.formatEther(balance);
}

/**
 * Get ERC20 token balance
 */
export async function getERC20Balance(
  chainId: string,
  tokenAddress: string,
  walletAddress: string
): Promise<string> {
  const provider = getEthereumProvider(chainId);
  
  const erc20Abi = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)'
  ];
  
  const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
  const [balance, decimals] = await Promise.all([
    contract.balanceOf(walletAddress),
    contract.decimals()
  ]);
  
  return ethers.formatUnits(balance, decimals);
}

/**
 * Send native token (ETH, MATIC, etc.)
 */
export async function sendNativeToken(
  chainId: string,
  toAddress: string,
  amount: string,
  privateKey?: string
): Promise<string> {
  const provider = getEthereumProvider(chainId);
  const wallet = privateKey 
    ? new ethers.Wallet(privateKey, provider)
    : getTreasuryWallet(chainId);

  const transaction = {
    to: toAddress,
    value: ethers.parseEther(amount).toString()
  };

  const gasLimit = await estimateGas(chainId, transaction);
  const gasPrice = await getCurrentGasPrice(chainId);

  const tx = await wallet.sendTransaction({
    ...transaction,
    gasLimit,
    gasPrice
  });

  return tx.hash;
}

/**
 * Send ERC20 token
 */
export async function sendERC20Token(
  chainId: string,
  tokenAddress: string,
  toAddress: string,
  amount: string,
  decimals: number,
  privateKey?: string
): Promise<string> {
  const provider = getEthereumProvider(chainId);
  const wallet = privateKey 
    ? new ethers.Wallet(privateKey, provider)
    : getTreasuryWallet(chainId);

  const erc20Abi = [
    'function transfer(address to, uint256 amount) returns (bool)'
  ];

  const contract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
  const amountInWei = ethers.parseUnits(amount, decimals);

  const tx = await contract.transfer(toAddress, amountInWei);
  return tx.hash;
}

/**
 * Get transaction details
 */
export async function getTransactionDetails(
  chainId: string,
  txHash: string
): Promise<TransactionData | null> {
  const provider = getEthereumProvider(chainId);
  
  try {
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(txHash),
      provider.getTransactionReceipt(txHash)
    ]);

    if (!tx) {
      return null;
    }

    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to || '',
      value: ethers.formatEther(tx.value),
      blockNumber: tx.blockNumber || 0,
      timestamp: 0, // Will need to fetch block details for timestamp
      gasUsed: receipt?.gasUsed.toString(),
      gasPrice: tx.gasPrice?.toString(),
      status: receipt ? (receipt.status === 1 ? 'confirmed' : 'failed') : 'pending'
    };
  } catch (error) {
    console.error('Error fetching transaction details:', error);
    return null;
  }
}

/**
 * Wait for transaction confirmation
 */
export async function waitForConfirmation(
  chainId: string,
  txHash: string,
  confirmations: number = 1
): Promise<boolean> {
  const provider = getEthereumProvider(chainId);
  
  try {
    const receipt = await provider.waitForTransaction(txHash, confirmations);
    return receipt?.status === 1;
  } catch (error) {
    console.error('Error waiting for confirmation:', error);
    return false;
  }
}

/**
 * Get current block number
 */
export async function getCurrentBlockNumber(chainId: string): Promise<number> {
  const provider = getEthereumProvider(chainId);
  return await provider.getBlockNumber();
}

/**
 * Get block details
 */
export async function getBlockDetails(chainId: string, blockNumber: number) {
  const provider = getEthereumProvider(chainId);
  return await provider.getBlock(blockNumber);
}

/**
 * Execute smart contract call
 */
export async function executeContractCall(
  chainId: string,
  contractCall: SmartContractCall,
  privateKey?: string
): Promise<string> {
  const provider = getEthereumProvider(chainId);
  const wallet = privateKey 
    ? new ethers.Wallet(privateKey, provider)
    : getTreasuryWallet(chainId);

  // This is a simplified version - in practice, you'd need the ABI
  const contract = new ethers.Contract(contractCall.contractAddress, [], wallet);
  
  const tx = await contract[contractCall.functionName](...contractCall.parameters, {
    value: contractCall.value ? ethers.parseEther(contractCall.value) : 0,
    gasLimit: contractCall.gasLimit ? BigInt(contractCall.gasLimit) : undefined
  });

  return tx.hash;
}

/**
 * Generate new wallet
 */
export function generateWallet(): { address: string; privateKey: string } {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey
  };
}

/**
 * Convert token amount to wei/smallest unit
 */
export function toWei(amount: string, decimals: number): bigint {
  return ethers.parseUnits(amount, decimals);
}

/**
 * Convert wei/smallest unit to token amount
 */
export function fromWei(amount: bigint, decimals: number): string {
  return ethers.formatUnits(amount, decimals);
}

/**
 * Check if address is a contract
 */
export async function isContract(chainId: string, address: string): Promise<boolean> {
  const provider = getEthereumProvider(chainId);
  const code = await provider.getCode(address);
  return code !== '0x';
}