import React from "react";

/**
 * Plain-language FAQ / Help modal explaining blockchain voting security,
 * anonymized voterHash secrecy, and transaction receipt verification.
 */
export default function BlockchainGuideModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const sections = [
    {
      icon: "⛓️",
      title: "Why Your Vote Cannot Be Altered",
      body: "Once your ballot is confirmed on the smart contract, it is sealed inside an immutable blockchain block. Neither administrators, relayer servers, nor developers can edit, delete, or overwrite a cast ballot.",
    },
    {
      icon: "🕶️",
      title: "How voterHash Protects Ballot Secrecy",
      body: "Your Government/Student ID is never saved in plaintext or sent on-chain. Instead, the platform creates a one-way cryptographic digest (keccak256 of your ID + secret salt). The smart contract uses this voterHash solely to prevent double voting without revealing who you voted for.",
    },
    {
      icon: "📜",
      title: "What Your Transaction Hash (txHash) Means",
      body: "Every confirmed vote produces a unique cryptographic fingerprint (txHash) and block number. You can copy, download, and paste your txHash into the Verify My Receipt tool at any time to prove your vote exists in an immutable block—without exposing your candidate selection.",
    },
    {
      icon: "⚡",
      title: "Hybrid Voting: 1-Click Relayer vs. MetaMask",
      body: "By default, Standard One-Click Voting lets our server Relayer submit the transaction and pay gas fees so you need zero crypto or extensions. If you prefer self-custody, link a MetaMask wallet on your dashboard and switch to Advanced Web3 Mode inside the voting room.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
              Voter Trust & Transparency Guide
            </span>
            <h3 className="text-xl font-bold text-white mt-1">
              How Blockchain Protects Your Vote
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
          >
            Close ✕
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sections.map((item) => (
            <div
              key={item.title}
              className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2"
            >
              <div className="flex items-center space-x-2">
                <span className="text-xl">{item.icon}</span>
                <h4 className="text-sm font-bold text-white">{item.title}</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
