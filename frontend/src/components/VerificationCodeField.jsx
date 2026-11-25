import React from "react";

/**
 * Shared 6-digit email verification code input with optional issued-code banner,
 * Auto-Fill button, and optional Resend trigger (used across Forgot Password & Registrations).
 */
export default function VerificationCodeField({
  code,
  onChange,
  devCode,
  onAutoFill,
  focusClass = "focus:border-indigo-500",
  onResend,
  resending = false,
  label = "6-Digit Verification Code *",
}) {
  return (
    <div className="space-y-3">
      {devCode && (
        <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs flex items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-indigo-300 block">Verification Code Issued:</span>
            <span className="font-mono text-base font-bold text-white tracking-widest">
              {devCode}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onAutoFill(devCode)}
            className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[11px] font-semibold transition-colors shrink-0"
          >
            Auto-Fill Code
          </button>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-semibold text-slate-300">{label}</label>
          {onResend && (
            <button
              type="button"
              onClick={onResend}
              disabled={resending}
              className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
            >
              {resending ? "Resending..." : "Resend Code"}
            </button>
          )}
        </div>
        <input
          type="text"
          required
          maxLength={6}
          value={code}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="e.g. 123456"
          className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm font-mono tracking-widest text-center focus:outline-none ${focusClass}`}
        />
      </div>
    </div>
  );
}
