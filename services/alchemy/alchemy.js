const { Alchemy } = require("alchemy-sdk");
const { alchemyConfigs } = require("../../config/alchemy");

const createAlchemyInstance = (network) => {
  let instance = null;
  try {
    if (alchemyConfigs[network]) {
      instance = new Alchemy(alchemyConfigs[network]);
    } else {
      throw new Error(`Alchemy configuration for network "${network}" not found`);
    }
  } catch (error) {
    console.error(`Error creating Alchemy instance: ${error.message}`);
  }
  return instance;
};

module.exports = {
  createAlchemyInstance,
};
