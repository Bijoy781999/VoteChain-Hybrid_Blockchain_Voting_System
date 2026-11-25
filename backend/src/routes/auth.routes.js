const express = require("express");
const router = express.Router();
const {
  registerVoter,
  loginVoter,
  registerAdmin,
  loginAdmin,
  registerCandidate,
  loginCandidate,
  requestRegistrationCode,
  forgotPassword,
  resetPassword,
  linkAdminWallet,
  listAdmins,
  deleteAdminAccount,
  getCurrentUser,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const blockReadOnlyAccount = require("../middleware/readOnlyMiddleware");
const { authLimiter } = require("../middleware/rateLimitMiddleware");
const { validateBody } = require("../middleware/validateMiddleware");

// Registration Email Verification Code (Voter, Candidate, Admin)
router.post(
  "/request-registration-code",
  authLimiter,
  validateBody(["email", "role"]),
  requestRegistrationCode
);

// Voter Auth
router.post(
  "/register",
  authLimiter,
  validateBody(["fullName", "email", "govId", "password"]),
  registerVoter
);
router.post("/login", authLimiter, validateBody(["email", "password"]), loginVoter);

// Admin Auth
router.post(
  "/admin/register",
  authLimiter,
  validateBody(["fullName", "email", "password"]),
  registerAdmin
);
router.post("/admin/login", authLimiter, validateBody(["email", "password"]), loginAdmin);
router.post(
  "/admin/link-wallet",
  authMiddleware,
  roleMiddleware("admin"),
  blockReadOnlyAccount,
  validateBody(["walletAddress"]),
  linkAdminWallet
);
router.get("/admins", authMiddleware, roleMiddleware("admin"), listAdmins);
router.delete(
  "/admins/:adminId",
  authMiddleware,
  roleMiddleware("admin"),
  blockReadOnlyAccount,
  deleteAdminAccount
);

// Candidate Auth
router.post(
  "/candidate/register",
  authLimiter,
  validateBody(["name", "email", "password"]),
  registerCandidate
);
router.post(
  "/candidate/login",
  authLimiter,
  validateBody(["email", "password"]),
  loginCandidate
);

// Password Recovery (Voter, Candidate, Admin)
router.post(
  "/forgot-password",
  authLimiter,
  validateBody(["email", "role"]),
  forgotPassword
);
router.post(
  "/reset-password",
  authLimiter,
  validateBody(["email", "role", "code", "newPassword"]),
  resetPassword
);

// Current User Profile
router.get("/me", authMiddleware, getCurrentUser);

module.exports = router;
