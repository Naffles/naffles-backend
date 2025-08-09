const axios = require('axios');
const connectWithRetry = require("../../config/database");
const { checkTwitterTaskQueue, joinAirdropcheckTwitterFollowQueue, joinAirdropcheckTwitterRetweetQueue, requestForRandomNumberVrfQueue } = require("../../config/queue");
const { checkIfUserCommentedOrRetweetedUsingPageFunction, checkIfUserFollowsTargetFunction } = require("../../middleware/validate");
const ClientMemberClaimedTask = require("../../models/client/items/earn/clientMemberClaimedTask");
const Session = require("../../models/utils/session");
const { createPuppeteerPage, extractTweetId } = require("../twitter");
const mongoose = require("mongoose");
const Airdrop = require('../../models/events/airdrop');
const { requestForRandomNumber } = require('../random');
const Raffle = require('../../models/raffle/raffle');

connectWithRetry();

const updateTaskStatus = async (task, user, session, taskType, extraData = {}) => {
  try {
    const updateFields = {
      taskType,
      status: 'pending',
      ...(extraData.twitter?.validAmountOfFollowers && { 'task.twitter.validAmountOfFollowers': extraData.twitter.validAmountOfFollowers }),
      ...(extraData.twitter?.retweet && { 'task.twitter.retweet': extraData.twitter.retweet }),
      ...(extraData.twitter?.comment && { 'task.twitter.comment': extraData.twitter.comment }),
      ...(extraData.telegram?.joined && { 'task.telegram.joined': extraData.telegram.joined }),
      ...(extraData.discord?.joined && { 'task.discord.joined': extraData.discord.joined })
    };

    return await ClientMemberClaimedTask.findOneAndUpdate(
      { taskId: task._id, claimedBy: user._id },
      { $set: updateFields },
      {
        new: true,
        upsert: true,
        session
      }
    );
  } catch (error) {
    console.error("Error updating task status:", error);
    throw new Error("Unable to claim or update task.");
  }
};

const handleCommentOrRetweetCheck = async (page, twitterUsername, minimumFollowersRequired, tweetId, task, user, session, job) => {
  const { isCommented, isRetweeted, hasEnoughFollowers, followerCount, error } = await checkIfUserCommentedOrRetweetedUsingPageFunction(page, twitterUsername, tweetId, minimumFollowersRequired);

  if (error) {
    console.error("Failed to verify if the tweet was commented or retweeted.");
    await session.abortTransaction();
    await job.discard();
    await job.moveToFailed({ message: "Failed to verify comment or retweet." }, true);
    return false;
  }

  // console.log("Is commented?:", isCommented, "Is retweeted?:", isRetweeted, "Has enough followers?:", hasEnoughFollowers, followerCount);
  await updateTaskStatus(task, user, session, 'twitter', { twitter: { comment: isCommented, retweet: isRetweeted, validAmountOfFollowers: hasEnoughFollowers } });
  return true;
};

const processTwitterTask = async (job) => {
  const { twitterTask, user } = job.data;
  console.log("Job created for twitter task");
  const session = await mongoose.startSession();
  session.startTransaction();

  let browser;
  try {
    const puppeteerResult = await createPuppeteerPage(process.env.TWITTER_USERNAME, process.env.TWITTER_PASSWORD);
    if (puppeteerResult.error) {
      console.error("Error with Puppeteer:", puppeteerResult.error);
      throw new Error("Failed to initialize Puppeteer.");
    }

    browser = puppeteerResult.browser;
    const page = puppeteerResult.page;
    const twitterUsername = user.socials?.twitter?.username;
    const minimumFollowersRequired = twitterTask?.twitter?.minimumFollowers || 0;
    const tweetId = extractTweetId(twitterTask.twitter.link);

    // Check if either comment or retweet task is required
    if (twitterTask.earnType === 'twitter' && (twitterTask?.twitter?.action?.comment || twitterTask?.twitter?.action?.retweet)) {
      const success = await handleCommentOrRetweetCheck(page, twitterUsername, minimumFollowersRequired, tweetId, twitterTask, user, session, job);
      if (!success) return;
    }

    await session.commitTransaction();
    await job.moveToCompleted('Task processed successfully', true);
  } catch (error) {
    console.error("Error processing Twitter task:", error);
    await session.abortTransaction();
    await job.discard();
    await job.moveToFailed({ message: error.message }, true);
  } finally {
    if (browser) await browser.close();
    session.endSession(); // End the current session before standalone writes

    try {
      // Update the status without a session
      const userTask = await ClientMemberClaimedTask.findOne({ claimedBy: user._id, taskId: twitterTask._id });
      if (userTask) {
        userTask.task.twitter.status = "idle";
        await userTask.save(); // Save without a session
      }
    } catch (updateError) {
      console.error("Error updating status to idle:", updateError);
    }
    console.log("Process completed and session ended.");
  }
};

