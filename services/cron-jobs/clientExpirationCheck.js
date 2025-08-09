
const cron = require("node-cron");
const { redlock, setAsync } = require("../../config/redisClient");
const moment = require('moment');
const ClientProfile = require("../../models/client/clientProfile");
const User = require("../../models/user/user");
const { sendClientExpirationNotificationEmail, sendEmailVerificationCode } = require("../../utils/sendEmail");

const checkClientProfileExpirations = async () => {
  try {
    // Get the current date in UTC
    const currentDate = moment.utc().startOf('day'); // Start of the day in UTC
    const intervals = [14, 7, 3, 1]; // Days before expiration to send notifications

    for (let days of intervals) {
      // Target date is calculated by adding 'days' to the current UTC date
      const targetDate = moment.utc(currentDate).add(days, 'days');
      const expiringProfiles = await ClientProfile.find({
        expiresAt: {
          $gte: targetDate.startOf('day').toDate(), // Start of the day in UTC
          $lte: targetDate.endOf('day').toDate()    // End of the day in UTC
        }
      });

      for (let profile of expiringProfiles) {
        // sending of email here
        const admin = await User.findById(profile.adminRef);
        if (admin && admin.email) {
          const email = admin.email;
          const username = admin?.username;
          await sendClientExpirationNotificationEmail(username, days, email);
        }
      }
    }
  } catch (error) {
    console.log("checkClientProfileExpirations error: ", error);
  }
}

const clientExpirationCheck = async () => {
  console.log("Initialize CRON for getting expired client profile");
  const cronJob = async () => {
    try {
      // Attempt to acquire the lock
      await redlock.acquire(['send-email-notif-client-profile-expiration'], 10 * 60 * 1000); // 600000 ms = 10 minutes
      await checkClientProfileExpirations();
    } catch (error) {
      console.log("sending email notif on client profile expiration cron error: ", error);
    }
  };
  // // Immediate execution at runtime with lock
  // await cronJob();

  // Schedule the task to run every day at 00:00:01 (1 second after midnight UTC)
  cron.schedule("1 0 * * *", cronJob); // "1 0 * * *" means every day at 00:00:01
};

module.exports = clientExpirationCheck;
