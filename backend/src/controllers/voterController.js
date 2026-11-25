const mongoose = require("mongoose");
const User = require("../models/User");
const Election = require("../models/Election");
const AuditLog = require("../models/AuditLog");
const VerificationCode = require("../models/VerificationCode");
const relayerService = require("../services/relayerService");
const { ensureElectionOnChain } = require("../utils/syncService");
const { generateVoterHash, hashSensitiveId } = require("../utils/cryptoHash");

function resolveKycStatus(user) {
  if (user.kycStatus === "rejected" && !user.isApproved) return "rejected";
  if (user.kycStatus === "synced_on_chain") return "synced_on_chain";
  if (user.isApproved) return user.kycStatus === "synced_on_chain" ? "synced_on_chain" : "approved";
  return user.kycStatus || "id_submitted";
}

// Get voter's profile & KYC progress
const getVoterProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "Voter not found" });
    }

    const kycStatus = resolveKycStatus(user);
    const voterObj = user.toObject();
    voterObj.kycStatus = kycStatus;

    // Check if voter hash is registered on-chain for any active election if approved
    let syncedOnChain = kycStatus === "synced_on_chain";
    if (user.isApproved && !syncedOnChain) {
      const syncLog = await AuditLog.exists({
        action: "VOTER_HASH_SYNCED",
        voterHash: user.voterHash,
      });
      if (syncLog) {
        syncedOnChain = true;
        voterObj.kycStatus = "synced_on_chain";
      }
    }

    res.status(200).json({
      success: true,
      voter: voterObj,
      kycSteps: {
        registered: true,
        idSubmitted: Boolean(user.hashedGovId),
        adminApproved: Boolean(user.isApproved),
        syncedOnChain: Boolean(syncedOnChain),
        rejected: kycStatus === "rejected",
      },
    });
  } catch (error) {
    next(error);
  }
};

// Voter self-service: update profile details or re-submit ID proof (e.g. if rejected)
const updateVoterProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Voter not found" });
    }

    const { fullName, govId, idProofName, idProofNote } = req.body;

    if (fullName && fullName.trim()) {
      user.fullName = fullName.trim();
    }

    if (idProofName !== undefined) {
      user.idProofName = String(idProofName).trim();
    }
    if (idProofNote !== undefined) {
      user.idProofNote = String(idProofNote).trim();
    }

    // Re-hashing Government/Student ID is allowed only before approval/on-chain lock
    let idChanged = false;
    if (govId && govId.trim()) {
      if (user.isApproved) {
        return res.status(400).json({
          success: false,
          message: "Government/Student ID cannot be changed after approval and on-chain whitelisting.",
        });
      }
      const nextHashedGovId = hashSensitiveId(govId);
      const duplicate = await User.findOne({
        hashedGovId: nextHashedGovId,
        _id: { $ne: user._id },
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "An account with this government/student ID already exists",
        });
      }
      user.hashedGovId = nextHashedGovId;
      user.voterHash = generateVoterHash(govId);
      idChanged = true;
    }

    const wasRejected = user.kycStatus === "rejected";
    if (!user.isApproved && (wasRejected || idChanged || idProofName || idProofNote)) {
      user.kycStatus = "id_submitted";
      user.rejectionReason = "";
    }

    await user.save();

    await AuditLog.create({
      action: wasRejected || idChanged ? "VOTER_KYC_RESUBMITTED" : "VOTER_PROFILE_UPDATED",
      actorId: user._id.toString(),
      actorRole: "voter",
      voterHash: user.voterHash,
      details: {
        email: user.email,
        fullName: user.fullName,
        idProofName: user.idProofName || null,
      },
    });

    const cleanUser = user.toObject();
    delete cleanUser.password;

    res.status(200).json({
      success: true,
      message: wasRejected
        ? "ID proof and details resubmitted for administrator verification."
        : "Profile updated successfully.",
      voter: cleanUser,
    });
  } catch (error) {
    next(error);
  }
};

