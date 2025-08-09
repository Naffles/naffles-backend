const { AdminSettings } = require("../models/admin/adminSettings");
const User = require("../models/user/user");
const WalletBalance = require("../models/user/walletBalance");
const sendResponse = require("../utils/responseHandler");
var passwordValidator = require("password-validator");
const axios = require("axios");
const ClientProfile = require("../models/client/clientProfile");
const { DISCORD_BOT_JOIN_LINK } = require("../config/client");
const {
	createPuppeteerPage,
	createBasicPuppeteerPage,
} = require("../utils/twitter");
const WalletAddress = require("../models/user/walletAddress");
const AllowlistTicket = require("../models/client/allowlist/allowlistTicket");

/**
 * Middleware to validate if the provided tweet URL matches the expected pattern.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 */
const validateTweetUrl = (req, res, next) => {
	const { path } = req.route;
	const tweetUrl =
		path === "/twitter" ? req.body.tweetUrl : req.body.twitterTasks?.tweetUrl;

	if (!tweetUrl) {
		return sendResponse(res, 400, "Tweet URL is required.");
	}

	// Regular expression to match the expected tweet URL pattern
	const tweetUrlPattern = /^https:\/\/x\.com\/[a-zA-Z0-9_]+\/status\/\d+$/;

	// Check if the provided URL matches the pattern
	if (!tweetUrlPattern.test(tweetUrl)) {
		return sendResponse(res, 400, "Invalid tweet URL format.");
	}

	// Proceed to the next middleware if the URL is valid
	next();
};

/**
 * Function to check if a specific user has commented on a tweet by visiting their profile's "with replies" section.
 * This function filters out retweets to ensure only direct comments (replies) are detected.
 * @param {Object} page - The Puppeteer page object.
 * @param {string} twitterUsername - The Twitter username to verify if they commented.
 * @param {string} tweetId - The ID of the tweet to check for replies/comments.
 * @returns {Promise<{ isCommented: boolean, error?: string, debugInfo?: Array<Object> }>} - Returns an object with the comment status and debug information.
 */
const checkIfUserCommentedUsingPageFunction = async (
	page,
	twitterUsername,
	tweetId,
) => {
	if (!twitterUsername) {
		return { isCommented: false, error: "Twitter username is required." };
	}

	try {
		// Step 1: Navigate to the user's Twitter profile "with replies" section
		const userProfileWithRepliesUrl = `https://x.com/${twitterUsername}/with_replies`;
		await page.goto(userProfileWithRepliesUrl, { waitUntil: "networkidle2" });

		// Step 2: Wait for a known element on the profile page to ensure it's fully loaded
		await page.waitForSelector(`a[href="/${twitterUsername}"]`, {
			timeout: 2000,
		});

		// Optional: Add a small delay to ensure all elements are fully rendered
		await new Promise((resolve) => setTimeout(resolve, 2000)); // 2-second delay

		// Step 3: Search for the tweet ID in the first 5 relevant links, excluding retweets
		const result = await page.evaluate(
			(id, username, tweetId) => {
				// Get all links on the page that point to the tweet status, limiting to the first 5
				const commentLinks = Array.from(
					document.querySelectorAll(`a[href*="/status/${tweetId}/"]`),
				).slice(0, 10);

				// Collect detailed debug info for each link
				const debugInfo = commentLinks.map((link) => {
					// Traverse up to find the nearest div with more context
					const closestContainer =
						link.closest("article") || link.closest("div");
					const grandParentContainer = closestContainer
						? closestContainer.parentElement
						: null;

					// Get the full text of the parent and grandparent containers for debugging
					const parentText = closestContainer ? closestContainer.innerText : "";
					const grandParentText = grandParentContainer
						? grandParentContainer.innerText
						: "";

					// Check for the repost indicator in either the parent or grandparent text
					const isRetweet =
						parentText.includes("You reposted") ||
						grandParentText.includes("You reposted") ||
						parentText.includes("reposted") ||
						grandParentText.includes("reposted");

					// // Construct postData with full text for debugging
					// const postData = {
					//   text: link.innerText, // Text content of the link itself
					//   href: link.href, // Link URL
					//   parentText, // Full text of the closest container
					//   grandParentText // Full text of the grandparent container for broader context
					// };

					return {
						href: link.href,
						isRetweet,
						matchesTweetId: link.href.includes(`/status/${id}`),
						// postData // Include the full debugging data
					};
				});

				// Determine if any link is a direct comment (not a retweet) that links to the correct tweet
				const isCommented = debugInfo.some(
					(info) => info.matchesTweetId && !info.isRetweet,
				);
				// Return both the comment status and debug information
				return { isCommented, debugInfo };
			},
			tweetId,
			twitterUsername,
			tweetId,
		);

		// // Log detailed debug information outside of page.evaluate
		// console.log("Debug Information:", result.debugInfo);

		// Return both the comment status and debug information
		return { isCommented: result.isCommented, debugInfo: result.debugInfo };
	} catch (error) {
		console.error("Error while checking if user commented:", error);
		return {
			isCommented: false,
			error: "Error occurred while checking comment status.",
		};
	}
};

/**
 * Function to check if a specific user has commented, retweeted, and has a minimum number of followers.
 * @param {Object} page - The Puppeteer page object.
 * @param {string} twitterUsername - The Twitter username to verify if they commented or retweeted.
 * @param {string} tweetId - The ID of the tweet to check for replies/comments or retweets.
 * @param {number} minFollowerCount - Minimum follower count required.
 * @returns {Promise<{ isCommented: boolean, isRetweeted: boolean, hasEnoughFollowers: boolean, followerCount?: number, error?: string, debugInfo?: Array<Object> }>} - Returns an object with the statuses and follower count.
 */
