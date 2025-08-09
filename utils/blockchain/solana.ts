import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  ParsedAccountData,
  ConfirmedSignatureInfo
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount
} from '@solana/spl-token';
import { SUPPORTED_CHAINS } from './constants';
import { TransactionData } from './types';

/**
 * Solana blockchain utilities
 */

/**
 * Get Solana connection
 */
export function getSolanaConnection(): Connection {
  const solanaConfig = SUPPORTED_CHAINS.solana;
  return new Connection(solanaConfig.rpcUrl, 'confirmed');
}

/**
 * Get treasury keypair for Solana operations
 */
export function getTreasuryKeypair(): Keypair {
  const privateKeyString = process.env.SOLANA_TREASURY_PRIVATE_KEY;
  
  if (!privateKeyString) {
    throw new Error('Solana treasury private key not configured');
  }

  // Convert base58 private key to Uint8Array
  const privateKeyBytes = Buffer.from(privateKeyString, 'base64');
  return Keypair.fromSecretKey(privateKeyBytes);
}

/**
 * Get SOL balance
 */
export async function getSolBalance(address: string): Promise<string> {
  const connection = getSolanaConnection();
  const publicKey = new PublicKey(address);
  const balance = await connection.getBalance(publicKey);
  return (balance / LAMPORTS_PER_SOL).toString();
}

/**
 * Get SPL token balance
 */
export async function getSPLTokenBalance(
  walletAddress: string,
  tokenMintAddress: string
): Promise<string> {
  const connection = getSolanaConnection();
  const walletPublicKey = new PublicKey(walletAddress);
  const tokenMintPublicKey = new PublicKey(tokenMintAddress);

  try {
    const associatedTokenAddress = await getAssociatedTokenAddress(
      tokenMintPublicKey,
      walletPublicKey
    );

    const tokenAccount = await getAccount(connection, associatedTokenAddress);
    
    // Get token mint info to determine decimals
    const mintInfo = await connection.getParsedAccountInfo(tokenMintPublicKey);
    const decimals = (mintInfo.value?.data as ParsedAccountData)?.parsed?.info?.decimals || 9;
    
    return (Number(tokenAccount.amount) / Math.pow(10, decimals)).toString();
  } catch (error) {
    console.error('Error getting SPL token balance:', error);
    return '0';
  }
}

/**
 * Send SOL
 */
export async function sendSol(
  toAddress: string,
  amount: string,
  fromKeypair?: Keypair
): Promise<string> {
  const connection = getSolanaConnection();
  const keypair = fromKeypair || getTreasuryKeypair();
  const toPublicKey = new PublicKey(toAddress);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: toPublicKey,
      lamports: Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL)
    })
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
  return signature;
}

/**
 * Send SPL token
 */
export async function sendSPLToken(
  tokenMintAddress: string,
  toAddress: string,
  amount: string,
  decimals: number,
  fromKeypair?: Keypair
): Promise<string> {
  const connection = getSolanaConnection();
  const keypair = fromKeypair || getTreasuryKeypair();
  const tokenMintPublicKey = new PublicKey(tokenMintAddress);
  const toPublicKey = new PublicKey(toAddress);

  // Get associated token addresses
  const fromTokenAddress = await getAssociatedTokenAddress(
    tokenMintPublicKey,
    keypair.publicKey
  );

  const toTokenAddress = await getAssociatedTokenAddress(
    tokenMintPublicKey,
    toPublicKey
  );

  const transaction = new Transaction().add(
    createTransferInstruction(
      fromTokenAddress,
      toTokenAddress,
      keypair.publicKey,
      Math.floor(parseFloat(amount) * Math.pow(10, decimals))
    )
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
  return signature;
}

/**
 * Get transaction details
 */
export async function getSolanaTransactionDetails(
  signature: string
): Promise<TransactionData | null> {
  const connection = getSolanaConnection();

  try {
    const transaction = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0
    });

    if (!transaction) {
      return null;
    }

    const meta = transaction.meta;
    if (!meta) {
      return null;
    }

    // Extract basic transaction info
    const preBalances = meta.preBalances;
    const postBalances = meta.postBalances;
    const accountKeys = transaction.transaction.message.staticAccountKeys;

    // Calculate transferred amount (simplified)
    let transferAmount = '0';
    if (preBalances.length > 0 && postBalances.length > 0) {
      const diff = Math.abs(postBalances[0] - preBalances[0]);
      transferAmount = (diff / LAMPORTS_PER_SOL).toString();
    }

    return {
      hash: signature,
      from: accountKeys[0]?.toString() || '',
      to: accountKeys[1]?.toString() || '',
      value: transferAmount,
      blockNumber: transaction.slot,
      timestamp: transaction.blockTime || 0,
      status: meta.err ? 'failed' : 'confirmed'
    };
  } catch (error) {
    console.error('Error fetching Solana transaction details:', error);
    return null;
  }
}

