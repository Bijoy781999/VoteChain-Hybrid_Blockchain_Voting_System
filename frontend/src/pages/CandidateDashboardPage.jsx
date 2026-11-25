import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { candidateAPI, electionAPI, voteAPI } from "../services/api";
import { parseErrorMessage, formatDate } from "../utils/format";
import ReadOnlyBanner from "../components/ReadOnlyBanner";
import VotingHistorySection from "../components/VotingHistorySection";
import ReceiptVerifierWidget from "../components/ReceiptVerifierWidget";
import VoteReceiptModal from "../components/VoteReceiptModal";

export default function CandidateDashboardPage() {
  const { user, refreshUser, isReadOnly } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get("tab") || "profile";
  const initialTxHash = searchParams.get("txHash") || "";

  const [activeTab, setActiveTab] = useState(
    ["profile", "history", "verify"].includes(initialTab) ? initialTab : "profile"
  );
  const [verifierTxHash, setVerifierTxHash] = useState(initialTxHash);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  const [candidate, setCandidate] = useState(null);
  const [elections, setElections] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState("");
  const [party, setParty] = useState("");
  const [manifesto, setManifesto] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [selectedElectionId, setSelectedElectionId] = useState("");

  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [candRes, elecRes, histRes] = await Promise.all([
        candidateAPI.getProfile(),
        electionAPI.list(),
        voteAPI.getHistory(),
      ]);

      if (candRes.data.success) {
        const c = candRes.data.candidate;
        setCandidate(c);
        setName(c.name || "");
        setParty(c.party || "Independent");
        setManifesto(c.manifesto || "");
        setPhotoUrl(c.photoUrl || "");
        setSelectedElectionId(
          c.electionId?._id || c.electionId || c.onChainElectionId?.toString() || ""
        );
      }

      if (elecRes.data.success) {
        setElections(elecRes.data.elections);
      }

      if (histRes.data.success) {
        setHistory(histRes.data.history);
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const t = searchParams.get("tab");
    const h = searchParams.get("txHash");
    if (t && ["profile", "history", "verify"].includes(t)) {
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

  const handleVerifyHashJump = (hash) => {
    setVerifierTxHash(hash);
    setActiveTab("verify");
    setSearchParams({ tab: "verify", txHash: hash });
  };

  const isApproved = candidate?.approvalStatus === "approved" || candidate?.isApproved;
  const isRejected = candidate?.approvalStatus === "rejected";
  const isPending = candidate?.approvalStatus === "pending";
  const reapplyCount = candidate?.reapplicationCount || 0;
  const reapplyLimitReached = isRejected && reapplyCount >= 2;

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setStatusMsg("");
    setErrorMsg("");
    if (isReadOnly) {
      setErrorMsg("Read-Only Explorer Mode: Editing candidate details is disabled for preview accounts.");
      return;
    }
    setIsSaving(true);

    try {
      const payload = {
        manifesto,
        photoUrl,
      };

      // Only send name, party, electionId if NOT already approved on-chain
      if (!isApproved) {
        payload.name = name;
        payload.party = party;
        payload.electionId = selectedElectionId;
      }

      const res = await candidateAPI.updateProfile(payload);
      if (res.data.success) {
        setStatusMsg(res.data.message || "Candidate profile updated successfully!");
        await loadData();
        await refreshUser();
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestApproval = async () => {
    setStatusMsg("");
    setErrorMsg("");

    if (isReadOnly) {
      setErrorMsg("Read-Only Explorer Mode: Submitting nomination approval is disabled for preview accounts.");
      return;
    }

    if (reapplyLimitReached) {
      setErrorMsg("Maximum reapplication limit reached (2 re-applications allowed).");
      return;
    }

    if (!selectedElectionId) {
      setErrorMsg("Please select an election to contest before requesting approval.");
      return;
    }

    const confirmPrompt = isRejected
      ? `Do you want to submit nomination reapplication #${reapplyCount + 1} of 2 to the election administrator for re-evaluation?`
      : "Are you sure you want to request administrator approval?\n\nOnce submitted, your nomination and party will be placed under official review.";

    if (!window.confirm(confirmPrompt)) {
      return;
    }

    setIsSubmittingApproval(true);

    try {
      const res = await candidateAPI.requestApproval();
      if (res.data.success) {
        setStatusMsg(res.data.message);
        await loadData();
        await refreshUser();
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-24 text-slate-400 text-sm flex items-center justify-center space-x-2">
        <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping"></span>
        <span>Loading Candidate Headquarters...</span>
      </div>
    );
  }

  const getStatusBadge = () => {
    switch (candidate?.approvalStatus) {
      case "approved":
        return (
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Official Ballot Candidate (Approved)</span>
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span>
              {candidate?.partyRequestCount > 1
                ? "Reapplication Pending Admin Review"
                : "Nomination Pending Admin Review"}
            </span>
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span>⚠️</span>
            <span>Nomination Rejected (Reapply Allowed)</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            <span>📝</span>
            <span>Draft Nomination (Not Yet Submitted)</span>
          </span>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <ReadOnlyBanner />

      {/* Portal Section Navigation Tabs */}
      <div className="flex flex-wrap bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs gap-1.5">
        <button
          type="button"
          onClick={() => switchTab("profile")}
          className={`px-4 py-2 rounded-xl font-semibold transition-all ${
            activeTab === "profile"
              ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          🏛️ Nomination & Campaign
        </button>
        <button
          type="button"
          onClick={() => switchTab("history")}
          className={`px-4 py-2 rounded-xl font-semibold transition-all ${
            activeTab === "history"
              ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
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
              ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          🔍 Verify Receipt
        </button>
      </div>

      {activeTab === "profile" && (
        <>
          {/* Candidate Profile Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-6 mb-6">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                Candidate Headquarters
              </span>
              {candidate?.onChainId && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  On-Chain ID #{candidate.onChainId}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white mt-1">{candidate?.name}</h1>
            <p className="text-xs text-slate-400">{candidate?.email}</p>
          </div>

          <div>{getStatusBadge()}</div>
        </div>

        {/* Status Alerts */}
        {statusMsg && (
          <div className="p-4 mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center space-x-2">
            <span>✓</span>
            <span>{statusMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 mb-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center space-x-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {candidate?.adminFeedback && (
          <div className="p-4 mb-6 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs">
            <span className="font-semibold block mb-1">Election Commission Feedback:</span>
            <span>{candidate.adminFeedback}</span>
          </div>
        )}

        {/* Status Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-500 block mb-1">Contesting Election</span>
            <span className="font-semibold text-white">
              {candidate?.electionId?.title ||
                elections.find((e) => e._id === selectedElectionId)?.title ||
                "No election chosen yet"}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-500">Party Affiliation</span>
              {candidate?.partyLocked ? (
                <span className="text-[10px] font-semibold text-amber-400 flex items-center space-x-1">
                  <span>🔒</span>
                  <span>Locked</span>
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-emerald-400">Editable</span>
              )}
            </div>
            <span className="font-semibold text-purple-300 text-sm">
              {candidate?.party || "Independent"}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-500 block mb-1">Admin Approval Status</span>
            <span className="font-semibold uppercase text-xs text-slate-300">
              {candidate?.approvalStatus || "Draft"}
            </span>
          </div>
        </div>
      </div>

      {/* Rejection Alert & Reapplication Banner */}
      {isRejected && (
        <div className="p-6 rounded-3xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xl">⚠️</span>
              <span className="text-sm font-bold text-rose-300 uppercase tracking-wide">
                Nomination Rejected by Election Administrator
              </span>
            </div>
            <span className="px-3 py-1 rounded-xl font-mono text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Reapplications Used: {reapplyCount} / 2
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-rose-500/20 text-slate-200 space-y-1">
            <span className="font-semibold text-rose-400 block">Administrator Feedback:</span>
            <p className="text-slate-300 italic">{candidate.adminFeedback || "No specific feedback provided."}</p>
          </div>

          {reapplyLimitReached ? (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 font-semibold">
              🚫 Maximum reapplication limit reached (2 of 2 used). Your nomination is finalized as rejected for this election cycle.
            </div>
          ) : (
            <p className="text-slate-300 leading-relaxed">
              You can now <strong className="text-emerald-400 font-bold">edit your political party</strong>, update your candidate name, select an open election, or refine your manifesto platform before submitting your reapplication. (Maximum 2 reapplications allowed).
            </p>
          )}
        </div>
      )}

      {/* Approved Candidate Notice */}
      {isApproved && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center space-x-2">
          <span>🏛️</span>
          <span>
            <strong>Official Ballot Candidate:</strong> Your candidate name, party affiliation, and contested election are permanently locked on the smart contract. You may update your <strong>Campaign Manifesto & Key Policies</strong> below at any time.
          </span>
        </div>
      )}

      {/* Profile & Party Management Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <h2 className="text-lg font-bold text-white">Nomination & Campaign Details</h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure your campaign platform, candidate statement, and election entry.
          </p>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  Candidate Official Name
                </label>
                {isApproved && (
                  <span className="text-[10px] text-amber-400 font-semibold">
                    🔒 Locked on Ballot
                  </span>
                )}
              </div>
              <input
                type="text"
                required
                disabled={isApproved || isPending}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl text-xs border focus:outline-none ${
                  isApproved || isPending
                    ? "bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed"
                    : "bg-slate-950 border-slate-800 text-slate-200 focus:border-purple-500"
                }`}
              />
              {isApproved && (
                <p className="mt-1 text-[11px] text-slate-500">Candidate name is locked after official ballot approval.</p>
              )}
            </div>

            {/* Political Party Field (Editable after rejection, locked after approval) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
                  <span>Political Party</span>
                  {(isApproved || isPending) && <span>🔒</span>}
                </label>
                {isApproved ? (
                  <span className="text-[10px] text-amber-400 font-semibold">
                    🔒 Locked on Ballot
                  </span>
                ) : isRejected ? (
                  <span className="text-[10px] text-emerald-400 font-semibold">
                    ✓ Editable after Rejection
                  </span>
                ) : isPending ? (
                  <span className="text-[10px] text-amber-400 font-semibold">
                    🔒 Under Review
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500">
                    Locks during review
                  </span>
                )}
              </div>
              <input
                type="text"
                disabled={isApproved || isPending}
                value={party}
                onChange={(e) => setParty(e.target.value)}
                placeholder="e.g. Innovation Alliance"
                className={`w-full px-4 py-2.5 rounded-xl text-xs border focus:outline-none ${
                  isApproved || isPending
                    ? "bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed"
                    : "bg-slate-950 border-slate-800 text-slate-200 focus:border-purple-500"
                }`}
              />
              {isApproved ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  🔒 Party affiliation is permanently locked after ballot approval.
                </p>
              ) : isRejected ? (
                <p className="mt-1 text-[11px] text-emerald-400/90 leading-tight">
                  ✓ You can update your party affiliation before resubmitting your reapplication.
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500 leading-tight">
                  Party affiliation will be locked while under review and permanently locked upon approval.
                </p>
              )}
            </div>
          </div>

          {/* Election Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">
                Select Election to Contest
              </label>
              {isApproved && (
                <span className="text-[10px] text-amber-400 font-semibold">
                  🔒 Locked on Ballot
                </span>
              )}
            </div>
            <select
              disabled={isApproved || isPending}
              value={selectedElectionId}
              onChange={(e) => setSelectedElectionId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">-- Choose an Open Election --</option>
              {elections.map((elec) => (
                <option
                  key={elec._id}
                  value={elec._id}
                  disabled={elec.phase === "Voting" || elec.phase === "Ended"}
                >
                  #{elec.onChainElectionId} - {elec.title} ({elec.phase})
                  {elec.phase === "Voting" ? " [Voting Started - Nominations Closed]" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Manifesto (Always editable) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">
                Campaign Manifesto & Key Policies Platform
              </label>
              {isApproved && (
                <span className="text-[10px] text-emerald-400 font-semibold">
                  ✓ Editable for Approved Candidates
                </span>
              )}
            </div>
            <textarea
              rows="4"
              value={manifesto}
              onChange={(e) => setManifesto(e.target.value)}
              placeholder="Outline your promises, student policy initiatives, and campaign pledges..."
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500 resize-none"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Approved candidates can keep their manifesto and key policy statements up to date for voters at any time.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving || isPending || isReadOnly}
              title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
              className="py-2.5 px-6 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving Updates..." : isApproved ? "Update Campaign Manifesto" : "Save Details"}
            </button>
          </div>
        </form>
      </div>

      {/* Action Card: Request Admin Approval / Reapply */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-purple-950/40 via-slate-900 to-slate-900 border border-purple-500/20 shadow-xl space-y-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-xl text-purple-300">
            🛡️
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Administrator Nomination Approval</h3>
            <p className="text-xs text-slate-400">
              Submit your candidacy to the Election Commission to be placed onto the official voting ballot.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 space-y-2">
          <p>
            <span className="font-semibold text-amber-400">⚠️ Election Commission Regulations:</span>
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
            <li>Once approved, candidate name, political party, and election are permanently locked on-chain.</li>
            <li>If rejected, you may edit your political party and reapply (up to 2 re-applications allowed).</li>
            <li>Approved candidates can continue to update their Campaign Manifesto & Key Policies.</li>
          </ul>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-400">
            Current Status: <span className="font-semibold text-purple-400">{getStatusBadge()}</span>
          </div>

          <button
            onClick={handleRequestApproval}
            disabled={
              isSubmittingApproval ||
              isPending ||
              isApproved ||
              reapplyLimitReached ||
              isReadOnly
            }
            title={isReadOnly ? "Disabled in Read-Only Explorer Mode" : undefined}
            className={`py-2.5 px-6 rounded-xl text-xs font-semibold text-white transition-all shadow-lg flex items-center space-x-2 ${
              reapplyLimitReached
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : isRejected
                ? "bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 shadow-amber-600/30"
                : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-600/30"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span>
              {isSubmittingApproval
                ? "Submitting..."
                : isApproved
                ? "Ballot Candidate Approved ✓"
                : reapplyLimitReached
                ? "Reapplication Limit Reached (2/2) 🔒"
                : isRejected
                ? `Reapply for Election (${reapplyCount + 1}/2) 🔄`
                : "Request Admin Approval 🚀"}
            </span>
          </button>
        </div>
      </div>
        </>
      )}

      {activeTab === "history" && (
        <VotingHistorySection
          history={history}
          onSelectReceipt={setSelectedReceipt}
          onVerifyHash={handleVerifyHashJump}
        />
      )}

      {activeTab === "verify" && <ReceiptVerifierWidget initialTxHash={verifierTxHash} />}

      <VoteReceiptModal
        isOpen={Boolean(selectedReceipt)}
        onClose={() => setSelectedReceipt(null)}
        receipt={selectedReceipt}
      />
    </div>
  );
}
