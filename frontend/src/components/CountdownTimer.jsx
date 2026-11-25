import React, { useState, useEffect } from "react";

function formatRemaining(ms) {
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  parts.push(`${String(hours).padStart(2, "0")}h`);
  parts.push(`${String(mins).padStart(2, "0")}m`);
  parts.push(`${String(secs).padStart(2, "0")}s`);
  return parts.join(" ");
}

/**
 * Displays a live 1-second ticking countdown for election start/close times.
 */
export default function CountdownTimer({ phase, startDate, endDate, compact = false }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (phase === "Ended") {
    return (
      <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
        <span>🏁</span>
        <span>Concluded</span>
      </span>
    );
  }

  if (phase === "Voting") {
    if (endDate) {
      const msLeft = new Date(endDate).getTime() - now;
      if (msLeft > 0) {
        const closingSoon = msLeft <= 24 * 60 * 60 * 1000;
        return (
          <span
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold border ${
              closingSoon
                ? "bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse"
                : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
            }`}
          >
            <span>⏳</span>
            <span>
              {compact ? "" : "Closes in "}
              {formatRemaining(msLeft)}
            </span>
          </span>
        );
      }
    }
    return (
      <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
        <span>Live Voting Active</span>
      </span>
    );
  }

  // Created or Registration phase
  if (startDate) {
    const msUntilStart = new Date(startDate).getTime() - now;
    if (msUntilStart > 0) {
      return (
        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
          <span>🕒</span>
          <span>
            {compact ? "" : "Starts in "}
            {formatRemaining(msUntilStart)}
          </span>
        </span>
      );
    }
  }

  return (
    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
      <span>📋</span>
      <span>{phase} Phase</span>
    </span>
  );
}