// Link optional Web3 wallet (MetaMask)
const linkWallet = async (req, res, next) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ success: false, message: "Wallet address is required" });
    }

    const normalizedAddress = walletAddress.toLowerCase().trim();
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { walletAddress: normalizedAddress },
      { new: true }
    ).select("-password");

    // If already approved, register wallet address on-chain for active elections
    if (user.isApproved) {
      const activeElections = await Election.find({
        phase: { $in: ["Created", "Registration", "Voting"] },
      });
      for (const elec of activeElections) {
        try {
          const syncedElec = await ensureElectionOnChain(elec);
          await relayerService.registerVoterAddressOnChain(
            syncedElec.onChainElectionId,
            normalizedAddress
          );
        } catch (chainErr) {
          console.warn("Wallet registration on-chain warning:", chainErr.message);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Wallet linked successfully",
      walletAddress: user.walletAddress,
    });
  } catch (error) {
    next(error);
  }
};

// Admin: list voters with filtering
const listVoters = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status === "approved") query.isApproved = true;
    if (status === "pending") query.isApproved = false;

    const voters = await User.find(query).select("-password").sort({ createdAt: -1 }).lean();

    const voterHashes = voters.map((v) => v.voterHash).filter(Boolean);
    const voterIds = voters.map((v) => v._id.toString());

    const [syncLogs, receiptLogs] = await Promise.all([
      voterHashes.length
        ? AuditLog.find({
            action: "VOTER_HASH_SYNCED",
            voterHash: { $in: voterHashes },
            txHash: { $ne: null },
          }).sort({ timestamp: -1 })
        : Promise.resolve([]),
      AuditLog.find({
        action: { $in: ["RELAYER_VOTE_CAST", "DIRECT_VOTE_RECORDED"] },
        txHash: { $ne: null },
        $or: [
          ...(voterHashes.length ? [{ voterHash: { $in: voterHashes } }] : []),
          { actorId: { $in: voterIds } },
        ],
      }).sort({ timestamp: -1 }),
    ]);

    const syncTxByHash = new Map();
    for (const log of syncLogs) {
      if (log.voterHash && log.txHash && !syncTxByHash.has(log.voterHash)) {
        syncTxByHash.set(log.voterHash, log.txHash);
      }
    }

    const receiptsByVoterId = new Map();
    const receiptsByVoterHash = new Map();
    for (const log of receiptLogs) {
      if (log.actorId) {
        if (!receiptsByVoterId.has(log.actorId)) receiptsByVoterId.set(log.actorId, []);
        receiptsByVoterId.get(log.actorId).push({
          electionId: log.electionId,
          txHash: log.txHash,
          timestamp: log.timestamp,
        });
      }
      if (log.voterHash) {
        if (!receiptsByVoterHash.has(log.voterHash)) receiptsByVoterHash.set(log.voterHash, []);
        receiptsByVoterHash.get(log.voterHash).push({
          electionId: log.electionId,
          txHash: log.txHash,
          timestamp: log.timestamp,
        });
      }
    }

    const enrichedVoters = voters.map((v) => {
      const voterReceipts =
        receiptsByVoterId.get(v._id.toString()) ||
        receiptsByVoterHash.get(v.voterHash) ||
        [];
      return {
        ...v,
        syncTxHash: v.syncTxHash || syncTxByHash.get(v.voterHash) || null,
        receiptHash: voterReceipts[0]?.txHash || null,
        receiptHashes: voterReceipts,
      };
    });

    res.status(200).json({ success: true, count: enrichedVoters.length, voters: enrichedVoters });
  } catch (error) {
    next(error);
  }
};

