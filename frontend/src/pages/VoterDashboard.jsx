import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../context/WalletContext";
import { electionAPI, voterAPI, voteAPI } from "../services/api";
import { shortenHash, shortenAddress, formatDate, parseErrorMessage } from "../utils/format";
import ReadOnlyBanner from "../components/ReadOnlyBanner";
import CountdownTimer from "../components/CountdownTimer";
import BlockchainGuideModal from "../components/BlockchainGuideModal";
import ReceiptVerifierWidget from "../components/ReceiptVerifierWidget";
import VoteReceiptModal from "../components/VoteReceiptModal";
import ElectionEndedBreakdown from "../components/ElectionEndedBreakdown";
import CandidateComparisonSection from "../components/CandidateComparisonSection";
import VotingHistorySection from "../components/VotingHistorySection";
import CopyButton from "../components/CopyButton";

const KYC_STAGES = [
  { key: "registered", label: "Registered" },
  { key: "idSubmitted", label: "ID Submitted" },
  { key: "adminApproved", label: "Admin Approved" },
  { key: "syncedOnChain", label: "Synced On-Chain" },
];

export default function VoterDashboard() {
  const { user, refreshUser, isReadOnly } = useAuth();
  const { account, isConnected, connectWallet } = useWallet();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get("tab") || "ballots";
  const initialTxHash = searchParams.get("txHash") || "";
  const initialElectionId = searchParams.get("electionId") || "";

  const [activeTab, setActiveTab] = useState(
    ["ballots", "compare", "history", "verify", "alerts"].includes(initialTab)
      ? initialTab
      : "ballots"
  );
  const [verifierTxHash, setVerifierTxHash] = useState(initialTxHash);
  const [compareElectionId, setCompareElectionId] = useState(initialElectionId);

  const [profile, setProfile] = useState(user);
  const [kycSteps, setKycSteps] = useState(null);
  const [elections, setElections] = useState([]);
  const [history, setHistory] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // KYC Update / Re-upload Form State
  const [showKycForm, setShowKycForm] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editGovId, setEditGovId] = useState("");
  const [idProofName, setIdProofName] = useState("");
  const [idProofNote, setIdProofNote] = useState("");
  const [kycMsg, setKycMsg] = useState("");
  const [kycErr, setKycErr] = useState("");
  const [savingKyc, setSavingKyc] = useState(false);

  // Wallet Linking State
  const [newWallet, setNewWallet] = useState("");
  const [walletMsg, setWalletMsg] = useState("");

  // Modals / Drawers
  const [guideOpen, setGuideOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [endedBreakdownId, setEndedBreakdownId] = useState(null);

  const loadPortalData = async () => {
    try {
      setLoading(true);
      const [profRes, elecRes, histRes, notifRes] = await Promise.all([
        voterAPI.getProfile(),
        electionAPI.list(),
        voteAPI.getHistory(),
        voterAPI.getNotifications(),
      ]);

      if (profRes.data.success) {
        setProfile(profRes.data.voter);
        setKycSteps(profRes.data.kycSteps);
        setEditFullName(profRes.data.voter.fullName || "");
        setIdProofName(profRes.data.voter.idProofName || "");
        setIdProofNote(profRes.data.voter.idProofNote || "");
        if (profRes.data.voter.kycStatus === "rejected") {
          setShowKycForm(true);
        }
      }
      if (elecRes.data.success) {
        const fetchedElections = elecRes.data.elections;
        setElections(fetchedElections);
        if (fetchedElections.length > 0 && !compareElectionId) {
          const votingFirst = fetchedElections.find((e) => e.phase === "Voting");
          const chosen = votingFirst || fetchedElections[0];
          setCompareElectionId(chosen.onChainElectionId.toString());
        }
      }
      if (histRes.data.success) setHistory(histRes.data.history);
      if (notifRes.data.success) {
        setNotifications(notifRes.data.notifications);
        setUnreadCount(notifRes.data.unreadCount);
      }
    } catch (e) {
      console.warn("Could not load public portal data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortalData();
  }, []);

  useEffect(() => {
    const t = searchParams.get("tab");
    const h = searchParams.get("txHash");
    const eId = searchParams.get("electionId");
    if (t && ["ballots", "compare", "history", "verify", "alerts"].includes(t)) {
      setActiveTab(t);
    }
    if (h) {
      setVerifierTxHash(h);
    }
    if (eId) {
      setCompareElectionId(eId);
    }
  }, [searchParams]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    if (tab === "verify" && verifierTxHash) {
      setSearchParams({ tab, txHash: verifierTxHash });
    } else if (tab === "compare" && compareElectionId) {
      setSearchParams({ tab, electionId: compareElectionId });
    } else {
      setSearchParams({ tab });
    }
  };

  const handleOpenComparison = (onChainElectionId) => {
    setCompareElectionId(onChainElectionId.toString());
    setActiveTab("compare");
    setSearchParams({ tab: "compare", electionId: onChainElectionId.toString() });
  };

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setIdProofName(`${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`);
    }
  };

  const handleKycSubmit = async (e) => {
    e.preventDefault();
    setKycMsg("");
    setKycErr("");
    if (isReadOnly) {
      setKycErr("Read-Only Explorer Mode: Updating KYC profile is disabled for preview accounts.");
      return;
    }

    setSavingKyc(true);
    try {
      const payload = {
        fullName: editFullName,
        idProofName,
        idProofNote,
      };
      if (editGovId.trim()) {
        payload.govId = editGovId.trim();
      }
      const res = await voterAPI.updateProfile(payload);
      if (res.data.success) {
        setKycMsg(res.data.message);
        setEditGovId("");
        await refreshUser();
        await loadPortalData();
      }
    } catch (err) {
      setKycErr(parseErrorMessage(err));
    } finally {
      setSavingKyc(false);
    }
  };

  const handleLinkWallet = async (e) => {
    e.preventDefault();
    if (isReadOnly) {
      setWalletMsg("Read-Only Explorer Mode: Updating wallet is disabled.");
      return;
    }
    const targetWallet = (newWallet || account || "").trim();
    if (!targetWallet) return;
    try {
      await voterAPI.linkWallet(targetWallet);
      await refreshUser();
      await loadPortalData();
      setWalletMsg("Wallet successfully linked for Advanced Web3 Voting!");
      setTimeout(() => setWalletMsg(""), 3500);
      setNewWallet("");
    } catch (err) {
      setWalletMsg(parseErrorMessage(err));
    }
  };

  const handleMarkAllRead = async () => {
    if (isReadOnly || notifications.length === 0) return;
    try {
      const ids = notifications.map((n) => n.id);
      await voterAPI.markNotificationsRead(ids);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (e) {
      // ignore
    }
  };

  const handleVerifyHashJump = (hash) => {
    setVerifierTxHash(hash);
    setActiveTab("verify");
    setSearchParams({ tab: "verify", txHash: hash });
  };

  const isRejected = profile?.kycStatus === "rejected" && !profile?.isApproved;
  const computedSteps = kycSteps || {
    registered: true,
    idSubmitted: true,
    adminApproved: Boolean(profile?.isApproved),
    syncedOnChain: profile?.kycStatus === "synced_on_chain",
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <ReadOnlyBanner />

      {/* Top Portal Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Public Voter Portal
            </span>
            <h1 className="text-2xl font-bold text-white mt-1">
              {profile?.fullName || user?.fullName}
            </h1>
            <p className="text-xs text-slate-400">{profile?.email || user?.email}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 transition-all"
            >
              How Blockchain Protects Your Vote ❓
            </button>

            {isRejected ? (
              <span className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <span>⚠️</span>
                <span>KYC Rejected — Resubmission Required</span>
              </span>
            ) : computedSteps.syncedOnChain ? (
              <span className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Verified & Synced On-Chain</span>
              </span>
            ) : profile?.isApproved ? (
              <span className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Admin Approved</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                <span>Pending Admin KYC Review</span>
              </span>
            )}
          </div>
        </div>

        {/* 1. KYC / Eligibility & Verification Tracker */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white">
              KYC Eligibility & Verification Tracker
            </h2>
            <button
              type="button"
              onClick={() => setShowKycForm((prev) => !prev)}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
            >
              {showKycForm
                ? "Hide Profile / ID Resubmission"
                : isRejected
                ? "Re-upload ID Proof & Fix Profile →"
                : "Update Profile / Attach ID Proof"}
            </button>
          </div>

          {/* 4-Step Progress Stepper */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {KYC_STAGES.map((stage, idx) => {
              const done = Boolean(computedSteps[stage.key]);
              return (
                <div
                  key={stage.key}
                  className={`p-3 rounded-2xl border flex items-center space-x-2.5 ${
                    done
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : isRejected && idx >= 2
                      ? "bg-rose-500/10 border-rose-500/25 text-rose-300"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                      done
                        ? "bg-emerald-500 text-slate-950"
                        : isRejected && idx === 2
                        ? "bg-rose-500 text-white"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {done ? "✓" : isRejected && idx === 2 ? "!" : idx + 1}
                  </span>
                  <span className="font-semibold">{stage.label}</span>
                </div>
              );
            })}
          </div>

          {isRejected && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs space-y-1">
              <span className="font-bold text-rose-300 block">
                Administrator Rejection Reason:
              </span>
              <p>{profile?.rejectionReason || "Please update your profile details and re-submit ID proof."}</p>
            </div>
          )}

          {/* Collapsible Profile Update / ID Re-upload Form */}
          {showKycForm && (
            <form
              onSubmit={handleKycSubmit}
              className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 text-xs"
            >
              <h3 className="font-bold text-white text-sm">
                Update Profile & Submit / Re-upload ID Proof
              </h3>
              {kycMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  ✓ {kycMsg}
                </div>
              )}
              {kycErr && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  ⚠️ {kycErr}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Full Legal Name</label>
                  <input
                    type="text"
                    required
                    disabled={isReadOnly}
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Re-enter Gov / Student ID {profile?.isApproved ? "(Locked after approval)" : "(Optional update)"}
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly || profile?.isApproved}
                    value={editGovId}
                    onChange={(e) => setEditGovId(e.target.value)}
                    placeholder={profile?.isApproved ? "Verified & Locked" : "Enter updated ID if corrected"}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Attach / Re-upload ID Proof Document
                  </label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    disabled={isReadOnly}
                    onChange={handleFilePick}
                    className="w-full text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600/20 file:text-indigo-300 hover:file:bg-indigo-600/30"
                  />
                  {idProofName && (
                    <span className="text-[11px] text-emerald-400 block mt-1">
                      Attached: {idProofName}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Verification Notes / Document Reference
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={idProofNote}
                    onChange={(e) => setIdProofNote(e.target.value)}
                    placeholder="e.g. Student Card #2026 / Passport last 4 digits"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingKyc || isReadOnly}
                  title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
                  className="py-2 px-5 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingKyc
                    ? "Submitting..."
                    : isRejected
                    ? "Re-submit KYC Proof for Review"
                    : "Save Profile Updates"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Cryptographic Identity & Optional Web3 Wallet Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-500 block mb-1">Anonymized Voter Hash (On-Chain Nullifier)</span>
            <span className="font-mono text-indigo-400 text-xs break-all">
              {profile?.voterHash || "Not generated"}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-500 block mb-1">
              Hybrid Voting Wallet (Standard Relayer = Default)
            </span>
            <span className="font-mono text-slate-300 text-xs">
              {profile?.walletAddress
                ? `Linked: ${shortenAddress(profile.walletAddress, 8)}`
                : "No wallet linked (Standard 1-Click Gasless Voting active)"}
            </span>
          </div>
        </div>

        {/* Optional Web3 Wallet Linking Form */}
        <div className="pt-4 border-t border-slate-800/80">
          <form onSubmit={handleLinkWallet} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              disabled={isReadOnly}
              value={newWallet}
              onChange={(e) => setNewWallet(e.target.value)}
              placeholder={
                isConnected && account
                  ? `Connected MetaMask: ${account}`
                  : "Link optional MetaMask address (0x...) for Advanced Web3 Mode"
              }
              className="flex-1 px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {!isConnected && (
              <button
                type="button"
                onClick={connectWallet}
                className="py-2 px-4 rounded-xl text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all"
              >
                🦊 Connect MetaMask
              </button>
            )}
            <button
              type="submit"
              disabled={isReadOnly}
              title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
              className="py-2 px-4 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 transition-all border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Link Wallet
            </button>
          </form>
          {walletMsg && <span className="text-xs text-emerald-400 mt-2 block">{walletMsg}</span>}
        </div>
      </div>

      {/* Portal Section Navigation Tabs */}
      <div className="flex flex-wrap bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs gap-1.5">
        <button
          type="button"
          onClick={() => switchTab("ballots")}
          className={`px-4 py-2 rounded-xl font-semibold transition-all ${
            activeTab === "ballots"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          🗳️ Ballots & Live Turnout ({elections.length})
        </button>
        <button
          type="button"
          onClick={() => switchTab("compare")}
          className={`px-4 py-2 rounded-xl font-semibold transition-all ${
            activeTab === "compare"
              ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          🏛️ Candidate Manifesto & Compare
        </button>
        <button
          type="button"
          onClick={() => switchTab("history")}
          className={`px-4 py-2 rounded-xl font-semibold transition-all ${
            activeTab === "history"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          📜 Voting History & Ended Results ({history.length})
        </button>
        <button
          type="button"
          onClick={() => switchTab("verify")}
          className={`px-4 py-2 rounded-xl font-semibold transition-all ${
            activeTab === "verify"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          🔍 Verify My Receipt
        </button>
        <button
          type="button"
          onClick={() => switchTab("alerts")}
          className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === "alerts"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <span>🔔 Alerts & Reminders</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px]">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: Active Ballots & Turnout Monitor */}
      {activeTab === "ballots" && (
        <div className="space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading elections...</p>
          ) : elections.length === 0 ? (
            <p className="text-sm text-slate-500">No elections available right now.</p>
          ) : (
            <div className="space-y-4">
              {elections.map((elec) => {
                const hasVoted = profile?.hasVotedElections?.includes(elec.onChainElectionId);
                const turnout = elec.turnout;
                return (
                  <div
                    key={elec.onChainElectionId}
                    className="p-5 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
                            Phase: {elec.phase}
                          </span>
                          <CountdownTimer
                            phase={elec.phase}
                            startDate={elec.startDate}
                            endDate={elec.endDate}
                          />
                          <span className="text-xs text-slate-500 font-mono">
                            ID #{elec.onChainElectionId}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white">{elec.title}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {elec.description || "General democratic election"}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        {hasVoted && (
                          <span className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            ✓ Ballot Cast
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenComparison(elec.onChainElectionId)}
                          className="py-2 px-3.5 rounded-xl text-xs font-semibold text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition-all"
                        >
                          Manifesto & Compare ({elec.candidatesCount ?? elec.candidates?.length ?? 0})
                        </button>
                        {elec.phase === "Voting" ? (
                          <Link
                            to={`/election/${elec.onChainElectionId}`}
                            className="py-2 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md shadow-indigo-600/30"
                          >
                            {hasVoted ? "Inspect Ballot & Candidates" : "Compare & Vote Now 🗳️"}
                          </Link>
                        ) : elec.phase === "Ended" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEndedBreakdownId(
                                endedBreakdownId === elec.onChainElectionId
                                  ? null
                                  : elec.onChainElectionId
                              );
                            }}
                            className="py-2 px-4 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all"
                          >
                            {endedBreakdownId === elec.onChainElectionId
                              ? "Hide Final Results"
                              : "View Final Results 📊"}
                          </button>
                        ) : (
                          <Link
                            to={`/election/${elec.onChainElectionId}`}
                            className="py-2 px-4 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700"
                          >
                            Preview Candidates →
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Turnout Progress Bar */}
                    {turnout && (
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Voter Turnout</span>
                          <span className="font-mono text-slate-300">
                            {turnout.votesCast} of {turnout.verifiedVoters} verified voters (
                            <strong className="text-indigo-400">{turnout.percentage}%</strong>)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500"
                            style={{
                              width: `${Math.max(
                                turnout.percentage,
                                turnout.votesCast > 0 ? 3 : 0
                              )}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* Inline Unlocked Ended Breakdown */}
                    {elec.phase === "Ended" && endedBreakdownId === elec.onChainElectionId && (
                      <div className="pt-3 border-t border-slate-800">
                        <ElectionEndedBreakdown
                          electionId={elec.onChainElectionId}
                          onSelectTxHash={handleVerifyHashJump}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Candidate Manifesto & Side-by-Side Comparison directly in Public Portal */}
      {activeTab === "compare" && (() => {
        const selectedElec =
          elections.find((e) => e.onChainElectionId.toString() === compareElectionId) ||
          elections[0];
        const selectedHasVoted = selectedElec
          ? profile?.hasVotedElections?.includes(selectedElec.onChainElectionId)
          : false;

        return (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-400">
                  Informed Constituent Decision
                </span>
                <h2 className="text-xl font-bold text-white mt-0.5">
                  Candidate Manifesto & Side-by-Side Comparison
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Inspect each candidate's full bio, party/department, and agenda points, or compare 2–3 candidates side by side before voting.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <select
                  value={selectedElec ? selectedElec.onChainElectionId.toString() : ""}
                  onChange={(e) => {
                    setCompareElectionId(e.target.value);
                    setSearchParams({ tab: "compare", electionId: e.target.value });
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  {elections.map((elec) => (
                    <option key={elec.onChainElectionId} value={elec.onChainElectionId.toString()}>
                      #{elec.onChainElectionId} - {elec.title} ({elec.phase})
                    </option>
                  ))}
                </select>

                {selectedElec && selectedElec.phase === "Voting" && (
                  <Link
                    to={`/election/${selectedElec.onChainElectionId}`}
                    className="py-2 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md shadow-indigo-600/30"
                  >
                    Open Voting Room 🗳️
                  </Link>
                )}
              </div>
            </div>

            {selectedElec ? (
              <CandidateComparisonSection
                candidates={selectedElec.candidates || []}
                isVotingPhase={selectedElec.phase === "Voting"}
                hasVoted={selectedHasVoted}
                votePath={`/election/${selectedElec.onChainElectionId}`}
                isReadOnly={isReadOnly}
              />
            ) : (
              <div className="text-center py-12 bg-slate-900 rounded-2xl border border-slate-800 text-slate-400 text-sm">
                No elections available to inspect candidates.
              </div>
            )}
          </div>
        );
      })()}

      {/* TAB 3: Past Elections & Voting History */}
      {activeTab === "history" && (
        <VotingHistorySection
          history={history}
          onSelectReceipt={setSelectedReceipt}
          onVerifyHash={handleVerifyHashJump}
        />
      )}

      {/* TAB 3: Verify My Receipt */}
      {activeTab === "verify" && <ReceiptVerifierWidget initialTxHash={verifierTxHash} />}

      {/* TAB 4: Automated Notifications & Reminders */}
      {activeTab === "alerts" && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Automated Notifications & Reminders</h2>
              <p className="text-xs text-slate-400">
                Real-time portal and email-dispatched alerts for KYC approvals, ballot openings, closing reminders, and instant vote receipts.
              </p>
            </div>
            {notifications.length > 0 && unreadCount > 0 && (
              <button
                type="button"
                disabled={isReadOnly}
                onClick={handleMarkAllRead}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-50"
              >
                Mark All Read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">No notifications yet.</p>
          ) : (
            <div className="space-y-3">
              {notifications.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    alert.read
                      ? "bg-slate-950/60 border-slate-800/80 text-slate-400"
                      : "bg-slate-950 border-indigo-500/30 text-slate-200"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      {!alert.read && (
                        <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0"></span>
                      )}
                      <span className="font-bold text-white">{alert.title}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-300">
                        {alert.channel}
                      </span>
                    </div>
                    <p className="leading-relaxed">{alert.message}</p>
                    <span className="text-[11px] text-slate-500 block">
                      {formatDate(alert.timestamp)}
                    </span>
                  </div>

                  {alert.txHash && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <CopyButton
                        text={alert.txHash}
                        label="Copy Tx"
                        copiedLabel="Copied ✓"
                        title="Copy transaction hash"
                      />
                      <button
                        type="button"
                        onClick={() => handleVerifyHashJump(alert.txHash)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 font-semibold"
                      >
                        Verify Tx 🔍
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <VoteReceiptModal
        isOpen={Boolean(selectedReceipt)}
        onClose={() => setSelectedReceipt(null)}
        receipt={selectedReceipt}
      />

      <BlockchainGuideModal isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
