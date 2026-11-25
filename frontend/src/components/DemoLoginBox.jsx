import React from "react";

const ACCENT_STYLES = {
  indigo: {
    box: "bg-indigo-500/10 border-indigo-500/20",
    title: "text-indigo-300",
    creds: "text-indigo-200/80",
    btn: "bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300",
  },
  purple: {
    box: "bg-purple-500/10 border-purple-500/20",
    title: "text-purple-300",
    creds: "text-purple-200/80",
    btn: "bg-purple-500/20 hover:bg-purple-500/30 text-purple-300",
  },
  amber: {
    box: "bg-amber-500/10 border-amber-500/20",
    title: "text-amber-300",
    creds: "text-amber-200/80",
    btn: "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300",
  },
};

/**
 * Displays default read-only explorer credentials and an Auto-Fill button on login forms.
 */
export default function DemoLoginBox({
  title,
  email,
  password,
  description,
  accent = "indigo",
  onFill,
}) {
  const styles = ACCENT_STYLES[accent] || ACCENT_STYLES.indigo;

  return (
    <div className={`mb-5 p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs ${styles.box}`}>
      <div className="min-w-0">
        <span className={`font-semibold block ${styles.title}`}>{title}</span>
        <span className={`text-[11px] font-mono block truncate ${styles.creds}`}>
          {email} / {password}
        </span>
        {description && (
          <span className="text-[10px] text-slate-400 block mt-0.5">{description}</span>
        )}
      </div>
      <button
        type="button"
        onClick={onFill}
        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors shrink-0 ${styles.btn}`}
      >
        Auto-Fill
      </button>
    </div>
  );
}
