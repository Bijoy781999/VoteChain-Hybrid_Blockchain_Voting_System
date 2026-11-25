const mongoose = require("mongoose");
const Candidate = require("../models/Candidate");
const Election = require("../models/Election");
const AuditLog = require("../models/AuditLog");
const DeletedOnChainRecord = require("../models/DeletedOnChainRecord");
const VerificationCode = require("../models/VerificationCode");
const relayerService = require("../services/relayerService");
const { ensureElectionOnChain } = require("../utils/syncService");

// 1. Add a candidate directly (Admin legacy/manual add)
const addCandidate = async (req, res, next) => {
  try {
    const { electionId, name, party, manifesto, photoUrl } = req.body;

    if (!electionId || !name) {
      return res.status(400).json({
        success: false,
        message: "electionId and candidate name are required",
      });
    }

    let election = null;
    if (typeof electionId === "string" && electionId.match(/^[0-9a-fA-F]{24}$/)) {
      election = await Election.findById(electionId);
    } else {
      election = await Election.findOne({ onChainElectionId: Number(electionId) });
    }

    if (!election) {
      return res.status(404).json({ success: false, message: "Election not found" });
    }

    if (election.phase === "Voting" || election.phase === "Ended") {
      return res.status(400).json({
        success: false,
        message: "Candidates cannot be added after voting has started",
      });
    }

    // Determine candidate on-chain ID
    const count = await Candidate.countDocuments({ onChainElectionId: election.onChainElectionId });
    const nextOnChainId = count + 1;

    let txHash = null;
    let chainCandidateId = null;
    try {
      election = await ensureElectionOnChain(election);
      const chainRes = await relayerService.addCandidateOnChain(
        election.onChainElectionId,
        name,
        party || "Independent"
      );
      txHash = chainRes.txHash;
      chainCandidateId = chainRes.candidateId;
    } catch (chainErr) {
      console.warn("Candidate add on-chain warning:", chainErr.message);
    }

    const finalCandidateId = chainCandidateId || nextOnChainId;

    const candidate = await Candidate.create({
      electionId: election._id,
      onChainElectionId: election.onChainElectionId,
      onChainId: finalCandidateId,
      name,
      party: party || "Independent",
      manifesto: manifesto || "",
      photoUrl: photoUrl || "",
      isApproved: true,
      approvalStatus: "approved",
      partyLocked: true,
    });

    await AuditLog.create({
      action: "CANDIDATE_ADDED",
      actorId: req.user.id,
      actorRole: "admin",
      electionId: election.onChainElectionId,
      txHash,
      details: { candidateName: name, candidateId: finalCandidateId },
    });

    res.status(201).json({
      success: true,
      message: "Candidate registered successfully",
      candidate,
      txHash,
    });
  } catch (error) {
    next(error);
  }
};

// 2. List candidates for an election (Public / non-admin strips voteCount)
const listCandidates = async (req, res, next) => {
  try {
    const { electionId } = req.params;
    let query = {};

    if (electionId.match(/^[0-9a-fA-F]{24}$/)) {
      query = { electionId };
    } else {
      query = { onChainElectionId: Number(electionId) };
    }

    const election = await Election.findOne(
      electionId.match(/^[0-9a-fA-F]{24}$/)
        ? { _id: electionId }
        : { onChainElectionId: Number(electionId) }
    );

    // Approved or already on-chain ballot candidates appear on the voter ballot
    query.$or = [{ isApproved: true }, { onChainId: { $ne: null } }];

    const isAdmin = req.user && req.user.role === "admin";
    const allowTallies = isAdmin || (election && election.phase === "Ended");
    const selectProjection = allowTallies ? {} : "-voteCount";

    const candidates = await Candidate.find(query).select(selectProjection).sort({ onChainId: 1 });
    res.status(200).json({ success: true, count: candidates.length, candidates });
  } catch (error) {
    next(error);
  }
};

