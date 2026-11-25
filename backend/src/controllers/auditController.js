const AuditLog = require("../models/AuditLog");
const Election = require("../models/Election");
const Candidate = require("../models/Candidate");
const relayerService = require("../services/relayerService");

// Get audit logs (Public / Admin viewable)
const getAuditLogs = async (req, res, next) => {
  try {
    const { electionId, action, limit = 50 } = req.query;
    const filter = {};

    if (electionId) filter.electionId = Number(electionId);
    if (action) filter.action = action;

    const logs = await AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error) {
    next(error);
  }
};

// Public receipt verification by txHash
const verifyReceipt = async (req, res, next) => {
  try {
    const { txHash } = req.params;

    if (!txHash) {
      return res.status(400).json({ success: false, message: "txHash is required" });
    }

    // Check in database audit logs
    const log = await AuditLog.findOne({ txHash });

    let onChainReceipt = null;
    if (relayerService.provider) {
      try {
        onChainReceipt = await relayerService.provider.getTransactionReceipt(txHash);
      } catch (e) {
        // provider couldn't fetch receipt or offline
      }
    }

    if (!log && !onChainReceipt) {
      return res.status(404).json({
        success: false,
        message: "No transaction found matching the provided transaction hash.",
      });
    }

    res.status(200).json({
      success: true,
      verified: true,
      auditRecord: log,
      onChainConfirmation: onChainReceipt
        ? {
            blockNumber: onChainReceipt.blockNumber,
            from: onChainReceipt.from,
            to: onChainReceipt.to,
            status: onChainReceipt.status === 1 ? "Success" : "Failed",
            gasUsed: onChainReceipt.gasUsed ? onChainReceipt.gasUsed.toString() : "0",
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
};

// Get final tally results
const getResults = async (req, res, next) => {
  try {
    const { electionId } = req.params;
    const election = await Election.findOne({ onChainElectionId: Number(electionId) });

    if (!election) {
      return res.status(404).json({ success: false, message: "Election not found" });
    }

    const candidates = await Candidate.find({ onChainElectionId: election.onChainElectionId }).sort({
      voteCount: -1,
    });

    let onChainResults = null;
    try {
      onChainResults = await relayerService.getElectionResultsFromChain(
        election.onChainElectionId
      );
    } catch (e) {
      // contract offline fallback
    }

    res.status(200).json({
      success: true,
      election,
      candidates,
      onChainResults,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAuditLogs,
  verifyReceipt,
  getResults,
};