/**
 * Wait for transaction confirmation
 */
export async function waitForSolanaConfirmation(
  signature: string,
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
): Promise<boolean> {
  const connection = getSolanaConnection();

  try {
    const result = await connection.confirmTransaction(signature, commitment);
    return !result.value.err;
  } catch (error) {
    console.error('Error waiting for Solana confirmation:', error);
    return false;
  }
}

/**
 * Get current slot (block number equivalent)
 */
export async function getCurrentSlot(): Promise<number> {
  const connection = getSolanaConnection();
  return await connection.getSlot();
}

/**
 * Get account info
 */
export async function getAccountInfo(address: string) {
  const connection = getSolanaConnection();
  const publicKey = new PublicKey(address);
  return await connection.getAccountInfo(publicKey);
}

/**
 * Get token accounts for a wallet
 */
export async function getTokenAccounts(walletAddress: string) {
  const connection = getSolanaConnection();
  const walletPublicKey = new PublicKey(walletAddress);
  
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    walletPublicKey,
    { programId: TOKEN_PROGRAM_ID }
  );

  return tokenAccounts.value.map(account => ({
    address: account.pubkey.toString(),
    mint: account.account.data.parsed.info.mint,
    amount: account.account.data.parsed.info.tokenAmount.uiAmount,
    decimals: account.account.data.parsed.info.tokenAmount.decimals
  }));
}

/**
 * Get transaction history for an address
 */
export async function getTransactionHistory(
  address: string,
  limit: number = 10
): Promise<ConfirmedSignatureInfo[]> {
  const connection = getSolanaConnection();
  const publicKey = new PublicKey(address);
  
  return await connection.getSignaturesForAddress(publicKey, { limit });
}

/**
 * Generate new Solana keypair
 */
export function generateSolanaKeypair(): { address: string; privateKey: string } {
  const keypair = Keypair.generate();
  return {
    address: keypair.publicKey.toString(),
    privateKey: Buffer.from(keypair.secretKey).toString('base64')
  };
}

/**
 * Get associated token address
 */
export async function getAssociatedTokenAddressForMint(
  mintAddress: string,
  ownerAddress: string
): Promise<string> {
  const mintPublicKey = new PublicKey(mintAddress);
  const ownerPublicKey = new PublicKey(ownerAddress);
  
  const associatedTokenAddress = await getAssociatedTokenAddress(
    mintPublicKey,
    ownerPublicKey
  );
  
  return associatedTokenAddress.toString();
}

/**
 * Check if account exists
 */
export async function accountExists(address: string): Promise<boolean> {
  const connection = getSolanaConnection();
  const publicKey = new PublicKey(address);
  
  try {
    const accountInfo = await connection.getAccountInfo(publicKey);
    return accountInfo !== null;
  } catch {
    return false;
  }
}

/**
 * Get minimum rent exemption
 */
export async function getMinimumRentExemption(dataLength: number): Promise<number> {
  const connection = getSolanaConnection();
  return await connection.getMinimumBalanceForRentExemption(dataLength);
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toString();
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: string): number {
  return Math.floor(parseFloat(sol) * LAMPORTS_PER_SOL);
}