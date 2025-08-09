module.exports = {
  DEV_ENVIRONMENTS: ["localhost", "development"],
  MONGO_IP: process.env.MONGO_IP || "mongo",
  MONGO_PORT: process.env.MONGO_PORT || 27017,
  MONGO_USER: process.env.MONGO_USER,
  MONGO_PASSWORD: process.env.MONGO_PASSWORD,
  REDIS_URL: process.env.REDIS_URL || "localhost",
  REDIS_PORT: process.env.REDIS_PORT || 6379,
  SESSION_SECRET: process.env.SESSION_SECRET,
  GCS_PROFILE_PICTURE_TTL: 6 * 60 * 60, // 6 hours
  GAME_TIMEOUT: 10,
  JOIN_REQUEST_TIMEOUT: 180,
  USER_CONNECTION_TIMEOUT: 1,
  GENERAL_REDIS_TIMEOUT: 60 * 60,
  COIN_TOSS_PLAYER_PICK_TIMEOUT: 30,
  userRoles: ["user", "admin", "super"],
  EMAIL_REQUEST_CHANGE_TIMEOUT_S: 10 * 60, // 10 minutes
  SEND_EMAIL_VERIFICATION_CODE_TIMEOUT_S: 10 * 60,
  JACKPOT_INTERVAL_SECONDS: 10,
  VALID_GAMES: ["rockPaperScissors", "coinToss", "blackjack"],
  IMAGE_LINK_EXPIRATION_IN_SECONDS: 6 * 60 * 60, // 6hrs
  REDIS_IMAGE_KEY: "userCachedProfileImage:",
  REDIS_FEATURED_COMMUNITY_IMAGE_KEY: "cachedFeaturedCommunityImage:",
  REDIS_FEATURED_TOKEN_IMAGE_KEY: "cachedFeaturedTokenImage:",
  TOKEN_DECIMAL_MULTIPLIER: {
    points: 10 ** 18,
    nafflings: 10 ** 18,
    eth: 10 ** 18,
    sol: 10 ** 9,
    beth: 10 ** 18
    // Add more tokens and their decimal multipliers here
  },
  TICKER_TO_TOKEN_NAME: {
    eth: "ethereum",
    sol: "solana",
    beth: "ethereum", // ethereum because this is an EVM L2
    bat: "basic-attention-token",
    bytes: "neo-tokyo",
    brett: "brett-2-0",
    degen: "degen-base",
    toshi: "toshi",
    miggles: "mister-miggles",
    basenji: "basenji",
    dook: "dook",
    daddy: "crypto-journey",
    atlas: "star-atlas",
    aurory: "aurory",
    bendog: "ben-the-dog",
    bonk: "bonk",
    bome: "book-of-meme",
    mew: "cat-in-a-dogs-world",
    cwif: "catwifhat-2",
    duko: "duko",
    gene: "genopets",
    jup: "jupiter-exchange-solana",
    trump: "maga",
    maneki: "maneki",
    mplx: "metaplex",
    myro: "myro",
    orca: "orca",
    polis: "star-atlas-dao",
    ponke: "ponke",
    popcat: "popcat",
    pyth: "pyth-network",
    ray: "raydium",
    slerf: "slerf",
    smog: "smog",
    solama: "solama",
    step: "step-finance",
    gmt: "stepn",
    tnsr: "tensor",
    wen: "wen-4",
    w: "wormhole",
    bird: "bird-dog",
  },
  LOTTERY_TYPES: ["NFT", "TOKEN", "ALLOWLIST", "NAFFLINGS"],
  RAFFLE_TYPES: ["RESERVE", "UNCONDITIONAL", "UNLIMITED"],
  // fees will be multiplied by 100 for precision
  TOKEN_FEE_IN_DOLLARS: {
    spl: 200, // 2
    erc20: 2000, // 20
    evml2: 200, // 2
  },
  NATIVE_TOKEN_FEE_IN_DOLLARS: {
    sol: 50, // .5
    eth: 500, // 5
    evml2: 50, // 0.5 BASE ETH EVM L2
    beth: 50 // need this for each L2 for getting of crypto price - just copy the evml2 value
  },
  VALID_COMMUNITY_TASK: ['twitter', 'telegram', 'discord'],
  TELEGRAM_NAFFLES_CHANNEL: "nafflingsofficial",
  DISCORD_NAFFLES_SERVER_ID: "960769667566288966",
  TWITTER_NAFFLES_OFFICIAL_USERNAME: "Nafflesofficial",
  TWITTER_NAFFLES_POST_FOR_AIRDROP_RETWEET: "https://x.com/nafflings/status/1869049484480503927"
};