const checkIfUserCommentedOrRetweetedUsingPageFunction = async (
	page,
	twitterUsername,
	tweetId,
	minFollowerCount = 0,
) => {
	if (!twitterUsername) {
		return {
			isCommented: false,
			isRetweeted: false,
			error: "Twitter username is required.",
		};
	}

	try {
		// Step 1: Navigate to the user's Twitter profile "with replies" section
		const userProfileWithRepliesUrl = `https://x.com/${twitterUsername}/with_replies`;
		await page.goto(userProfileWithRepliesUrl, { waitUntil: "networkidle2" });

		// Step 2: Wait for a known element on the profile page to ensure it's fully loaded
		await page.waitForSelector(`a[href="/${twitterUsername}"]`, {
			timeout: 2000,
		});

		// Optional: Add a small delay to ensure all elements are fully rendered
		await new Promise((resolve) => setTimeout(resolve, 2000)); // 2-second delay

		// Step 3: Get the follower count
		const { followerCount, followerDebugInfo } = await page.evaluate(
			(twitterUsername) => {
				const followerElement = document.querySelector(
					`a[href$="/${twitterUsername}/verified_followers"] span`,
				);
				const followerText = followerElement
					? followerElement.textContent.replace(/,/g, "")
					: "0";
				const debugInfo = followerElement
					? {
						textContent: followerElement.textContent,
						outerHTML: followerElement.outerHTML,
					}
					: {
						error: "Follower element not found",
						selectorAttempted: 'a[href$="/followers"] span',
					};
				return {
					followerCount: parseInt(followerText, 10),
					followerDebugInfo: debugInfo,
				};
			},
			twitterUsername,
		);
		// console.log("follower bug info: ", followerDebugInfo);

		// Check if the follower count meets the minimum requirement
		const hasEnoughFollowers = followerCount >= minFollowerCount;

		// Step 4: Check for comments and retweets on the tweet
		const result = await page.evaluate((tweetId) => {
			const tweetLinks = Array.from(
				document.querySelectorAll(`a[href*="/status/${tweetId}/"]`),
			).slice(0, 10);

			const debugInfo = tweetLinks.map((link) => {
				const closestContainer = link.closest("article") || link.closest("div");
				const grandParentContainer = closestContainer
					? closestContainer.parentElement
					: null;
				const parentText = closestContainer ? closestContainer.innerText : "";
				const grandParentText = grandParentContainer
					? grandParentContainer.innerText
					: "";

				const isRetweet =
					parentText.includes("You reposted") ||
					grandParentText.includes("You reposted") ||
					parentText.includes("reposted") ||
					grandParentText.includes("reposted");

				return {
					href: link.href,
					isRetweet,
					matchesTweetId: link.href.includes(`/status/${tweetId}`),
				};
			});

			const isCommented = debugInfo.some(
				(info) => info.matchesTweetId && !info.isRetweet,
			);
			const isRetweeted = debugInfo.some(
				(info) => info.matchesTweetId && info.isRetweet,
			);

			return { isCommented, isRetweeted, debugInfo };
		}, tweetId);

		// // Log detailed debug information outside of page.evaluate
		// console.log("Debug Information:", result.debugInfo);

		// Return the combined result
		return {
			isCommented: result.isCommented,
			isRetweeted: result.isRetweeted,
			hasEnoughFollowers,
			followerCount,
			debugInfo: result.debugInfo,
		};
	} catch (error) {
		console.error(
			"Error while checking if user commented, retweeted, or has enough followers:",
			error,
		);
		return {
			isCommented: false,
			isRetweeted: false,
			hasEnoughFollowers: false,
			error: "Error occurred during check.",
		};
	}
};

/**
 * Function to check if a specific user has retweeted a tweet by visiting their profile.
 * @param {Object} page - The Puppeteer page object.
 * @param {string} twitterUsername - The Twitter username to verify if they retweeted.
 * @param {string} tweetId - The ID of the tweet to check.
 * @returns {Promise<{ isRetweeted: boolean, error?: string }>} - Returns an object with the retweet status.
 */
const checkIfUserRetweetedUsingPageFunction = async (
	page,
	twitterUsername,
	tweetId,
) => {
	if (!twitterUsername) {
		return { isRetweeted: false, error: "Twitter username is required." };
	}

	try {
		// Step 1: Navigate to the user's Twitter profile
		const userProfileUrl = `https://x.com/${twitterUsername}`;
		await page.goto(userProfileUrl, { waitUntil: "networkidle2" });

		// Step 2: Wait for a known element on the profile page to ensure it's fully loaded
		await page.waitForSelector("article", { timeout: 2000 });

		// Optional: Add a small delay to ensure all elements are fully rendered
		await new Promise((resolve) => setTimeout(resolve, 2000)); // 2-second delay

		// Step 2: Log all links found on the user's profile page for debugging
		const tweetLinks = await page.evaluate(() => {
			return Array.from(document.querySelectorAll('a[href*="/status/"]')).map(
				(a) => a.href,
			);
		});

		// Step 3: Check if the tweet ID matches any of the found links
		const isRetweeted = tweetLinks.some((link) =>
			link.includes(`/status/${tweetId}`),
		);

		return { isRetweeted };
	} catch (error) {
		console.error("Error while checking if user retweeted:", error);
		return {
			isRetweeted: false,
			error: "Error occurred while checking retweet status.",
		};
	}
};

/**
 * Middleware to check if a tweet is available.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 */
