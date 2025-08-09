const mongoose = require("mongoose");
const User = require("../models/user/user");
const WalletAddress = require("../models/user/walletAddress");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { deleteFile, getSignedUrl, getAndOrSetCachedSignedUrl, getDownloadSignedUrl } = require("../services/gcs");
const { convertToWebpAndUpload, convertToNum, convertToUsd } = require("../utils/convert");
const sendResponse = require("../utils/responseHandler");
const { generateTemporaryPassword, generateRandomToken } = require("../utils/random");
const { setAsync, getAsync } = require("../config/redisClient");
const { sendUserTemporaryPassword, sendEmailForEmailChangeRequest, sendWithdrawNotification } = require("../utils/sendEmail");
const Deposit = require("../models/transactions/deposit");
const WalletBalance = require("../models/user/walletBalance");
const createWalletBalance = require("../utils/createWalletBalance");
const { EMAIL_REQUEST_CHANGE_TIMEOUT_S, IMAGE_LINK_EXPIRATION_IN_SECONDS, REDIS_IMAGE_KEY, TICKER_TO_TOKEN_NAME, TOKEN_FEE_IN_DOLLARS, NATIVE_TOKEN_FEE_IN_DOLLARS, TELEGRAM_NAFFLES_CHANNEL, DISCORD_NAFFLES_SERVER_ID, TWITTER_NAFFLES_OFFICIAL_USERNAME, TWITTER_NAFFLES_POST_FOR_AIRDROP_RETWEET } = require("../config/config");
const userLogService = require("../services/userLog");
const Withdraw = require("../models/transactions/withdraw");
const ActiveGame = require("../models/game/activeGame");
const { givePoints } = require("../services/pointsService");
const UserDepositAndWithdrawHistory = require("../models/analytics/userDepositAndWithdrawHistory");
const { Treasury, initializeTreasury } = require("../models/analytics/treasury");
const validator = require("validator");
const { fetchTopNafflers, fetchTopGamers, formatLeaderboard } = require("../utils/updateLeaderboardInCache");
const UserStats = require("../models/analytics/userStats");
const GameHistory = require("../models/game/gameHistory");
const { calculateChallengerBuyInAmount } = require("../services/socket/helpers");
const { getUserProfileImage } = require("../utils/image");
const { getSupportedTokenDecimalMultiplier } = require("../utils/helpers");
const { AllowableTokenContractsForLotteries } = require("../models/admin/fileUploadSettings/uploadableContent");
const UserHistory = require("../models/user/userHistory");
const ClientShop = require("../models/client/items/shop/clientShop");
const Airdrop = require("../models/events/airdrop");
const { isBotInGuildFunction, isUserInGuildFunction, isBotInTelegramChannelFunction, isUserInTelegramChannel } = require("../middleware/validate");
const { joinAirdropcheckTwitterFollowQueue, joinAirdropcheckTwitterRetweetQueue } = require("../config/queue");
const clientService = require("../services/clientService");
const { AdminSettings } = require("../models/admin/adminSettings");
const userProfileService = require("../services/userProfileService");
const ActionItem = require("../models/user/actionItem");

exports.getRaffleServiceFee = async (req, res) => {
  try {
    const adminSettings = await AdminSettings.findOne().select('raffleFeePercentage');
    if (!adminSettings) {
      return sendResponse(res, 404, "Settings not found.");
    }
    const raffleFee = adminSettings?.raffleFeePercentage || 0;
    return sendResponse(res, 200, "Fee percentage fetched successfully", raffleFee);
  } catch (error) {
    console.error("Something went wrong:", error);
    return sendResponse(res, 500, "Failed to fetch fee percentage", {
      error: error.message,
    });
  }
};

exports.searchUser = async (req, res) => {
  const { email } = req.query;
  try {
    if (!validator.isEmail(email)) {
      return sendResponse(res, 400, "Not a valid email address.");
    }

    // Check if email already exists
    let user = await User.findOne({ email: email }).lean();
    if (user) {
      return sendResponse(res, 400, "Email address is already taken.");
    }
    sendResponse(res, 200, "Email address is available to use.");
  } catch (error) {
    console.error("Failed to check email:", error);
    return sendResponse(res, 500, "Failed to check email");
  }
};

exports.addWallet = async (req, res) => {
  const { address, walletType, chainId = "1" } = req.body;

  // Check if the required fields are provided
  if (!address || !walletType) {
    return sendResponse(res, 400, "Address and wallet type are required.");
  }

  // Validate walletType
  const validWalletTypes = ["phantom", "metamask"];
  if (!validWalletTypes.includes(walletType)) {
    return sendResponse(res, 400, "Invalid wallet type.");
  }

  try {
    const AuthService = require("../services/authService");
    
    const walletAddress = await AuthService.linkWalletToUser(req.user._id, {
      address,
      walletType,
      chainId
    });

    sendResponse(res, 201, "Wallet address added successfully.", {
      address: walletAddress.address,
      walletType: walletAddress.walletType,
      chainId: walletAddress.chainId,
      isPrimary: walletAddress.isPrimary,
      connectedAt: walletAddress.connectedAt
    });
  } catch (error) {
    console.error("Error adding wallet address:", error);
    sendResponse(res, 500, error.message || "An error occurred while adding the wallet address.");
  }
};

exports.deleteWallet = async (req, res) => {
  const { address } = req.body;
  // Check if the address is provided
  if (!address) {
    return sendResponse(res, 400, "Address is required.");
  }
  try {
    // Find the wallet address associated with the user
    const wallet = await WalletAddress.findOneAndDelete({ userRef: req.user._id, address });
    if (!wallet) {
      return sendResponse(res, 404, "Wallet address not found or not associated with the user.");
    }
    sendResponse(res, 200, "Wallet address deleted successfully.");
  } catch (error) {
    console.error("Error deleting wallet address:", error);
    sendResponse(res, 500, "An error occurred while deleting the wallet address.");
  }
};

exports.updateEmail = async (req, res) => {
  const { token } = req.body;

  try {
    // Retrieve the email and user ID associated with the token from Redis
    const newEmail = await getAsync(`user:${token}:emailChangeRequestNewEmail`);
    const userId = await getAsync(`user:${token}:emailChangeRequestUserId`);

    if (!newEmail || !userId) {
      return sendResponse(res, 400, "Invalid or expired token.");
    }

    // Find the user by ID and update the email
    const user = await User.findByIdAndUpdate(
      userId,
      { email: newEmail },
      { new: true, runValidators: true }
    );

    if (!user) {
      return sendResponse(res, 404, "User not found.");
    }

    sendResponse(res, 200, "Email updated successfully.", true);
  } catch (error) {
    console.error("Error updating email:", error);
    sendResponse(res, 500, "An error occurred while updating the email.");
  }
};

