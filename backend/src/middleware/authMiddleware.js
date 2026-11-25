const jwt = require("jsonwebtoken");
const env = require("../config/env");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Candidate = require("../models/Candidate");

const resolveAccountExists = async (decoded) => {
  const modelMap = {
    admin: Admin,
    candidate: Candidate,
    voter: User,
  };
  const Model = modelMap[decoded?.role];
  if (!Model || !decoded?.id) return true;
  const exists = await Model.exists({ _id: decoded.id });
  return Boolean(exists);
};

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authorization token missing or invalid",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const exists = await resolveAccountExists(decoded);
    if (!exists) {
      return res.status(401).json({
        success: false,
        message: "Account no longer exists or has been removed. Please log in again.",
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Session expired or invalid token. Please log in again.",
    });
  }
};

const optionalAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, env.JWT_SECRET);
      const exists = await resolveAccountExists(decoded);
      if (exists) {
        req.user = decoded;
      }
    } catch (error) {}
  }
  next();
};

module.exports = authMiddleware;
module.exports.optionalAuth = optionalAuthMiddleware;
