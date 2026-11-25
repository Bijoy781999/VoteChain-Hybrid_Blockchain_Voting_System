import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../context/WalletContext";
import { shortenAddress } from "../utils/format";

export default function Navbar() {
  const { user, isAuthenticated, isAdmin, isVoter, isCandidate, isReadOnly, logout } = useAuth();
  const { account, isConnected, isConnecting, connectWallet, disconnectWallet } = useWallet();
  const navigate = useNavigate();
  const [registerOpen, setRegisterOpen] = useState(false);
  const registerMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (registerMenuRef.current && !registerMenuRef.current.contains(event.target)) {
        setRegisterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-900/80 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform">
              <span className="text-xl font-black text-white">⬡</span>
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-white block leading-tight">
                Vote<span className="text-indigo-400">Chain</span>
              </span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                Hybrid Blockchain Voting
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-300">
            <Link to="/" className="hover:text-white transition-colors">
              Home
            </Link>

            {/* PUBLIC (Voter Panel / Login) placed exactly before Candidates */}
            <Link
              to={isVoter ? "/voter-dashboard" : "/login"}
              className={`transition-colors flex items-center space-x-1.5 ${
                isVoter ? "text-indigo-400 font-semibold" : "text-slate-300 hover:text-white"
              }`}
            >
              <span>🗳️</span>
              <span>Public Portal</span>
            </Link>

            {/* Candidates */}
            {isCandidate ? (
              <Link to="/candidate-dashboard" className="text-purple-400 hover:text-purple-300 font-semibold flex items-center space-x-1">
                <span>🏛️</span>
                <span>Candidates</span>
              </Link>
            ) : (
              <Link to="/candidate-login" className="text-slate-400 hover:text-purple-400 transition-colors flex items-center space-x-1">
                <span>🏛️</span>
                <span>Candidates Portal</span>
              </Link>
            )}

            {/* Admin Portal / Dashboard */}
            {isAdmin ? (
              <Link to="/admin" className="text-amber-400 hover:text-amber-300 font-semibold flex items-center space-x-1">
                <span>🛡️</span>
                <span>Admin Dashboard</span>
              </Link>
            ) : (
              <Link to="/admin-login" className="text-slate-400 hover:text-amber-400 transition-colors flex items-center space-x-1">
                <span>🛡️</span>
                <span>Admin Portal</span>
              </Link>
            )}

            {/* Results & Audit (Admin Only) */}
            {isAdmin && (
              <Link to="/results" className="text-amber-400 hover:text-amber-300 transition-colors flex items-center space-x-1">
                <span>📊</span>
                <span>Results & Audit</span>
              </Link>
            )}
          </nav>

          {/* User Status & Wallet Connect */}
          <div className="flex items-center space-x-3">
            {/* Optional Web3 Wallet Connect */}
            {isConnected ? (
              <button
                onClick={disconnectWallet}
                title="Disconnect Web3 Wallet"
                className="flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{shortenAddress(account)}</span>
              </button>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                title="Connect optional MetaMask wallet for Direct On-Chain Voting"
                className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 transition-all"
              >
                <span>🦊</span>
                <span>{isConnecting ? "Connecting..." : "Connect Wallet"}</span>
              </button>
            )}

            {/* Auth Actions */}
            {isAuthenticated ? (
              <div className="flex items-center space-x-3 pl-2 border-l border-slate-800">
                <span className="text-xs text-slate-400 hidden lg:inline-block">
                  {user?.fullName || user?.email}
                </span>
                {isReadOnly && (
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/30">
                    👁️ Explorer
                  </span>
                )}
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                {/* Register Dropdown (links to the 3 separated standalone registration forms) */}
                <div
                  ref={registerMenuRef}
                  className="relative"
                  onMouseEnter={() => setRegisterOpen(true)}
                  onMouseLeave={() => setRegisterOpen(false)}
                >
                  <button
                    type="button"
                    onClick={() => setRegisterOpen((prev) => !prev)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl shadow-md shadow-indigo-600/30 transition-all flex items-center space-x-1"
                  >
                    <span>📝</span>
                    <span>Register</span>
                    <span className="text-[10px] opacity-75">▾</span>
                  </button>

                  {/* Dropdown with direct links to each standalone registration page */}
                  <div
                    className={`absolute right-0 pt-1 w-56 transition-all z-50 ${
                      registerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    }`}
                  >
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-1.5 shadow-2xl">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-3 py-1 border-b border-slate-800/80 mb-1">
                        Registration Portals
                      </div>
                      <Link
                        to="/register"
                        onClick={() => setRegisterOpen(false)}
                        className="flex items-center space-x-2 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                      >
                        <span>🗳️</span>
                        <span>Public / Voter Registration</span>
                      </Link>
                      <Link
                        to="/candidate-register"
                        onClick={() => setRegisterOpen(false)}
                        className="flex items-center space-x-2 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-purple-300 hover:bg-slate-800 transition-colors"
                      >
                        <span>🏛️</span>
                        <span>Candidate Registration</span>
                      </Link>
                      <Link
                        to="/admin-register"
                        onClick={() => setRegisterOpen(false)}
                        className="flex items-center space-x-2 px-3 py-2 rounded-xl text-xs text-slate-300 hover:text-amber-300 hover:bg-slate-800 transition-colors"
                      >
                        <span>🛡️</span>
                        <span>Admin Registration</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
