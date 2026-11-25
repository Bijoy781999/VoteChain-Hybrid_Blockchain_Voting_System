const mongoose = require("mongoose");

const verificationCodeSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      enum: ["voter", "candidate", "admin"],
    },
    codeHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

verificationCodeSchema.index({ email: 1, role: 1 }, { unique: true });

module.exports = mongoose.model("VerificationCode", verificationCodeSchema);
