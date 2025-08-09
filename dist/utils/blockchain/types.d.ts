export interface TokenAmount {
    amount: string;
    tokenContract: string;
    chainId: string;
    decimals: number;
    symbol: string;
}
export interface ChainBalance {
    chainId: string;
    tokens: TokenBalance[];
    nativeToken: TokenBalance;
}
export interface TokenBalance {
    symbol: string;
    balance: string;
    decimals: number;
    contractAddress?: string;
    usdValue?: number;
    isNativeToken: boolean;
}
export interface MultiChainBalance {
    ethereum: ChainBalance;
    solana: ChainBalance;
    polygon: ChainBalance;
    base: ChainBalance;
    [chainId: string]: ChainBalance;
}
export interface TransactionData {
    hash: string;
    from: string;
    to: string;
    value: string;
    blockNumber: number;
    timestamp: number;
    gasUsed?: string;
    gasPrice?: string;
    status: 'pending' | 'confirmed' | 'failed';
}
export interface DepositAddress {
    address: string;
    chainId: string;
    tokenContract?: string;
    userId: string;
    createdAt: Date;
}
export interface WithdrawalRequest {
    id: string;
    userId: string;
    amount: TokenAmount;
    destinationAddress: string;
    status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
    adminApproval?: {
        adminId: string;
        approvedAt: Date;
        notes?: string;
    };
    transactionHash?: string;
    createdAt: Date;
    completedAt?: Date;
}
export interface BlockchainNetwork {
    chainId: string;
    name: string;
    rpcUrl: string;
    explorerUrl: string;
    nativeToken: {
        symbol: string;
        decimals: number;
    };
    isTestnet: boolean;
}
export interface NFTMetadata {
    name: string;
    description: string;
    image: string;
    attributes?: Array<{
        trait_type: string;
        value: string | number;
    }>;
    external_url?: string;
}
export interface NFTData {
    contractAddress: string;
    tokenId: string;
    chainId: string;
    metadata: NFTMetadata;
    owner: string;
}
export interface SmartContractCall {
    contractAddress: string;
    functionName: string;
    parameters: any[];
    value?: string;
    gasLimit?: string;
}
export interface VRFRequest {
    requestId: string;
    raffleId: string;
    chainId: string;
    transactionHash: string;
    status: 'pending' | 'fulfilled' | 'failed';
    randomness?: string;
    createdAt: Date;
    fulfilledAt?: Date;
}
export type SupportedChain = 'ethereum' | 'solana' | 'polygon' | 'base' | 'bsc' | 'arbitrum' | 'optimism' | 'avalanche';
export interface ChainConfig {
    chainId: string;
    name: string;
    rpcUrl: string;
    explorerUrl: string;
    nativeToken: {
        symbol: string;
        decimals: number;
        coingeckoId: string;
    };
    isEVM: boolean;
    isTestnet: boolean;
    blockTime: number;
    confirmations: number;
}
//# sourceMappingURL=types.d.ts.map