const { Web3 } = require("web3");
const crypto = require('crypto');

// Polygon-optimized VRF configuration
const VRF_POLYGON_CONFIG = {
  NETWORK: 'polygon',
  CHAIN_ID: '137',
  RPC_URL: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
  VRF_COORDINATOR: process.env.POLYGON_VRF_COORDINATOR || '0xAE975071Be8F8eE67addBC1A82488F1C24858067',
  VRF_KEY_HASH: process.env.POLYGON_VRF_KEY_HASH || '0xcc294a196eeeb44da2888d17c0625cc88d70d9760a69d58d853ba6581a9ab0cd',
  VRF_SUBSCRIPTION_ID: process.env.POLYGON_VRF_SUBSCRIPTION_ID || '1',
  CALLBACK_GAS_LIMIT: parseInt(process.env.POLYGON_VRF_CALLBACK_GAS_LIMIT) || 200000,
  REQUEST_CONFIRMATIONS: parseInt(process.env.POLYGON_VRF_REQUEST_CONFIRMATIONS) || 3,
  LINK_TOKEN_ADDRESS: process.env.POLYGON_LINK_TOKEN || '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
  VRF_WALLET_ADDRESS: process.env.POLYGON_VRF_WALLET_ADDRESS,
  VRF_WALLET_PRIVATE_KEY: process.env.POLYGON_VRF_WALLET_PRIVATE_KEY
};

// Enhanced VRF contract ABI with Polygon-specific optimizations
const VRF_POLYGON_ABI = [
  {
    "inputs": [],
    "name": "acceptOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_vrfCoordinator",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "_subscriptionId",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "_gasLaneKeyHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "_callbackGasLimit",
        "type": "uint32"
      },
      {
        "internalType": "uint16",
        "name": "_requestConfirmations",
        "type": "uint16"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "range",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "enableNativePayment",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "isAllowlist",
        "type": "bool"
      },
      {
        "internalType": "string",
        "name": "sourceChain",
        "type": "string"
      }
    ],
    "name": "drawWinnerCrossChain",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "internalType": "uint256[]",
        "name": "randomWords",
        "type": "uint256[]"
      }
    ],
    "name": "rawFulfillRandomWords",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_subscriptionId",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "_gasLaneKeyHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "_callbackGasLimit",
        "type": "uint32"
      },
      {
        "internalType": "uint16",
        "name": "_requestConfirmations",
        "type": "uint16"
      }
    ],
    "name": "setChainlinkVRFSettings",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_vrfCoordinator",
        "type": "address"
      }
    ],
    "name": "setCoordinator",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "chainlinkRequestStatus",
    "outputs": [
      {
        "internalType": "bool",
        "name": "fulfilled",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "exists",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "randomNumber",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "range",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "naffleId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "randomWords",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isAllowlist",
        "type": "bool"
      },
      {
        "internalType": "string",
        "name": "sourceChain",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "naffleIdToChainlinkRequestId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "chainlinkVRFSubscriptionId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "chainlinkVRFGasLaneKeyHash",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "chainlinkVRFCallbackGasLimit",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "s_vrfCoordinator",
    "outputs": [
      {
        "internalType": "contract IVRFCoordinatorV2Plus",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "naffleId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "winningNumber",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "randomWords",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "sourceChain",
        "type": "string"
      }
    ],
    "name": "ChainlinkRequestFulfilled",
    "type": "event"
  }
];

// LINK token ABI for balance checking and transfers
const LINK_TOKEN_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "transfer",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// Initialize Web3 instance for Polygon
const WEB3_POLYGON = new Web3(VRF_POLYGON_CONFIG.RPC_URL);

// Secure wallet management
class SecureVRFWallet {
  constructor() {
    this.wallet = null;
    this.isInitialized = false;
  }

  initialize() {
    if (!VRF_POLYGON_CONFIG.VRF_WALLET_PRIVATE_KEY) {
      throw new Error('VRF wallet private key not configured');
    }

    try {
      // Decrypt private key if it's encrypted
      const privateKey = this.decryptPrivateKey(VRF_POLYGON_CONFIG.VRF_WALLET_PRIVATE_KEY);
      this.wallet = WEB3_POLYGON.eth.accounts.wallet.add(privateKey)[0];
      this.isInitialized = true;
      
      console.log(`VRF Wallet initialized: ${this.wallet.address}`);
    } catch (error) {
      console.error('Failed to initialize VRF wallet:', error);
      throw new Error('VRF wallet initialization failed');
    }
  }

  decryptPrivateKey(encryptedKey) {
    // If the key starts with 0x, it's not encrypted
    if (encryptedKey.startsWith('0x')) {
      return encryptedKey;
    }

    // Decrypt using environment encryption key
    const encryptionKey = process.env.ENCRYPTION_SECRET_KEY;
    if (!encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    try {
      const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
      let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Failed to decrypt VRF private key:', error);
      throw new Error('Private key decryption failed');
    }
  }

  getWallet() {
    if (!this.isInitialized) {
      this.initialize();
    }
    return this.wallet;
  }

  getAddress() {
    return this.getWallet().address;
  }
}

// Initialize secure wallet instance
const vrfWallet = new SecureVRFWallet();

// Contract instances
const getVRFContract = () => {
  const contractAddress = process.env.POLYGON_VRF_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error('Polygon VRF contract address not configured');
  }
  return new WEB3_POLYGON.eth.Contract(VRF_POLYGON_ABI, contractAddress);
};

const getLinkContract = () => {
  return new WEB3_POLYGON.eth.Contract(LINK_TOKEN_ABI, VRF_POLYGON_CONFIG.LINK_TOKEN_ADDRESS);
};

module.exports = {
  VRF_POLYGON_CONFIG,
  VRF_POLYGON_ABI,
  LINK_TOKEN_ABI,
  WEB3_POLYGON,
  vrfWallet,
  getVRFContract,
  getLinkContract,
  SecureVRFWallet
};