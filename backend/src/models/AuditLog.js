const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        "VOTER_REGISTERED",
        "VOTER_APPROVED",
        "VOTER_REJECTED",
        "VOTER_KYC_RESUBMITTED",
        "VOTER_PROFILE_UPDATED",
        "VOTER_DELETED",
        "VOTER_HASH_SYNCED",
        "ELECTION_CREATED",
        "ELECTION_DELETED",
        "PHASE_CHANGED",
        "CANDIDATE_ADDED",
        "CANDIDATE_REGISTERED",
        "CANDIDATE_APPROVAL_REQUESTED",
        "CANDIDATE_APPROVED",
        "CANDIDATE_REJECTED",
        "CANDIDATE_DELETED",
        "REGISTRATION_CODE_REQUESTED",
        "PASSWORD_RESET_REQUESTED",
        "PASSWORD_RESET_COMPLETED",
        "ADMIN_WALLET_LINKED",
        "ADMIN_DELETED",
        "RELAYER_VOTE_CAST",
        "DIRECT_VOTE_RECORDED",
      ],
    },
    actorId: {
      type: String,
      default: "SYSTEM",
    },
    actorRole: {
      type: String,
      default: "system",
    },
    electionId: {
      type: Number,
      default: null,
    },
    voterHash: {
      type: String,
      default: null,
    },
    txHash: {
      type: String,
      default: null,
      index: true,
    },
    blockNumber: {
      type: Number,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