const checkTweetAvailability = async (req, res, next) => {
	const { tweetUrl } = req.body;

	if (!tweetUrl) {
		return sendResponse(res, 400, "Tweet URL is required.");
	}

	const { browser, page, error } = await createBasicPuppeteerPage();
	if (error) {
		console.error("Failed to initialize Puppeteer:", error);
		return sendResponse(
			res,
			500,
			"Failed to initialize. Please try again later.",
		);
	}
	try {
		// Navigate to the tweet URL
		await page.goto(tweetUrl, { waitUntil: "networkidle2" });

		// Check if the tweet exists or shows an unavailable message
		const tweetUnavailable = await page.evaluate(() => {
			return (
				document.body.innerText.includes("This Tweet is unavailable") ||
				document.body.innerText.includes(
					"Something went wrong. Try reloading.",
				) ||
				document.body.innerText.includes(
					"Hmm...this page doesn’t exist. Try searching for something else.",
				)
			);
		});

		// Close the browser
		await browser.close();

		// Save tweet availability status to the request object
		req.tweetAvailable = !tweetUnavailable;
		next();
	} catch (error) {
		console.error("Error while checking tweet availability:", error);
		if (browser) await browser.close();
		return sendResponse(
			res,
			500,
			"Error occurred while checking tweet availability.",
		);
	}
};

/**
 * Function to follow a user, check if they follow a target, and unfollow if needed.
 * @param {Object} page - The Puppeteer page object.
 * @param {string} targetProfile - The Twitter username of the profile to check if followed.
 * @param {string} followerUsername - The Twitter username of the user who should be following the target.
 * @returns {Promise<{ isFollowing: boolean, error?: string }>} - Returns an object with the follow status.
 */
