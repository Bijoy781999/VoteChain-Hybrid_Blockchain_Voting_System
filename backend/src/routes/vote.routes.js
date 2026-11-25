const express = require("express");
const router = express.Router();
const {
  submitRelayerVote,
  checkVoterStatus,
  recordDirectVote,
  getVotingHistory,
  verifyVoteReceipt,
} = require("../controllers/voteController");
const authMiddleware = require("../middleware/authMiddleware");
const { optionalAuth } = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const blockReadOnlyAccount = require("../middleware/readOnlyMiddleware");
const { voteLimiter } = require("../middleware/rateLimitMiddleware");
const { validateBody } = require("../middleware/validateMiddleware");

// Submit gasless vote via relayer
router.post(
  "/relayer",
  authMiddleware,
  roleMiddleware("voter"),
  blockReadOnlyAccount,
  voteLimiter,
  validateBody(["electionId", "candidateId"]),
  submitRelayerVote
);

// Record direct MetaMask vote receipt
router.post(
  "/direct-record",
  authMiddleware,
  roleMiddleware("voter"),
  blockReadOnlyAccount,
  recordDirectVote
);

// Personal voting history archive & ended results overview for logged-in voter or candidate
router.get("/history", authMiddleware, roleMiddleware("voter", "candidate"), getVotingHistory);

// Independent anonymized ballot receipt verification by txHash
router.get("/verify/:txHash", optionalAuth, verifyVoteReceipt);

// Check if current voter has voted in an election
router.get(
  "/status/:electionId",
  authMiddleware,
  roleMiddleware("voter"),
  checkVoterStatus
);

module.exports = router;
