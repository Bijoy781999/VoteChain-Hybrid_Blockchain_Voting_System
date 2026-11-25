import React from "react";

export default function ResultsChart({ candidates, totalVotes }) {
  if (!candidates || candidates.length === 0) {
    return <p className="text-sm text-slate-500 py-4">No candidates registered.</p>;
  }

  const sortedCandidates = [...candidates].sort((a, b) => b.voteCount - a.voteCount);
  const leadingCount = sortedCandidates[0]?.voteCount || 0;

  return (
    <div className="space-y-4">
      {sortedCandidates.map((candidate, index) => {
        const percentage =
          totalVotes > 0 ? Math.round((candidate.voteCount / totalVotes) * 100) : 0;
        const isLeader = index === 0 && candidate.voteCount > 0;

        return (
          <div
            key={candidate.onChainId || candidate.id || index}
            className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-white">{candidate.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {candidate.party}
                </span>
                {isLeader && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                    👑 Leading
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-white">{candidate.voteCount}</span>
                <span className="text-xs text-slate-500 ml-1">({percentage}%)</span>
              </div>
            </div>

            {/* Visual Bar */}
            <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  isLeader
                    ? "bg-gradient-to-r from-amber-500 to-indigo-500"
                    : "bg-indigo-600"
                }`}
                style={{ width: `${Math.max(percentage, 2)}%` }}
              ></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
