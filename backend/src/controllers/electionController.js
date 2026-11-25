const Election = require("../models/Election");
const Candidate = require("../models/Candidate");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const DeletedOnChainRecord = require("../models/DeletedOnChainRecord");
const relayerService = require("../services/relayerService");
const { syncMissingDbElectionsToChain, ensureElectionOnChain } = require("../utils/syncService");

async function findElectionByIdentifier(id) {
  if (typeof id === "string" && id.match(/^[0-9a-fA-F]{24}$/)) {
    return Election.findById(id);
  }
  const numericId = Number(id);
  if (Number.isNaN(numericId)) return null;
  return Election.findOne({ onChainElectionId: numericId });
}

const PHASE_MAP = {
  Created: 0,
  Registration: 1,
  Voting: 2,
  Ended: 3,
};

// Create a new election (Admin — supports direct browser signing or backend relayer fallback)
const createElection = async (req, res, next) => {
  try {
    const {
      title,
      description,
      startDate,
      endDate,
      txHash: clientTxHash,
      onChainElectionId: clientOnChainElectionId,
    } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: "Election title is required" });
    }

    let onChainData = { onChainElectionId: Date.now(), txHash: null };

    if (clientTxHash && clientOnChainElectionId !== undefined && clientOnChainElectionId !== null) {
      onChainData = {
        onChainElectionId: Number(clientOnChainElectionId),
        txHash: clientTxHash,
      };
    } else {
      try {
        await syncMissingDbElectionsToChain();
        const chainRes = await relayerService.createElectionOnChain(title);
        onChainData = chainRes;
      } catch (chainErr) {
        console.warn("Blockchain election creation fallback:", chainErr.message);
        // Fallback unique onChainElectionId if local node not running
        const lastElection = await Election.findOne().sort({ onChainElectionId: -1 });
        onChainData.onChainElectionId = lastElection ? lastElection.onChainElectionId + 1 : 1;
      }
    }

    const election = await Election.create({
      title,
      description: description || "",
      onChainElectionId: onChainData.onChainElectionId,
      phase: "Created",
      startDate: startDate || new Date(),
      endDate: endDate || null,
      contractAddress: relayerService.contractConfig ? relayerService.contractConfig.address : "",
    });

    await AuditLog.create({
      action: "ELECTION_CREATED",
      actorId: req.user.id,
      actorRole: "admin",
      electionId: election.onChainElectionId,
      txHash: onChainData.txHash,
      details: { title: election.title },
    });

    res.status(201).json({
      success: true,
      message: "Election created successfully",
      election,
      txHash: onChainData.txHash,
    });
  } catch (error) {
    next(error);
  }
};

function buildTurnoutStats(election, verifiedVotersCount) {
  const votesCast = election.totalVotes || 0;
  const eligibleBase = Math.max(verifiedVotersCount || 0, votesCast);
  const percentage =
    eligibleBase > 0 ? Math.min(100, Math.round((votesCast / eligibleBase) * 100)) : 0;
  return {
    votesCast,
    verifiedVoters: eligibleBase,
    percentage,
  };
}

// List all elections (Individual candidate counts unlocked only for Admin or after phase is Ended)
const listElections = async (req, res, next) => {
  try {
    const [elections, verifiedVotersCount] = await Promise.all([
      Election.find().sort({ createdAt: -1 }),
      User.countDocuments({ isApproved: true, isReadOnly: { $ne: true } }),
    ]);
    const isAdmin = req.user && req.user.role === "admin";

    // Populate candidates summary (strip password and hide unapproved drafts from non-admins)
    const electionsWithCandidates = await Promise.all(
      elections.map(async (elec) => {
        const allowTallies = isAdmin || elec.phase === "Ended";
        const candFilter = isAdmin
          ? { onChainElectionId: elec.onChainElectionId }
          : {
              onChainElectionId: elec.onChainElectionId,
              $or: [{ isApproved: true }, { onChainId: { $ne: null } }],
            };
        const query = Candidate.find(candFilter)
          .select(allowTallies ? "-password" : "-password -voteCount")
          .sort({ onChainId: 1 });
        const candidates = await query;
        const elecObj = elec.toObject();
        const turnout = buildTurnoutStats(elec, verifiedVotersCount);

        if (!allowTallies) {
          delete elecObj.totalVotes;
        }

        return {
          ...elecObj,
          turnout,
          candidatesCount: candidates.length,
          candidates,
        };
      })
    );

    res.status(200).json({ success: true, elections: electionsWithCandidates });
  } catch (error) {
    next(error);
  }
};

