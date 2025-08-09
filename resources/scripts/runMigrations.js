const { exec } = require("child_process");
const { redlock } = require("../../config/redisClient");

const runMigrations = async () => {
  try {
    // localhost = 30secs, dev/staging/prod = 10 mins
    const duration = process.env.NODE_ENV === "localhost" ? (10 * 1000) : (10 * 60 * 1000);
    console.log("NODE ENV: ", process.env.NODE_ENV)
    // Attempt to acquire the lock
    await redlock.acquire(["run-migrations"], duration);
    console.log("Running migrations...123");

    return new Promise((resolve, reject) => {
      const migrateProcess = exec("npm run migrate");

      let stdoutData = "";
      let stderrData = "";

      migrateProcess.stdout.on("data", (data) => {
        stdoutData += data;
      });

      migrateProcess.stderr.on("data", (data) => {
        stderrData += data;
      });

      migrateProcess.on("close", (code) => {
        if (code === 0) {
          resolve({ code, stdout: stdoutData, stderr: stderrData });
        } else {
          reject({ code, stdout: stdoutData, stderr: stderrData });
        }
      });
    });
  } catch (err) {
    // Log the error and rethrow it to be handled by the calling function
    console.error("Migration is already running on another instance or lock error");
    throw err;
  }
};

module.exports = runMigrations;
