
const cron = require("node-cron");
const CoinGecko = require("coingecko-api");
const { redlock, setAsync } = require("../../config/redisClient");
let coingecko = new CoinGecko();

const fetchAndSaveCryptoPrices = async () => {
  try {
    let data = await coingecko.simple.price({
      ids: [
        "ethereum",
        "solana",
        "basic-attention-token",
        "neo-tokyo",
        "brett-2-0",
        "degen-base",
        "toshi",
        "mister-miggles",
        "basenji",
        "dook",
        "crypto-journey",
        "star-atlas",
        "aurory",
        "ben-the-dog",
        "bonk",
        "book-of-meme",
        "cat-in-a-dogs-world",
        "catwifhat-2",
        "duko",
        "genopets",
        "jupiter-exchange-solana",
        "maga",
        "maneki",
        "metaplex",
        "myro",
        "orca",
        "star-atlas-dao",
        "ponke",
        "popcat",
        "pyth-network",
        "raydium",
        "slerf",
        "smog",
        "solama",
        "step-finance",
        "stepn",
        "tensor",
        "wen-4",
        "wormhole",
        "bird-dog"
      ],
      vs_currencies: ["usd"],
      headers: {
        'x-cg-pro-api-key': process.env.COINGECKO_API_KEY
      }
    });

    if (data && data.success) {
      // Save into Redis
      await setAsync('crypto:prices', JSON.stringify(data.data));
    } else {
      console.log("No data received from CoinGecko", new Date());
    }
  } catch (error) {
    console.error("Error fetching crypto prices:", error);
  }
};

const updateCryptoPrices = async () => {
  console.log("Initialize CRON for getting crypto prices");
  const cronJob = async () => {
    try {
      // Attempt to acquire the lock
      await redlock.acquire(['get-crypto-price'], 10 * 60 * 1000); // 600000 ms = 10 minutes
      await fetchAndSaveCryptoPrices();
    } catch (error) {
      // console.log(error)
    }
  };

  // Immediate execution at runtime with lock
  await cronJob();
  // Schedule the task to run every 10 minutes
  cron.schedule("*/10 * * * *", cronJob);
};

module.exports = updateCryptoPrices;