exports.updateUserProfile = async (req, res) => {
  const {
    username,
    email,
    password,
    twitterUsername,
    telegramId,
    telegramUsername,
    telegramName,
    discordId,
    discordUsername,
    discordName,
  } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const user = await User.findById(req.user._id).select('+password').session(session);
    if (!user) {
      await session.abortTransaction();
      return sendResponse(res, 404, "User not found.");
    }

    if (req.file) {
      const avatarKey = await convertToWebpAndUpload(req.file);
      if (avatarKey) {
        if (user.profileImage) {
          await deleteFile(user.profileImage, process.env.GCS_BUCKET_NAME);
        }
        user.profileImage = avatarKey;
      }
    }

    if (password) {
      if (!user.password) {
        user.password = await bcrypt.hash(password, 12);
      } else {
        await session.abortTransaction();
        return sendResponse(res, 404, "User already has a password.");
      }
    }

    if (username) {
      user.username = username;
    }

    if (email) {
      const randomToken = generateTemporaryPassword(24);
      await setAsync(`user:${randomToken}:emailChangeRequestNewEmail`, email, "EX", EMAIL_REQUEST_CHANGE_TIMEOUT_S);
      await setAsync(`user:${randomToken}:emailChangeRequestUserId`, user._id.toString(), "EX", EMAIL_REQUEST_CHANGE_TIMEOUT_S);

      await sendEmailForEmailChangeRequest(
        `${process.env.FE_URL}/gamezone/?open=verify&token=${randomToken}`,
        Math.floor(EMAIL_REQUEST_CHANGE_TIMEOUT_S / 60), // convert as minute
        email
      );
    }

    if (twitterUsername) user.socials.twitter.username = twitterUsername;
    if (telegramId) user.socials.telegram.id = telegramId;
    if (telegramName) user.socials.telegram.name = telegramName;
    if (telegramUsername) user.socials.telegram.username = telegramUsername;

    if (discordId) user.socials.discord.id = discordId;
    if (discordName) user.socials.discord.name = discordName;
    if (discordUsername) user.socials.discord.username = discordUsername;

    await user.save({ session });

    if (user.profileImage) {
      const profileImageUrl = await getSignedUrl(
        user.profileImage,
        process.env.GCS_BUCKET_NAME,
        IMAGE_LINK_EXPIRATION_IN_SECONDS
      );
      await setAsync(REDIS_IMAGE_KEY, profileImageUrl, "EX", IMAGE_LINK_EXPIRATION_IN_SECONDS);
    }
    // Remove the password field from the user object before sending the response
    user.password = undefined;
    await session.commitTransaction();
    return sendResponse(res, 200, "User profile updated successfully.", user);
  } catch (error) {
    await session.abortTransaction();
    console.error("Error updating user profile:", error);
    return sendResponse(res, 500, "An error occurred while updating the user profile.");
  } finally {
    session.endSession();
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const AuthService = require("../services/authService");
    
    // Get enhanced profile using AuthService
    const profile = await AuthService.getUserProfile(req.user._id);

    // Get wallet balance for financial information
    let userWalletBalance = await WalletBalance.findOne({ userRef: req.user._id });
    if (!userWalletBalance) {
      userWalletBalance = await createWalletBalance(req.user._id);
    }

    const multiplier = 10 ** 18; // number of decimals for precision
    const data = JSON.parse(await getAsync('crypto:prices'));

    // Fetch balances and convert them dynamically
    const userBalance = [];
    const sortedBalances = Array.from(userWalletBalance.balances.entries()).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    for (const [tokenx, balance] of sortedBalances) {
      const token = tokenx.toLowerCase();
      const tokenBalance = BigInt(balance || '0');
      const tokenPrice = BigInt(Math.round(data[TICKER_TO_TOKEN_NAME[token]]?.usd * Number(multiplier)) || '0');
      const tokenDecimal = await getSupportedTokenDecimalMultiplier(token) || 10 ** 9;
      const tokenBalanceConverted = (tokenBalance * tokenPrice) / BigInt(tokenDecimal * multiplier);
      userBalance.push({
        tokenType: token,
        amount: tokenBalance.toString(),
        conversion: tokenBalanceConverted ? tokenBalanceConverted.toString() : "--",
        id: generateRandomToken(),
        isWalletConnected: true // isWalletConnected
      });
    }

    const userProfile = {
      ...profile,
      profileImageUrl: await getUserProfileImage(profile.profileImage),
      temporaryPoints: await convertToNum(profile.temporaryPoints),
      walletAddresses: profile.wallets.map((wallet) => wallet.address),
      userBalance: userBalance,
      // Enhanced profile information
      foundersKeyBenefits: profile.foundersKeys ? profile.foundersKeys.reduce((benefits, key) => {
        benefits.feeDiscount = Math.max(benefits.feeDiscount, key.benefits.feeDiscount);
        benefits.priorityAccess = benefits.priorityAccess || key.benefits.priorityAccess;
        benefits.openEntryTickets += key.benefits.openEntryTickets;
        return benefits;
      }, { feeDiscount: 0, priorityAccess: false, openEntryTickets: 0 }) : { feeDiscount: 0, priorityAccess: false, openEntryTickets: 0 },
      authMethods: profile.authMethods,
      tier: profile.tier,
      lastLoginAt: profile.lastLoginAt,
      loginCount: profile.loginCount
    };

    sendResponse(res, 200, "User profile retrieved successfully.", userProfile);
  } catch (error) {
    console.error("Error retrieving user profile:", error);
    sendResponse(
      res,
      500,
      "An error occurred while retrieving the user profile."
    );
  }
};

exports.updateUserPassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!req.user || !req.user._id) {
    return sendResponse(res, 400, "User authentication failed.");
  }

  try {
    const user = await User.findById(req.user._id).select("password");
    if (!user) {
      return sendResponse(res, 404, "User not found.");
    }
    // Check if the provided password matches the stored hashed password
    const isPasswordMatch = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isPasswordMatch) {
      return sendResponse(res, 401, "Current password is incorrect.");
    }

    // Set new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();

    sendResponse(res, 200, "Password updated successfully.");
  } catch (error) {
    console.error("Error updating password:", error);
    sendResponse(res, 500, "Failed to update password.");
  }
};

exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return sendResponse(res, 400, "Email is required");
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return sendResponse(res, 404, "User not found");
    }

    const tempPassword = generateTemporaryPassword();
    // Store the temporary password in Redis with an expiration
    await setAsync(
      `user:${user._id}:tempPassword`,
      tempPassword,
      "EX",
      15 * 60
    ); // expires in 15 minutes

    await sendUserTemporaryPassword(tempPassword, email);
    return sendResponse(
      res,
      200,
      "Temporary password has been sent to your email."
    );
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, "Error in sending temporary password.");
  }
};

exports.resetPassword = async (req, res) => {
  const { email, tempPassword, newPassword } = req.body;
  if (!email || !tempPassword || !newPassword) {
    return sendResponse(
      res,
      400,
      "Email, temporary password, and new password are required"
    );
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return sendResponse(res, 404, "User not found");
    }

    // Retrieve the temporary password from Redis
    const storedTempPassword = await getAsync(`user:${user._id}:tempPassword`);
    if (tempPassword !== storedTempPassword) {
      return sendResponse(res, 401, "Invalid temporary password");
    }

    // Set new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();

    // Invalidate the temporary password in Redis
    await setAsync(`user:${user._id}:tempPassword`, "", "EX", 1);
    return sendResponse(res, 200, "Your password has been successfully reset.");
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, "Failed to reset password.");
  }
};