// Get single election by ID or onChainElectionId (Candidate tallies unlocked only for Admin or Ended)
const getElectionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const election = await findElectionByIdentifier(id);

    if (!election) {
      return res.status(404).json({ success: false, message: "Election not found" });
    }

    const isAdmin = req.user && req.user.role === "admin";
    const allowTallies = isAdmin || election.phase === "Ended";
    const candFilter = isAdmin
      ? { onChainElectionId: election.onChainElectionId }
      : {
          onChainElectionId: election.onChainElectionId,
          $or: [{ isApproved: true }, { onChainId: { $ne: null } }],
        };
    const [candidates, verifiedVotersCount] = await Promise.all([
      Candidate.find(candFilter)
        .select(allowTallies ? "-password" : "-password -voteCount")
        .sort({ onChainId: 1 }),
      User.countDocuments({ isApproved: true, isReadOnly: { $ne: true } }),
    ]);

    const elecObj = election.toObject();
    const turnout = buildTurnoutStats(election, verifiedVotersCount);

    if (!allowTallies) {
      delete elecObj.totalVotes;
    }

    res.status(200).json({
      success: true,
      election: {
        ...elecObj,
        turnout,
        candidates,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Public post-election results & anonymized VoteCast event hashes (unlocked ONLY when phase === 'Ended' or Admin)
const getPublicElectionResults = async (req, res, next) => {
  try {
    const { id } = req.params;
    const election = await findElectionByIdentifier(id);

    if (!election) {
      return res.status(404).json({ success: false, message: "Election not found" });
    }

    const isAdmin = req.user && req.user.role === "admin";
    if (election.phase !== "Ended" && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Results and candidate tallies are locked until the election has ended.",
      });
    }

    const [candidates, verifiedVotersCount, voteLogs] = await Promise.all([
      Candidate.find({
        onChainElectionId: election.onChainElectionId,
        $or: [{ isApproved: true }, { onChainId: { $ne: null } }],
      })
        .select("-password")
        .sort({ voteCount: -1, onChainId: 1 }),
      User.countDocuments({ isApproved: true, isReadOnly: { $ne: true } }),
      AuditLog.find({
        electionId: election.onChainElectionId,
        action: { $in: ["RELAYER_VOTE_CAST", "DIRECT_VOTE_RECORDED"] },
      })
        .sort({ timestamp: -1 })
        .limit(100),
    ]);

    const turnout = buildTurnoutStats(election, verifiedVotersCount);
    const totalCandidateVotes = candidates.reduce((acc, c) => acc + (c.voteCount || 0), 0);
    const effectiveTotalVotes = Math.max(election.totalVotes || 0, totalCandidateVotes);

    const topVotes = candidates[0]?.voteCount || 0;
    const topCandidates = topVotes > 0 ? candidates.filter((c) => c.voteCount === topVotes) : [];

    const voteCastEvents = voteLogs.map((log) => ({
      id: log._id,
      action: log.action,
      txHash: log.txHash,
      blockNumber: log.blockNumber,
      voterHash: log.voterHash,
      timestamp: log.timestamp || log.createdAt,
    }));

    res.status(200).json({
      success: true,
      election,
      turnout: {
        ...turnout,
        votesCast: effectiveTotalVotes,
      },
      candidates,
      totalVotes: effectiveTotalVotes,
      winner: {
        hasWinner: topVotes > 0,
        isTie: topCandidates.length > 1,
        topVotes,
        candidates: topCandidates.map((c) => ({
          id: c._id,
          onChainId: c.onChainId,
          name: c.name,
          party: c.party,
          voteCount: c.voteCount,
        })),
      },
      voteCastEvents,
    });
  } catch (error) {
    next(error);
  }
};

// Update election phase (Admin — supports direct browser signing or backend relayer fallback)
const updateElectionPhase = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { phase, txHash: clientTxHash } = req.body;

    if (!["Created", "Registration", "Voting", "Ended"].includes(phase)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phase. Allowed: Created, Registration, Voting, Ended",
      });
    }

    let election = await findElectionByIdentifier(id);

    if (!election) {
      return res.status(404).json({ success: false, message: "Election not found" });
    }

    let txHash = clientTxHash || null;
    try {
      election = await ensureElectionOnChain(election);
      const phaseNum = PHASE_MAP[phase];
      const chainElec = await relayerService.ensureContract().elections(election.onChainElectionId);
      if (Number(chainElec.phase) === phaseNum) {
        if (election.phase === phase) {
          return res.status(400).json({
            success: false,
            message: `Election is already in '${phase}' phase`,
          });
        }
      } else {
        const chainRes = await relayerService.setElectionPhaseOnChain(
          election.onChainElectionId,
          phaseNum
        );
        txHash = chainRes.txHash;
      }
    } catch (chainErr) {
      console.warn("Phase update on-chain warning:", chainErr.message);
      return res.status(400).json({
        success: false,
        message: `Failed to update election phase on blockchain: ${chainErr.message}`,
      });
    }

    election.phase = phase;
    await election.save();

    // Auto-sync approved voters to the election on-chain when entering Registration or Voting
    if (phase === "Registration" || phase === "Voting") {
      const User = require("../models/User");
      const approvedUsers = await User.find({ isApproved: true });
      for (const u of approvedUsers) {
        try {
          await relayerService.registerVoterHashOnChain(election.onChainElectionId, u.voterHash);
          if (u.walletAddress) {
            await relayerService.registerVoterAddressOnChain(election.onChainElectionId, u.walletAddress);
          }
        } catch (e) {}
      }
    }

    await AuditLog.create({
      action: "PHASE_CHANGED",
      actorId: req.user.id,
      actorRole: "admin",
      electionId: election.onChainElectionId,
      txHash,
      details: { newPhase: phase },
    });

    res.status(200).json({
      success: true,
      message: `Election phase updated to ${phase}`,
      election,
      txHash,
    });
  } catch (error) {
    next(error);
  }
};