// Admin: approve voter and sync voterHash to active elections on chain
const approveVoter = async (req, res, next) => {
  try {
    const { voterId } = req.params;
    const { electionId } = req.body; // optional specific election

    const user = await User.findById(voterId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Voter not found" });
    }

    user.isApproved = true;
    user.approvedAt = new Date();
    user.rejectionReason = "";
    user.kycStatus = "approved";
    await user.save();

    let onChainSyncResult = null;

    // If an election is provided or active elections exist, register hash on chain
    const targetElections = electionId
      ? await Election.find({ onChainElectionId: electionId })
      : await Election.find({ phase: { $in: ["Created", "Registration", "Voting"] } });

    for (const election of targetElections) {
      try {
        const syncedElec = await ensureElectionOnChain(election);
        const syncRes = await relayerService.registerVoterHashOnChain(
          syncedElec.onChainElectionId,
          user.voterHash
        );
        onChainSyncResult = syncRes;

        // Also register wallet address if linked
        if (user.walletAddress) {
          await relayerService.registerVoterAddressOnChain(
            syncedElec.onChainElectionId,
            user.walletAddress
          );
        }

        await AuditLog.create({
          action: "VOTER_HASH_SYNCED",
          actorId: req.user.id,
          actorRole: "admin",
          electionId: syncedElec.onChainElectionId,
          voterHash: user.voterHash,
          txHash: syncRes.txHash || null,
          details: { voterEmail: user.email },
        });
      } catch (chainErr) {
        console.warn(
          `On-chain voter hash registration warning for election ${election.onChainElectionId}:`,
          chainErr.message
        );
      }
    }

    if (onChainSyncResult) {
      user.kycStatus = "synced_on_chain";
      if (onChainSyncResult.txHash) {
        user.syncTxHash = onChainSyncResult.txHash;
      }
      await user.save();
    }

    await AuditLog.create({
      action: "VOTER_APPROVED",
      actorId: req.user.id,
      actorRole: "admin",
      voterHash: user.voterHash,
      details: { voterEmail: user.email, voterId: user._id },
    });

    res.status(200).json({
      success: true,
      message: "Voter approved successfully and hash synced.",
      txHash: onChainSyncResult?.txHash || user.syncTxHash || null,
      voter: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        isApproved: user.isApproved,
        kycStatus: user.kycStatus,
        voterHash: user.voterHash,
        syncTxHash: user.syncTxHash || null,
      },
      onChainSyncResult,
    });
  } catch (error) {
    next(error);
  }
};

