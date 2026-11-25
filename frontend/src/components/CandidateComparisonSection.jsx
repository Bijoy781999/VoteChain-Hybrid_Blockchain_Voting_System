import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import CandidateCard from "./CandidateCard";

export function extractAgendaPoints(manifesto = "") {
  if (!manifesto) {
    return ["Transparent governance & accountability", "Responsive constituent representation"];
  }
  const split = manifesto
    .split(/[\n.;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
  return split.length > 0 ? split : [manifesto];
}

/**
 * Reusable Candidate Manifesto & Side-by-Side Comparison (2-3 candidates) + Full Bio Modal.
 * Used in both ElectionRoomPage and the dedicated Public Voter Portal (VoterDashboard).
 */
export default function CandidateComparisonSection({
  candidates = [],
  isVotingPhase = false,
  hasVoted = false,
  onVote = null,
  votePath = "",
  isSubmitting = false,
  votingMode = "relayer",
  isReadOnly = false,
}) {
  const [compareIds, setCompareIds] = useState([]);
  const [activeBioCandidate, setActiveBioCandidate] = useState(null);
  const [compareWarning, setCompareWarning] = useState("");

  useEffect(() => {
    setCompareIds([]);
    setActiveBioCandidate(null);
    setCompareWarning("");
  }, [candidates]);

  const handleToggleCompare = (cand) => {
    const key = cand._id || cand.onChainId;
    setCompareWarning("");
    setCompareIds((prev) => {
      if (prev.includes(key)) {
        return prev.filter((item) => item !== key);
      }
      if (prev.length >= 3) {
        setCompareWarning("You can compare up to 3 candidates side by side at once.");
        return prev;
      }
      return [...prev, key];
    });
  };

  const comparedCandidates = candidates.filter((c) => compareIds.includes(c._id || c.onChainId));

  return (
    <div className="space-y-6">
      {compareWarning && (
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-center">
          ⚠️ {compareWarning}
        </div>
      )}

      {/* Side-by-Side Candidate Comparison Drawer (2-3 candidates) */}
      {comparedCandidates.length > 0 && (
        <div className="bg-slate-900 border border-purple-500/40 rounded-3xl p-6 sm:p-8 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-400">
                Informed Voting Tool
              </span>
              <h3 className="text-lg font-bold text-white">
                Side-by-Side Candidate Comparison ({comparedCandidates.length}/3 Selected)
              </h3>
              {comparedCandidates.length < 2 && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Select at least 1 more candidate card below to compare 2–3 platforms side by side.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              Clear Comparison
            </button>
          </div>

          <div
            className={`grid gap-4 ${
              comparedCandidates.length === 1
                ? "grid-cols-1"
                : comparedCandidates.length === 2
                ? "grid-cols-1 md:grid-cols-2"
                : "grid-cols-1 md:grid-cols-3"
            }`}
          >
            {comparedCandidates.map((cand) => {
              const points = extractAgendaPoints(cand.manifesto);
              return (
                <div
                  key={cand._id || cand.onChainId}
                  className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-white text-base">{cand.name}</h4>
                        <span className="text-xs text-purple-300 font-semibold">
                          {cand.party || "Independent"}
                        </span>
                      </div>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        #{cand.onChainId}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                        Key Agenda Points
                      </span>
                      <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                        {points.map((pt, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {pt}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                        Full Bio & Manifesto
                      </span>
                      <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
                        {cand.manifesto ||
                          "Committed to transparent governance, student welfare, and equitable institutional progress."}
                      </p>
                    </div>
                  </div>

                  {isVotingPhase && !hasVoted && (
                    onVote ? (
                      <button
                        type="button"
                        disabled={isSubmitting || isReadOnly}
                        onClick={() => onVote(cand.onChainId)}
                        className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isReadOnly ? "Voting Disabled (Explorer)" : `Vote for ${cand.name}`}
                      </button>
                    ) : votePath ? (
                      <Link
                        to={votePath}
                        className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 text-center block"
                      >
                        Open Voting Room to Vote 🗳️
                      </Link>
                    ) : null
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Candidates Grid */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Official Candidates & Platforms</h2>
            <p className="text-xs text-slate-400">
              Click "Read Full Bio & Agenda" or select "+ Compare" on 2–3 candidates before voting.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">{candidates.length} Candidates</span>
        </div>

        {candidates.length === 0 ? (
          <div className="text-center py-12 bg-slate-900 rounded-2xl border border-slate-800 text-slate-400 text-sm">
            No approved candidates have been registered for this election yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {candidates.map((cand) => (
              <CandidateCard
                key={cand._id || cand.onChainId}
                candidate={cand}
                isVotingPhase={isVotingPhase}
                hasVoted={hasVoted}
                onVote={onVote}
                votePath={votePath}
                isSubmitting={isSubmitting}
                votingMode={votingMode}
                isReadOnly={isReadOnly}
                isCompared={compareIds.includes(cand._id || cand.onChainId)}
                onToggleCompare={handleToggleCompare}
                onReadManifesto={setActiveBioCandidate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Candidate Full Bio & Agenda Modal */}
      {activeBioCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs font-mono text-purple-400">
                  Official Ballot Candidate #{activeBioCandidate.onChainId}
                </span>
                <h3 className="text-xl font-bold text-white mt-0.5">{activeBioCandidate.name}</h3>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  {activeBioCandidate.party || "Independent"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveBioCandidate(null)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Close ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-slate-400 uppercase tracking-wider text-[11px] block mb-1">
                  Campaign Manifesto & Bio
                </span>
                <p className="text-slate-200 leading-relaxed whitespace-pre-line">
                  {activeBioCandidate.manifesto ||
                    "Committed to transparent governance, student welfare, and equitable institutional progress."}
                </p>
              </div>

              <div>
                <span className="font-semibold text-slate-400 uppercase tracking-wider text-[11px] block mb-1.5">
                  Agenda Points
                </span>
                <ul className="space-y-1.5 text-slate-300 list-disc list-inside">
                  {extractAgendaPoints(activeBioCandidate.manifesto).map((pt, i) => (
                    <li key={i}>{pt}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  handleToggleCompare(activeBioCandidate);
                  setActiveBioCandidate(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600/20 text-purple-300 border border-purple-500/30 hover:bg-purple-600/30"
              >
                {compareIds.includes(activeBioCandidate._id || activeBioCandidate.onChainId)
                  ? "Remove from Comparison"
                  : "+ Add to Side-by-Side Comparison"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
