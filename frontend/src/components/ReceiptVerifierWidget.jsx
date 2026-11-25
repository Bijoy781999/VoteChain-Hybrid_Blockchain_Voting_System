import React, { useState, useEffect } from "react";
import { voteAPI } from "../services/api";
import { shortenHash, formatDate, formatVoteReceiptText } from "../utils/format";
import CopyButton from "./CopyButton";

/**
 * Independent Ballot Receipt Verifier tool allowing voters, candidates, and admins to paste
 * a txHash and verify on-chain / audit confirmation without exposing candidate choice.
 */
export default function ReceiptVerifierWidget({
  initialTxHash = "",
  title = "Verify My Vote Receipt",
  badge = "Zero-Knowledge Inclusion Check",
  description = "Paste your transaction hash (txHash) below to independently confirm against the blockchain and audit API that your ballot is sealed in an immutable block. Candidate selection is never exposed.",
}) {
  const [txHash, setTxHash] = useState(initialTxHash);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const runVerification = async (targetHash) => {
    const clean = (targetHash ?? txHash).trim();
    if (!clean) return;
    setVerifying(true);
    setError("");
    setResult(null);
    try {
      const res = await voteAPI.verifyReceipt(clean);
      if (res.data.success) {
        setResult(res.data);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No confirmed ballot transaction found matching that transaction hash."
      );
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (initialTxHash) {
      setTxHash(initialTxHash);
      runVerification(initialTxHash);
    }
  }, [initialTxHash]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5">
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
          {badge}
        </span>
        <h2 className="text-xl font-bold text-white mt-1">{title}</h2>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{description}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runVerification(txHash);
        }}
        className="flex flex-col sm:flex-row gap-3"
      >
        <input
          type="text"
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          placeholder="Paste transaction hash (e.g. 0x...)"
          className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={verifying || !txHash.trim()}
          className="py-2.5 px-5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md shadow-indigo-600/30 disabled:opacity-50"
        >
          {verifying ? "Verifying..." : "Verify On-Chain 🔍"}
        </button>
      </form>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          ⚠️ {error}
        </div>
      )}

      {result && result.verified && (
        <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 pb-3">
            <div className="flex items-center space-x-2 text-emerald-300 font-bold text-sm">
              <span>✓</span>
              <span>Ballot Verified in Immutable Ledger</span>
            </div>
            <div className="flex items-center gap-2">
              <CopyButton
                text={formatVoteReceiptText(result.receipt)}
                label="Copy Receipt 📋"
                copiedLabel="Receipt Copied ✓"
                title="Copy full verified ballot receipt"
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-semibold text-[11px] transition-colors"
              />
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold text-[11px]">
                {result.receipt?.status || "Confirmed"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-slate-400 block">Transaction Hash</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-indigo-300 break-all">{result.receipt?.txHash}</span>
                <CopyButton
                  text={result.receipt?.txHash}
                  label="Copy"
                  copiedLabel="Copied ✓"
                  title="Copy transaction hash"
                />
              </div>
            </div>
            <div>
              <span className="text-slate-400 block">Election</span>
              <span className="font-semibold text-white">
                {result.receipt?.electionTitle || `Election #${result.receipt?.electionId || "-"}`}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Block Number</span>
              <span className="font-mono text-slate-200">
                #{result.onChainConfirmation?.blockNumber || result.receipt?.blockNumber || "Confirmed"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Timestamp</span>
              <span className="text-slate-200">{formatDate(result.receipt?.timestamp)}</span>
            </div>
            {result.receipt?.voterHash && (
              <div className="sm:col-span-2">
                <span className="text-slate-400 block">Anonymized Voter Hash</span>
                <span className="font-mono text-slate-300">
                  {shortenHash(result.receipt.voterHash, 14)}
                </span>
              </div>
            )}
            {result.onChainConfirmation && (
              <>
                <div>
                  <span className="text-slate-400 block">Contract Address</span>
                  <span className="font-mono text-slate-300">
                    {shortenHash(result.onChainConfirmation.to, 10)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Gas Used</span>
                  <span className="font-mono text-slate-300">
                    {result.onChainConfirmation.gasUsed}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
