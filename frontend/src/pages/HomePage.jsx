import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { electionAPI } from "../services/api";
import ElectionCard from "../components/ElectionCard";

export default function HomePage() {
  const { isAdmin, isVoter, isCandidate, isAuthenticated } = useAuth();
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await electionAPI.list();
        if (res.data.success) {
          setElections(res.data.elections);
        }
      } catch (err) {
        console.warn("Could not load elections:", err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-16 py-8">
      {/* Hero Section */}
      <section className="relative text-center max-w-4xl mx-auto px-4 pt-10 pb-6">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-6">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
          <span>Next-Generation Hybrid Voting</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight mb-6">
          Cryptographically Verifiable,{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            Gasless Blockchain
          </span>{" "}
          Voting.
        </h1>

        <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed mb-8">
          Eliminate voter friction and gas fees. Constituents vote with a single click via our
          secure on-chain Relayer, while Web3 users and auditors retain full direct MetaMask signing and public verification.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          {!isAuthenticated && (
            <>
              <Link
                to="/register"
                className="px-6 py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/30"
              >
                Register as Voter 🗳️
              </Link>
              <Link
                to="/candidate-register"
                className="px-6 py-3 rounded-xl text-sm font-semibold text-purple-300 bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 transition-all shadow-lg shadow-purple-600/10"
              >
                Contest as Candidate 🏛️
              </Link>
            </>
          )}

          {isAdmin && (
            <Link
              to="/results"
              className="px-6 py-3 rounded-xl text-sm font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all"
            >
              Admin Audit & Results Dashboard 📊
            </Link>
          )}

          {isVoter && (
            <Link
              to="/voter-dashboard"
              className="px-6 py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/30"
            >
              Open Public Voter Portal 🗳️
            </Link>
          )}

          {isCandidate && (
            <Link
              to="/candidate-dashboard"
              className="px-6 py-3 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 transition-all shadow-lg shadow-purple-600/30"
            >
              Candidate Headquarters 🏛️
            </Link>
          )}

          {!isAuthenticated && (
            <Link
              to="/admin-login"
              className="px-6 py-3 rounded-xl text-sm font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-all"
            >
              Admin Portal Access 🛡️
            </Link>
          )}
        </div>
      </section>

      {/* Architecture Highlights */}
      <section className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-3xl mb-3">⚡</div>
          <h3 className="text-lg font-bold text-white mb-2">Zero Gas for Voters</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Constituents do not need cryptocurrency or wallet browser extensions. The Relayer securely batches and submits transactions to the Ethereum smart contract.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-3xl mb-3">🛡️</div>
          <h3 className="text-lg font-bold text-white mb-2">Double-Vote Prevention</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Strict on-chain keccak256 voter hash tracking ensures absolute double-voting immunity. Once cast, a ballot cannot be duplicated or altered.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-3xl mb-3">📜</div>
          <h3 className="text-lg font-bold text-white mb-2">Verifiable Receipts & Tamper-Proof Audit</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Every voter receives an immutable transaction receipt hash confirming their ballot is permanently recorded on-chain with zero privacy exposure, while official election tallies and audit ledgers remain securely governed by authorized administrators.
          </p>
        </div>
      </section>

      {/* Active Elections */}
      <section className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Elections & Ballots</h2>
            <p className="text-sm text-slate-400">
              Browse current democratic elections and on-chain ballots.
            </p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-slate-800 text-slate-400 font-mono">
            {elections.length} Found
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading active elections...</div>
        ) : elections.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/50 rounded-2xl border border-slate-800 p-8">
            <p className="text-slate-400 text-sm mb-4">No elections have been scheduled yet.</p>
            <Link
              to="/admin"
              className="text-indigo-400 hover:text-indigo-300 text-xs font-semibold"
            >
              Log in as Administrator to create the first election →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {elections.map((election) => (
              <ElectionCard key={election._id || election.onChainElectionId} election={election} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
