import React from "react";
import { useAuth } from "../context/AuthContext";

/**
 * Persistent notice displayed across portal pages when signed in with a
 * read-only default preview account.
 */
export default function ReadOnlyBanner() {
  const { isReadOnly } = useAuth();
  if (!isReadOnly) return null;

  return (
    <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-200 text-xs flex items-start sm:items-center gap-3 shadow-lg">
      <span className="text-lg shrink-0">👁️</span>
      <div>
        <span className="font-bold text-sky-300 uppercase tracking-wider text-[11px] block">
          Read-Only Explorer Mode
        </span>
        <span className="text-slate-300 leading-relaxed">
          You are signed in with a default explorer account. You can browse all portal pages and inspect every available option, while voting, submitting, editing, approving, and deleting actions are disabled.
        </span>
      </div>
    </div>
  );
}
