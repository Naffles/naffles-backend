import { ChainConfig, SupportedChain } from './types';
export declare const SUPPORTED_CHAINS: Record<SupportedChain, ChainConfig>;
export declare const TOKEN_DECIMAL_MULTIPLIERS: {
    points: number;
    nafflings: number;
    eth: number;
    sol: number;
    beth: number;
    matic: number;
    bnb: number;
    avax: number;
};
export declare const MINIMUM_CONFIRMATIONS: {
    ethereum: number;
    solana: number;
    polygon: number;
    base: number;
    bsc: number;
    arbitrum: number;
    optimism: number;
    avalanche: number;
};
export declare const GAS_LIMITS: {
    ETH_TRANSFER: string;
    ERC20_TRANSFER: string;
    ERC721_TRANSFER: string;
    CONTRACT_INTERACTION: string;
};
export declare const CHAINLINK_VRF_CONFIG: {
    ethereum: {
        coordinator: string;
        keyHash: string;
        subscriptionId: string;
        callbackGasLimit: string;
        requestConfirmations: number;
    };
    polygon: {
        coordinator: string;
        keyHash: string;
        subscriptionId: string;
        callbackGasLimit: string;
        requestConfirmations: number;
    };
    base: {
        coordinator: string;
        keyHash: string;
        subscriptionId: string;
        callbackGasLimit: string;
        requestConfirmations: number;
    };
};
export declare const TREASURY_WALLETS: {
    ethereum: string;
    solana: string;
    polygon: string;
    base: string;
    bsc: string;
    arbitrum: string;
    optimism: string;
    avalanche: string;
};
export declare const SUPPORTED_TOKENS: {
    ethereum: {
        symbol: string;
        address: string;
        decimals: number;
    }[];
    solana: {
        symbol: string;
        address: string;
        decimals: number;
    }[];
    polygon: {
        symbol: string;
        address: string;
        decimals: number;
    }[];
    base: {
        symbol: string;
        address: string;
        decimals: number;
    }[];
};
export declare const ERROR_CODES: {
    INSUFFICIENT_BALANCE: string;
    INVALID_ADDRESS: string;
    NETWORK_ERROR: string;
    TRANSACTION_FAILED: string;
    UNSUPPORTED_CHAIN: string;
    INVALID_TOKEN: string;
    GAS_ESTIMATION_FAILED: string;
    NONCE_TOO_LOW: string;
    REPLACEMENT_UNDERPRICED: string;
};
//# sourceMappingURL=constants.d.ts.map