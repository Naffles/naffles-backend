const jwt = require("jsonwebtoken");
const User = require("../models/user/user");

const optionalAuthenticate = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    // Extract the token from the 'Authorization' header
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    // No token provided, proceed without user information
    return next();
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find the user based on the token's id payload
    const user = await User.findById(decoded.id);

    if (user) {
      // User found, attach to request object
      req.user = user;
    }
    // Proceed regardless of user being found or not
    next();
  } catch (error) {
    // In case of token verification failure, proceed without user information
    next();
  }
};

module.exports = optionalAuthenticate;
