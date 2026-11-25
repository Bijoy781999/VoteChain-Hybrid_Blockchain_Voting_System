const User = require("../models/User");
const Election = require("../models/Election");
const Candidate = require("../models/Candidate");
const AuditLog = require("../models/AuditLog");
const relayerService = require("../services/relayerService");
const { ensureElectionOnChain } = require("../utils/syncService");

// Submit a gasless vote via the Relayer (No wallet/extension required for voters)
const submitRelayerVote = async (req, res, next) => {
  try {
    const { electionId, candidateId } = req.body;

    if (!electionId || !candidateId) {
      return res.status(400).json({
        success: false,
        message: "electionId and candidateId are required",
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Voter account not found" });
    }

    if (!user.isApproved) {
      return res.status(403).json({
        success: false,
        message: "Your voter identity has not been approved by an administrator yet.",
      });
    }

    const election = await Election.findOne({ onChainElectionId: Number(electionId) });
    if (!election) {
      return res.status(404).json({ success: false, message: "Election not found" });
    }

    if (election.phase !== "Voting") {
      return res.status(400).json({
        success: false,
        message: `Election is currently in '${election.phase}' phase. Voting is only allowed during the 'Voting' phase.`,
      });
    }

    // Check double voting in DB
    if (user.hasVotedElections.includes(election.onChainElectionId)) {
      return res.status(400).json({
        success: false,
        message: "You have already cast your ballot for this election.",
      });
    }

    // Check candidate exists
    const candidate = await Candidate.findOne({
      onChainElectionId: election.onChainElectionId,
      onChainId: Number(candidateId),
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    // Execute transaction on-chain via Relayer
    let txHash = null;
    let blockNumber = null;
    let activeElection = election;

    try {
      activeElection = await ensureElectionOnChain(election);
      const chainVote = await relayerService.castVoteOnChain(
        activeElection.onChainElectionId,
        Number(candidateId),
        user.voterHash
      );
      txHash = chainVote.txHash;
      blockNumber = chainVote.blockNumber;
    } catch (chainErr) {
      return res.status(400).json({
        success: false,
        message: `Smart contract error: ${chainErr.message}`,
      });
    }

    // Update database records
    user.hasVotedElections.push(activeElection.onChainElectionId);
    await user.save();

    candidate.voteCount += 1;
    await candidate.save();

    activeElection.totalVotes += 1;
    await activeElection.save();

    // Log to audit trail
    await AuditLog.create({
      action: "RELAYER_VOTE_CAST",
      actorId: user._id.toString(),
      actorRole: "voter",
      electionId: activeElection.onChainElectionId,
      voterHash: user.voterHash,
      txHash,
      blockNumber,
      details: {
        electionTitle: activeElection.title,
      },
    });

    res.status(200).json({
      success: true,
      message: "Vote cast and securely confirmed on the blockchain!",
      receipt: {
        txHash,
        blockNumber,
        electionId: activeElection.onChainElectionId,
        electionTitle: activeElection.title,
        voterHash: user.voterHash,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Record direct Web3 MetaMask vote receipt & turnout (anonymized)
const recordDirectVote = async (req, res, next) => {
  try {
    const { electionId, candidateId, txHash, blockNumber } = req.body;
    if (!electionId || !txHash) {
      return res.status(400).json({
        success: false,
        message: "electionId and txHash are required",
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Voter account not found" });
    }

    const election = await Election.findOne({ onChainElectionId: Number(electionId) });
    if (!election) {
      return res.status(404).json({ success: false, message: "Election not found" });
    }

    if (!user.hasVotedElections.includes(election.onChainElectionId)) {
      user.hasVotedElections.push(election.onChainElectionId);
      await user.save();

      election.totalVotes += 1;
      await election.save();

      if (candidateId) {
        const cand = await Candidate.findOne({
          onChainElectionId: election.onChainElectionId,
          onChainId: Number(candidateId),
        });
        if (cand) {
          cand.voteCount += 1;
          await cand.save();
        }
      }
    }

    const existingLog = await AuditLog.findOne({ txHash: txHash.trim() });
    if (!existingLog) {
      await AuditLog.create({
        action: "DIRECT_VOTE_RECORDED",
        actorId: user._id.toString(),
        actorRole: "voter",
        electionId: election.onChainElectionId,
        voterHash: user.voterHash,
        txHash: txHash.trim(),
        blockNumber: blockNumber || null,
        details: {
          electionTitle: election.title,
          mode: "direct_metamask",
        },
      });
    }

    res.status(200).json({
      success: true,
      message: "Direct Web3 vote receipt recorded.",
      receipt: {
        txHash: txHash.trim(),
        blockNumber: blockNumber || null,
        electionId: election.onChainElectionId,
        electionTitle: election.title,
        voterHash: user.voterHash,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Personal voting history archive across all elections (past, active, upcoming) for Voter or Candidate
const getVotingHistory = async (req, res, next) => {
  try {
    let user = null;
    let candidateProfile = null;

    if (req.user.role === "candidate") {
      candidateProfile = await Candidate.findById(req.user.id);
      if (!candidateProfile) {
        return res.status(404).json({ success: false, message: "Candidate account not found" });
      }
      if (candidateProfile.email) {
        user = await User.findOne({ email: candidateProfile.email.toLowerCase().trim() });
      }
    } else {
      user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, message: "Voter account not found" });
      }
    }

    const [elections, voteLogs] = await Promise.all([
      Election.find().sort({ createdAt: -1 }),
      user
        ? AuditLog.find({
            action: { $in: ["RELAYER_VOTE_CAST", "DIRECT_VOTE_RECORDED"] },
            $or: [{ voterHash: user.voterHash }, { actorId: user._id.toString() }],
          }).sort({ timestamp: -1 })
        : Promise.resolve([]),
    ]);

    const logByElection = new Map();
    for (const log of voteLogs) {
      if (!logByElection.has(log.electionId)) {
        logByElection.set(log.electionId, log);
      }
    }

    const history = elections.map((elec) => {
      const voteLog = logByElection.get(elec.onChainElectionId);
      const participated = user
        ? Boolean(voteLog) || (user.hasVotedElections || []).includes(elec.onChainElectionId)
        : false;
      const contested = Boolean(
        candidateProfile && candidateProfile.onChainElectionId === elec.onChainElectionId
      );

      return {
        _id: elec._id,
        onChainElectionId: elec.onChainElectionId,
        title: elec.title,
        description: elec.description,
        phase: elec.phase,
        startDate: elec.startDate,
        endDate: elec.endDate,
        contested,
        participated,
        receipt: participated
          ? {
              txHash: voteLog?.txHash || null,
              blockNumber: voteLog?.blockNumber || null,
              voterHash: voteLog?.voterHash || user?.voterHash || null,
              electionTitle: elec.title,
              electionId: elec.onChainElectionId,
              timestamp: voteLog?.timestamp || elec.updatedAt,
              mode: voteLog?.action === "DIRECT_VOTE_RECORDED" ? "MetaMask Direct" : "Relayer Gasless",
            }
          : null,
      };
    });

    res.status(200).json({
      success: true,
      history,
    });
  } catch (error) {
    next(error);
  }
};

// Independent anonymized receipt verifier by txHash (never exposes candidate choice)
const verifyVoteReceipt = async (req, res, next) => {
  try {
    const { txHash } = req.params;
    if (!txHash || !txHash.trim()) {
      return res.status(400).json({ success: false, message: "Transaction hash is required" });
    }

    const cleanHash = txHash.trim();
    const log = await AuditLog.findOne({
      txHash: cleanHash,
      action: { $in: ["RELAYER_VOTE_CAST", "DIRECT_VOTE_RECORDED"] },
    });

    let onChainReceipt = null;
    if (relayerService.provider) {
      try {
        onChainReceipt = await relayerService.provider.getTransactionReceipt(cleanHash);
      } catch (e) {
        // node offline or non-hex txHash
      }
    }

    if (!log && !onChainReceipt) {
      return res.status(404).json({
        success: false,
        message: "No ballot transaction found matching the provided transaction hash.",
      });
    }

    res.status(200).json({
      success: true,
      verified: true,
      receipt: {
        txHash: cleanHash,
        action: log?.action || "ON_CHAIN_TRANSACTION",
        electionId: log?.electionId || null,
        electionTitle: log?.details?.electionTitle || null,
        blockNumber: onChainReceipt?.blockNumber || log?.blockNumber || null,
        voterHash: log?.voterHash || null,
        timestamp: log?.timestamp || null,
        status: onChainReceipt ? (onChainReceipt.status === 1 ? "Success (Confirmed)" : "Failed") : "Recorded in Audit Ledger",
      },
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

// Check voter eligibility and voting status for an election
const checkVoterStatus = async (req, res, next) => {
  try {
    const { electionId } = req.params;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Voter not found" });
    }

    const hasVotedDB = user.hasVotedElections.includes(Number(electionId));
    let hasVotedChain = false;

    try {
      hasVotedChain = await relayerService.hasVoted(Number(electionId), user.voterHash);
    } catch (e) {
      // ignore if node offline
    }

    res.status(200).json({
      success: true,
      isApproved: user.isApproved,
      hasVoted: hasVotedDB || hasVotedChain,
      voterHash: user.voterHash,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitRelayerVote,
  checkVoterStatus,
  recordDirectVote,
  getVotingHistory,
  verifyVoteReceipt,
};
