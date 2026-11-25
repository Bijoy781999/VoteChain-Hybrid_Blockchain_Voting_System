const express = require("express");
const router = express.Router();
const {
  addCandidate,
  listCandidates,
  getCandidateProfile,
  updateCandidateProfile,
  requestAdminApproval,
  listCandidateNominations,
  reviewCandidateNomination,
  listAllCandidatesAdmin,
  deleteCandidate,
} = require("../controllers/candidateController");
const authMiddleware = require("../middleware/authMiddleware");
const { optionalAuth } = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const blockReadOnlyAccount = require("../middleware/readOnlyMiddleware");

// Public / Voter / Candidate view (totalVotes & results hidden for non-admins)
router.get("/election/:electionId", optionalAuth, listCandidates);

// Candidate Self-Service Routes (Candidate Role Only)
router.get("/me", authMiddleware, roleMiddleware("candidate"), getCandidateProfile);
router.put("/me", authMiddleware, roleMiddleware("candidate"), blockReadOnlyAccount, updateCandidateProfile);
router.post("/me/request-approval", authMiddleware, roleMiddleware("candidate"), blockReadOnlyAccount, requestAdminApproval);

// Admin Candidate Management & Nominations
router.get("/admin/all", authMiddleware, roleMiddleware("admin"), listAllCandidatesAdmin);
router.get("/admin/nominations", authMiddleware, roleMiddleware("admin"), listCandidateNominations);
router.post(
  "/admin/nominations/:candidateId/review",
  authMiddleware,
  roleMiddleware("admin"),
  blockReadOnlyAccount,
  reviewCandidateNomination
);

// Admin Manual Candidate Add & Delete
router.post("/", authMiddleware, roleMiddleware("admin"), blockReadOnlyAccount, addCandidate);
router.delete("/:candidateId", authMiddleware, roleMiddleware("admin"), blockReadOnlyAccount, deleteCandidate);

module.exports = router;
