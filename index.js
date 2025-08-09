const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const connectWithRetry = require("./config/database");
const { validateConfigurationOrExit } = require("./utils/configValidator");

// Validate configuration before starting the application
validateConfigurationOrExit();
const sessionMiddleware = require("./middleware/session");
const rateLimiter = require("./middleware/rateLimiter");
const corsOptions = require("./config/cors");
const io = require("./config/socket");
const setupSocketHandlers = require("./services/socket/setupSocketHandlers");
const updateCryptoPrices = require("./services/coingecko/updateCryptoPrices");
const {
	validateAPIKey,
	validateSecFetchSite,
} = require("./middleware/validate");
const leaderboardUpdater = require("./utils/schedulers/leaderboardUpdater");
const cronUpdateGamezoneDashboard = require("./services/socket/gamezoneDashboardUpdate");

const userRouter = require("./routes/userRoutes");
const gameRouter = require("./routes/gameRoutes");
const imageRouter = require("./routes/imageRoutes");
const adminRouter = require("./routes/adminRoutes");
const raffleRouter = require("./routes/raffleRoutes");
const cryptoRouter = require("./routes/cryptoRoutes");
const clientRouter = require("./routes/clientRoutes");
const healthRouter = require("./routes/healthRoutes");
const houseRouter = require("./routes/houseRoutes");
const gamingApiRouter = require("./routes/gamingApiRoutes");
const wageringApiRouter = require("./routes/wageringApiRoutes");
const specificGamesRouter = require("./routes/specificGamesRoutes");
const secureGameRouter = require("./routes/secureGameRoutes");
const unifiedSecureGameRouter = require("./routes/unifiedSecureGameRoutes");
const pointsRouter = require("./routes/pointsRoutes");
const foundersKeyRouter = require("./routes/foundersKeyRoutes");
const allowlistRouter = require("./routes/allowlistRoutes");
const realTimeRouter = require("./routes/realTimeRoutes");
const fundManagementRouter = require("./routes/fundManagementRoutes");
const affiliateRouter = require("./routes/affiliateRoutes");
const discordOAuthRouter = require("./routes/discordOAuthRoutes");
const monitoringRouter = require("./routes/monitoringRoutes");
const checkAndHandleGiveaways = require("./utils/schedulers/jackpotGiveawayScheduler");
const { drawRaffleWinners, checkForSoldOutRaffles } = require("./services/alchemy/vrfDrawRaffleWinner");
const clientExpirationCheck = require("./services/cron-jobs/clientExpirationCheck");
const {
	checkForEndedAllowlists,
	drawAllowlistWinners,
} = require("./services/cron-jobs/endedAllowlistCheck");
const startGameSessionCleanup = require("./services/cron-jobs/gameSessionCleanup");
const realTimeCleanup = require("./services/cron-jobs/realTimeCleanup");
const monitoringManager = require("./services/monitoring");

const app = express();
const httpServer = http.createServer(app);
// Attach Socket.IO to the HTTP server
io.attach(httpServer);

updateCryptoPrices();
connectWithRetry();
app.use(cors(corsOptions));
app.enable("trust proxy");
app.use(mongoSanitize());
app.use(helmet());
app.use(sessionMiddleware);

app.use(express.json());
app.use(rateLimiter({ durationSec: 60, allowedHits: 1000, isGeneral: true }));

// dev environment only
// app.use((req, res, next) => {
//   console.log(req.headers.origin, "ORIGN")
//   if (req.headers.origin === "http://localhost:3000") {
//     next();
//   } else {
//     validateSecFetchSite(req, res, next);
//   }
// });
// app.use(validateSecFetchSite); // for prod

app.get("/", (req, res) => {
	res.send({ version: "1.0.0" });
});

app.use(validateAPIKey);

// Health check routes (before API key validation for monitoring)
app.use("/", healthRouter);

app.use("/user", userRouter);
app.use("/game", gameRouter);
app.use("/image", imageRouter);
app.use("/admin", adminRouter);
app.use("/raffle", raffleRouter);
app.use("/crypto", cryptoRouter);
app.use("/client", clientRouter);
app.use("/house", houseRouter);
app.use("/gaming-api", gamingApiRouter);
app.use("/wagering-api", wageringApiRouter);
app.use("/specific-games", specificGamesRouter);
app.use("/secure-games", secureGameRouter);
app.use("/unified-secure-games", unifiedSecureGameRouter);
app.use("/api/points", pointsRouter);
app.use("/api/founders-keys", foundersKeyRouter);
app.use("/api/allowlists", allowlistRouter);
app.use("/api/realtime", realTimeRouter);
app.use("/api/fund-management", fundManagementRouter);
app.use("/api/affiliate", affiliateRouter);
app.use("/api/discord/oauth", discordOAuthRouter);
app.use("/api/monitoring", monitoringRouter);

const port = process.env.PORT || 3000;

// app.listen(port, () => console.log(`listening on port ${port}`));
httpServer.listen(port, () => console.log(`listening on port ${port}`));
// Setup socket event handlers
setupSocketHandlers(io);
// Initialize leaderboard in cache
// leaderboardUpdater();
cronUpdateGamezoneDashboard(io);
// Giveaway cron scheduler
checkAndHandleGiveaways();
// // Checks for any soldout raffles (not UNLIMITED)
checkForSoldOutRaffles();
// Draw raffle winners on vrf chainlink
drawRaffleWinners();
// Check for ended allowlist
checkForEndedAllowlists();
// Draw allowlist winners
drawAllowlistWinners();
// cron that will run every 12:01am everyday
// will send an email for client profile expiration notif
clientExpirationCheck();
// Start game session cleanup scheduler
startGameSessionCleanup();
// Start real-time cleanup jobs
realTimeCleanup.start();

// Initialize monitoring services
monitoringManager.initialize().catch(error => {
  console.error('Failed to initialize monitoring services:', error);
  // Don't exit the process, just log the error
});