// Admin: reject voter KYC submission with feedback so voter can re-upload/resubmit
const rejectVoter = async (req, res, next) => {
  try {
    const { voterId } = req.params;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(voterId)) {
      return res.status(404).json({ success: false, message: "Voter not found" });
    }

    const user = await User.findById(voterId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Voter not found" });
    }

    user.isApproved = false;
    user.kycStatus = "rejected";
    user.rejectionReason =
      (reason && reason.trim()) ||
      "Submitted Government/Student ID could not be verified. Please review and re-submit your ID proof.";
    await user.save();

    await AuditLog.create({
      action: "VOTER_REJECTED",
      actorId: req.user.id,
      actorRole: "admin",
      voterHash: user.voterHash,
      details: { voterEmail: user.email, reason: user.rejectionReason },
    });

    res.status(200).json({
      success: true,
      message: `Voter KYC for "${user.fullName}" rejected with feedback.`,
      voter: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        isApproved: user.isApproved,
        kycStatus: user.kycStatus,
        rejectionReason: user.rejectionReason,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Automated in-app / email-style alerts & reminders for voters
const getVoterNotifications = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "Voter not found" });
    }

    const readSet = new Set(user.readNotificationIds || []);
    const alerts = [];
    const now = Date.now();

    // 1. KYC Status Notification
    if (user.kycStatus === "rejected") {
      const id = `kyc-rejected-${user.updatedAt?.getTime() || 1}`;
      alerts.push({
        id,
        type: "kyc_rejected",
        title: "ID Verification Requires Attention",
        message:
          user.rejectionReason ||
          "Your ID proof was rejected. Please update your details and re-submit ID proof.",
        channel: "Email & Portal Alert",
        timestamp: user.updatedAt || user.createdAt,
        read: readSet.has(id),
      });
    } else if (user.isApproved) {
      const id = `kyc-approved-${user.approvedAt?.getTime() || user.createdAt?.getTime() || 1}`;
      alerts.push({
        id,
        type: "kyc_approved",
        title: "ID Verification Approved & Whitelisted",
        message: `Email alert sent to ${user.email}: Your constituent identity has been verified and whitelisted for blockchain voting.`,
        channel: "Email & Portal Alert",
        timestamp: user.approvedAt || user.updatedAt || user.createdAt,
        read: readSet.has(id),
      });
    }

    // 2. Election Opened & Closing-Soon Reminders
    const activeElections = await Election.find({ phase: "Voting" }).sort({ startDate: -1 });
    for (const elec of activeElections) {
      const hasVoted = (user.hasVotedElections || []).includes(elec.onChainElectionId);
      if (!hasVoted) {
        const openId = `election-open-${elec.onChainElectionId}`;
        alerts.push({
          id: openId,
          type: "election_open",
          electionId: elec.onChainElectionId,
          title: `Voting Open: ${elec.title}`,
          message: `Election #${elec.onChainElectionId} is now in the Voting phase. Cast your ballot securely inside the Public Portal.`,
          channel: "Email & Portal Alert",
          timestamp: elec.updatedAt || elec.startDate,
          read: readSet.has(openId),
        });

        if (elec.endDate) {
          const msLeft = new Date(elec.endDate).getTime() - now;
          if (msLeft > 0 && msLeft <= 24 * 60 * 60 * 1000) {
            const closeId = `election-closing-${elec.onChainElectionId}`;
            const hrs = Math.max(1, Math.ceil(msLeft / (60 * 60 * 1000)));
            alerts.push({
              id: closeId,
              type: "closing_soon",
              electionId: elec.onChainElectionId,
              title: `Closing Soon: ${elec.title}`,
              message: `Reminder: Voting closes in approximately ${hrs} hour(s). Don't forget to submit your ballot!`,
              channel: "Urgent Reminder",
              timestamp: elec.endDate,
              read: readSet.has(closeId),
            });
          }
        }
      }
    }

    // 3. Instant Vote Receipt Emails / Confirmations (anonymized, never exposing candidate)
    const voteLogs = await AuditLog.find({
      action: { $in: ["RELAYER_VOTE_CAST", "DIRECT_VOTE_RECORDED"] },
      $or: [{ voterHash: user.voterHash }, { actorId: user._id.toString() }],
    })
      .sort({ timestamp: -1 })
      .limit(20);

    for (const log of voteLogs) {
      const id = `receipt-${log._id.toString()}`;
      alerts.push({
        id,
        type: "vote_receipt",
        electionId: log.electionId,
        txHash: log.txHash,
        blockNumber: log.blockNumber,
        title: `Vote Receipt Confirmed (Election #${log.electionId})`,
        message: `Receipt email dispatched to ${user.email}: Your ballot was recorded on-chain (Tx: ${log.txHash || "Confirmed"}).`,
        channel: "Receipt Email & Ledger",
        timestamp: log.timestamp || log.createdAt,
        read: readSet.has(id),
      });
    }

    alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.status(200).json({
      success: true,
      unreadCount: alerts.filter((a) => !a.read).length,
      notifications: alerts,
    });
  } catch (error) {
    next(error);
  }
};

const markNotificationsRead = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Voter not found" });
    }

    if (Array.isArray(ids) && ids.length > 0) {
      const merged = new Set([...(user.readNotificationIds || []), ...ids.map(String)]);
      user.readNotificationIds = Array.from(merged);
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: "Notifications marked as read.",
    });
  } catch (error) {
    next(error);
  }
};

// Admin: delete voter
const deleteVoter = async (req, res, next) => {
  try {
    const { voterId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(voterId)) {
      return res.status(404).json({ success: false, message: "Voter not found" });
    }

    const user = await User.findById(voterId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Voter not found" });
    }

    if (user.isReadOnly) {
      return res.status(403).json({
        success: false,
        message: "Read-only demo accounts are protected and cannot be deleted by anyone.",
      });
    }

    await User.deleteOne({ _id: user._id });
    await VerificationCode.deleteMany({ email: user.email, role: "voter" });

    await AuditLog.create({
      action: "VOTER_DELETED",
      actorId: req.user.id,
      actorRole: "admin",
      voterHash: user.voterHash,
      details: { voterEmail: user.email, fullName: user.fullName, voterId: user._id },
    });

    res.status(200).json({
      success: true,
      message: `Voter "${user.fullName}" deleted successfully.`,
      deletedId: user._id,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getVoterProfile,
  updateVoterProfile,
  linkWallet,
  listVoters,
  approveVoter,
  rejectVoter,
  deleteVoter,
  getVoterNotifications,
  markNotificationsRead,
};
