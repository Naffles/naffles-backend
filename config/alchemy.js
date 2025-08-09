const { Network } = require("alchemy-sdk");

console.log(`Running in ${process.env.NODE_ENV} mode`);

// all evms api keys are the same for mainnet and sepolia
const alchemyConfigs = {
  mainnet: {
    apiKey: process.env.ALCHEMY_API_KEY_ETH_MAINNET,
    network: Network.ETH_MAINNET,
  },
  sepolia: {
    apiKey: process.env.ALCHEMY_API_KEY_SEPOLIA,
    network: Network.ETH_SEPOLIA,
  },
  "base-mainnet": {
    apiKey: process.env.ALCHEMY_API_KEY_ETH_MAINNET,
    network: Network.BASE_MAINNET,
  },
  "base-sepolia": {
    apiKey: process.env.ALCHEMY_API_KEY_SEPOLIA,
    network: Network.BASE_SEPOLIA,
  },
  // polygon: {
  //   apiKey: process.env.ALCHEMY_API_KEY_POLYGON,
  //   network: networkMap[process.env.ALCHEMY_NETWORK_POLYGON] || Network.MATIC_MAINNET,
  // },
  // Add other configurations as needed
};

// Define a map for chainId to network name
const chainIdToNetworkMap = {
  "1": "mainnet",
  "11155111": "sepolia",
  "8453": "base-mainnet",
  "84532": "base-sepolia"
  // Add additional chainId to network mappings here
};

module.exports = { alchemyConfigs, chainIdToNetworkMap };
