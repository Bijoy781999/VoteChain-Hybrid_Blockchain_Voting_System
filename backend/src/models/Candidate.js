const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const candidateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Candidate name is required"],
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      minlength: 6,
    },
    party: {
      type: String,
      default: "Independent",
      trim: true,
    },
    manifesto: {
      type: String,
      default: "",
    },
    photoUrl: {
      type: String,
      default: "",
    },
    electionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      default: null,
    },
    onChainElectionId: {
      type: Number,
      default: null,
    },
    onChainId: {
      type: Number,
      default: null,
    },
    voteCount: {
      type: Number,
      default: 0,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    approvalStatus: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected"],
      default: "draft",
    },
    partyLocked: {
      type: Boolean,
      default: false,
    },
    partyRequestCount: {
      type: Number,
      default: 0,
    },
    reapplicationCount: {
      type: Number,
      default: 0,
    },
    adminFeedback: {
      type: String,
      default: "",
    },
    requestedAt: {
      type: Date,
      default: null,
    },
    role: {
      type: String,
      default: "candidate",
    },
    isReadOnly: {
      type: Boolean,
      default: false,
    },
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

candidateSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

candidateSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("Candidate", candidateSchema);
