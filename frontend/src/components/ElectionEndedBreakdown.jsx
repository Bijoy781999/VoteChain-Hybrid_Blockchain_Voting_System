import React, { useState, useEffect } from "react";
import { electionAPI } from "../services/api";
import ResultsChart from "./ResultsChart";
import CopyButton from "./CopyButton";
import { shortenHash, formatDate } from "../utils/format";

/**
 * Automatically unlocked once an election reaches 'Ended' phase.
 * Displays winner declaration, ResultsChart breakdown, turnout vs registered voters,
 * and anonymized public VoteCast event hashes.
 */
export default function ElectionEndedBreakdown({ electionId, onSelectTxHash }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!electionId) return;
      setLoading(true);
      setError("");
      try {
        const res = await electionAPI.getPublicResults(electionId);
        if (active && res.data.success) {
          setData(res.data);
        }
      } catch (err) {
        if (active) {
          setError(err.response?.data?.message || "Could not load final results.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [electionId]);

  if (loading) {
    return (
      <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
        Unlocking finalized post-election audit breakdown...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
        {error || "Results unavailable."}
      </div>
    );
  }

  const { winner, candidates, totalVotes, turnout, voteCastEvents } = data;

  return (
    <div className="space-y-6">
      {/* Winner Declaration Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-amber-500/15 via-slate-900 to-indigo-950/30 border border-amber-500/30 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] font-bold uppercase tracking-wider mb-2">
              <span>🏆</span>
              <span>Official Ended Election Results Unlocked</span>
            </span>
            {winner?.hasWinner ? (
              winner.isTie ? (
                <h2 className="text-2xl font-black text-white">
                  Tie Declared: {winner.candidates.map((c) => c.name).join(" & ")} ({winner.topVotes} votes each)
                </h2>
              ) : (
                <h2 className="text-2xl font-black text-white">
                  Winner: {winner.candidates[0].name}{" "}
                  <span className="text-amber-400 text-base font-semibold">
                    ({winner.candidates[0].party}) — {winner.topVotes} votes
                  </span>
                </h2>
              )
            ) : (
              <h2 className="text-xl font-bold text-slate-200">
                Election Concluded — No Votes Cast Yet
              </h2>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs shrink-0">
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-center">
              <span className="text-slate-400 block">Valid Votes</span>
              <span className="text-lg font-bold text-white">{totalVotes}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-center">
              <span className="text-slate-400 block">Verified Voters</span>
              <span className="text-lg font-bold text-indigo-400">
                {turnout?.verifiedVoters || 0} ({turnout?.percentage || 0}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Results Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Final Candidate Tally Breakdown</h3>
            <p className="text-xs text-slate-400">
              Verified vote distribution across official candidates
            </p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
            {totalVotes} Valid Ballots
          </span>
        </div>

        <ResultsChart candidates={candidates} totalVotes={totalVotes} />
      </div>

      {/* Public Anonymized VoteCast Event Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-white">Public VoteCast Transaction Hashes</h3>
            <p className="text-xs text-slate-400">
              Anonymized on-chain ballot cast log proving public tally integrity without revealing voter identities or choices.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {voteCastEvents?.length || 0} Events
          </span>
        </div>

        {!voteCastEvents || voteCastEvents.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            No VoteCast events recorded for this election.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4">Transaction Hash (txHash)</th>
                  <th className="py-3 px-4">Voter Hash</th>
                  <th className="py-3 px-4">Block</th>
                  <th className="py-3 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {voteCastEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-950/40">
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono text-[10px]">
                        {ev.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-indigo-400">
                      {ev.txHash ? (
                        <div className="inline-flex items-center gap-2">
                          {onSelectTxHash ? (
                            <button
                              type="button"
                              onClick={() => onSelectTxHash(ev.txHash)}
                              className="hover:underline text-left"
                              title="Verify this txHash"
                            >
                              {shortenHash(ev.txHash, 10)}
                            </button>
                          ) : (
                            <span>{shortenHash(ev.txHash, 10)}</span>
                          )}
                          <CopyButton
                            text={ev.txHash}
                            label="Copy"
                            copiedLabel="Copied ✓"
                            title="Copy transaction hash"
                          />
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {ev.voterHash ? shortenHash(ev.voterHash, 8) : "Direct Wallet"}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {ev.blockNumber ? `#${ev.blockNumber}` : "-"}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">
                      {formatDate(ev.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
