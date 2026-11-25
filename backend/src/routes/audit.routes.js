const express = require("express");
const router = express.Router();
const { getAuditLogs, verifyReceipt, getResults } = require("../controllers/auditController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// All audit and results endpoints are strictly restricted to Administrators only
router.use(authMiddleware, roleMiddleware("admin"));

// Admin: Audit trail logs
router.get("/logs", getAuditLogs);

// Admin: Transaction receipt verification
router.get("/receipt/:txHash", verifyReceipt);

// Admin: Final election results and audit breakdown
router.get("/results/:electionId", getResults);

module.exports = router;
