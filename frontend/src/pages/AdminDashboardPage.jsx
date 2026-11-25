import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../context/WalletContext";
import { useVotingContract } from "../hooks/useVotingContract";
import { authAPI, electionAPI, candidateAPI, voterAPI } from "../services/api";
import { parseErrorMessage, formatDate, shortenHash, shortenAddress } from "../utils/format";
import ReadOnlyBanner from "../components/ReadOnlyBanner";
import ReceiptVerifierWidget from "../components/ReceiptVerifierWidget";
import CopyButton from "../components/CopyButton";

const PHASE_MAP = {
  Created: 0,
  Registration: 1,
  Voting: 2,
  Ended: 3,
};

export default function AdminDashboardPage() {
  const { user, isReadOnly, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { account, isConnected, isConnecting, hasMetaMask, connectWallet } = useWallet();
  const { createElectionDirect, setElectionPhaseDirect } = useVotingContract();

  const initialTab = searchParams.get("tab") || "elections";
  const initialTxHash = searchParams.get("txHash") || "";
  const [activeTab, setActiveTab] = useState(
    ["elections", "nominations", "candidates", "voters", "accounts", "verify"].includes(initialTab)
      ? initialTab
      : "elections"
  );
  const [verifierTxHash, setVerifierTxHash] = useState(initialTxHash);
  const [signingMode, setSigningMode] = useState("relayer"); // 'relayer' | 'metamask'
  const [isLinkingWallet, setIsLinkingWallet] = useState(false);

  const [elections, setElections] = useState([]);
  const [voters, setVoters] = useState([]);
  const [nominations, setNominations] = useState([]);
  const [allCandidates, setAllCandidates] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("");
  const [statusTxHash, setStatusTxHash] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Create Election Form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Add Candidate Form
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateParty, setCandidateParty] = useState("");
  const [candidateManifesto, setCandidateManifesto] = useState("");

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [elecRes, voterRes, nomRes, allCandRes, adminRes] = await Promise.all([
        electionAPI.list(),
        voterAPI.listVoters(),
        candidateAPI.listNominations(),
        candidateAPI.listAllAdmin(),
        authAPI.listAdmins(),
      ]);
      if (elecRes.data.success) {
        const fetched = elecRes.data.elections;
        setElections(fetched);
        if (fetched.length > 0) {
          const stillExists = fetched.some(
            (e) => e.onChainElectionId.toString() === selectedElectionId
          );
          if (!selectedElectionId || !stillExists) {
            setSelectedElectionId(fetched[0].onChainElectionId.toString());
          }
        } else {
          setSelectedElectionId("");
        }
      }
      if (voterRes.data.success) setVoters(voterRes.data.voters);
      if (nomRes.data.success) setNominations(nomRes.data.candidates);
      if (allCandRes.data.success) setAllCandidates(allCandRes.data.candidates);
      if (adminRes.data.success) setAdmins(adminRes.data.admins);
    } catch (e) {
      console.warn("Error loading admin data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    const t = searchParams.get("tab");
    const h = searchParams.get("txHash");
    if (t && ["elections", "nominations", "candidates", "voters", "accounts", "verify"].includes(t)) {
      setActiveTab(t);
    }
    if (h) {
      setVerifierTxHash(h);
    }
  }, [searchParams]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    if (tab === "verify" && verifierTxHash) {
      setSearchParams({ tab, txHash: verifierTxHash });
    } else {
      setSearchParams({ tab });
    }
  };

  const blockIfReadOnly = () => {
    if (!isReadOnly) return false;
    setStatusMsg("");
    setErrorMsg(
      "Read-Only Explorer Mode: Administrative actions are disabled on the default preview account."
    );
    return true;
  };

  const handleLinkMetaMaskWallet = async () => {
    if (blockIfReadOnly()) return;
    setStatusMsg("");
    setErrorMsg("");
    setIsLinkingWallet(true);
    try {
      const targetAddress = account || (await connectWallet());
      if (!targetAddress) {
        setErrorMsg(
          hasMetaMask
            ? "MetaMask connection was cancelled. You can continue using Backend Relayer mode."
            : "MetaMask extension not installed. Elections and voter approvals will continue working via Backend Relayer mode."
        );
        return;
      }

      const res = await authAPI.linkAdminWallet(targetAddress);
      if (res.data.success) {
        await refreshUser();
        setStatusMsg(
          `MetaMask wallet ${shortenAddress(res.data.admin.walletAddress)} bound to your Admin profile!`
        );
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    } finally {
      setIsLinkingWallet(false);
    }
  };

  const handleCreateElection = async (e) => {
    e.preventDefault();
    if (blockIfReadOnly()) return;
    setStatusMsg("");
    setStatusTxHash("");
    setErrorMsg("");
    try {
      let extraPayload = {};
      if (signingMode === "metamask" && isConnected) {
        try {
          const directRes = await createElectionDirect(title);
          extraPayload = {
            txHash: directRes.txHash,
            onChainElectionId: directRes.onChainElectionId,
          };
        } catch (directErr) {
          setErrorMsg(
            `Direct MetaMask signing failed (${parseErrorMessage(
              directErr
            )}). Switch to Backend Relayer mode or connect an authorized owner/relayer wallet.`
          );
          return;
        }
      }

      const res = await electionAPI.create({
        title,
        description,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        ...extraPayload,
      });
      if (res.data.success) {
        setStatusTxHash(res.data.txHash || "");
        setStatusMsg(
          `Election created on-chain${extraPayload.txHash ? " via MetaMask" : " via Relayer"}! Tx: ${
            res.data.txHash || "Local"
          }`
        );
        setTitle("");
        setDescription("");
        setStartDate("");
        setEndDate("");
        await loadAllData();
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    }
  };

  const handlePhaseChange = async (electionId, newPhase) => {
    if (blockIfReadOnly()) return;
    setStatusMsg("");
    setStatusTxHash("");
    setErrorMsg("");
    try {
      let extraPayload = {};
      if (signingMode === "metamask" && isConnected) {
        try {
          const directRes = await setElectionPhaseDirect(electionId, PHASE_MAP[newPhase]);
          extraPayload = { txHash: directRes.txHash };
        } catch (directErr) {
          setErrorMsg(
            `Direct MetaMask phase update failed (${parseErrorMessage(
              directErr
            )}). Switch to Backend Relayer mode or connect an authorized owner/relayer wallet.`
          );
          return;
        }
      }

      const res = await electionAPI.updatePhase(electionId, newPhase, extraPayload);
      if (res.data.success) {
        setStatusTxHash(res.data.txHash || "");
        setStatusMsg(
          `Phase updated to ${newPhase}${extraPayload.txHash ? " via MetaMask" : " via Relayer"}`
        );
        await loadAllData();
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    }
  };

  const handleAddCandidate = async (e) => {
    e.preventDefault();
    if (blockIfReadOnly()) return;
    setStatusMsg("");
    setErrorMsg("");
    try {
      const res = await candidateAPI.add({
        electionId: selectedElectionId,
        name: candidateName,
        party: candidateParty,
        manifesto: candidateManifesto,
      });
      if (res.data.success) {
        setStatusMsg(`Candidate ${candidateName} added!`);
        setCandidateName("");
        setCandidateParty("");
        setCandidateManifesto("");
        await loadAllData();
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    }
  };

  const handleApproveVoter = async (voterId) => {
    if (blockIfReadOnly()) return;
    setStatusMsg("");
    setStatusTxHash("");
    setErrorMsg("");
    try {
      const res = await voterAPI.approveVoter(voterId, selectedElectionId);
      if (res.data.success) {
        const approvalTx =
          res.data.txHash || res.data.onChainSyncResult?.txHash || res.data.voter?.syncTxHash || "";
        setStatusTxHash(approvalTx);
        setStatusMsg(
          approvalTx
            ? `Voter approved and hash registered on-chain! Tx: ${shortenHash(approvalTx, 10)}`
            : `Voter approved and hash registered on-chain!`
        );
        await loadAllData();
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    }
  };

  const handleRejectVoter = async (voter) => {
    if (blockIfReadOnly()) return;
    const reason = window.prompt(
      `Enter KYC rejection reason for "${voter.fullName}" (voter will be able to update profile & re-upload ID proof):`,
      "ID proof document could not be verified. Please re-submit a clear ID proof."
    );
    if (reason === null) return;
    setStatusMsg("");
    setStatusTxHash("");
    setErrorMsg("");
    try {
      const res = await voterAPI.rejectVoter(voter._id, reason);
      if (res.data.success) {
        setStatusMsg(res.data.message);
        await loadAllData();
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    }
  };

  const handleReviewNomination = async (candidateId, action) => {
    if (blockIfReadOnly()) return;
    setStatusMsg("");
    setStatusTxHash("");
    setErrorMsg("");
    let feedback = "";
    if (action === "reject") {
      feedback = window.prompt(
        "Enter feedback / reason for rejection (the candidate will see this upon login and can reapply):",
        "Manifesto details require clarification before ballot inclusion."
      );
      if (feedback === null) return; // user cancelled prompt
    }
    try {
      const res = await candidateAPI.reviewNomination(candidateId, { action, feedback });
      if (res.data.success) {
        setStatusTxHash(res.data.txHash || "");
        setStatusMsg(res.data.message);
        await loadAllData();
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    }
  };

  const handleDeleteElection = async (elec) => {
    if (blockIfReadOnly()) return;
    if (
      !window.confirm(
        `Delete election "#${elec.onChainElectionId} - ${elec.title}"? This removes the election and manual candidates from the platform database.`
      )
    ) {
      return;
    }
    setStatusMsg("");
    setErrorMsg("");
    try {
      const res = await electionAPI.delete(elec._id);
      if (res.data.success) {
        setStatusMsg(res.data.message);
        await loadAllData();
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    }
  };

  const handleDeleteCandidate = async (cand) => {
    if (blockIfReadOnly()) return;
    if (cand.isReadOnly) {
      setStatusMsg("");
      setErrorMsg("Read-only demo accounts are protected and cannot be deleted by anyone.");
      return;
    }
    if (
      !window.confirm(
        `Delete candidate "${cand.name}"${cand.party ? ` (${cand.party})` : ""}?`
      )
    ) {
      return;
    }
    setStatusMsg("");
    setErrorMsg("");
    try {
      const res = await candidateAPI.delete(cand._id);
      if (res.data.success) {
        setStatusMsg(res.data.message);
        await loadAllData();
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    }
  };

  const handleDeleteVoter = async (voter) => {
    if (blockIfReadOnly()) return;
    if (voter.isReadOnly) {
      setStatusMsg("");
      setErrorMsg("Read-only demo accounts are protected and cannot be deleted by anyone.");
      return;
    }
    if (
      !window.confirm(
        `Delete voter "${voter.fullName}" (${voter.email}) from the voter registry?`
      )
    ) {
      return;
    }
    setStatusMsg("");
    setErrorMsg("");
    try {
      const res = await voterAPI.deleteVoter(voter._id);
      if (res.data.success) {
        setStatusMsg(res.data.message);
        await loadAllData();
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    }
  };

  const handleDeleteAdmin = async (targetAdmin) => {
    if (blockIfReadOnly()) return;
    if (targetAdmin.isReadOnly) {
      setStatusMsg("");
      setErrorMsg("Read-only demo accounts are protected and cannot be deleted by anyone.");
      return;
    }
    const isSelf =
      targetAdmin._id === (user?.id || user?._id) || targetAdmin.email === user?.email;
    const confirmMsg = isSelf
      ? `Delete YOUR OWN Admin account "${targetAdmin.fullName}" (${targetAdmin.email})?\n\nYou will be immediately logged out and redirected to the home page.`
      : `Delete admin account "${targetAdmin.fullName}" (${targetAdmin.email})?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setStatusMsg("");
    setErrorMsg("");
    try {
      const res = await authAPI.deleteAdmin(targetAdmin._id);
      if (res.data.success) {
        if (res.data.selfDeleted || isSelf) {
          logout();
          navigate("/");
          return;
        }
        setStatusMsg(res.data.message);
        await loadAllData();
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <ReadOnlyBanner />

      {/* Admin Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
            Control Center
          </span>
          <h1 className="text-2xl font-bold text-white mt-1">Election Administration</h1>
          <p className="text-xs text-slate-400">Logged in as {user?.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/results"
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all flex items-center space-x-1.5 shadow-sm"
          >
            <span>📊</span>
            <span>View Results & Audit Ledger</span>
          </Link>

          {/* Tab Switcher */}
          <div className="flex flex-wrap bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs gap-1">
            <button
              onClick={() => switchTab("elections")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === "elections"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Elections & Phases
            </button>
            <button
              onClick={() => switchTab("nominations")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center space-x-1.5 ${
                activeTab === "nominations"
                  ? "bg-purple-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>Candidate Nominations</span>
              {nominations.filter((n) => n.approvalStatus === "pending").length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-[10px] text-slate-950 font-bold">
                  {nominations.filter((n) => n.approvalStatus === "pending").length}
                </span>
              )}
            </button>
            <button
              onClick={() => switchTab("candidates")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === "candidates"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Candidates ({allCandidates.length})
            </button>
            <button
              onClick={() => switchTab("voters")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === "voters"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Voter Approvals ({voters.filter((v) => !v.isApproved).length})
            </button>
            <button
              onClick={() => switchTab("accounts")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === "accounts"
                  ? "bg-rose-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Accounts ({admins.length + voters.length + allCandidates.length})
            </button>
            <button
              onClick={() => switchTab("verify")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === "verify"
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🔍 Verify Voter Receipt
            </button>
          </div>
        </div>
      </div>

      {/* Optional MetaMask Wallet Linking & Relayer Fallback Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-white">🦊 Admin Web3 Wallet (Optional)</span>
            {user?.walletAddress ? (
              <span
                title={user.walletAddress}
                className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              >
                Bound: {shortenAddress(user.walletAddress)}
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                No wallet linked — using Backend Relayer
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {hasMetaMask
              ? "Optionally bind MetaMask to your Admin profile to sign on-chain election actions directly in your browser, or keep Backend Relayer mode enabled."
              : "No MetaMask extension detected. Off-chain metadata, voter approvals, and on-chain transactions run seamlessly via the Backend Relayer service."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {hasMetaMask ? (
            <>
              <button
                type="button"
                onClick={handleLinkMetaMaskWallet}
                disabled={isReadOnly || isLinkingWallet || isConnecting}
                title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLinkingWallet || isConnecting
                  ? "Connecting..."
                  : isConnected
                  ? user?.walletAddress?.toLowerCase() === account?.toLowerCase()
                    ? `MetaMask Linked (${shortenAddress(account)})`
                    : `Bind Connected (${shortenAddress(account)})`
                  : "🦊 Connect MetaMask"}
              </button>

              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSigningMode("relayer")}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    signingMode === "relayer"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Backend Relayer (Default)
                </button>
                <button
                  type="button"
                  onClick={() => setSigningMode("metamask")}
                  disabled={!isConnected || isReadOnly}
                  title={
                    !isConnected
                      ? "Connect MetaMask first to enable direct browser signing"
                      : isReadOnly
                      ? "Disabled in Read-Only Explorer Mode"
                      : undefined
                  }
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    signingMode === "metamask"
                      ? "bg-amber-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Direct MetaMask Signing
                </button>
              </div>
            </>
          ) : (
            <span className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              ⚡ Backend Relayer Active (No Extension Mode)
            </span>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex flex-wrap items-center justify-between gap-2">
          <span>{statusMsg}</span>
          {statusTxHash && (
            <CopyButton
              text={statusTxHash}
              label="Copy Tx Hash 📋"
              copiedLabel="Tx Copied ✓"
              title="Copy generated transaction hash"
              className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 transition-colors shrink-0"
            />
          )}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Tab 1: Elections */}
      {activeTab === "elections" && (
        <div className="space-y-8">
          {/* Create Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white mb-4">Create New On-Chain Election</h2>
            <form onSubmit={handleCreateElection} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Election Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 2026 University Student Council Presidential Election"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Description / Guidelines
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Official guidelines and terms for voters..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Scheduled Start Date/Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Scheduled End Date/Time (Optional Countdown)
                  </label>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isReadOnly}
                title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
                className="py-2.5 px-5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Deploy Election to Blockchain
              </button>
            </form>
          </div>

          {/* Phase Management */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white mb-4">Manage Active Election Phases</h2>
            <div className="space-y-4">
              {elections.map((elec) => (
                <div
                  key={elec.onChainElectionId}
                  className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                >
                  <div>
                    <h3 className="font-bold text-white">{elec.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1">
                      <span>ID #{elec.onChainElectionId}</span>
                      <span>Current Phase: <strong className="text-indigo-400">{elec.phase}</strong></span>
                      <span>Candidates: {elec.candidatesCount ?? elec.candidates?.length ?? 0}</span>
                      <span>Total Votes: {elec.totalVotes}</span>
                    </div>
                  </div>

                  {/* Phase & Delete Buttons */}
                  <div className="flex flex-wrap gap-2">
                    {["Created", "Registration", "Voting", "Ended"].map((phaseName) => (
                      <button
                        key={phaseName}
                        onClick={() => handlePhaseChange(elec.onChainElectionId, phaseName)}
                        disabled={elec.phase === phaseName || isReadOnly}
                        title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          elec.phase === phaseName || isReadOnly
                            ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                            : "bg-slate-900 text-slate-300 hover:text-white hover:bg-indigo-600 border border-slate-800"
                        }`}
                      >
                        Set {phaseName}
                      </button>
                    ))}
                    <button
                      onClick={() => handleDeleteElection(elec)}
                      disabled={isReadOnly}
                      title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Delete Election
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Candidates Add & Directory */}
      {activeTab === "candidates" && (
        <div className="space-y-8">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white mb-4">Register Official Candidate</h2>
            <form onSubmit={handleAddCandidate} className="space-y-4 max-w-xl">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Target Election
                </label>
                <select
                  value={selectedElectionId}
                  onChange={(e) => setSelectedElectionId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {elections.map((elec) => (
                    <option key={elec.onChainElectionId} value={elec.onChainElectionId}>
                      #{elec.onChainElectionId} - {elec.title} ({elec.phase})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Candidate Name
                </label>
                <input
                  type="text"
                  required
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="e.g. Maya Lin"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Party / Department / Affiliation
                </label>
                <input
                  type="text"
                  value={candidateParty}
                  onChange={(e) => setCandidateParty(e.target.value)}
                  placeholder="e.g. Progressive Student Union"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Manifesto / Policy Platform
                </label>
                <textarea
                  value={candidateManifesto}
                  onChange={(e) => setCandidateManifesto(e.target.value)}
                  rows={4}
                  placeholder="Key goals, manifesto promises, and credentials..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={isReadOnly}
                title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
                className="py-2.5 px-5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Candidate on Blockchain
              </button>
            </form>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">All Candidates Directory</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage manually added, seeded, and self-nominated candidates across all elections.
                </p>
              </div>
              <span className="text-xs text-slate-400">Total: {allCandidates.length}</span>
            </div>

            {allCandidates.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">No candidates found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Candidate</th>
                      <th className="py-3 px-4">Party</th>
                      <th className="py-3 px-4">Election</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {allCandidates.map((cand) => (
                      <tr key={cand._id} className="hover:bg-slate-950/40">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{cand.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {cand.email || "Manual / Ballot Entry"}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-purple-300">{cand.party || "Independent"}</td>
                        <td className="py-3 px-4">
                          {cand.electionId?.title
                            ? `#${cand.onChainElectionId} - ${cand.electionId.title}`
                            : cand.onChainElectionId
                            ? `Election #${cand.onChainElectionId}`
                            : "Unassigned"}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] border ${
                              cand.isApproved || cand.approvalStatus === "approved"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : cand.approvalStatus === "pending"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : cand.approvalStatus === "rejected"
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                          >
                            {cand.isApproved ? "approved" : cand.approvalStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeleteCandidate(cand)}
                            disabled={isReadOnly || Boolean(cand.isReadOnly)}
                            title={
                              cand.isReadOnly
                                ? "Read-Only Demo account is restricted from deletion by anyone"
                                : isReadOnly
                                ? "Disabled in Read-Only Explorer Mode"
                                : undefined
                            }
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {cand.isReadOnly ? "🔒 Protected" : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Candidate Self-Nominations */}
      {activeTab === "nominations" && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Candidate Self-Nominations</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Review candidate registrations, verify locked party affiliations, and approve candidates onto the on-chain ballot.
              </p>
            </div>
            <span className="text-xs text-slate-400">Total Registered Candidates: {nominations.length}</span>
          </div>

          {nominations.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              No self-registered candidates found. Candidates can register at /candidate-register.
            </p>
          ) : (
            <div className="space-y-4">
              {nominations.map((nom) => (
                <div
                  key={nom._id}
                  className="p-5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all space-y-4"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-base font-bold text-white">{nom.name}</h3>
                        <span className="text-xs text-slate-400">({nom.email})</span>
                        {nom.onChainId && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            On-Chain #{nom.onChainId}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                        <span className="text-slate-400">
                          Election:{" "}
                          <span className="text-white font-semibold">
                            {nom.electionId?.title || `#${nom.onChainElectionId || "Unselected"}`}
                          </span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center space-x-1">
                          <span className="text-slate-400">Party:</span>
                          <span className="font-semibold text-purple-300">{nom.party}</span>
                          {nom.partyLocked && (
                            <span className="text-[10px] text-amber-400 font-semibold" title="Party locked after approval request">
                              🔒 (Locked)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {nom.approvalStatus === "approved" ? (
                        <span className="px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          ✓ Approved On-Chain
                        </span>
                      ) : nom.approvalStatus === "pending" ? (
                        <span className="px-3 py-1 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center space-x-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                          <span>
                            {nom.partyRequestCount > 1
                              ? "🔄 Reapplication Pending"
                              : "Pending Approval"}
                          </span>
                        </span>
                      ) : nom.approvalStatus === "rejected" ? (
                        <span className="px-3 py-1 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          Rejected (Can Reapply)
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-xl text-xs font-medium text-slate-500 bg-slate-800">
                          Draft
                        </span>
                      )}
                    </div>
                  </div>

                  {nom.manifesto && (
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 text-xs text-slate-300">
                      <span className="font-semibold text-slate-400 block mb-1">Manifesto Platform:</span>
                      <p className="line-clamp-3">{nom.manifesto}</p>
                    </div>
                  )}

                  {nom.adminFeedback && (
                    <div className={`p-3 rounded-xl text-xs border ${
                      nom.approvalStatus === "rejected"
                        ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
                        : "bg-slate-900 border-slate-800 text-slate-300"
                    }`}>
                      <span className="font-semibold text-slate-400 block mb-0.5">Admin Note / Feedback:</span>
                      <p>{nom.adminFeedback}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-900">
                    <div>
                      {nom.approvalStatus === "rejected" && (
                        <span className="text-[11px] text-slate-400 italic">
                          Awaiting candidate reapplication or manual override:
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {nom.approvalStatus !== "approved" && (
                        <>
                          <button
                            onClick={() => handleReviewNomination(nom._id, "reject")}
                            disabled={isReadOnly}
                            title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {nom.approvalStatus === "rejected" ? "Update Rejection Note" : "Reject Nomination"}
                          </button>
                          <button
                            onClick={() => handleReviewNomination(nom._id, "approve")}
                            disabled={isReadOnly}
                            title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
                            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Approve & Mint to Smart Contract 🏛️
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteCandidate(nom)}
                        disabled={isReadOnly || Boolean(nom.isReadOnly)}
                        title={
                          nom.isReadOnly
                            ? "Read-Only Demo account is restricted from deletion by anyone"
                            : isReadOnly
                            ? "Disabled in Read-Only Explorer Mode"
                            : undefined
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {nom.isReadOnly ? "🔒 Protected Demo" : "Delete Candidate"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Voter Approvals */}
      {activeTab === "voters" && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Constituent Verification Desk</h2>
            <span className="text-xs text-slate-400">Total Voters: {voters.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Constituent</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Voter Hash</th>
                  <th className="py-3 px-4">Receipt Hash</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {voters.map((voter) => (
                  <tr key={voter._id} className="hover:bg-slate-950/40">
                    <td className="py-3 px-4 font-semibold text-white">
                      <div>{voter.fullName}</div>
                      {voter.idProofName && (
                        <div className="text-[10px] text-indigo-300 font-normal">
                          ID Proof: {voter.idProofName}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">{voter.email}</td>
                    <td className="py-3 px-4 font-mono text-indigo-400">
                      {shortenHash(voter.voterHash, 6)}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {voter.receiptHash ? (
                        <div className="inline-flex items-center gap-2 text-emerald-300">
                          <span>{shortenHash(voter.receiptHash, 6)}</span>
                          <CopyButton
                            text={voter.receiptHash}
                            label="Copy"
                            copiedLabel="Copied ✓"
                            title="Copy voter receipt hash"
                          />
                        </div>
                      ) : (
                        <span className="text-slate-500 font-sans text-[11px]">
                          No vote cast yet
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {voter.isApproved ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {voter.kycStatus === "synced_on_chain" ? "Synced On-Chain" : "Approved"}
                        </span>
                      ) : voter.kycStatus === "rejected" ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          Rejected
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Pending KYC
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {!voter.isApproved && (
                          <>
                            <button
                              onClick={() => handleApproveVoter(voter._id)}
                              disabled={isReadOnly}
                              title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Approve & Whitelist Hash
                            </button>
                            <button
                              onClick={() => handleRejectVoter(voter)}
                              disabled={isReadOnly}
                              title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-600 text-amber-400 hover:text-white border border-amber-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Reject KYC
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDeleteVoter(voter)}
                          disabled={isReadOnly || Boolean(voter.isReadOnly)}
                          title={
                            voter.isReadOnly
                              ? "Read-Only Demo account is restricted from deletion by anyone"
                              : isReadOnly
                              ? "Disabled in Read-Only Explorer Mode"
                              : undefined
                          }
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {voter.isReadOnly ? "🔒 Protected" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: All User Accounts Directory (Admins including self, Candidates, Voters) */}
      {activeTab === "accounts" && (
        <div className="space-y-8">
          {/* Admin Accounts Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">🛡️ Admin Accounts</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage election administrator accounts. Deleting your own account logs you out and redirects to Home.
                </p>
              </div>
              <span className="text-xs text-slate-400">Total Admins: {admins.length}</span>
            </div>

            {admins.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No admin accounts found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Wallet</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {admins.map((adm) => {
                      const isSelf =
                        adm._id === (user?.id || user?._id) || adm.email === user?.email;
                      return (
                        <tr key={adm._id} className="hover:bg-slate-950/40">
                          <td className="py-3 px-4 font-semibold text-white">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{adm.fullName}</span>
                              {isSelf && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  You
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">{adm.email}</td>
                          <td className="py-3 px-4 font-mono text-slate-400">
                            {adm.walletAddress ? shortenAddress(adm.walletAddress) : "Relayer Mode"}
                          </td>
                          <td className="py-3 px-4">
                            {adm.isReadOnly ? (
                              <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                Read-Only Demo
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Full Admin
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleDeleteAdmin(adm)}
                              disabled={isReadOnly || Boolean(adm.isReadOnly)}
                              title={
                                adm.isReadOnly
                                  ? "Read-Only Demo account is restricted from deletion by anyone"
                                  : isReadOnly
                                  ? "Disabled in Read-Only Explorer Mode"
                                  : undefined
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                isSelf
                                  ? "bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border-rose-500/40"
                                  : "bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border-rose-500/30"
                              }`}
                            >
                              {adm.isReadOnly
                                ? "🔒 Protected"
                                : isSelf
                                ? "Delete My Account"
                                : "Delete"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Public Voter Accounts Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">🗳️ Public Voter Accounts</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Remove any registered voter account from the portal.
                </p>
              </div>
              <span className="text-xs text-slate-400">Total Voters: {voters.length}</span>
            </div>

            {voters.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No voter accounts found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Full Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {voters.map((voter) => (
                      <tr key={voter._id} className="hover:bg-slate-950/40">
                        <td className="py-3 px-4 font-semibold text-white">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{voter.fullName}</span>
                            {voter.isReadOnly && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                Read-Only Demo
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">{voter.email}</td>
                        <td className="py-3 px-4">
                          {voter.isApproved ? "Approved" : voter.kycStatus === "rejected" ? "Rejected" : "Pending KYC"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeleteVoter(voter)}
                            disabled={isReadOnly || Boolean(voter.isReadOnly)}
                            title={
                              voter.isReadOnly
                                ? "Read-Only Demo account is restricted from deletion by anyone"
                                : isReadOnly
                                ? "Disabled in Read-Only Explorer Mode"
                                : undefined
                            }
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {voter.isReadOnly ? "🔒 Protected" : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Candidate Accounts Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">🏛️ Candidate Accounts & Entries</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Remove any self-registered or manually added candidate profile.
                </p>
              </div>
              <span className="text-xs text-slate-400">Total Candidates: {allCandidates.length}</span>
            </div>

            {allCandidates.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No candidate accounts found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Email / Entry</th>
                      <th className="py-3 px-4">Party</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {allCandidates.map((cand) => (
                      <tr key={cand._id} className="hover:bg-slate-950/40">
                        <td className="py-3 px-4 font-semibold text-white">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{cand.name}</span>
                            {cand.isReadOnly && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                Read-Only Demo
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">{cand.email || "Manual / Ballot Entry"}</td>
                        <td className="py-3 px-4 text-purple-300">{cand.party || "Independent"}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeleteCandidate(cand)}
                            disabled={isReadOnly || Boolean(cand.isReadOnly)}
                            title={
                              cand.isReadOnly
                                ? "Read-Only Demo account is restricted from deletion by anyone"
                                : isReadOnly
                                ? "Disabled in Read-Only Explorer Mode"
                                : undefined
                            }
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {cand.isReadOnly ? "🔒 Protected" : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Tab 5: Verify Voter Receipt */}
      {activeTab === "verify" && (
        <ReceiptVerifierWidget
          initialTxHash={verifierTxHash}
          title="Verify Voter Receipt"
          badge="Commission Receipt Verification"
          description="Paste any voter transaction hash (txHash) below to confirm blockchain block inclusion and audit record authenticity without exposing candidate selection."
        />
      )}
    </div>
  );
}
