import { ethers } from 'ethers';
import { TransactionData, SmartContractCall } from './types';
export declare function getEthereumProvider(chainId: string): ethers.JsonRpcProvider;
export declare function getTreasuryWallet(chainId: string): ethers.Wallet;
export declare function getCurrentGasPrice(chainId: string): Promise<bigint>;
export declare function estimateGas(chainId: string, transaction: {
    to: string;
    value?: string;
    data?: string;
}): Promise<bigint>;
export declare function getNativeBalance(chainId: string, address: string): Promise<string>;
export declare function getERC20Balance(chainId: string, tokenAddress: string, walletAddress: string): Promise<string>;
export declare function sendNativeToken(chainId: string, toAddress: string, amount: string, privateKey?: string): Promise<string>;
export declare function sendERC20Token(chainId: string, tokenAddress: string, toAddress: string, amount: string, decimals: number, privateKey?: string): Promise<string>;
export declare function getTransactionDetails(chainId: string, txHash: string): Promise<TransactionData | null>;
export declare function waitForConfirmation(chainId: string, txHash: string, confirmations?: number): Promise<boolean>;
export declare function getCurrentBlockNumber(chainId: string): Promise<number>;
export declare function getBlockDetails(chainId: string, blockNumber: number): Promise<ethers.Block | null>;
export declare function executeContractCall(chainId: string, contractCall: SmartContractCall, privateKey?: string): Promise<string>;
export declare function generateWallet(): {
    address: string;
    privateKey: string;
};
export declare function toWei(amount: string, decimals: number): bigint;
export declare function fromWei(amount: bigint, decimals: number): string;
export declare function isContract(chainId: string, address: string): Promise<boolean>;
//# sourceMappingURL=ethereum.d.ts.map