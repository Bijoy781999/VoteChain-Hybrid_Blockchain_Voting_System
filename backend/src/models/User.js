const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    hashedGovId: {
      type: String,
      required: [true, "Hashed ID is required"],
      unique: true,
    },
    voterHash: {
      type: String,
      required: [true, "Voter hash is required"],
      unique: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
    },
    walletAddress: {
      type: String,
      default: null,
      trim: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    kycStatus: {
      type: String,
      enum: ["registered", "id_submitted", "approved", "rejected", "synced_on_chain"],
      default: "id_submitted",
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    idProofName: {
      type: String,
      default: "",
    },
    idProofNote: {
      type: String,
      default: "",
    },
    syncTxHash: {
      type: String,
      default: null,
    },
    readNotificationIds: [
      {
        type: String,
      },
    ],
    hasVotedElections: [
      {
        type: Number,
      },
    ],
    role: {
      type: String,
      default: "voter",
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

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
