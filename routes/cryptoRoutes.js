const express = require("express");
const router = express.Router();
const rateLimiter = require("../middleware/rateLimiter");
const { getCryptoPrice, getUserNfts, getTokenDecimalMultiplier, getTokenContractsForLotteries, getUserTokenBalance } = require("../controllers/cryptoController");
const { authenticate } = require("../middleware/authenticate");

// get crypto price
router.get(
  "/price",
  rateLimiter({ durationSec: 60, allowedHits: 200 }),
  getCryptoPrice
);

router.get(
  "/get-user-nft",
  rateLimiter({ durationSec: 60, allowedHits: 200 }),
  authenticate,
  getUserNfts
);

router.get(
  "/get-token-decimal-multiplier",
  rateLimiter({ durationSec: 60, allowedHits: 200 }),
  getTokenDecimalMultiplier
);

router.get(
  "/supported-token/info-list",
  rateLimiter({ durationSec: 60, allowedHits: 200 }),
  getTokenContractsForLotteries
);

router.get(
  "/user-wallet-balance",
  rateLimiter({ durationSec: 60, allowedHits: 200 }),
  authenticate,
  getUserTokenBalance
);

module.exports = router;