exports.rejectWithdrawalRequest = async (req, res) => {
  const { id } = req.params;
  try {
    const withdrawDocument = await Withdraw.findById(id);
    if (!withdrawDocument) {
      console.log("no document found");
      return sendResponse(res, 404, "no document found");
    }

    // get user wallet balances
    const wallet = await WalletBalance.findOne({ userRef: withdrawDocument.userRef })
    if (!wallet) {
      console.log("No user wallet for: ", withdrawDocument.userRef);
      return sendResponse(res, 404, "No user wallet");
    }
    withdrawDocument.status = "rejected";
    await withdrawDocument.save();

    // add the amount from fundingBalances and add it to balances
    const coin = withdrawDocument.coinType.toLowerCase();
    const amountToWithdraw = BigInt(withdrawDocument.amount);
    const balance = BigInt(wallet.fundingBalances.get(coin) || '0');

    wallet.fundingBalances.set(coin, (balance - amountToWithdraw).toString());
    wallet.balances.set(coin, (BigInt(wallet.balances.get(coin) || '0') + amountToWithdraw).toString());
    // Save the updated wallet
    await wallet.save();
    sendResponse(res, 200, "updating document successfully");
  } catch (error) {
    console.error("Error updating withdraw document:", error);
    sendResponse(res, 500, "An error occurred while updating the withdrawal request.");
  }
};

exports.logUserActivity = async (req, res) => {
  try {
    const activityDetails = req.body;

    if (!activityDetails.user) {
      return sendResponse(res, 400, "Activity details required: user");
    }

    await userLogService.logUserEvent(activityDetails);

    return sendResponse(res, 200, "User activity logged successfully.");
  } catch (error) {
    return sendResponse(res, 500, "Failed to log user activity.");
  }
};

exports.giveActivityPoints = async (req, res) => {
  try {
    const { user, activity, partnerToken } = req.body;
    const updatedUser = await givePoints(user.id, activity, partnerToken);
    return sendResponse(res, 200, "Successfully added points to user!", updatedUser);
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, "Failed to give activity points.");
  }
};

exports.createCoinWithdrawalRequest = async (req, res) => {
  const { amount, coinType, network, walletType } = req.body;
  const { feeCoinType, amount: feeInCrypto } = req.fee;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!amount || !coinType || !network || !walletType) {
      await session.abortTransaction();
      return sendResponse(res, 400, "Invalid or missing field");
    }

    // User must not have an active game
    const pendingGamesCount = await ActiveGame.countDocuments(
      {
        $or: [{ creator: req.user._id }, { challenger: req.user._id }],
      }
    ).session(session);

    if (pendingGamesCount > 0) {
      await session.abortTransaction();
      return sendResponse(
        res,
        400,
        "You have an active game, please finish/close it before creating a withdrawal request"
      );
    }

    const coin = coinType.toLowerCase();

    // Check for user address based on network
    const userWalletAddress = await WalletAddress.findOne(
      {
        userRef: req.user._id,
        walletType: walletType,
      }
    ).session(session);

    if (!userWalletAddress) {
      await session.abortTransaction();
      console.log("No user wallet found for: ", req.user._id, walletType);
      return sendResponse(res, 404, "No user wallet found");
    }

    const address = userWalletAddress.address;

    // Check if the user has enough amount to withdraw
    const wallet = await WalletBalance.findOne(
      { userRef: req.user._id }
    ).session(session);

    if (!wallet) {
      await session.abortTransaction();
      console.log("No user wallet for: ", req.user._id);
      return sendResponse(res, 404, "No user wallet");
    }

    // already checked if the amount is valid on the middleware `isUserCanWithdraw`
    const balance = BigInt(wallet.balances.get(coin) || "0");
    const amountToWithdraw = BigInt(amount.toString());
    // Deduct the amount from balances and add it to fundingBalances
    wallet.balances.set(coin, (balance - amountToWithdraw).toString());
    wallet.fundingBalances.set(
      coin,
      (BigInt(wallet.fundingBalances.get(coin) || "0") + amountToWithdraw).toString()
    );

    const feeBalance = BigInt(wallet.balances.get(feeCoinType) || '0');
    const feeAmount = BigInt(feeInCrypto.toString());
    // Deduct the fee amount from balances and add it to fundingBalances
    wallet.balances.set(feeCoinType, (feeBalance - feeAmount).toString());
    wallet.fundingBalances.set(
      feeCoinType,
      (BigInt(wallet.fundingBalances.get(feeCoinType) || "0") + feeAmount).toString()
    );

    // Save the updated wallet
    await wallet.save({ session });

    // Add treasury balance here
    const userHistory = await UserDepositAndWithdrawHistory.findOne(
      { userRef: req.user._id },
      null,
      { session, sort: { createdAt: -1 } }
    );

    const totalDeposited = userHistory.totalDepositedAmount.get(coin) || "0";
    const totalWithdrawn = userHistory.totalWithdrawnAmount.get(coin) || "0";

    let treasury = await Treasury.findOne({}).session(session);
    if (!treasury) {
      await initializeTreasury({ session }); // Ensure your initializeTreasury function can accept a session
      treasury = await Treasury.findOne({}).session(session);
    }

    const currentTreasuryBalance = treasury.balances.get(coin) || "0";
    // Save withdraw request data
    const newWithdrawalTransaction = new Withdraw({
      userRef: req.user._id,
      toAddress: address,
      amount: amount.toString(),
      coinType: coin,
      network,
      status: "pending",
      currentTreasuryBalance,
      currentUserTotalDeposited: totalDeposited,
      currentUserTotalWithdrawn: totalWithdrawn,
      fee: {
        amount: feeInCrypto.toString(),
        coinType: feeCoinType,
      }
    });

    await newWithdrawalTransaction.save({ session });
    // Send an email notification
    const tokenInfo = await AllowableTokenContractsForLotteries.findOne(
      { ticker: coin, network },
      null
    ).session(session);

    const username = req.user.username;
    const tokenName = tokenInfo?.name || "Token not supported";
    const tokenTicker = tokenInfo?.ticker;
    const tokenNetwork = tokenInfo?.network;
    const tokenAddress = tokenInfo?.contractAddress;
    const tokenDecimal = tokenInfo?.decimal || 1;
    const tokenAmount = Number(amount.toString());
    const tokenAmountConverted = tokenAmount / (10 ** tokenDecimal);
    await sendWithdrawNotification(
      username,
      tokenName,
      tokenTicker,
      tokenNetwork,
      tokenAddress,
      tokenAmountConverted
    );

    await session.commitTransaction();
    sendResponse(res, 200, "Requesting withdrawal successfully");
  } catch (error) {
    await session.abortTransaction();
    console.error("Error requesting coin withdrawal", error);
    sendResponse(res, 500, "An error occurred while requesting for withdrawal");
  } finally {
    session.endSession();
  }
};

