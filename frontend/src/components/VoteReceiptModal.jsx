import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { shortenHash, formatVoteReceiptText } from "../utils/format";
import CopyButton from "./CopyButton";

export default function VoteReceiptModal({ isOpen, onClose, receipt }) {
  const { isAdmin, isCandidate } = useAuth();

  if (!isOpen || !receipt) return null;

  const receiptJsonText = formatVoteReceiptText(receipt);

  const downloadReceipt = () => {
    const blob = new Blob([receiptJsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vote-receipt-election-${receipt.electionId || "ballot"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const verifyPath = isAdmin
    ? `/admin?tab=verify&txHash=${encodeURIComponent(receipt.txHash || "")}`
    : isCandidate
    ? `/candidate-dashboard?tab=verify&txHash=${encodeURIComponent(receipt.txHash || "")}`
    : `/voter-dashboard?tab=verify&txHash=${encodeURIComponent(receipt.txHash || "")}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative text-center">
        {/* Success Icon */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-3xl text-emerald-400">
          ✓
        </div>

        <h3 className="text-2xl font-bold text-white mb-1">Vote Successfully Confirmed!</h3>
        <p className="text-sm text-slate-400 mb-6">
          Your ballot has been cryptographically recorded on the blockchain. This receipt verifies submission without exposing who you voted for.
        </p>

        {/* Anonymized Receipt Details Box */}
        <div className="bg-slate-950/60 rounded-2xl border border-slate-800/80 p-4 text-left space-y-3 mb-6 text-xs">
          <div>
            <span className="text-slate-500 block">Election</span>
            <span className="font-semibold text-slate-200 text-sm">
              {receipt.electionTitle || `Election #${receipt.electionId}`}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block">Transaction Hash (txHash)</span>
            <div className="flex items-center justify-between font-mono bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 mt-1">
              <span className="text-indigo-400 text-[11px] truncate mr-2">
                {receipt.txHash || "0xConfirmedLocalNodeTransaction"}
              </span>
              <CopyButton
                text={receipt.txHash}
                label="Copy Hash"
                copiedLabel="Copied ✓"
                title="Copy transaction hash"
                className="text-slate-400 hover:text-white transition-colors shrink-0 font-sans font-semibold text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-slate-500 block">Block Height</span>
              <span className="font-mono text-slate-200">
                {receipt.blockNumber ? `#${receipt.blockNumber}` : "Confirmed"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Timestamp</span>
              <span className="text-slate-200">
                {new Date(receipt.timestamp || Date.now()).toLocaleString()}
              </span>
            </div>
          </div>

          {receipt.voterHash && (
            <div>
              <span className="text-slate-500 block">Anonymized Voter Hash</span>
              <span className="font-mono text-slate-400 text-[11px] truncate block">
                {shortenHash(receipt.voterHash, 12)}
              </span>
            </div>
          )}

          <div className="pt-2 border-t border-slate-800/70 text-[11px] text-emerald-400/90 flex items-center space-x-1.5">
            <span>🔒</span>
            <span>Ballot Choice Confidential — Never exposed on receipts.</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2.5">
          <CopyButton
            text={receiptJsonText}
            label="Copy Vote Receipt 📋"
            copiedLabel="Receipt Copied ✓"
            title="Copy full anonymized vote receipt"
            className="py-2.5 px-4 rounded-xl text-xs font-semibold text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 transition-all"
          />
          <button
            type="button"
            onClick={downloadReceipt}
            className="py-2.5 px-4 rounded-xl text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all"
          >
            Download Receipt ⬇️
          </button>
          <Link
            to={verifyPath}
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all text-center min-w-[140px]"
          >
            {isAdmin ? "Verify Voter Receipt 🔍" : "Verify My Receipt 🔍"}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
