import { Connection, Keypair, ConfirmedSignatureInfo } from '@solana/web3.js';
import { TransactionData } from './types';
export declare function getSolanaConnection(): Connection;
export declare function getTreasuryKeypair(): Keypair;
export declare function getSolBalance(address: string): Promise<string>;
export declare function getSPLTokenBalance(walletAddress: string, tokenMintAddress: string): Promise<string>;
export declare function sendSol(toAddress: string, amount: string, fromKeypair?: Keypair): Promise<string>;
export declare function sendSPLToken(tokenMintAddress: string, toAddress: string, amount: string, decimals: number, fromKeypair?: Keypair): Promise<string>;
export declare function getSolanaTransactionDetails(signature: string): Promise<TransactionData | null>;
export declare function waitForSolanaConfirmation(signature: string, commitment?: 'processed' | 'confirmed' | 'finalized'): Promise<boolean>;
export declare function getCurrentSlot(): Promise<number>;
export declare function getAccountInfo(address: string): Promise<import("@solana/web3.js").AccountInfo<Buffer> | null>;
export declare function getTokenAccounts(walletAddress: string): Promise<{
    address: string;
    mint: any;
    amount: any;
    decimals: any;
}[]>;
export declare function getTransactionHistory(address: string, limit?: number): Promise<ConfirmedSignatureInfo[]>;
export declare function generateSolanaKeypair(): {
    address: string;
    privateKey: string;
};
export declare function getAssociatedTokenAddressForMint(mintAddress: string, ownerAddress: string): Promise<string>;
export declare function accountExists(address: string): Promise<boolean>;
export declare function getMinimumRentExemption(dataLength: number): Promise<number>;
export declare function lamportsToSol(lamports: number): string;
export declare function solToLamports(sol: string): number;
//# sourceMappingURL=solana.d.ts.map