const processAirdropRetweetQueue = async (job) => {
  const { twitterPost, user, walletAddress } = job.data;
  console.log("JOB DATA: ", job.data);
  const session = await mongoose.startSession();
  session.startTransaction();

  let browser;
  try {
    const puppeteerResult = await createPuppeteerPage(process.env.TWITTER_USERNAME, process.env.TWITTER_PASSWORD);
    if (puppeteerResult.error) {
      console.error("Error with Puppeteer:", puppeteerResult.error);
      throw new Error("Failed to initialize Puppeteer.");
    }

    browser = puppeteerResult.browser;
    const page = puppeteerResult.page;
    const twitterUsername = user.socials?.twitter?.username;
    const tweetId = extractTweetId(twitterPost);

    const { isCommented, isRetweeted, hasEnoughFollowers, followerCount, error } = await checkIfUserCommentedOrRetweetedUsingPageFunction(page, twitterUsername, tweetId);
    // console.log("IS COMMENTED: ", isCommented);
    // console.log("isRetweeted: ", isRetweeted);
    // console.log("hasEnoughFollowers: ", hasEnoughFollowers);
    // console.log("followerCount: ", followerCount);
    if (error) {
      console.error("Failed to verify if the tweet was commented or retweeted.");
      await session.abortTransaction();
      await job.discard();
      await job.moveToFailed({ message: "Failed to verify comment or retweet." }, true);
    }
    // Find the existing document
    let airdrop = await Airdrop.findOne({ userRef: user._id, walletAddress }).session(session);

    if (!airdrop) {
      // Create a new document if it doesn't exist
      airdrop = new Airdrop({ userRef: user._id, walletAddress });
    }

    // Update the fields and save the document
    airdrop.taskStatus.repostNafflesPostOnX = isRetweeted;
    airdrop.taskStatus.followNafflesOnX = isRetweeted;

    await airdrop.save({ session }); // This will trigger the `post-save` hook

    await session.commitTransaction();
    // await new Promise((resolve) => setTimeout(resolve, 5000)); // 5-second delay
    await job.moveToCompleted('Task processed successfully', true);
  } catch (error) {
    console.error("Error processing Twitter task:", error);
    await session.abortTransaction();
    await job.discard();
    await job.moveToFailed({ message: error.message }, true);
  } finally {
    if (browser) await browser.close();
    session.endSession(); // End the current session before standalone writes

    try {
      // Update the status without a session
      const airdrop = await Airdrop.findOne({ userRef: user._id, walletAddress });
      if (airdrop) {
        airdrop.status = "pending";
        await airdrop.save(); // Save without a session
      }
    } catch (updateError) {
      console.error("Error updating status to pending:", updateError);
    }
    console.log("Process airdrop retweet completed and session ended.");
  }
};

const processAirdropFollowXQueue = async (job) => {
  const { targetProfile, followerProfile, user } = job.data;
  console.log("Job created for follower checker");
  const session = await mongoose.startSession();
  session.startTransaction();

  let browser;
  try {
    const puppeteerResult = await createPuppeteerPage(process.env.TWITTER_USERNAME, process.env.TWITTER_PASSWORD);
    if (puppeteerResult.error) {
      console.error("Error with Puppeteer:", puppeteerResult.error);
      throw new Error("Failed to initialize Puppeteer.");
    }

    browser = puppeteerResult.browser;
    const page = puppeteerResult.page;
    const twitterUsername = followerProfile;

    // Check if user follows the target profile
    const followCheckResult = await checkIfUserFollowsTargetFunction(page, targetProfile, twitterUsername);
    if (followCheckResult.error) {
      throw new Error(followCheckResult.error);
    }

    const isFollowed = followCheckResult.isFollowing;
    var airdrop = await Airdrop.findOne({
      userRef: user._id
    }).session(session)
    if (!airdrop) {
      airdrop = new Airdrop({ userRef: user._id });
      await airdrop.save({ session });
    }

    airdrop.taskStatus.followNafflesOnX = isFollowed;
    await airdrop.save({ session });
    await session.commitTransaction();
    await job.moveToCompleted('Task processed successfully', true);
  } catch (error) {
    console.error("Error processing Twitter task:", error);
    await session.abortTransaction();
    await job.discard();
    await job.moveToFailed({ message: error.message }, true);
  } finally {
    if (browser) await browser.close();
    session.endSession();
    console.log("Process completed and session ended.");
  }
};

// for raffles
const processRandomNumberVrf = async (job) => {
  const { raffleId, randomRange } = job.data;
  const session = await mongoose.startSession();
  session.startTransaction();
  let errorOccurred = false; // Flag to track if an error occurred
  try {
    // Find raffle
    const raffle = await Raffle.findById(raffleId).session(session);
    if (!raffle) {
      throw new Error(`No raffle found. Skipping this job.`);
    }

    const naffleId = raffle.eventId;
    const transactionHash = await requestForRandomNumber(naffleId, randomRange);
    if (transactionHash !== null) {
      raffle.vrf.status = "Fulfilled";
      raffle.vrf.transactionHash = transactionHash;
      raffle.status.isActive = true;
      await raffle.save({ session });
    }

    await session.commitTransaction();
    await job.moveToCompleted("Task processed successfully", true);
  } catch (error) {
    console.error("Error processing VRF:", error);
    errorOccurred = true; // Set the flag to true if an error occurred
    await session.abortTransaction();
    await job.discard();
    await job.moveToFailed({ message: error.message }, true);
  } finally {
    session.endSession(); // End the session before standalone writes

    if (errorOccurred) {
      try {
        // Update raffle.vrf.status to "Failed" only if an error occurred
        const raffle = await Raffle.findById(raffleId);
        if (raffle && raffle.vrf.status !== "Fulfilled") {
          raffle.vrf.status = "Failed";
          await raffle.save();
        }
      } catch (updateError) {
        console.error("Error updating raffle.vrf.status to Failed:", updateError);
      }
    }

    console.log("Process completed and session ended.");
  }
};


// Assign the processor to the queue with concurrency set to 2
checkTwitterTaskQueue.process(2, processTwitterTask);  // Processes two job at a time

// airdrop related jobs
joinAirdropcheckTwitterFollowQueue.process(2, processAirdropFollowXQueue);
joinAirdropcheckTwitterRetweetQueue.process(2, processAirdropRetweetQueue);
requestForRandomNumberVrfQueue.process(1, processRandomNumberVrf);