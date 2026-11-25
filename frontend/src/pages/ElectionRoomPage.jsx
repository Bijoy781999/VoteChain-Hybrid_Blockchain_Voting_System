import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../context/WalletContext";
import { useVotingContract } from "../hooks/useVotingContract";
import { electionAPI, candidateAPI, voteAPI } from "../services/api";
import CandidateComparisonSection from "../components/CandidateComparisonSection";
import VoteReceiptModal from "../components/VoteReceiptModal";
import ReadOnlyBanner from "../components/ReadOnlyBanner";
import CountdownTimer from "../components/CountdownTimer";
import ElectionEndedBreakdown from "../components/ElectionEndedBreakdown";
import BlockchainGuideModal from "../components/BlockchainGuideModal";
import { parseErrorMessage, getPhaseBadgeClass } from "../utils/format";

export default function ElectionRoomPage() {
  const { id } = useParams();
  const { user, isAuthenticated, isVoter, isCandidate, refreshUser, isReadOnly } = useAuth();
  const { isConnected, connectWallet, account } = useWallet();
  const { castDirectVote, checkAddressVoted } = useVotingContract();

  const [election, setElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [votingMode, setVotingMode] = useState("relayer"); // 'relayer' | 'wallet'
  const [hasVoted, setHasVoted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const fetchData = async () => {
    try {
      const [elecRes, candRes] = await Promise.all([
        electionAPI.getById(id),
        candidateAPI.listByElection(id),
      ]);
      if (elecRes.data.success) {
        setElection(elecRes.data.election);
      }
      if (candRes.data.success) {
        setCandidates(candRes.data.candidates);
      }
      if (isAuthenticated && isVoter) {
        const statusRes = await voteAPI.checkStatus(id);
        if (statusRes.data.success) {
          setHasVoted(statusRes.data.hasVoted);
        }
      }
    } catch (err) {
      console.warn("Error loading election room:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id, isAuthenticated, isVoter]);

  useEffect(() => {
    async function checkWalletStatus() {
      if (votingMode === "wallet" && isConnected && election) {
        const voted = await checkAddressVoted(election.onChainElectionId, account);
        if (voted) setHasVoted(true);
      }
    }
    checkWalletStatus();
  }, [votingMode, isConnected, account, election]);

  const handleCastVote = async (candidateId) => {
    setError("");

    if (isReadOnly) {
      setError("Read-Only Explorer Mode: Voting is disabled on the default preview account.");
      return;
    }

    if (!isAuthenticated && votingMode === "relayer") {
      setError("Please sign in as a registered constituent to cast a gasless ballot.");
      return;
    }

    if (votingMode === "relayer" && !user?.isApproved) {
      setError("Your voter account is currently pending administrator verification.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (votingMode === "relayer") {
        const res = await voteAPI.submitRelayerVote(election.onChainElectionId, candidateId);
        if (res.data.success) {
          setReceipt(res.data.receipt);
          setHasVoted(true);
          setIsModalOpen(true);
          await refreshUser();
          await fetchData();
        }
      } else {
        if (!isConnected) {
          await connectWallet();
          setIsSubmitting(false);
          return;
        }

        const directReceipt = await castDirectVote(election.onChainElectionId, candidateId);

        let storedReceipt = {
          txHash: directReceipt.txHash,
          blockNumber: directReceipt.blockNumber,
          electionId: election.onChainElectionId,
          electionTitle: election.title,
          voterHash: user?.voterHash || null,
          timestamp: new Date().toISOString(),
        };

        if (isAuthenticated && isVoter) {
          try {
            const recordRes = await voteAPI.recordDirectVote({
              electionId: election.onChainElectionId,
              candidateId,
              txHash: directReceipt.txHash,
              blockNumber: directReceipt.blockNumber,
            });
            if (recordRes.data.success && recordRes.data.receipt) {
              storedReceipt = recordRes.data.receipt;
            }
            await refreshUser();
          } catch (e) {
            // Keep chain receipt if DB sync fails
          }
        }

        setReceipt(storedReceipt);
        setHasVoted(true);
        setIsModalOpen(true);
        await fetchData();
      }
    } catch (err) {
      setError(parseErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-slate-500">Loading voting room...</div>;
  }

  if (!election) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold text-white mb-2">Election Not Found</h2>
        <Link to="/" className="text-indigo-400 text-sm">
          Return to Elections List
        </Link>
      </div>
    );
  }

  const isVotingPhase = election.phase === "Voting";
  const isEnded = election.phase === "Ended";
  const turnout = election.turnout;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <ReadOnlyBanner />

      {/* Header Banner with Countdown & Turnout Monitor */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${getPhaseBadgeClass(
                election.phase
              )}`}
            >
              {election.phase} Phase
            </span>
            <CountdownTimer
              phase={election.phase}
              startDate={election.startDate}
              endDate={election.endDate}
            />
            <span className="text-xs font-mono text-slate-400">
              Election ID #{election.onChainElectionId}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all"
            >
              How Blockchain Protects Your Vote ❓
            </button>

            {isVoter && (
              <Link
                to="/voter-dashboard"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
              >
                ← Public Portal
              </Link>
            )}
            {isCandidate && (
              <Link
                to="/candidate-dashboard"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition-all"
              >
                ← Candidate Portal
              </Link>
            )}
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{election.title}</h1>
          <p className="text-slate-400 text-sm max-w-3xl leading-relaxed">
            {election.description ||
              "Please review each candidate's platform and agenda before casting your immutable ballot."}
          </p>
        </div>

        {/* Live Voter Turnout Monitor */}
        {turnout && (
          <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-white">Live Voter Turnout Monitor</span>
                {!isEnded && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-semibold">
                    Candidate Counts Sealed Until End 🔒
                  </span>
                )}
              </div>
              <span className="font-mono text-slate-300">
                <strong className="text-indigo-400">{turnout.votesCast}</strong> of{" "}
                <strong>{turnout.verifiedVoters}</strong> verified voters have voted (
                <strong className="text-emerald-400">{turnout.percentage}%</strong>)
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-700"
                style={{ width: `${Math.max(turnout.percentage, turnout.votesCast > 0 ? 4 : 0)}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Hybrid Voting Mode Switcher */}
        {!isEnded && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs">
            <div>
              <span className="font-semibold text-slate-200 block">
                {votingMode === "relayer"
                  ? "Standard Mode: 1-Click Gasless Vote (No Wallet Required)"
                  : "Advanced Web3 Mode: Sign Directly with MetaMask"}
              </span>
              <p className="text-slate-400 mt-0.5">
                {votingMode === "relayer"
                  ? "The server Relayer pays gas fees and submits your anonymized voterHash on-chain."
                  : "Sign the transaction directly from your linked MetaMask wallet."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setVotingMode("relayer")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    votingMode === "relayer"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  ⚡ 1-Click Gasless
                </button>
                <button
                  type="button"
                  onClick={() => setVotingMode("wallet")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    votingMode === "wallet"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  🦊 MetaMask Web3
                </button>
              </div>
              {votingMode === "wallet" && !isConnected && (
                <button
                  type="button"
                  onClick={connectWallet}
                  className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-center">
          {error}
        </div>
      )}

      {hasVoted && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>✓ You have successfully cast your ballot for this election.</span>
          <Link to="/voter-dashboard?tab=verify" className="underline font-semibold text-xs">
            Open Verify My Receipt Tool →
          </Link>
        </div>
      )}

      {!isVotingPhase && !isEnded && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm text-center">
          Ballot casting is not currently active. This election is in{" "}
          <strong>{election.phase}</strong> phase. You can review and compare candidates below.
        </div>
      )}

      {/* Post-Election Breakdown when Ended */}
      {isEnded && <ElectionEndedBreakdown electionId={election.onChainElectionId} />}

      {/* Candidate Manifesto & Side-by-Side Comparison + Cards */}
      <CandidateComparisonSection
        candidates={candidates}
        isVotingPhase={isVotingPhase}
        hasVoted={hasVoted}
        onVote={handleCastVote}
        isSubmitting={isSubmitting}
        votingMode={votingMode}
        isReadOnly={isReadOnly}
      />

      <VoteReceiptModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        receipt={receipt}
      />

      <BlockchainGuideModal isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
