const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication requests from this IP, please try again after 15 minutes",
  },
});

const voteLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Max 30 vote submission attempts
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Vote submission rate limit reached. Please wait a moment before retrying.",
  },
});

module.exports = {
  authLimiter,
  voteLimiter,
};
