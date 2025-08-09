// middleware/checkVerificationCode.js
const { getAsync, ttlAsync } = require("../config/redisClient");
const sendResponse = require("../utils/responseHandler");

const checkUserCreationVerificationCode = async (req, res, next) => {
  const email = req.body.email;
  if (!email) {
    // If 'email' is not provided, return an error response
    return sendResponse(res, 400, "Email is required for verification.");
  }
  const existingCode = await getAsync(`userCreationVerification:${email}`);
  if (existingCode) {
    const ttl = await ttlAsync(`userCreationVerification:${email}`);
    return sendResponse(
      res,
      429,
      `Please wait ${ttl} seconds before requesting a new code.`
    );
  }
  next();
};
module.exports = { checkUserCreationVerificationCode };
