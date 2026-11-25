/**
 * Utility functions for formatting addresses, transaction hashes, dates, and phases.
 */

export function shortenAddress(address, chars = 4) {
  if (!address) return "";
  const clean = address.trim();
  if (clean.length <= chars * 2 + 2) return clean;
  return `${clean.substring(0, chars + 2)}...${clean.substring(clean.length - chars)}`;
}

export function shortenHash(hash, chars = 6) {
  if (!hash) return "";
  const clean = hash.trim();
  if (clean.length <= chars * 2 + 2) return clean;
  return `${clean.substring(0, chars + 2)}...${clean.substring(clean.length - chars)}`;
}

export function formatDate(dateString) {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Invalid Date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getPhaseBadgeClass(phase) {
  switch (phase) {
    case "Voting":
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    case "Registration":
      return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
    case "Ended":
      return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
    case "Created":
    default:
      return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
  }
}

export function parseErrorMessage(error) {
  if (!error) return "An unexpected error occurred.";
  if (typeof error === "string") return error;
  if (error.response?.data?.message) return error.response.data.message;
  if (error.message) return error.message;
  return "An unexpected error occurred.";
}

export function formatVoteReceiptText(receipt) {
  if (!receipt) return "";
  return JSON.stringify(
    {
      platform: "VoteChain Hybrid Blockchain Voting System",
      receiptType: "Anonymized Cryptographic Ballot Receipt",
      electionId: receipt.electionId ?? null,
      electionTitle:
        receipt.electionTitle ||
        (receipt.electionId ? `Election #${receipt.electionId}` : "Election"),
      transactionHash: receipt.txHash || null,
      blockNumber: receipt.blockNumber || "Confirmed",
      timestamp: receipt.timestamp || new Date().toISOString(),
      anonymizedVoterHash: receipt.voterHash || "Anonymized On-Chain",
      privacyGuarantee:
        "Ballot choice is intentionally omitted to protect voter secrecy.",
    },
    null,
    2
  );
}