exports.getWithdrawalFee = async (req, res) => {
  const user = req.user;
  const {
    feeCoinType,
    amount: feeInCrypto,
    gasFeeInDollars,
    payInNative,
    nativeToken
  } = req.fee;
  const { coinType: coin } = req.query;
  try {
    if (user) {
      const coinUseForPayment = payInNative ? nativeToken : coin;
      const userWallet = await WalletBalance.findOne({ userRef: user._id });
      if (!userWallet) {
        return sendResponse(res, 400, "user does not have a wallet yet");
      }
      const balances = userWallet.balances;
      const cryptoBalance = BigInt(balances.get(coinUseForPayment) || '0');
      if (feeInCrypto > cryptoBalance) {
        return sendResponse(
          res,
          400,
          `User doesn't have enough ${coinUseForPayment} balance to withdraw`,
          {
            feeCoinType,
            fee: feeInCrypto,
            ticker: coin,
            gasFeeInDollars,
            payInNative,
            user: user?._id
          }
        );
      }
    }

    return sendResponse(
      res,
      200,
      "Getting of withdrawal fee successful",
      {
        feeCoinType,
        fee: feeInCrypto,
        ticker: coin,
        gasFeeInDollars,
        payInNative,
        user: user?._id
      }
    );

  } catch (err) {
    console.log("Error getting withdrawal fee: ", err);
    return sendResponse(res, 500, "Something went wrong.", { error: err.message });
  }
}

exports.getWithdrawalRequests = async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const limit = parseInt(req.query.limit || "10", 10);
    const skip = (page - 1) * limit;

    // Fetch Withdrawals with pagination
    const withdawalRequests = await Withdraw.find({
      status: 'pending'
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate("userRef", "username")
      .exec();

    const withdrawDocuments = await Promise.all(withdawalRequests.map(async (withdrawDocument) => {
      return {
        id: withdrawDocument._id,
        requestNumber: withdrawDocument.trackingNumber,
        date: withdrawDocument.createdAt,
        user: withdrawDocument.userRef.username,
        deposits: withdrawDocument.currentUserTotalDeposited,
        withdrawals: withdrawDocument.currentUserTotalWithdrawn,
        withdrawalRequest: withdrawDocument.amount,
        treasuryBalance: withdrawDocument.currentTreasuryBalance,
        toAddress: withdrawDocument.toAddress,
        status: withdrawDocument.status,
        coinType: withdrawDocument.coinType.toLowerCase(),
        network: withdrawDocument.network
      }
    }));

    // Count total request for pagination
    const count = await Withdraw.countDocuments({ status: 'pending' });
    return sendResponse(res, 200, "success", {
      requests: withdrawDocuments,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      totalRequests: count
    });
  } catch (error) {
    console.error("Failed to retrieve withdraw data:", error);
    return sendResponse(res, 500, "Failed to retrieve data", error.message)
  }
};

exports.getWithdrawalHistory = async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const limit = parseInt(req.query.limit || "10", 10);
    const skip = (page - 1) * limit;

    // Fetch Withdrawals with pagination
    const withdrawalRequests = await Withdraw.find({
      status: { $ne: 'pending' }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate("userRef", "username")
      .exec();

    const withdrawalRequestsDocuments = await Promise.all(withdrawalRequests.map(async (withdrawalRequest) => {
      return {
        id: withdrawalRequest._id,
        address: withdrawalRequest.toAddress,
        date: withdrawalRequest.createdAt,
        user: withdrawalRequest.userRef.username,
        deposits: withdrawalRequest.currentUserTotalDeposited,
        withdrawals: withdrawalRequest.currentUserTotalWithdrawn,
        status: withdrawalRequest.status,
        network: withdrawalRequest.network,
        coinType: withdrawalRequest.coinType.toLowerCase()
      }
    }));

    const count = await Withdraw.countDocuments({ status: { $ne: 'pending' } });
    return sendResponse(res, 200, "success", {
      requests: withdrawalRequestsDocuments,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      totalRequests: count
    });
  } catch (error) {
    console.error("Failed to retrieve withdraw data history:", error);
    return sendResponse(res, 500, "Failed to retrieve withdraw data history", error.message)
  }
};

exports.getLeaderboards = async (req, res) => {
  const { leaderboardType } = req.params;
  const { page = 1 } = req.query;
  const limit = parseInt(req.query.limit || "10", 10);

  const leaderboardMap = {
    "top-nafflers": "topNafflersLeaderboard",
    "top-gamers": "topGamersLeaderboard",
  }

  try {
    const type = leaderboardMap[leaderboardType];
    if (!type) {
      return sendResponse(res, 400, "Error leaderboard type");
    }

    // Fetch data from cache
    // const cachedData = await getAsync(`${type}:page:${page}`);
    // if (!cachedData) {
    //   return sendResponse(res, 500, "Something went wrong.",
    //     { error: "Leaderboard not available in cache." });
    // }
    // const { totalPages, totalCount, currentPage, leaderboard } = JSON.parse(cachedData);

    // Fetch realtime data
    let data;
    if (type === "topNafflersLeaderboard") data = await fetchTopNafflers(page, limit);
    if (type === "topGamersLeaderboard") data = await fetchTopGamers(page, limit);

    const leaderboard = formatLeaderboard(type, data);

    const totalCount = await UserStats.countDocuments();
    sendResponse(res, 200, "success", {
      leaderboard,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: parseInt(page),
      totalPlayerCount: totalCount
    });
  } catch (error) {
    console.error(`Failed to retrieve leaderboards ${leaderboardType} data:`, error);
    return sendResponse(res, 500, `Failed to retrieve leaderboards ${leaderboardType} data:`, error.message)
  }
};
// exports.getTransactionHistories = async (req, res) => {
//   const { page = 1 } = req.query;
//   const limit = parseInt(req.query.limit || "10", 10);
//   const skip = (page - 1) * limit;
//   const userId = req.user._id;

//   try {
//     // Build query to fetch transaction histories
//     const query = {
//       $or: [
//         { creator: mongoose.Types.ObjectId(userId) },
//         { challenger: mongoose.Types.ObjectId(userId) },
//       ]
//     };

//     // Fetch game histories with cursor-based pagination
//     const gameHistories = await GameHistory.find(query)
//       .sort({ createdAt: -1 }) // Sort in ascending order by _id
//       .limit(limit)
//       .skip(skip)
//       .populate("creator", "username")
//       .populate("challenger", "username")
//       .populate("winner", "username")
//       .exec();

//     // console.log("game histories: ", gameHistories);
//     const gameDocuments = await Promise.all(
//       gameHistories.map(async (gameHistory) => {
//         const coinType = gameHistory.coinType.toLowerCase();
//         var buyIn = calculateChallengerBuyInAmount(gameHistory.odds, gameHistory.betAmount);
//         var payout = gameHistory.payout;
//         // if (coinType != 'points') {
//         //   buyIn = await convertToUsd(buyIn, coinType);
//         //   payout = await convertToUsd(payout);
//         // } else {
//         //   buyIn = convertToNum(buyIn.toString());
//         //   payout = convertToNum(payout.toString());
//         // }

//         return {
//           date: gameHistory.createdAt,
//           eventType: 'GAME',
//           coinType: coinType,
//           priceOrBuyIn: buyIn.toString(),
//           prizeOrPayout: payout.toString(),
//           ticketNumber: 'n/a',
//           sellerOrOpponent: userId == gameHistory.creator ?
//             gameHistory.challenger :
//             gameHistory.creator,
//           status: userId == gameHistory.winner ? 'WON' : 'LOST',
//         }
//       }))

