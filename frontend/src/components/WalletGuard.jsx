import React from "react";
import { useWallet } from "../context/WalletContext";

/**
 * WalletGuard is used ONLY on Admin panels or Web3 direct-wallet views.
 * It does NOT block regular voters who use the gasless relayer system.
 */
export default function WalletGuard({ children, title = "Web3 Wallet Required" }) {
  const { isConnected, connectWallet, isConnecting, hasMetaMask } = useWallet();

  if (isConnected) {
    return <>{children}</>;
  }

  return (
    <div className="max-w-md mx-auto my-12 p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center shadow-xl">
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl">
        🦊
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-slate-400 text-sm mb-6 leading-relaxed">
        {hasMetaMask
          ? "This administrative or direct-signing feature requires an active Web3 wallet connection to sign transactions directly."
          : "MetaMask or a Web3 compatible browser extension is required to access this specific direct-wallet view."}
      </p>
      <button
        onClick={connectWallet}
        disabled={isConnecting}
        className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50"
      >
        {isConnecting ? "Connecting to Wallet..." : "Connect MetaMask Wallet"}
      </button>
    </div>
  );
}
