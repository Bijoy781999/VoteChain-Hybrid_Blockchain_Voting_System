const mongoose = require("mongoose");

const electionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Election title is required"],
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    onChainElectionId: {
      type: Number,
      required: true,
      unique: true,
    },
    phase: {
      type: String,
      enum: ["Created", "Registration", "Voting", "Ended"],
      default: "Created",
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null,
    },
    contractAddress: {
      type: String,
      default: "",
    },
    totalVotes: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Election", electionSchema);