//     const nextCursor = gameHistories.length > 0 ? gameHistories[gameHistories.length - 1]._id : null;
//     sendResponse(res, 200, "success", {
//       transactions: gameDocuments,
//       nextCursor,
//     });
//   } catch (error) {
//     console.error("Failed to retrieve transaction histories:", error);
//     sendResponse(res, 500, "Failed to retrieve transaction histories", error.message);
//   }
// };

exports.getTransactionHistories = async (req, res) => {
  const page = parseInt(req.query.page) || 1; // Default page is 1
  const limit = parseInt(req.query.limit) || 20; // Default limit is 20
  const sortBy = req.query.sortBy || 'dateCreated'; // Default sorting by dateCreated
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1; // Default sort order is descending
  const user = req.user;

  // Destructure filters from the request query
  const { won, lost, live, purchased, event } = req.query;
  try {
    // Define the sort object dynamically based on the request query
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder;

    // Build the query object dynamically based on the provided filters
    const query = { userRef: user._id, $or: [] };

    if (won === 'true') query.$or.push({ status: 'won' });
    if (lost === 'true') query.$or.push({ status: 'lost' });
    if (live === 'true') query.$or.push({ status: 'live' });
    if (purchased === 'true') {
      query.$or.push({ status: 'purchased' });
      query.$or.push({ status: 'sold' });
    }
    if (query.$or.length === 0) delete query.$or;
    if (event) query.eventType = event;
    // Query to find all user history related to the given user ID with optional pagination and sorting
    const historyLists = await UserHistory.find(query)
      .sort(sortOptions) // Apply sorting based on the sortOptions
      .skip((page - 1) * limit) // Skip for pagination
      .limit(limit) // Limit the number of records per page
      .exec();

    // Get the total count of user history for pagination
    const totalUserHistory = await UserHistory.countDocuments({ userRef: user._id });

    const userHistoryWithUrls = await Promise.all(
      historyLists.map(async (history) => {
        const userHistory = history.toObject();
        if (userHistory.file) userHistory.fileURL = await getDownloadSignedUrl(userHistory.file, process.env.GCS_BUCKET_NAME, 5 * 60);
        return userHistory;
      })
    );

    return sendResponse(res, 200, "User history retrieved successfully", {
      page,
      limit,
      totalPages: Math.ceil(totalUserHistory / limit),
      totalUserHistory,
      historyLists: userHistoryWithUrls,
    });
  } catch (error) {
    console.log("Error getting user history: ", error);
    return sendResponse(res, 500, "Error getting user history");
  }
};

exports.checkAirdropStatus = async (req, res) => {
  const user = req.user;
  try {
    // Fetch the user's airdrop status
    const airdropStatus = await Airdrop.findOne({ userRef: user._id });

    // If no airdrop status found, return a 400 error
    if (!airdropStatus) {
      return sendResponse(res, 400, "No airdrop status found for the user.");
    }

    // Return the airdrop status details
    return sendResponse(res, 200, "Airdrop status fetched successfully.", airdropStatus);
  } catch (error) {
    console.log("Error getting airdrop status: ", error);
    return sendResponse(res, 500, "Error getting airdrop status");
  }
};

exports.checkTasksCompletionForPreLaunchAirdrop = async (req, res) => {
  const { walletAddress } = req.body;
  const user = req.user;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {

    // step 1
    // make sure that the wallet is connected and it belongs to the user.
    const walletInfo = await WalletAddress.findOne({
      userRef: user._id,
      address: walletAddress
    }).session(session);

    if (!walletInfo) {
      await session.abortTransaction();
      return sendResponse(res, 400, "Wallet does not belong to the user");
    }

    var airdrop = await Airdrop.findOne({
      userRef: user._id,
      walletAddress
    }).session(session)
    if (!airdrop) {
      airdrop = new Airdrop({
        userRef: user._id,
        walletAddress
      });
    }

    if (!airdrop?.taskStatus?.wallet) {
      // step 1
      // make sure that the wallet is connected and it belongs to the user.
      if (walletInfo) {
        airdrop.taskStatus.wallet = true
      } else {
        await session.abortTransaction();
        return sendResponse(res, 400, "Wallet address not found");
      }
    }

    if (!airdrop?.taskStatus?.connectDiscord) {
      // step 2
      // check if the discord is already connected
      const userDiscordId = user?.socials?.discord?.id;
      if (userDiscordId) {
        airdrop.taskStatus.connectDiscord = true
      }
    }

    // Check if joined Naffles Discord server
    if (!airdrop.taskStatus?.joinNafflesDiscord) {
      try {
        const guildId = DISCORD_NAFFLES_SERVER_ID;
        const discordId = user.socials?.discord?.id;
        const botInChannel = await isBotInGuildFunction(guildId);

        if (discordId && botInChannel) {
          const userInChannel = await isUserInGuildFunction(guildId, discordId);
          airdrop.taskStatus.joinNafflesDiscord = Boolean(userInChannel);
        } else {
          console.warn("Bot is not a member of the specified guild or user ID is missing.");
        }
      } catch (error) {
        console.error("Error checking Discord membership:", error.response?.data || error.message);
      }
    }

    if (!airdrop?.taskStatus?.connectTelegram) {
      // step 4
      // check if user connected their telegram
      const userTelegramId = user?.socials?.telegram?.id;
      if (userTelegramId) {
        airdrop.taskStatus.connectTelegram = true;
      }
    }

    // Check if joined Naffles Telegram channel
    if (!airdrop.taskStatus?.joinNafflesTelegram) {
      try {
        const telegramChannel = TELEGRAM_NAFFLES_CHANNEL;
        const telegramId = user.socials?.telegram?.id;
        const botInChannel = await isBotInTelegramChannelFunction(telegramChannel);
        if (telegramId && botInChannel) {
          const userInChannel = await isUserInTelegramChannel(telegramChannel, telegramId);
          airdrop.taskStatus.joinNafflesTelegram = Boolean(userInChannel);
        } else {
          console.warn("Bot is not a member of the specified Telegram channel or user ID is missing.");
        }
      } catch (error) {
        console.error("Error checking Telegram channel membership:", error.response?.data || error.message);
      }
    }

    if (!airdrop?.taskStatus?.connectX) {
      // step 6
      // check if twitter is connected to their account
      const twitterUsername = user?.socials?.twitter?.username;
      if (twitterUsername) {
        airdrop.taskStatus.connectX = true
      }
    }

    if (!airdrop?.taskStatus?.followNafflesOnX) {
      airdrop.taskStatus.followNafflesOnX = airdrop?.taskStatus?.repostNafflesPostOnX || false;
      // // step 7
      // // check if they follow Naffles official twitter account
      // // will add on worker queue, it might have some delays
      // const twitterUsername = user?.socials?.twitter?.username;
      // if (twitterUsername) {
      //   const jobId = `${user._id}-${airdrop._id}-twitter-follow-task`; // Create a unique job ID
      //   // Check if a job with the same jobId already exists
      //   // Check if the queue has more than 1000 waiting tasks
      //   const existingJob = await joinAirdropcheckTwitterFollowQueue.getJob(jobId);
      //   const waitingCount = await joinAirdropcheckTwitterFollowQueue.getWaitingCount();
      //   if (!existingJob && waitingCount <= 1000) {
      //     joinAirdropcheckTwitterFollowQueue.add({
      //       targetProfile: TWITTER_NAFFLES_OFFICIAL_USERNAME,
      //       followerProfile: twitterUsername,
      //       user: user
      //     },
      //       {
      //         jobId, attempts: 1,
      //         removeOnComplete: true,
      //         removeOnFail: true,
      //       })
      //       .then(job => console.log(`Added Twitter follow tasks to queue with jobId: ${jobId}`))
      //       .catch(err => console.error('Error adding Twitter follow tasks to queue:', err));
      //   }
      // }
    }

    var twitterCheckTriggered = false;
    if (!airdrop?.taskStatus?.repostNafflesPostOnX) {
      // step 8
      // check if they repost naffles X post
      // will add on worker queue, it might have some delays
      const twitterUsername = user?.socials?.twitter?.username;
      if (twitterUsername) {
        const jobId = `${user._id}-${airdrop._id}-twitter-repost-task`; // Create a unique job ID
        // Check if a job with the same jobId already exists
        // Check if the queue has more than 1000 waiting tasks
        const existingJob = await joinAirdropcheckTwitterRetweetQueue.getJob(jobId);
        const waitingCount = await joinAirdropcheckTwitterRetweetQueue.getWaitingCount();
        if (!existingJob && waitingCount <= 1000) {
          twitterCheckTriggered = true;
          joinAirdropcheckTwitterRetweetQueue.add({
            twitterPost: TWITTER_NAFFLES_POST_FOR_AIRDROP_RETWEET,
            user: user,
            walletAddress
          },
            {
              jobId, attempts: 1,
              removeOnComplete: true,
              removeOnFail: true,
            })
            .then(async (job) => {
              console.log(`Added Twitter RT task to queue with jobId: ${jobId}`);
            })
            .catch((err) => {
              console.error("Error adding Twitter RT task to queue:", err);
            });
        }
      }
    }

    if (twitterCheckTriggered) {
      // Update the airdrop status to "checking-twitter-task"
      airdrop.status = "checking-twitter-task";
      await airdrop.save({ session }); // Save the updated airdrop status within the session
    }

    // Determine the response message based on the airdrop completion status
    const allTasksCompleted = Object.values(airdrop.taskStatus).every(status => status === true);
    let responseMessage = "Please complete all tasks to join the airdrop event.";

    if (allTasksCompleted) {
      responseMessage = "Successfully joined airdrop event! All tasks completed.";
    } else if (airdrop.taskStatus.followNafflesOnX === false || airdrop.taskStatus.repostNafflesPostOnX === false) {
      responseMessage = "Tasks added to the backend queue. Please wait for Twitter tasks to be checked.";
    }

    await airdrop.save({ session });
    await session.commitTransaction();
    return sendResponse(res, 200, responseMessage, airdrop);
  } catch (error) {
    await session.abortTransaction();
    console.error("Error checking and/or creating document for airdrop completion:", error);
    return sendResponse(res, 500, "An error occurred while signing up for airdrop");
  } finally {
    session.endSession();
  }
}

