const mongoose = require("mongoose");

/**
 * Tracks elections or candidates explicitly removed by an administrator so
 * startup blockchain sync does not re-import immutable historical chain records.
 */
const deletedOnChainRecordSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["election", "candidate"],
      required: true,
    },
    onChainElectionId: {
      type: Number,
      required: true,
    },
    onChainId: {
      type: Number,
      default: null,
    },
    label: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

deletedOnChainRecordSchema.index({ type: 1, onChainElectionId: 1, onChainId: 1 });

module.exports = mongoose.model("DeletedOnChainRecord", deletedOnChainRecordSchema);
