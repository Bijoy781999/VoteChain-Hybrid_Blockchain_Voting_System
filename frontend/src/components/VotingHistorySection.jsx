import React, { useState } from "react";
import { Link } from "react-router-dom";
import ElectionEndedBreakdown from "./ElectionEndedBreakdown";
import CopyButton from "./CopyButton";
import { shortenHash, formatVoteReceiptText } from "../utils/format";

/**
 * Shared Past Elections, Voting History & Unlocked Ended Results viewer
 * used by both Public Voter Portal and Candidate Portal.
 */
export default function VotingHistorySection({
  history = [],
  onSelectReceipt,
  onVerifyHash,
}) {
  const [expandedEndedId, setExpandedEndedId] = useState(null);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Past Elections, Voting History & Ended Results</h2>
          <p className="text-xs text-slate-400">
            Complete archive of past, active, and upcoming elections with unlocked final breakdowns for ended elections and receipt lookup.
          </p>
        </div>
      </div>

      {history.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">No election records found.</p>
      ) : (
        <div className="space-y-4">
          {history.map((item) => {
            const isExpanded = expandedEndedId === item.onChainElectionId;
            return (
              <div
                key={item.onChainElectionId}
                className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 text-xs"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono text-slate-500">#{item.onChainElectionId}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
                        {item.phase}
                      </span>
                      {item.contested && (
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold">
                          🏛️ Contested by You
                        </span>
                      )}
                      {item.participated ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                          ✓ Voted ({item.receipt?.mode || "Verified"})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400">
                          {item.phase === "Ended" ? "No Ballot Linked" : "Pending / Upcoming"}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-white text-sm">{item.title}</h3>
                    {item.receipt?.txHash && (
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <p className="font-mono text-indigo-400 text-[11px]">
                          Receipt Tx: {shortenHash(item.receipt.txHash, 10)}
                        </p>
                        <CopyButton
                          text={item.receipt.txHash}
                          label="Copy Tx"
                          copiedLabel="Copied ✓"
                          title="Copy transaction hash"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {item.receipt?.txHash && (
                      <>
                        <CopyButton
                          text={formatVoteReceiptText(item.receipt)}
                          label="Copy Receipt 📋"
                          copiedLabel="Receipt Copied ✓"
                          title="Copy complete vote receipt"
                          className="px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/20 font-semibold transition-colors"
                        />
                        {onSelectReceipt && (
                          <button
                            type="button"
                            onClick={() => onSelectReceipt(item.receipt)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 font-semibold"
                          >
                            View / Download Receipt
                          </button>
                        )}
                        {onVerifyHash && (
                          <button
                            type="button"
                            onClick={() => onVerifyHash(item.receipt.txHash)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 font-semibold"
                          >
                            Verify Hash 🔍
                          </button>
                        )}
                      </>
                    )}
                    {item.phase === "Ended" && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedEndedId(isExpanded ? null : item.onChainElectionId)
                          }
                          className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-semibold"
                        >
                          {isExpanded ? "Hide Final Results" : "View Ended Results 📊"}
                        </button>
                        <Link
                          to={`/election/${item.onChainElectionId}`}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold"
                        >
                          Election Room ↗
                        </Link>
                      </>
                    )}
                  </div>
                </div>

                {item.phase === "Ended" && isExpanded && (
                  <div className="pt-3 border-t border-slate-800">
                    <ElectionEndedBreakdown
                      electionId={item.onChainElectionId}
                      onSelectTxHash={onVerifyHash}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
