import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatDate, getPhaseBadgeClass } from "../utils/format";
import CountdownTimer from "./CountdownTimer";

export default function ElectionCard({ election }) {
  const { isAdmin } = useAuth();
  if (!election) return null;
  const badgeClass = getPhaseBadgeClass(election.phase);
  const turnout = election.turnout;

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 flex flex-col justify-between hover:border-slate-700 transition-all hover:shadow-xl hover:shadow-indigo-950/20">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide ${badgeClass}`}
          >
            {election.phase}
          </span>
          <CountdownTimer
            phase={election.phase}
            startDate={election.startDate}
            endDate={election.endDate}
            compact
          />
        </div>

        <h3 className="text-lg font-bold text-white mb-1 line-clamp-1">{election.title}</h3>
        <span className="text-[11px] text-slate-500 font-mono block mb-2">
          Election ID: #{election.onChainElectionId}
        </span>
        <p className="text-sm text-slate-400 mb-4 line-clamp-2 leading-relaxed">
          {election.description || "Official on-chain democratic ballot for verified constituents."}
        </p>

        <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-800/80 mb-5 text-xs text-slate-400">
          <div>
            <span className="block text-slate-500">Candidates</span>
            <span className="font-semibold text-slate-200">
              {election.candidatesCount ?? election.candidates?.length ?? 0}
            </span>
          </div>
          <div>
            <span className="block text-slate-500">Live Turnout</span>
            <span className="font-semibold text-slate-200">
              {turnout
                ? `${turnout.votesCast} / ${turnout.verifiedVoters} (${turnout.percentage}%)`
                : isAdmin || election.phase === "Ended"
                ? election.totalVotes || 0
                : "Hidden 🔒"}
            </span>
          </div>
          <div className="col-span-2">
            <span className="block text-slate-500">Start Date</span>
            <span className="text-slate-300">{formatDate(election.startDate)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        {election.phase === "Voting" ? (
          <Link
            to={`/election/${election.onChainElectionId}`}
            className="flex-1 text-center py-2 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md shadow-indigo-600/30"
          >
            Enter Voting Room 🗳️
          </Link>
        ) : election.phase === "Ended" ? (
          <Link
            to={
              isAdmin
                ? `/results?electionId=${election.onChainElectionId}`
                : `/election/${election.onChainElectionId}`
            }
            className="flex-1 text-center py-2 px-4 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-all border border-amber-500/30"
          >
            View Final Results 📊
          </Link>
        ) : (
          <Link
            to={`/election/${election.onChainElectionId}`}
            className="flex-1 text-center py-2 px-4 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-all border border-slate-700"
          >
            View Candidates & Details
          </Link>
        )}
      </div>
    </div>
  );
}