// Delete election (Admin)
const deleteElection = async (req, res, next) => {
  try {
    const { id } = req.params;
    const election = await findElectionByIdentifier(id);

    if (!election) {
      return res.status(404).json({ success: false, message: "Election not found" });
    }

    // Record tombstone so syncService never re-imports immutable historical chain data
    await DeletedOnChainRecord.create({
      type: "election",
      onChainElectionId: election.onChainElectionId,
      label: election.title,
    });

    // Remove manual/seeded ballot candidates tied strictly to this election
    await Candidate.deleteMany({
      $or: [{ electionId: election._id }, { onChainElectionId: election.onChainElectionId }],
      $and: [{ $or: [{ email: { $exists: false } }, { email: null }] }],
    });

    // Reset self-registered candidate accounts linked to this election so they can re-select
    await Candidate.updateMany(
      {
        $or: [{ electionId: election._id }, { onChainElectionId: election.onChainElectionId }],
        email: { $exists: true, $ne: null },
      },
      {
        $set: {
          electionId: null,
          onChainElectionId: null,
          onChainId: null,
          isApproved: false,
          partyLocked: false,
          approvalStatus: "draft",
          adminFeedback: "The previously selected election was removed by an administrator. Please choose another election.",
        },
      }
    );

    // Clean voter tracking references
    await User.updateMany(
      { hasVotedElections: election.onChainElectionId },
      { $pull: { hasVotedElections: election.onChainElectionId } }
    );

    await Election.deleteOne({ _id: election._id });

    await AuditLog.create({
      action: "ELECTION_DELETED",
      actorId: req.user.id,
      actorRole: "admin",
      electionId: election.onChainElectionId,
      details: { title: election.title },
    });

    res.status(200).json({
      success: true,
      message: `Election "${election.title}" deleted successfully.`,
      deletedId: election._id,
      onChainElectionId: election.onChainElectionId,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createElection,
  listElections,
  getElectionById,
  getPublicElectionResults,
  updateElectionPhase,
  deleteElection,
};
