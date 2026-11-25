const express = require("express");
const router = express.Router();

const authRoutes = require("./auth.routes");
const voterRoutes = require("./voter.routes");
const electionRoutes = require("./election.routes");
const candidateRoutes = require("./candidate.routes");
const voteRoutes = require("./vote.routes");
const auditRoutes = require("./audit.routes");

router.use("/auth", authRoutes);
router.use("/voters", voterRoutes);
router.use("/elections", electionRoutes);
router.use("/candidates", candidateRoutes);
router.use("/votes", voteRoutes);
router.use("/audit", auditRoutes);

module.exports = router;