exports.getMyAllowlists = async (req, res) => {
  const {
    presale,
    free,
    blockchain,
    status,
    sortBy,
    sortOrder,
    page,
    limit,
  } = req.query;
  const user = req.user;

  try {
    const myAllowlists = await clientService.getMyAllowlists(user, {
      presale,
      free,
      blockchain,
      status,
      sortBy,
      sortOrder,
      page,
      limit,
    });
    return sendResponse(res, 200, "Success", myAllowlists);
  } catch (err) {
    console.error("Error fetching MY allowlists:", err);
    return sendResponse(res, 500, "Error encountered during get MY allowlists");
  }
};
/**
 * Enhanced profile management endpoints
 */

/**
 * Update user profile data (enhanced version)
 */
exports.updateProfileData = async (req, res) => {
  try {
    const AuthService = require("../services/authService");
    
    const updates = {
      profileData: req.body.profileData,
      socials: req.body.socials
    };

    const updatedProfile = await AuthService.updateUserProfile(req.user._id, updates);

    return sendResponse(res, 200, "Profile data updated successfully", updatedProfile);
  } catch (error) {
    console.error("Error updating profile data:", error);
    return sendResponse(res, 500, error.message || "Failed to update profile data");
  }
};

/**
 * Get user's wallet information
 */
exports.getUserWallets = async (req, res) => {
  try {
    const wallets = await WalletAddress.findUserWallets(req.user._id);
    
    const walletsData = wallets.map(wallet => ({
      address: wallet.address,
      walletType: wallet.walletType,
      chainId: wallet.chainId,
      isPrimary: wallet.isPrimary,
      isVerified: wallet.isVerified,
      connectedAt: wallet.connectedAt,
      lastUsedAt: wallet.lastUsedAt,
      metadata: wallet.metadata
    }));

    return sendResponse(res, 200, "Wallets retrieved successfully", walletsData);
  } catch (error) {
    console.error("Error retrieving wallets:", error);
    return sendResponse(res, 500, "Failed to retrieve wallets");
  }
};

/**
 * Set primary wallet
 */
exports.setPrimaryWallet = async (req, res) => {
  const { address } = req.body;
  
  try {
    if (!address) {
      return sendResponse(res, 400, "Wallet address is required");
    }

    // Find the wallet belonging to the user
    const wallet = await WalletAddress.findOne({
      userRef: req.user._id,
      address: address.toLowerCase()
    });

    if (!wallet) {
      return sendResponse(res, 404, "Wallet not found or not associated with user");
    }

    // Set as primary
    wallet.isPrimary = true;
    await wallet.save();

    // Update user's primary wallet
    const user = await User.findById(req.user._id);
    user.primaryWallet = {
      address: wallet.address,
      walletType: wallet.walletType,
      chainId: wallet.chainId
    };
    await user.save();

    return sendResponse(res, 200, "Primary wallet updated successfully", {
      address: wallet.address,
      walletType: wallet.walletType,
      chainId: wallet.chainId
    });
  } catch (error) {
    console.error("Error setting primary wallet:", error);
    return sendResponse(res, 500, "Failed to set primary wallet");
  }
};

/**
 * Update wallet metadata
 */
exports.updateWalletMetadata = async (req, res) => {
  const { address, metadata } = req.body;
  
  try {
    if (!address) {
      return sendResponse(res, 400, "Wallet address is required");
    }

    const wallet = await WalletAddress.findOne({
      userRef: req.user._id,
      address: address.toLowerCase()
    });

    if (!wallet) {
      return sendResponse(res, 404, "Wallet not found or not associated with user");
    }

    await wallet.updateMetadata(metadata);

    return sendResponse(res, 200, "Wallet metadata updated successfully", {
      address: wallet.address,
      metadata: wallet.metadata
    });
  } catch (error) {
    console.error("Error updating wallet metadata:", error);
    return sendResponse(res, 500, "Failed to update wallet metadata");
  }
};