const checkIfUserFollowsTargetFunction = async (
	page,
	targetProfile,
	followerUsername,
) => {
	if (!targetProfile || !followerUsername) {
		return {
			isFollowing: false,
			error: "Both target and follower usernames are required.",
		};
	}

	const userProfileUrl = `https://x.com/${followerUsername}`;
	const followersUrl = `https://x.com/${targetProfile}/followers_you_follow`;
	let isFollowing = false;
	let isUserFollowsTheAccount = false;
	try {
		// Step 1: Navigate to the follower's profile page
		console.log("Navigating to user profile page:", userProfileUrl);
		await page.goto(userProfileUrl, { waitUntil: "networkidle2" });

		// Step 2: Attempt to follow the user if not already following
		console.log("Checking follow status on user profile...");
		await page.waitForSelector('div[data-testid="placementTracking"]', {
			visible: true,
			timeout: 5000,
		});

		const { followingStatus, buttonText } = await page.evaluate(() => {
			const followButton = document.querySelector(
				'div[data-testid="placementTracking"] span',
			);
			const buttonText = followButton
				? followButton.innerText
				: "No button found";
			return { followingStatus: buttonText === "Following", buttonText };
		});
		console.log("Follow button text:", buttonText);
		isFollowing = followingStatus;

		if (!isFollowing) {
			console.log("Not currently following. Clicking the follow button...");
			await page.click('div[data-testid="placementTracking"]');
			isFollowing = true;
			console.log("Successfully followed the user.");
		} else {
			console.log("Already following the user.");
		}

		// Step 3: Verify if the follower is in the target's "Followers You Follow" list
		console.log("Navigating to target profile's followers list:", followersUrl);
		await page.goto(followersUrl, { waitUntil: "networkidle2" });
		let isInFollowersList = false;

		for (let i = 0; i < 5; i++) {
			// Loop to scroll and search up to 5 times
			console.log(
				`Checking batch ${i + 1} for follower username: ${followerUsername}`,
			);

			const usernamesFound = await page.evaluate(() => {
				return Array.from(
					document.querySelectorAll('div[data-testid="cellInnerDiv"] span'),
				).map((span) => span.innerText);
			});
			// console.log("Usernames found in this batch:", usernamesFound);

			isInFollowersList = usernamesFound.some(
				(username) =>
					username.toLowerCase() === `@${followerUsername.toLowerCase()}`,
			);
			if (isInFollowersList) {
				console.log(`${followerUsername} is following ${targetProfile}.`);
				isUserFollowsTheAccount = true;
				break;
			} else {
				console.log("Not found in this batch, scrolling to load more...");
				await page.evaluate(() => window.scrollBy(0, window.innerHeight));
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		// Step 4: If the user was followed, unfollow to clean up
		if (isFollowing) {
			console.log("Unfollowing the user to reset state...");
			await page.goto(userProfileUrl, { waitUntil: "networkidle2" });
			await page.waitForSelector('div[data-testid="placementTracking"]', {
				visible: true,
				timeout: 5000,
			});

			// Click the "Following" button to unfollow
			await page.click('div[data-testid="placementTracking"]');
			console.log("Clicked the unfollow button.");

			// Wait for 200ms before pressing the spacebar
			await new Promise((resolve) => setTimeout(resolve, 200));
			await page.keyboard.press("Space");
			console.log("Spacebar pressed to confirm unfollow.");
			isFollowing = false;
		}

		return { isFollowing: isUserFollowsTheAccount }; // Return the final follow status
	} catch (error) {
		console.error(
			"An error occurred during the follow/unfollow check process:",
			error,
		);
		return {
			isFollowing: false,
			error: "Error occurred while checking follow status.",
		};
	}
};

/**
 * Function to check if a tweet is available.
 * @param {string} tweetUrl - The URL of the tweet to check.
 * @returns {Promise<{ isTweetAvailable: boolean, page?: Object, browser?: Object, error?: string }>} - Returns an object with the availability status, page, and browser.
 */
const checkTweetAvailabilityFunction = async (tweetUrl) => {
	if (!tweetUrl) {
		return { isTweetAvailable: false, error: "Tweet URL is required." };
	}

	const { browser, page, error } = await createPuppeteerPage(
		process.env.TWITTER_USERNAME,
		process.env.TWITTER_PASSWORD,
	);

	if (error) {
		console.error("Failed to initialize Puppeteer:", error);
		return {
			isTweetAvailable: false,
			error: "Failed to initialize. Please try again later.",
		};
	}

	try {
		// Navigate to the tweet URL
		await page.goto(tweetUrl, { waitUntil: "networkidle2" });

		// Check if the tweet exists or shows an unavailable message
		const tweetUnavailable = await page.evaluate(() => {
			return (
				document.body.innerText.includes("This Tweet is unavailable") ||
				document.body.innerText.includes(
					"Something went wrong. Try reloading.",
				) ||
				document.body.innerText.includes(
					"Hmm...this page doesn’t exist. Try searching for something else.",
				)
			);
		});

		// Return the result, page, and browser
		return { isTweetAvailable: !tweetUnavailable, page, browser };
	} catch (error) {
		console.error("Error while checking tweet availability:", error);
		if (browser) await browser.close();
		return {
			isTweetAvailable: false,
			error: "Error occurred while checking tweet availability.",
		};
	}
};

/**
 * Function to check if a user is in a Discord guild (server).
 * @param {string} guildId - The ID of the Discord guild (server).
 * @param {string} userId - The Discord user ID of the user to check.
 * @returns {Promise<boolean>} - Returns true if the user is a member of the guild, otherwise false.
 */
const isUserInGuildFunction = async (guildId, userId) => {
	try {
		// Discord API endpoint to check if the user is in the guild
		const url = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`;

		// Make the API request to check if the user is in the guild
		const response = await axios.get(url, {
			headers: {
				Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, // Use your bot's token for authorization
			},
		});

		// If successful (status 200), the user is in the guild
		return response.status === 200;
	} catch (error) {
		console.error("Error checking user membership in guild:", error.message);

		// If 404, user is not in the guild
		if (error.response && error.response.status === 404) {
			console.log("User is not a member of the specified guild.");
			return false;
		}

		// Handle other errors
		throw new Error("An error occurred while checking user membership.");
	}
};

/**
 * Standalone function to check if the bot is in a Discord guild (server).
 * @param {string} guildId - The ID of the Discord guild to check.
 * @returns {Promise<boolean>} - Returns true if the bot is a member of the guild, otherwise false.
 */
const isBotInGuildFunction = async (guildId) => {
	try {
		// Discord API endpoint to check if the bot is in the guild
		const url = `https://discord.com/api/v10/guilds/${guildId}/members/${process.env.DISCORD_BOT_USER_ID}`;
		// Make the API request to check if the bot is in the guild
		const response = await axios.get(url, {
			headers: {
				Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, // Use your bot's token for authorization
			},
		});
		// If successful, the bot is in the server (status code 200)
		return response.status === 200;
	} catch (error) {
		console.error("Error checking bot membership in guild:", error.message);

		// If the bot is not in the guild (404 error)
		if (error.response && error.response.status === 404) {
			console.log("Bot is not a member of the specified guild.");
			return false;
		}

		// Handle other errors
		throw new Error("An error occurred while checking bot membership.");
	}
};

// Middleware to check if a Discord invite link is valid
const isValidDiscordInviteLink = async (req, res, next) => {
	const { path } = req.route;

	const discordInviteLink =
		path === "/discord"
			? req.body.discordInviteLink
			: req.body.joinDiscord?.inviteLink;

	if (!discordInviteLink) {
		return sendResponse(res, 400, "Discord invite link is required.");
	}

	// Extract the invite code from the invite link
	const inviteCode = discordInviteLink.split("/").pop();

	try {
		// Call Discord API to check invite details
		const url = `https://discord.com/api/v10/invites/${inviteCode}`;

		const response = await axios.get(url, {
			headers: {
				Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, // Optional, depending on API access
			},
		});

		// If successful, the invite is valid
		if (response.status === 200) {
			const { guild } = response.data; // Guild contains server info

			if (!guild) {
				return sendResponse(
					res,
					400,
					"Guild (server) not found in the invite.",
				);
			}

			const { id: guildId, name: guildName } = guild;

			// Save server (guild) information to req for later use
			req.discordInviteDetails = response.data;
			req.guild = { guildId, guildName };
			return next();
		} else {
			return sendResponse(res, 400, "Invalid Discord invite link.");
		}
	} catch (error) {
		console.error("Error validating Discord invite link:", error.message);

		if (error.response && error.response.status === 404) {
			return sendResponse(
				res,
				400,
				"Invalid Discord invite link. Invite not found.",
			);
		} else {
			return sendResponse(
				res,
				500,
				"An error occurred while validating the Discord invite link.",
			);
		}
	}
};

// Middleware to check if the bot is in the specified guild (server)
const isBotInGuild = async (req, res, next) => {
	const { guildId } = req.guild; // The guildId should already be in the req from the previous middleware

	if (!guildId) {
		return sendResponse(
			res,
			400,
			"Guild ID is required to check bot membership.",
		);
	}
	try {
		// Discord API endpoint to check if the bot is in the guild
		const url = `https://discord.com/api/v10/guilds/${guildId}/members/${process.env.DISCORD_BOT_USER_ID}`;
		// Make the API request to check if the bot is in the guild
		const response = await axios.get(url, {
			headers: {
				Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
			},
		});

		// If successful, the bot is in the server
		if (response.status === 200) {
			req.botInGuild = true; // Set a flag indicating the bot is in the server
			return next();
		}
	} catch (error) {
		console.error("Error checking bot membership in guild:", error.message);

		// If 404, bot is not in the guild
		if (error.response && error.response.status === 404) {
			return sendResponse(
				res,
				400,
				"Bot is not a member of the specified guild.",
				{ inviteLink: DISCORD_BOT_JOIN_LINK },
			);
		}

		// Handle other errors
		return sendResponse(
			res,
			500,
			"An error occurred while checking bot membership.",
		);
	}
};

const isValidCommunityId = async (req, res, next) => {
	// use this after authenticate to have req.user
	const { communityId } = req.params;
	try {
		const clientProfile = await ClientProfile.findById(communityId);
		if (!clientProfile) {
			return sendResponse(res, 400, "Client profile not found");
		}
		req.clientProfile = clientProfile;
		next();
	} catch (error) {
		console.log("isValidClientProfileId error: ", error);
		return sendResponse(res, 500, "Unable to fetch Community Profile");
	}
};

// Middleware to validate Telegram username
const validateTelegramUsername = (req, res, next) => {
	const telegramUser = req.body.telegram;

	if (telegramUser) {
		const telegramUsernameRegex = /^[a-zA-Z0-9_]{5,32}$/;
		if (!telegramUsernameRegex.test(telegramUser)) {
			return sendResponse(
				res,
				400,
				"Invalid Telegram username. Must be 5-32 characters and can only contain letters, numbers, and underscores.",
			);
		}
	}
	next();
};

/**
 * Function to get the user ID from a Telegram username.
 * @param {string} username - The Telegram username (e.g., 'myUsername').
 * @param {string} botToken - The Telegram bot token to use for the request.
 * @returns {Promise<number|null>} - Returns the user ID if found, otherwise null.
 */
const getUserIdFromUsername = async (username, botToken) => {
	try {
		const url = `https://api.telegram.org/bot${botToken}/getChat`;

		// Make a request to get the user details from their username
		const response = await axios.get(url, {
			params: {
				chat_id: `@${username}`, // Pass the username to getChat API
			},
		});

		// Return the user ID if found
		return response.data.result.id;
	} catch (error) {
		console.error(
			`Error retrieving user ID for username ${username}:`,
			error.message,
		);
		return null; // Return null if an error occurs
	}
};

/**
 * Function to check if a specific user is a member of a Telegram channel.
 * @param {string} channelUsername - The username of the Telegram channel (e.g., 'myChannelUsername').
 * @param {string} userId - The Telegram user ID of the user to check.
 * @param {string} botToken - The Telegram bot token to use for the request.
 * @returns {Promise<boolean>} - Returns true if the user is a member, otherwise false.
 */
const isUserInTelegramChannel = async (
	channelUsername,
	userId,
	botToken = process.env.TELEGRAM_BOT_TOKEN,
) => {
	try {
		// Construct the URL to call the Telegram Bot API
		const url = `https://api.telegram.org/bot${botToken}/getChatMember`;

		// Make a GET request to the API to get information about the user in the channel
		const response = await axios.get(url, {
			params: {
				chat_id: `@${channelUsername}`, // Channel username or channel ID
				user_id: userId, // User ID of the user to check
			},
		});

		// Check the response to see if the user is in the channel
		const memberStatus = response.data.result.status;

		// Return true if the user is a member, administrator, or creator
		return ["administrator", "member", "creator"].includes(memberStatus);
	} catch (error) {
		console.error("Error checking user channel membership:", error.message);

		if (error.response && error.response.data) {
			const errorCode = error.response.data.error_code;
			const errorMessage = error.response.data.description;

			// Specific error handling for Telegram API errors
			if (errorCode === 400 && errorMessage.includes("chat not found")) {
				console.log(
					"The specified channel was not found. Please check the channel username.",
				);
			} else if (errorCode === 400 && errorMessage.includes("user not found")) {
				console.log(
					"The specified user is not in the channel or the channel does not exist.",
				);
			} else {
				console.log(
					"An error occurred while checking the user's channel membership:",
					errorMessage,
				);
			}
		}

		return false; // Return false if there's any error
	}
};

/**
 * Function to check if a specific user is a member of a Telegram channel.
 * @param {string} channelUsername - The username of the Telegram channel (e.g., 'myChannelUsername').
 * @param {string} username - The Telegram username of the user to check.
 * @param {string} botToken - The Telegram bot token to use for the request.
 * @returns {Promise<boolean>} - Returns true if the user is a member, otherwise false.
 */
const isUserInTelegramChannelByUsername = async (
	channelUsername,
	username,
	botToken = process.env.TELEGRAM_BOT_TOKEN,
) => {
	// Get the user ID from the username
	const userId = await getUserIdFromUsername(username, botToken);

	// If userId is null, it means the user does not exist or an error occurred
	if (!userId) {
		console.log(`Could not find user ID for username: ${username}`);
		return false;
	}

	try {
		// Call the existing function using user ID
		return await isUserInTelegramChannel(channelUsername, userId, botToken);
	} catch (error) {
		console.error("Error in isUserInTelegramChannelByUsername:", error.message);
		return false; // Return false in case of any error
	}
};

/**
 * Helper function to check if the bot is a member of a specific Telegram channel.
 * @param {string} channelUsername - The username of the Telegram channel (e.g., 'myChannelUsername').
 * @param {string} botToken - The Telegram bot token to use for the request.
 * @param {string} botUserId - The Telegram bot's user ID to check membership status.
 * @returns {Promise<boolean>} - Returns true if the bot is a member, otherwise false.
 */
const checkBotInTelegramChannel = async (
	channelUsername,
	botToken,
	botUserId,
) => {
	try {
		// Construct the URL to call the Telegram Bot API
		const url = `https://api.telegram.org/bot${botToken}/getChatMember`;

		// Make a GET request to the API to get information about the bot in the channel
		const response = await axios.get(url, {
			params: {
				chat_id: `@${channelUsername}`, // Channel username or channel ID
				user_id: botUserId, // User ID of your bot
			},
		});

		// Check the response to see if the bot is in the channel
		const memberStatus = response.data.result.status;

		// Return true if the status indicates membership
		return ["administrator", "member", "creator"].includes(memberStatus);
	} catch (error) {
		console.error("Error checking bot channel membership:", error.message);
		throw error; // Throw error for handling in the caller function
	}
};

/**
 * Middleware function to check if the bot is a member of a specific Telegram channel.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 */
const isBotInTelegramChannel = async (req, res, next) => {
	const { path } = req.route;
	const channelUsername =
		path === "/telegram"
			? req.body.telegramChannel
			: `${req.body.joinTelegram?.inviteLink.split("/").pop()}`;

	try {
		const botIsInChannel = await checkBotInTelegramChannel(
			channelUsername,
			process.env.TELEGRAM_BOT_TOKEN,
			process.env.TELEGRAM_BOT_USER_ID,
		);
		if (botIsInChannel) {
			return next(); // Proceed to the next middleware if bot is in the channel
		} else {
			return sendResponse(
				res,
				400,
				"The bot is not a member of the specified channel.",
				{ tgBotUsername: process.env.TELEGRAM_BOT_USERNAME },
			);
		}
	} catch (error) {
		if (error.response && error.response.data) {
			console.error("Error logs for testing: ", error);
			const errorCode = error.response.data.error_code;
			const errorMessage = error.response.data.description;

			if (errorCode === 400 && errorMessage.includes("chat not found")) {
				return sendResponse(
					res,
					400,
					"The specified channel was not found. Please check the channel username.",
					{ success: false },
				);
			} else if (errorCode === 400 && errorMessage.includes("user not found")) {
				return sendResponse(
					res,
					400,
					"The bot is not a member of the specified channel.",
					{ success: false, tgBotUsername: process.env.TELEGRAM_BOT_USERNAME },
				);
			} else if (errorCode === 403) {
				return sendResponse(
					res,
					400,
					"The bot is not a member of the specified channel.",
					{ success: false, tgBotUsername: process.env.TELEGRAM_BOT_USERNAME },
				);
			} else if (
				errorCode === 400 &&
				errorMessage.includes("member list is inaccessible")
			) {
				return sendResponse(
					res,
					400,
					"The bot is not a member of the specified channel.",
					{ success: false, tgBotUsername: process.env.TELEGRAM_BOT_USERNAME },
				);
			} else {
				return sendResponse(
					res,
					500,
					"An error occurred while checking the bot's channel membership.",
					{ success: false, error: errorMessage },
				);
			}
		} else {
			console.error("Error checking bot channel membership:", error.message);
			return sendResponse(
				res,
				500,
				"An unexpected error occurred while checking the bot's channel membership.",
				{
					success: false,
					error: error.message,
				},
			);
		}
	}
};

/**
 * Standalone function to check if the bot is in a Telegram channel.
 * @param {string} telegramChannel - The username of the Telegram channel to check.
 * @returns {Promise<boolean>} - Returns true if the bot is a member, otherwise false.
 */
const isBotInTelegramChannelFunction = async (telegramChannel) => {
	try {
		return await checkBotInTelegramChannel(
			telegramChannel,
			process.env.TELEGRAM_BOT_TOKEN,
			process.env.TELEGRAM_BOT_USER_ID,
		);
	} catch (error) {
		console.error("Error in isBotInTelegramChannel:", error.message);
		return false; // Return false in case of any error for standalone usage
	}
};

// middleware for client subscription fee
const isUserCanPay = async (req, res, next) => {
	const { feeInCrypto, coinType } = req.fee;
	const user = req.user;
	try {
		if (!user) return sendResponse(res, 400, "No user found");
		const userWallet = await WalletBalance.findOne({ userRef: user._id });
		if (!userWallet)
			return sendResponse(res, 400, "User does not have a wallet yet");

		const balances = userWallet.balances;
		let userBalance = BigInt(balances.get(coinType) || "0");

		if (BigInt(feeInCrypto) > BigInt(userBalance)) {
			return sendResponse(res, 400, `Not enough ${coinType} balance`, {
				currentBalance: userBalance.toString(),
				fee: feeInCrypto.toString(),
			});
		}
		next();
	} catch (err) {
		console.error(
			"Error checking if user has enough balance to pay for client subscription: ",
			err,
		);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	}
};

// checking if user has enough nafflings to pay
// for client subscription fee
const isUserHasEnoughNafflings = (options = {}) => {
	const { amount = 100 } = options;
	return async (req, res, next) => {
		const user = req.user;
		try {
			if (!user) return sendResponse(res, 400, "No user found");

			const userNafflingsBalance = user.temporaryPointsAsNumber || 0;
			if (amount > userNafflingsBalance) {
				return sendResponse(res, 400, `YOU NEED AT LEAST ${amount} NAFFLINGS TO PROCEED`);
			}
			req.fee = { feeAmount: amount };
			next();
		} catch (err) {
			console.error(
				"Error checking if user has enough nafflings balance to pay for client subscription: ",
				err,
			);
			return sendResponse(res, 500, "Something went wrong.", {
				error: err.message,
			});
		}
	};
};

// checker for user if enough token for withdraw
const isUserCanWithdraw = async (req, res, next) => {
	try {
		const { user } = req;
		const { amount: amountToWithdraw, coinType: coin } = req.body;
		const {
			amount: feeInCrypto,
			gasFeeInDollars,
			payInNative,
			nativeToken,
		} = req.fee;

		if (!user) return sendResponse(res, 400, "No user found");

		const userWallet = await WalletBalance.findOne({ userRef: user._id });
		if (!userWallet)
			return sendResponse(res, 400, "User does not have a wallet yet");

		const balances = userWallet.balances;
		const coinUseForPayment = payInNative ? nativeToken : coin;
		let userBalance = BigInt(balances.get(coin) || "0");
		let error = {};

		const checkBalance = (requiredAmount, actualBalance) => {
			return BigInt(requiredAmount) > BigInt(actualBalance);
		};

		// If paying in native token (e.g., Solana)
		if (payInNative) {
			if (coin === nativeToken) {
				const totalAmountToCheck =
					BigInt(amountToWithdraw) + BigInt(feeInCrypto);
				error.status = checkBalance(totalAmountToCheck, userBalance);
				error.message = `User doesn't have enough ${coinUseForPayment} balance to withdraw`;
			} else {
				const userCoinBalance = BigInt(balances.get(coin) || "0");
				const userFeeBalance = BigInt(balances.get(nativeToken) || "0");
				error.status =
					checkBalance(amountToWithdraw, userCoinBalance) ||
					checkBalance(feeInCrypto, userFeeBalance);
				error.message = `User doesn't have enough ${coin} and/or ${nativeToken} balance to withdraw`;
			}
		} else {
			// If not paying in native token
			const totalAmountToCheck = BigInt(amountToWithdraw) + BigInt(feeInCrypto);
			error.status = checkBalance(totalAmountToCheck, userBalance);
			error.message = `User doesn't have enough ${coin} balance to withdraw`;
		}

		if (error.status) {
			return sendResponse(res, 400, error.message, {
				fee: feeInCrypto,
				ticker: coin,
				gasFeeInDollars,
				payInNative,
				user: user._id,
			});
		}

		next();
	} catch (err) {
		console.error(
			"Error checking if user has enough balance for withdrawal fee: ",
			err,
		);
		return sendResponse(res, 500, "Something went wrong.", {
			error: err.message,
		});
	}
};

// Validate Email
async function validateEmail(req, res, next) {
	const { email } = req.body;
	if (!email) {
		return next();
	}

	// Simple regex for email validation
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!email || !emailRegex.test(email)) {
		return sendResponse(res, 400, "Invalid email format.");
	}

	try {
		// Check for uniqueness of the email in the database
		const existingUser = await User.findOne({ email: email.toLowerCase() });
		if (existingUser) {
			return sendResponse(res, 409, "Email is already taken.");
		}
		req.body.email = email.toLowerCase();
		next();
	} catch (err) {
		console.error("Database error during email check:", err);
		return sendResponse(res, 500, "Error checking email availability.");
	}
}

function validateUsername(req, res, next) {
	const { username } = req.body;
	if (!username) {
		return next();
	}

	// Check if the username meets the desired format
	const usernameRegex = /^[a-zA-Z0-9_]+$/; // This regex allows letters, numbers, and underscores
	if (!username || !usernameRegex.test(username)) {
		return sendResponse(
			res,
			400,
			"Username must contain only letters, numbers, and underscores.",
		);
	}

	// Check the length of the username
	if (username.length < 3 || username.length > 20) {
		return sendResponse(
			res,
			400,
			"Username must be between 3 and 20 characters.",
		);
	}

	// Check for uniqueness of the username in the database
	User.findOne({ username: username.toLowerCase() }, (err, existingUser) => {
		if (err) {
			console.error("Database error during username check:", err);
			return sendResponse(res, 500, "Error checking username availability.");
		}

		if (existingUser) {
			return sendResponse(res, 409, "Username is already taken.");
		}
		req.body.username = username.toLowerCase();
		next();
	});
}

async function validateWalletAddress(req, res, next) {
	const { allowlist, user: currentUser } = req;
	const { walletAddress } = req.body;

	const walletAddressDoc = await WalletAddress.findOne({
		address: walletAddress,
	}).lean();

	if (!walletAddressDoc) {
		return sendResponse(res, 404, "Wallet address not found.");
	}

	if (!walletAddressDoc.userRef.equals(currentUser._id)) {
		return sendResponse(
			res,
			400,
			"You are not the owner of this wallet address.",
		);
	}

	const duplicateEntry = await AllowlistTicket.findOne({
		walletAddressRef: walletAddressDoc._id,
		allowlistRef: allowlist._id,
	});

	if (duplicateEntry) {
		return sendResponse(
			res,
			400,
			"Wallet address already entered. Please use another one",
		);
	}

	req.walletAddressId = walletAddressDoc._id;
	next();
}

const validateAPIKey = (req, res, next) => {
	const apiKey = req.headers["x-api-key"];
	if (apiKey === process.env.API_KEY) {
		next();
	} else {
		return sendResponse(res, 401, "Unauthorized");
	}
};

const validateSecFetchSite = (req, res, next) => {
	const secFetchSite = req.header("Sec-Fetch-Site");
	console.log();
	if (!secFetchSite || secFetchSite !== "same-origin") {
		return sendResponse(res, 401, "Access denied.");
	}
	next();
};

function validatePassword(req, res, next) {
	let { password, newPassword } = req.body;
	if (newPassword) {
		password = newPassword;
	}

	if (!password) {
		return next();
	}

	// Remove all whitespace from password
	password = password.replace(/\s+/g, "");
	var schema = new passwordValidator();
	schema
		.is()
		.min(8) // Minimum length 8
		.is()
		.max(100) // Maximum length 100
		.has()
		.uppercase() // Must have uppercase letters
		.has()
		.lowercase() // Must have lowercase letters
		.has()
		.digits(1) // Must have at least 2 digits
		.has()
		.not()
		.spaces(); // Should not have spaces

	const validPassword = schema.validate(password);
	if (!validPassword) {
		return sendResponse(res, 400, "Invalid password");
	} else {
		req.body.password = password;
		next();
	}
}

async function validatePermission(req, res, next) {
	const user = req.user;
	// Validate raffle creation setting
	const { canCreateRaffle } = await AdminSettings.findOne();
	console.log("canCreateRaffle:", canCreateRaffle);
	if (canCreateRaffle !== "everyone") {
		// TODO Add checking here
	}
	next();
}

const parseBigInt = (paths, options = { allowZero: true }) => {
	return (req, res, next) => {
		const getValue = (obj, path) => {
			const keys = path.split(".");
			let current = obj;
			for (let key of keys) {
				if (current[key] == null) {
					return null;
				}
				current = current[key];
			}
			return current;
		};

		const setValue = (obj, path, value) => {
			const keys = path.split(".");
			let current = obj;
			for (let i = 0; i < keys.length - 1; i++) {
				const key = keys[i];
				if (!current[key]) {
					current[key] = {};
				}
				current = current[key];
			}
			current[keys[keys.length - 1]] = value;
		};

		for (let path of paths) {
			const keys = path.split(".");
			const key = keys[keys.length - 1];
			let value = getValue(req, path);
			if (value == null) {
				// Value is null or undefined
				return sendResponse(res, 400, `${key} is required`);
			}

			try {
				if (typeof value === "string" || typeof value === "number") {
					// Convert string or number to BigInt
					value = BigInt(value);
					setValue(req, path, value);
				} else if (typeof value !== "bigint") {
					// Invalid type
					return sendResponse(
						res,
						400,
						`${key} must be a string, number, or BigInt`,
					);
				}

				if (!options.allowZero && value === BigInt(0)) {
					return sendResponse(res, 400, `${key} cannot be zero`);
				}
			} catch (e) {
				return sendResponse(res, 400, `${key} must be a valid integer`);
			}
		}
		next();
	};
};

const parseNumber = (paths, options = { allowZero: true }) => {
	return (req, res, next) => {
		const getValue = (obj, path) => {
			const keys = path.split(".");
			let current = obj;
			for (let key of keys) {
				if (current[key] == null) {
					return null;
				}
				current = current[key];
			}
			return current;
		};

		const setValue = (obj, path, value) => {
			const keys = path.split(".");
			let current = obj;
			for (let i = 0; i < keys.length - 1; i++) {
				const key = keys[i];
				if (!current[key]) {
					current[key] = {};
				}
				current = current[key];
			}
			current[keys[keys.length - 1]] = value;
		};

		for (let path of paths) {
			const keys = path.split(".");
			const key = keys[keys.length - 1];
			const userFriendlyKey = key.replace(/([A-Z])/g, " $1").toLowerCase(); // Convert camelCase to a friendly format
			let value = getValue(req, path);

			if (value == null) {
				// Value is null or undefined
				return sendResponse(res, 400, `${userFriendlyKey} is required`);
			}

			if (typeof value === "string" || typeof value === "number") {
				// Convert string or number to Number
				value = Number(value);
				if (isNaN(value) || value < 0 || !Number.isInteger(value)) {
					return sendResponse(
						res,
						400,
						`${userFriendlyKey} must be a valid non-negative integer`,
					);
				}
				setValue(req, path, value);
			} else {
				// Invalid type
				return sendResponse(
					res,
					400,
					`${userFriendlyKey} must be a string or number`,
				);
			}

			if (!options.allowZero && value === 0) {
				return sendResponse(res, 400, `${userFriendlyKey} cannot be zero`);
			}
		}
		next();
	};
};

const normalizeString = (paths) => {
	return (req, res, next) => {
		const getValue = (obj, path) => {
			const keys = path.split(".");
			let current = obj;
			for (let key of keys) {
				if (current[key] == null) {
					return null;
				}
				current = current[key];
			}
			return current;
		};

		const setValue = (obj, path, value) => {
			const keys = path.split(".");
			let current = obj;
			for (let i = 0; i < keys.length - 1; i++) {
				const key = keys[i];
				if (!current[key]) {
					current[key] = {};
				}
				current = current[key];
			}
			current[keys[keys.length - 1]] = value;
		};

		paths.forEach((path) => {
			const value = getValue(req, path);
			if (typeof value === "string") {
				const normalized = value.toLowerCase().trim();
				setValue(req, path, normalized);
			}
		});
		next();
	};
};

const restructureBodyMiddleware = (req, res, next) => {
	const restructuredBody = {};

	// Loop through each key in req.body and transform it to nested structure
	Object.keys(req.body).forEach((key) => {
		const keys = key.split("."); // Split the key by dot notation (e.g., 'pot.amount')
		keys.reduce((acc, part, index) => {
			if (index === keys.length - 1) {
				acc[part] = req.body[key]; // Assign the final value
			} else {
				acc[part] = acc[part] || {}; // Create nested objects if not already present
			}
			return acc[part];
		}, restructuredBody);
	});

	// Assign the restructured body back to req.body
	req.body = restructuredBody;

	next();
};

const conditionalValidDiscordInviteLink = (req, res, next) => {
	if (req.body.joinDiscord) {
		return isValidDiscordInviteLink(req, res, next);
	}
	next();
};

const conditionalBotInGuild = (req, res, next) => {
	if (req.body.joinDiscord) {
		return isBotInGuild(req, res, next);
	}
	next();
};

const conditionalBotInTelegramChannel = (req, res, next) => {
	if (req.body.joinTelegram) {
		return isBotInTelegramChannel(req, res, next);
	}
	next();
};

const conditionalValidateTweetUrl = (req, res, next) => {
	if (req.body.twitterTasks) {
		return validateTweetUrl(req, res, next);
	}
	next();
};

module.exports = {
	isUserHasEnoughNafflings,
	isUserCanPay,
	validateUsername,
	validateWalletAddress,
	validateAPIKey,
	validateSecFetchSite,
	validatePassword,
	validateEmail,
	validatePermission,
	isUserCanWithdraw,
	parseBigInt,
	parseNumber,
	normalizeString,
	restructureBodyMiddleware,
	isBotInTelegramChannel,
	validateTelegramUsername,
	isBotInTelegramChannelFunction,
	isUserInTelegramChannelByUsername,
	isValidCommunityId,
	isUserInTelegramChannel,
	isValidDiscordInviteLink,
	isBotInGuild,
	isBotInGuildFunction,
	isUserInGuildFunction,
	checkTweetAvailability,
	checkTweetAvailabilityFunction,
	checkIfUserRetweetedUsingPageFunction,
	checkIfUserCommentedUsingPageFunction,
	validateTweetUrl,
	checkIfUserCommentedOrRetweetedUsingPageFunction,
	checkIfUserFollowsTargetFunction,
	conditionalValidDiscordInviteLink,
	conditionalBotInGuild,
	conditionalBotInTelegramChannel,
	conditionalValidateTweetUrl,
};
