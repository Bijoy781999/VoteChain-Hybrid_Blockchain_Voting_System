import React from "react";
import { Link } from "react-router-dom";

export default function CandidateCard({
  candidate,
  isVotingPhase,
  hasVoted,
  onVote,
  votePath,
  isSubmitting,
  votingMode = "relayer", // 'relayer' or 'wallet'
  isReadOnly = false,
  isCompared = false,
  onToggleCompare,
  onReadManifesto,
}) {
  return (
    <div
      className={`bg-slate-900 border rounded-2xl p-6 flex flex-col justify-between transition-all ${
        isCompared
          ? "border-purple-500/70 ring-1 ring-purple-500/40 shadow-lg shadow-purple-950/30"
          : "border-slate-800 hover:border-slate-700"
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h4 className="text-lg font-bold text-white">{candidate.name}</h4>
            <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {candidate.party || "Independent"}
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 shrink-0">
            #{candidate.onChainId}
          </div>
        </div>

        <p className="text-sm text-slate-400 my-4 leading-relaxed line-clamp-3">
          {candidate.manifesto || "Promotes transparency, democratic accountability, and progress."}
        </p>

        {/* Manifesto & Side-by-Side Compare Controls */}
        <div className="flex items-center justify-between gap-2 mb-4 text-xs">
          {onReadManifesto && (
            <button
              type="button"
              onClick={() => onReadManifesto(candidate)}
              className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
            >
              Read Full Bio & Agenda →
            </button>
          )}
          {onToggleCompare && (
            <button
              type="button"
              onClick={() => onToggleCompare(candidate)}
              className={`px-2.5 py-1 rounded-lg font-semibold border transition-all ${
                isCompared
                  ? "bg-purple-600 text-white border-purple-500"
                  : "bg-slate-950 text-slate-300 border-slate-700 hover:border-purple-500/50"
              }`}
            >
              {isCompared ? "✓ Comparing" : "+ Compare"}
            </button>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800">
        {!onVote && votePath && isVotingPhase && !hasVoted ? (
          <Link
            to={votePath}
            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30"
          >
            <span>Open Voting Room to Vote 🗳️</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onVote && onVote(candidate.onChainId)}
            disabled={!onVote || !isVotingPhase || hasVoted || isSubmitting || isReadOnly}
            title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
            className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center space-x-2 ${
              hasVoted || !isVotingPhase || isReadOnly || !onVote
                ? "bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700"
                : votingMode === "relayer"
                ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30"
            }`}
          >
            {isSubmitting ? (
              <span>Confirming Vote...</span>
            ) : hasVoted ? (
              <span>✓ Ballot Cast</span>
            ) : !isVotingPhase ? (
              <span>Voting Inactive</span>
            ) : isReadOnly ? (
              <span>
                {votingMode === "relayer"
                  ? "Vote Gasless (Explorer Only) 🔒"
                  : "Vote via MetaMask (Explorer Only) 🔒"}
              </span>
            ) : votingMode === "relayer" ? (
              <span>Vote Gasless (1-Click) 🗳️</span>
            ) : (
              <span>Vote via MetaMask 🦊</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
