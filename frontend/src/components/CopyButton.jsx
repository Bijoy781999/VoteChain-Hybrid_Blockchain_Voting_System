import React, { useState } from "react";

/**
 * Reusable clipboard copy button with temporary confirmation state.
 */
export default function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied ✓",
  title = "Copy to clipboard",
  className = "px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors",
}) {
  const [copied, setCopied] = useState(false);

  if (!text) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // Fallback ignored if clipboard API unavailable
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={title}
      className={className}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