/**
 * Get user's Founders Key benefits
 */
exports.getFoundersKeyBenefits = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return sendResponse(res, 404, "User not found");
    }

    const benefits = user.getFoundersKeyBenefits();
    const hasFoundersKey = user.hasFoundersKey();

    return sendResponse(res, 200, "Founders Key benefits retrieved", {
      hasFoundersKey,
      benefits,
      foundersKeys: user.foundersKeys,
      tier: user.tier
    });
  } catch (error) {
    console.error("Error retrieving Founders Key benefits:", error);
    return sendResponse(res, 500, "Failed to retrieve Founders Key benefits");
  }
};

/**
 * Check and update Founders Keys from blockchain
 */
exports.checkFoundersKeys = async (req, res) => {
  try {
    const AuthService = require("../services/authService");
    
    const user = await User.findById(req.user._id);
    if (!user || !user.primaryWallet.address) {
      return sendResponse(res, 400, "User must have a connected wallet");
    }

    const benefits = await AuthService.checkAndUpdateFoundersKeys(
      req.user._id, 
      user.primaryWallet.address
    );

    return sendResponse(res, 200, "Founders Keys checked and updated", benefits);
  } catch (error) {
    console.error("Error checking Founders Keys:", error);
    return sendResponse(res, 500, "Failed to check Founders Keys");
  }
};

/**
 * Get user activity summary
 */
exports.getUserActivitySummary = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return sendResponse(res, 404, "User not found");
    }

    // Get user statistics
    const userStats = await UserStats.findOne({ userRef: req.user._id });
    
    // Get recent game history
    const recentGames = await GameHistory.find({ 
      $or: [{ creator: req.user._id }, { challenger: req.user._id }] 
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('gameType result amount createdAt');

    const activitySummary = {
      user: {
        username: user.username,
        tier: user.tier,
        loginCount: user.loginCount,
        lastLoginAt: user.lastLoginAt,
        lastActiveAt: user.lastActiveAt,
        createdAt: user.createdAt
      },
      stats: userStats || {},
      recentActivity: recentGames,
      foundersKeyBenefits: user.getFoundersKeyBenefits()
    };

    return sendResponse(res, 200, "Activity summary retrieved", activitySummary);
  } catch (error) {
    console.error("Error retrieving activity summary:", error);
    return sendResponse(res, 500, "Failed to retrieve activity summary");
  }
};

/**
 * Update user preferences
 */
exports.updateUserPreferences = async (req, res) => {
  try {
    const { preferences } = req.body;
    
    if (!preferences) {
      return sendResponse(res, 400, "Preferences data is required");
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return sendResponse(res, 404, "User not found");
    }

    // Update preferences
    user.profileData.preferences = {
      ...user.profileData.preferences,
      ...preferences
    };

    await user.save();

    return sendResponse(res, 200, "Preferences updated successfully", {
      preferences: user.profileData.preferences
    });
  } catch (error) {
    console.error("Error updating preferences:", error);
    return sendResponse(res, 500, "Failed to update preferences");
  }
};

// Founders Key Benefits Methods
exports.getFoundersKeyBenefits = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return sendResponse(res, 404, "User not found");
    }

    const benefits = user.getFoundersKeyBenefits();
    const foundersKeys = user.foundersKeys.map(key => ({
      tokenId: key.tokenId,
      contractAddress: key.contractAddress,
      chainId: key.chainId,
      tier: key.tier,
      stakingPeriod: key.stakingPeriod,
      benefits: key.benefits
    }));

    return sendResponse(res, 200, "Founders Key benefits retrieved successfully", {
      foundersKeys,
      totalBenefits: benefits,
      tier: user.tier,
      hasFoundersKey: user.hasFoundersKey()
    });
  } catch (error) {
    console.error("Error retrieving Founders Key benefits:", error);
    return sendResponse(res, 500, "Failed to retrieve Founders Key benefits");
  }
};

exports.checkFoundersKeys = async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return sendResponse(res, 400, "Wallet address is required");
    }

    const AuthService = require("../services/authService");
    const foundersKeyService = require("../services/foundersKeyService");
    
    // Check for Founders Keys owned by the wallet
    const foundersKeys = await foundersKeyService.scanWalletForFoundersKeys(walletAddress);
    
    if (foundersKeys.length > 0) {
      // Update user's Founders Keys
      const user = await User.findById(req.user._id);
      if (!user) {
        return sendResponse(res, 404, "User not found");
      }

      // Merge new keys with existing ones (avoid duplicates)
      const existingTokenIds = user.foundersKeys.map(key => `${key.contractAddress}-${key.tokenId}`);
      const newKeys = foundersKeys.filter(key => 
        !existingTokenIds.includes(`${key.contractAddress}-${key.tokenId}`)
      );

      if (newKeys.length > 0) {
        user.foundersKeys.push(...newKeys);
        await user.save();
      }

      const benefits = user.getFoundersKeyBenefits();
      
      return sendResponse(res, 200, "Founders Keys updated successfully", {
        foundersKeys: user.foundersKeys,
        newKeysFound: newKeys.length,
        totalBenefits: benefits,
        tier: user.tier
      });
    } else {
      return sendResponse(res, 200, "No Founders Keys found for this wallet", {
        foundersKeys: [],
        newKeysFound: 0,
        totalBenefits: { feeDiscount: 0, priorityAccess: false, openEntryTickets: 0 }
      });
    }
  } catch (error) {
    console.error("Error checking Founders Keys:", error);
    return sendResponse(res, 500, "Failed to check Founders Keys");
  }
};
//
 Enhanced Profile Management Methods

exports.getComprehensiveProfile = async (req, res) => {
  try {
    const profile = await userProfileService.getComprehensiveProfile(req.user._id);
    sendResponse(res, 200, "Comprehensive profile retrieved successfully.", profile);
  } catch (error) {
    console.error("Error retrieving comprehensive profile:", error);
    sendResponse(res, 500, "An error occurred while retrieving the comprehensive profile.");
  }
};

exports.updateProfileData = async (req, res) => {
  try {
    const { displayName, bio, location, website } = req.body;
    
    const profileData = {
      displayName,
      bio,
      location,
      website
    };

    const updatedProfileData = await userProfileService.updateProfileData(req.user._id, profileData);
    sendResponse(res, 200, "Profile data updated successfully.", updatedProfileData);
  } catch (error) {
    console.error("Error updating profile data:", error);
    sendResponse(res, 500, "An error occurred while updating profile data.");
  }
};

exports.getUserWallets = async (req, res) => {
  try {
    const wallets = await userProfileService.getUserWallets(req.user._id);
    sendResponse(res, 200, "User wallets retrieved successfully.", wallets);
  } catch (error) {
    console.error("Error retrieving user wallets:", error);
    sendResponse(res, 500, "An error occurred while retrieving user wallets.");
  }
};

exports.setPrimaryWallet = async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return sendResponse(res, 400, "Wallet address is required.");
    }

    const wallet = await userProfileService.setPrimaryWallet(req.user._id, walletAddress);
    sendResponse(res, 200, "Primary wallet set successfully.", wallet);
  } catch (error) {
    console.error("Error setting primary wallet:", error);
    sendResponse(res, 500, "An error occurred while setting primary wallet.");
  }
};

