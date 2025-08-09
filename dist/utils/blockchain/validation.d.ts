import { TokenAmount } from './types';
export declare function isValidEthereumAddress(address: string): boolean;
export declare function isValidSolanaAddress(address: string): boolean;
export declare function isValidAddress(address: string, chainId: string): boolean;
export declare function isValidTransactionHash(hash: string, chainId: string): boolean;
export declare function isValidTokenAmount(amount: string, decimals: number): boolean;
export declare function isValidTokenAmountObject(tokenAmount: TokenAmount): boolean;
export declare function isSupportedChain(chainId: string): boolean;
export declare function isSupportedToken(symbol: string, chainId: string): boolean;
export declare function isValidPrivateKey(privateKey: string, chainId: string): boolean;
export declare function isValidGasPrice(gasPrice: string): boolean;
export declare function isValidGasLimit(gasLimit: string): boolean;
export declare function isValidNonce(nonce: number): boolean;
export declare function sanitizeAddress(address: string): string;
export declare function sanitizeTransactionHash(hash: string): string;
export declare function validateWithdrawalRequest(amount: TokenAmount, destinationAddress: string, userId: string): {
    isValid: boolean;
    errors: string[];
};
export declare function validateDepositAddressRequest(userId: string, chainId: string, tokenContract?: string): {
    isValid: boolean;
    errors: string[];
};
//# sourceMappingURL=validation.d.ts.map