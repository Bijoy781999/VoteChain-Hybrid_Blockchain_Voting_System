const express = require("express");
const router = express.Router();
const {
  getVoterProfile,
  updateVoterProfile,
  linkWallet,
  listVoters,
  approveVoter,
  rejectVoter,
  deleteVoter,
  getVoterNotifications,
  markNotificationsRead,
} = require("../controllers/voterController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const blockReadOnlyAccount = require("../middleware/readOnlyMiddleware");

// Voter self-service
router.get("/profile", authMiddleware, roleMiddleware("voter"), getVoterProfile);
router.put("/profile", authMiddleware, roleMiddleware("voter"), blockReadOnlyAccount, updateVoterProfile);
router.post("/link-wallet", authMiddleware, roleMiddleware("voter"), blockReadOnlyAccount, linkWallet);
router.get("/notifications", authMiddleware, roleMiddleware("voter"), getVoterNotifications);
router.post("/notifications/read", authMiddleware, roleMiddleware("voter"), blockReadOnlyAccount, markNotificationsRead);

// Admin voter management
router.get("/", authMiddleware, roleMiddleware("admin"), listVoters);
router.post("/:voterId/approve", authMiddleware, roleMiddleware("admin"), blockReadOnlyAccount, approveVoter);
router.post("/:voterId/reject", authMiddleware, roleMiddleware("admin"), blockReadOnlyAccount, rejectVoter);
router.delete("/:voterId", authMiddleware, roleMiddleware("admin"), blockReadOnlyAccount, deleteVoter);

module.exports = router;