exports.updateWalletMetadata = async (req, res) => {
  try {
    const { walletAddress, metadata } = req.body;
    
    if (!walletAddress) {
      return sendResponse(res, 400, "Wallet address is required.");
    }

    const wallet = await userProfileService.updateWalletMetadata(req.user._id, walletAddress, metadata);
    sendResponse(res, 200, "Wallet metadata updated successfully.", wallet);
  } catch (error) {
    console.error("Error updating wallet metadata:", error);
    sendResponse(res, 500, "An error occurred while updating wallet metadata.");
  }
};

exports.getFoundersKeyBenefits = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('foundersKeys');
    
    if (!user) {
      return sendResponse(res, 404, "User not found.");
    }

    const benefits = user.getFoundersKeyBenefits();
    sendResponse(res, 200, "Founders key benefits retrieved successfully.", benefits);
  } catch (error) {
    console.error("Error retrieving founders key benefits:", error);
    sendResponse(res, 500, "An error occurred while retrieving founders key benefits.");
  }
};

exports.checkFoundersKeys = async (req, res) => {
  try {
    // This would integrate with the founders key service to scan for new keys
    const foundersKeyService = require('../services/foundersKeyService');
    const updatedKeys = await foundersKeyService.scanAndUpdateUserKeys(req.user._id);
    
    sendResponse(res, 200, "Founders keys checked and updated.", updatedKeys);
  } catch (error) {
    console.error("Error checking founders keys:", error);
    sendResponse(res, 500, "An error occurred while checking founders keys.");
  }
};

exports.getUserActivitySummary = async (req, res) => {
  try {
    const activitySummary = await userProfileService.getUserActivitySummary(req.user._id);
    sendResponse(res, 200, "Activity summary retrieved successfully.", activitySummary);
  } catch (error) {
    console.error("Error retrieving activity summary:", error);
    sendResponse(res, 500, "An error occurred while retrieving activity summary.");
  }
};

exports.updateUserPreferences = async (req, res) => {
  try {
    const preferences = req.body;
    const updatedPreferences = await userProfileService.updateUserPreferences(req.user._id, preferences);
    sendResponse(res, 200, "User preferences updated successfully.", updatedPreferences);
  } catch (error) {
    console.error("Error updating user preferences:", error);
    sendResponse(res, 500, "An error occurred while updating user preferences.");
  }
};

exports.getNotificationPreferences = async (req, res) => {
  try {
    const preferences = await userProfileService.getNotificationPreferences(req.user._id);
    sendResponse(res, 200, "Notification preferences retrieved successfully.", preferences);
  } catch (error) {
    console.error("Error retrieving notification preferences:", error);
    sendResponse(res, 500, "An error occurred while retrieving notification preferences.");
  }
};

exports.updateNotificationPreferences = async (req, res) => {
  try {
    const preferences = req.body;
    const updatedPreferences = await userProfileService.updateNotificationPreferences(req.user._id, preferences);
    sendResponse(res, 200, "Notification preferences updated successfully.", updatedPreferences);
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    sendResponse(res, 500, "An error occurred while updating notification preferences.");
  }
};

exports.getUserActionItems = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const actionItems = await userProfileService.getUserActionItems(req.user._id, parseInt(limit));
    sendResponse(res, 200, "Action items retrieved successfully.", actionItems);
  } catch (error) {
    console.error("Error retrieving action items:", error);
    sendResponse(res, 500, "An error occurred while retrieving action items.");
  }
};

exports.markActionItemCompleted = async (req, res) => {
  try {
    const { actionItemId } = req.params;
    
    const actionItem = await ActionItem.findOne({
      _id: actionItemId,
      userId: req.user._id
    });

    if (!actionItem) {
      return sendResponse(res, 404, "Action item not found.");
    }

    await actionItem.markCompleted();
    sendResponse(res, 200, "Action item marked as completed.");
  } catch (error) {
    console.error("Error marking action item as completed:", error);
    sendResponse(res, 500, "An error occurred while marking action item as completed.");
  }
};

exports.getUserAchievements = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const achievements = await userProfileService.getUserAchievements(req.user._id, parseInt(limit));
    sendResponse(res, 200, "User achievements retrieved successfully.", achievements);
  } catch (error) {
    console.error("Error retrieving user achievements:", error);
    sendResponse(res, 500, "An error occurred while retrieving user achievements.");
  }
};

exports.getUserStakingPositions = async (req, res) => {
  try {
    const stakingPositions = await userProfileService.getUserStakingPositions(req.user._id);
    sendResponse(res, 200, "Staking positions retrieved successfully.", stakingPositions);
  } catch (error) {
    console.error("Error retrieving staking positions:", error);
    sendResponse(res, 500, "An error occurred while retrieving staking positions.");
  }
};

exports.getUserCommunityMemberships = async (req, res) => {
  try {
    const memberships = await userProfileService.getUserCommunityMemberships(req.user._id);
    sendResponse(res, 200, "Community memberships retrieved successfully.", memberships);
  } catch (error) {
    console.error("Error retrieving community memberships:", error);
    sendResponse(res, 500, "An error occurred while retrieving community memberships.");
  }
};

exports.getUserTransactionHistory = async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    const history = await UserHistory.find({ userRef: req.user._id })
      .sort({ dateCreated: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const totalCount = await UserHistory.countDocuments({ userRef: req.user._id });

    const response = {
      transactions: history.map(item => ({
        id: item._id,
        eventType: item.eventType,
        eventId: item.eventId,
        status: item.status,
        amount: item.amount,
        details: item.details,
        dateCreated: item.dateCreated
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNext: skip + history.length < totalCount,
        hasPrev: page > 1
      }
    };

    sendResponse(res, 200, "Transaction history retrieved successfully.", response);
  } catch (error) {
    console.error("Error retrieving transaction history:", error);
    sendResponse(res, 500, "An error occurred while retrieving transaction history.");
  }
};

exports.getUserAnalytics = async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeRange) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    // Get analytics data
    const [
      raffleActivity,
      gameActivity,
      pointsActivity,
      stakingActivity
    ] = await Promise.all([
      UserHistory.aggregate([
        {
          $match: {
            userRef: req.user._id,
            eventType: 'raffle',
            dateCreated: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$dateCreated" } },
            count: { $sum: 1 },
            totalAmount: { $sum: { $toDouble: "$amount" } }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      UserHistory.aggregate([
        {
          $match: {
            userRef: req.user._id,
            eventType: 'game',
            dateCreated: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$dateCreated" } },
            count: { $sum: 1 },
            totalAmount: { $sum: { $toDouble: "$amount" } }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      // Points activity would come from points transaction history
      [],
      // Staking activity would come from staking service
      []
    ]);

    const analytics = {
      timeRange,
      startDate,
      endDate,
      raffleActivity,
      gameActivity,
      pointsActivity,
      stakingActivity
    };

    sendResponse(res, 200, "User analytics retrieved successfully.", analytics);
  } catch (error) {
    console.error("Error retrieving user analytics:", error);
    sendResponse(res, 500, "An error occurred while retrieving user analytics.");
  }
};