// 3. Candidate Self-Service: Get Profile
const getCandidateProfile = async (req, res, next) => {
  try {
    const candidate = await Candidate.findById(req.user.id)
      .select("-password")
      .populate("electionId");

    if (!candidate) {
      return res.status(404).json({ success: false, message: "Candidate account not found" });
    }

    res.status(200).json({
      success: true,
      candidate,
    });
  } catch (error) {
    next(error);
  }
};

// 4. Candidate Self-Service: Update Details
const updateCandidateProfile = async (req, res, next) => {
  try {
    const candidate = await Candidate.findById(req.user.id);
    if (!candidate) {
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    const { name, party, manifesto, photoUrl, electionId } = req.body;

    // RULE 1: If approved for official ballot, party, candidate name, and election are LOCKED.
    // ONLY Campaign Manifesto & Key Policies (manifesto, photoUrl) can be edited.
    if (candidate.approvalStatus === "approved" || candidate.isApproved) {
      if (name && name.trim() !== candidate.name) {
        return res.status(400).json({
          success: false,
          message: "Candidate name is locked after approval for the official ballot.",
        });
      }
      if (party && party.trim().toLowerCase() !== candidate.party.toLowerCase()) {
        return res.status(400).json({
          success: false,
          message: "Party affiliation is locked after approval for the official ballot.",
        });
      }
      if (electionId) {
        return res.status(400).json({
          success: false,
          message: "Contested election is locked after approval for the official ballot.",
        });
      }

      // Approved candidates can update Campaign Manifesto & Key Policies
      if (manifesto !== undefined) candidate.manifesto = manifesto.trim();
      if (photoUrl !== undefined) candidate.photoUrl = photoUrl.trim();

      await candidate.save();

      return res.status(200).json({
        success: true,
        message: "Campaign manifesto & policies updated successfully.",
        candidate: {
          id: candidate._id,
          name: candidate.name,
          party: candidate.party,
          partyLocked: true,
          manifesto: candidate.manifesto,
          photoUrl: candidate.photoUrl,
          electionId: candidate.electionId,
          approvalStatus: candidate.approvalStatus,
          isApproved: candidate.isApproved,
          reapplicationCount: candidate.reapplicationCount || 0,
        },
      });
    }

    // RULE 2: If nomination is currently pending admin review, lock profile edits
    if (candidate.approvalStatus === "pending") {
      return res.status(400).json({
        success: false,
        message: "Nomination is currently pending administrator review. Details cannot be edited while under review.",
      });
    }

    // RULE 3: After rejection (or in draft), candidate CAN edit party, name, manifesto, photoUrl, and election!
    if (name) candidate.name = name.trim();
    if (manifesto !== undefined) candidate.manifesto = manifesto.trim();
    if (photoUrl !== undefined) candidate.photoUrl = photoUrl.trim();
    if (party) candidate.party = party.trim();

    // Update election if not yet approved
    if (electionId) {
      let election = null;
      if (typeof electionId === "string" && electionId.match(/^[0-9a-fA-F]{24}$/)) {
        election = await Election.findById(electionId);
      } else {
        election = await Election.findOne({ onChainElectionId: Number(electionId) });
      }

      if (election) {
        if (election.phase === "Voting" || election.phase === "Ended") {
          return res.status(400).json({
            success: false,
            message: "Cannot select an election where voting has already started or ended.",
          });
        }
        candidate.electionId = election._id;
        candidate.onChainElectionId = election.onChainElectionId;
      }
    }

    await candidate.save();

    res.status(200).json({
      success: true,
      message: "Candidate profile updated successfully.",
      candidate: {
        id: candidate._id,
        name: candidate.name,
        party: candidate.party,
        partyLocked: candidate.partyLocked,
        manifesto: candidate.manifesto,
        photoUrl: candidate.photoUrl,
        electionId: candidate.electionId,
        approvalStatus: candidate.approvalStatus,
        isApproved: candidate.isApproved,
        reapplicationCount: candidate.reapplicationCount || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 5. Candidate Self-Service: Request Admin Approval / Reapply (Limited to 2 times)
const requestAdminApproval = async (req, res, next) => {
  try {
    const candidate = await Candidate.findById(req.user.id);
    if (!candidate) {
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    if (candidate.approvalStatus === "approved" || candidate.isApproved) {
      return res.status(400).json({
        success: false,
        message: "You are already approved and registered on the official voting ballot.",
      });
    }

    if (!candidate.electionId) {
      return res.status(400).json({
        success: false,
        message: "Please select an election to contest before requesting administrator approval.",
      });
    }

    const election = await Election.findById(candidate.electionId);
    if (!election) {
      return res.status(404).json({ success: false, message: "Contested election not found." });
    }

    if (election.phase === "Voting" || election.phase === "Ended") {
      return res.status(400).json({
        success: false,
        message: "Cannot request nomination approval for an election where voting has already commenced.",
      });
    }

    const isReapplication = candidate.approvalStatus === "rejected";

    // RULE 4: Reapply is strictly limited to 2 times
    if (isReapplication) {
      const currentReapplies = candidate.reapplicationCount || 0;
      if (currentReapplies >= 2) {
        return res.status(400).json({
          success: false,
          message: "Maximum reapplication limit reached (2 re-applications allowed). Your candidacy has been finalized as rejected for this election cycle.",
        });
      }
      candidate.reapplicationCount = currentReapplies + 1;
    }

    // LOCK PARTY ONCE APPROVAL REQUEST / REAPPLICATION IS SUBMITTED
    candidate.partyLocked = true;
    candidate.partyRequestCount = (candidate.partyRequestCount || 0) + 1;
    candidate.approvalStatus = "pending";
    candidate.requestedAt = new Date();
    if (isReapplication) {
      candidate.adminFeedback = `Reapplication #${candidate.reapplicationCount} of 2 submitted on ${new Date().toLocaleDateString()}. Pending administrator re-evaluation.`;
    }
    await candidate.save();

    await AuditLog.create({
      action: "CANDIDATE_APPROVAL_REQUESTED",
      actorId: candidate._id.toString(),
      actorRole: "candidate",
      electionId: candidate.onChainElectionId,
      details: {
        candidateName: candidate.name,
        party: candidate.party,
        electionTitle: election.title,
        isReapplication,
        reapplicationCount: candidate.reapplicationCount || 0,
      },
    });

    res.status(200).json({
      success: true,
      message: isReapplication
        ? `Nomination reapplication #${candidate.reapplicationCount} of 2 submitted to administrator for review!`
        : "Nomination approval request submitted to election administrator! Your political party selection is now locked for review.",
      candidate: {
        id: candidate._id,
        approvalStatus: candidate.approvalStatus,
        partyLocked: candidate.partyLocked,
        party: candidate.party,
        requestedAt: candidate.requestedAt,
        adminFeedback: candidate.adminFeedback,
        reapplicationCount: candidate.reapplicationCount || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 6. Admin: List all candidate self-nominations
const listCandidateNominations = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { email: { $exists: true, $ne: null } };
    if (status) filter.approvalStatus = status;

    const candidates = await Candidate.find(filter)
      .select("-password")
      .populate("electionId")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: candidates.length,
      candidates,
    });
  } catch (error) {
    next(error);
  }
};

// 7. Admin: Review Candidate Nomination (Approve / Reject)
const reviewCandidateNomination = async (req, res, next) => {
  try {
    const { candidateId } = req.params;
    const { action, feedback } = req.body; // action: 'approve' | 'reject'

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be either 'approve' or 'reject'",
      });
    }

    const candidate = await Candidate.findById(candidateId).populate("electionId");
    if (!candidate) {
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    let txHash = null;

    if (action === "approve") {
      const election = candidate.electionId;
      if (!election) {
        return res.status(400).json({
          success: false,
          message: "Candidate has not selected a valid election to contest.",
        });
      }

      // If candidate not yet on-chain, register them on blockchain
      if (!candidate.onChainId) {
        const count = await Candidate.countDocuments({
          onChainElectionId: election.onChainElectionId,
          isApproved: true,
        });
        const nextOnChainId = count + 1;

        try {
          const syncedElection = await ensureElectionOnChain(election);
          const chainRes = await relayerService.addCandidateOnChain(
            syncedElection.onChainElectionId,
            candidate.name,
            candidate.party || "Independent"
          );
          txHash = chainRes.txHash;
          candidate.onChainElectionId = syncedElection.onChainElectionId;
          candidate.onChainId = chainRes.candidateId || nextOnChainId;
        } catch (chainErr) {
          console.warn("Candidate blockchain registration warning:", chainErr.message);
          candidate.onChainId = nextOnChainId;
        }
      }

      candidate.isApproved = true;
      candidate.approvalStatus = "approved";
      candidate.partyLocked = true;
      candidate.adminFeedback = feedback || "Candidate nomination approved for official ballot.";
      await candidate.save();

      await AuditLog.create({
        action: "CANDIDATE_APPROVED",
        actorId: req.user.id,
        actorRole: "admin",
        electionId: candidate.onChainElectionId,
        txHash,
        details: {
          candidateName: candidate.name,
          party: candidate.party,
          candidateId: candidate.onChainId,
        },
      });

      return res.status(200).json({
        success: true,
        message: `Candidate ${candidate.name} approved and officially registered on the ballot!`,
        candidate,
        txHash,
      });
    } else {
      // Reject: nomination rejected, party lock unlocked so candidate can edit party and reapply
      candidate.approvalStatus = "rejected";
      candidate.isApproved = false;
      candidate.partyLocked = false;
      candidate.adminFeedback = feedback || "Nomination rejected by election administrator.";
      await candidate.save();

      await AuditLog.create({
        action: "CANDIDATE_REJECTED",
        actorId: req.user.id,
        actorRole: "admin",
        electionId: candidate.onChainElectionId,
        details: {
          candidateName: candidate.name,
          feedback: candidate.adminFeedback,
        },
      });

      return res.status(200).json({
        success: true,
        message: `Candidate nomination for ${candidate.name} has been rejected.`,
        candidate,
      });
    }
  } catch (error) {
    next(error);
  }
};

// 8. Admin: List ALL candidates (manual, seeded, and self-nominated)
const listAllCandidatesAdmin = async (req, res, next) => {
  try {
    const candidates = await Candidate.find()
      .select("-password")
      .populate("electionId")
      .sort({ onChainElectionId: 1, onChainId: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: candidates.length,
      candidates,
    });
  } catch (error) {
    next(error);
  }
};

// 9. Admin: Delete Candidate
const deleteCandidate = async (req, res, next) => {
  try {
    const { candidateId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(candidateId)) {
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    if (candidate.isReadOnly) {
      return res.status(403).json({
        success: false,
        message: "Read-only demo accounts are protected and cannot be deleted by anyone.",
      });
    }

    // Record tombstone if candidate existed on-chain so syncService won't re-import
    if (candidate.onChainElectionId && candidate.onChainId) {
      await DeletedOnChainRecord.create({
        type: "candidate",
        onChainElectionId: candidate.onChainElectionId,
        onChainId: candidate.onChainId,
        label: candidate.name,
      });
    }

    await Candidate.deleteOne({ _id: candidate._id });
    if (candidate.email) {
      await VerificationCode.deleteMany({ email: candidate.email, role: "candidate" });
    }

    await AuditLog.create({
      action: "CANDIDATE_DELETED",
      actorId: req.user.id,
      actorRole: "admin",
      electionId: candidate.onChainElectionId || null,
      details: {
        candidateName: candidate.name,
        party: candidate.party,
        email: candidate.email || null,
        candidateId: candidate._id,
      },
    });

    res.status(200).json({
      success: true,
      message: `Candidate "${candidate.name}" deleted successfully.`,
      deletedId: candidate._id,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addCandidate,
  listCandidates,
  getCandidateProfile,
  updateCandidateProfile,
  requestAdminApproval,
  listCandidateNominations,
  reviewCandidateNomination,
  listAllCandidatesAdmin,
  deleteCandidate,
};
