const express = require("express");
const router = express.Router();
const {
  createElection,
  listElections,
  getElectionById,
  getPublicElectionResults,
  updateElectionPhase,
  deleteElection,
} = require("../controllers/electionController");
const authMiddleware = require("../middleware/authMiddleware");
const { optionalAuth } = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const blockReadOnlyAccount = require("../middleware/readOnlyMiddleware");

// Public / Voter / Candidate view (individual candidate counts hidden until Ended)
router.get("/", optionalAuth, listElections);
router.get("/:id/public-results", optionalAuth, getPublicElectionResults);
router.get("/:id", optionalAuth, getElectionById);

// Admin
router.post("/", authMiddleware, roleMiddleware("admin"), blockReadOnlyAccount, createElection);
router.patch("/:id/phase", authMiddleware, roleMiddleware("admin"), blockReadOnlyAccount, updateElectionPhase);
router.delete("/:id", authMiddleware, roleMiddleware("admin"), blockReadOnlyAccount, deleteElection);

module.exports = router;
