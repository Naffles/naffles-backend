// csvReader.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mongoose = require('mongoose'); // Import mongoose for session handling
const WalletAddress = require('../models/user/walletAddress');
const User = require('../models/user/user'); // Import the User model
const NafflingRewards = require('../models/events/nafflingRewards');

const rewardNafflings = () => {
  return new Promise((resolve, reject) => {
    const results = [];
    const filePath = path.join(__dirname, 'csv-files', 'Naffening winners.csv');

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        // Check if the row is not empty (all values should not be empty strings)
        if (Object.values(data).some(value => value.trim() !== '')) {
          results.push(data);
        }
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

const findUserByAddress = async (solAddress, ethAddress, session) => {
  try {
    // First, search by SOL address
    let user = await WalletAddress.findOne({ address: solAddress, walletType: 'phantom' }).populate('userRef').session(session);

    if (!user) {
      // If no user found, search by ETH address
      user = await WalletAddress.findOne({ address: ethAddress, walletType: 'metamask' }).populate('userRef').session(session);
    }

    return user ? user.userRef : null; // Return the user reference if found, otherwise null
  } catch (error) {
    console.error('Error searching for user:', error);
    throw error; // Optionally re-throw the error to handle it elsewhere
  }
};

const updateUserTemporaryPoints = async (userId, amount, address, session) => {
  try {
    // Find the user by their ID
    const user = await User.findById(userId).session(session);

    if (user) {
      // Check if a reward for this campaign, user, and address already exists
      const existingReward = await NafflingRewards.findOne({
        campaign: 'Sept.2 campaign naffening reward for winners',
        rewardedTo: user._id,
        address: address,
      }).session(session);

      if (existingReward) {
        console.log(`User ${user.username} has already been rewarded for this campaign and address.`);
        return; // Skip rewarding if already rewarded
      }

      // Convert the existing temporaryPoints to BigInt
      const currentPoints = BigInt(user.temporaryPoints || '0');

      // Convert the amount of Nafflings to BigInt and normalize
      const amountToAdd = BigInt(amount) * BigInt(10 ** 18);

      // Add the amount to the current points
      const newPoints = currentPoints + amountToAdd;

      // Update the user's temporaryPoints
      user.temporaryPoints = newPoints.toString();

      // Save the user
      await user.save({ session });

      console.log(`Updated temporaryPoints for user ${user.username}: ${user.temporaryPoints}`);

      // Save the reward document
      const reward = new NafflingRewards({
        campaign: 'Sept.2 campaign naffening reward for winners',
        rewardedTo: user._id,
        points: amountToAdd.toString(),
        address: address,
      });

      await reward.save({ session });

      console.log(`Saved reward for user ${user.username} with points: ${amountToAdd.toString()}`);
    } else {
      console.log('User not found.');
    }
  } catch (error) {
    console.error('Error updating user temporaryPoints or saving reward:', error);
    throw error;
  }
};

// New function to encapsulate the reward process
const processRewardNafflings = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const data = await rewardNafflings();
    console.log(`Total Rows: ${data.length}`);

    // Loop through each item in the data array
    for (const item of data) {
      console.log('Processing Item:', item);

      // Extract addresses and amount from the current item
      const solAddress = item.SOL;
      const ethAddress = item.ETH;
      const amountOfNafflings = item['Amount of Nafflings'];

      // Search for the user based on the SOL and ETH addresses
      const user = await findUserByAddress(solAddress, ethAddress, session);

      if (user) {
        console.log('User associated with the item:', user);

        // Update the user's temporaryPoints and save the reward
        await updateUserTemporaryPoints(user._id, amountOfNafflings, solAddress || ethAddress, session);
      } else {
        console.log('No user associated with the item.');
      }
    }

    // Commit the transaction after all items are processed
    await session.commitTransaction();
    console.log('Transaction committed successfully.');

  } catch (error) {
    await session.abortTransaction();
    console.error('Error processing rewards:', error);
  } finally {
    session.endSession();
  }
};

module.exports = {
  processRewardNafflings,
};
