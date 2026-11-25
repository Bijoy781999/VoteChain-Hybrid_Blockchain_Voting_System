import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { electionAPI, auditAPI } from "../services/api";
import ResultsChart from "../components/ResultsChart";
import ReadOnlyBanner from "../components/ReadOnlyBanner";
import CopyButton from "../components/CopyButton";
import { shortenHash, formatDate, formatVoteReceiptText } from "../utils/format";

export default function ResultsPage() {
  const [searchParams] = useSearchParams();
  const initialTx = searchParams.get("txHash") || "";
  const initialElection = searchParams.get("electionId") || "";

  const [elections, setElections] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState(initialElection);
  const [resultsData, setResultsData] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);

  // Verifier State
  const [queryTxHash, setQueryTxHash] = useState(initialTx);
  const [verifiedRecord, setVerifiedRecord] = useState(null);
  const [verifierError, setVerifierError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  // Audit Logs
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    async function loadElections() {
      try {
        const res = await electionAPI.list();
        if (res.data.success && res.data.elections.length > 0) {
          setElections(res.data.elections);
          if (!selectedElectionId) {
            setSelectedElectionId(res.data.elections[0].onChainElectionId.toString());
          }
        }
      } catch (e) {
        console.warn("Could not load elections:", e);
      }
    }
    loadElections();
  }, []);

  useEffect(() => {
    if (selectedElectionId) {
      loadElectionResults(selectedElectionId);
      loadAuditLogs(selectedElectionId);
    }
  }, [selectedElectionId]);

  useEffect(() => {
    if (initialTx) {
      handleVerifyReceipt(initialTx);
    }
  }, [initialTx]);

  const loadElectionResults = async (electionId) => {
    setLoadingResults(true);
    try {
      const res = await auditAPI.getResults(electionId);
      if (res.data.success) {
        setResultsData(res.data);
      }
    } catch (e) {
      console.warn("Results error:", e);
    } finally {
      setLoadingResults(false);
    }
  };

  const loadAuditLogs = async (electionId) => {
    try {
      const res = await auditAPI.getLogs({ electionId, limit: 15 });
      if (res.data.success) {
        setLogs(res.data.logs);
      }
    } catch (e) {
      console.warn("Audit logs error:", e);
    }
  };

  const handleVerifyReceipt = async (hashToVerify) => {
    const target = hashToVerify || queryTxHash;
    if (!target) return;
    setIsVerifying(true);
    setVerifierError("");
    setVerifiedRecord(null);

    try {
      const res = await auditAPI.verifyReceipt(target.trim());
      if (res.data.success) {
        setVerifiedRecord(res.data);
      }
    } catch (err) {
      setVerifierError("No valid transaction receipt found for the provided hash.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-12">
      <ReadOnlyBanner />

      {/* Title */}
      <div className="text-center max-w-3xl mx-auto">
        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-4">
          <span>🛡️</span>
          <span>Official Admin Portal - Confidential Ledger</span>
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">
          Election Results & Administrative Audit
        </h1>
        <p className="text-sm text-slate-400">
          Executive view: verified on-chain ballot tallies, cryptographically proven receipts, and full audit trail.
        </p>
      </div>

      {/* Results Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Ballot Tallies</h2>
            <p className="text-xs text-slate-400 mt-1">Live synchronized results from smart contract</p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400">Select Election:</span>
            <select
              value={selectedElectionId}
              onChange={(e) => setSelectedElectionId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {elections.map((elec) => (
                <option key={elec.onChainElectionId} value={elec.onChainElectionId}>
                  #{elec.onChainElectionId} - {elec.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loadingResults ? (
          <p className="text-xs text-slate-500 py-6 text-center">Loading tallies...</p>
        ) : resultsData ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
              <div>
                <span className="text-slate-500 block">Election Phase</span>
                <span className="font-semibold text-indigo-400 text-sm">
                  {resultsData.election.phase}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">Total Ballots Cast</span>
                <span className="font-bold text-white text-base">
                  {resultsData.election.totalVotes}
                </span>
              </div>
            </div>

            <ResultsChart
              candidates={resultsData.candidates}
              totalVotes={resultsData.election.totalVotes}
            />
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-6 text-center">No results available.</p>
        )}
      </div>

      {/* Public Receipt Verifier */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
        <div className="mb-6">
          <div className="inline-block px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold mb-2">
            Commission Receipt Audit
          </div>
          <h2 className="text-xl font-bold text-white">Verify Voter Receipt</h2>
          <p className="text-xs text-slate-400 mt-1">
            Enter any voter transaction hash (txHash) to verify its blockchain inclusion and immutable audit record without exposing ballot choice.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleVerifyReceipt();
          }}
          className="flex flex-col sm:flex-row gap-3 mb-6"
        >
          <input
            type="text"
            value={queryTxHash}
            onChange={(e) => setQueryTxHash(e.target.value)}
            placeholder="Paste Transaction Hash (e.g. 0x8a7f2...)"
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={isVerifying}
            className="py-2.5 px-6 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition-all shrink-0"
          >
            {isVerifying ? "Verifying..." : "Verify Proof 🔍"}
          </button>
        </form>

        {verifierError && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {verifierError}
          </div>
        )}

        {verifiedRecord && (
          <div className="p-6 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-4 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2 text-emerald-400 text-sm font-semibold">
                <span>✓ Verified On-Chain Record</span>
              </div>
              <CopyButton
                text={formatVoteReceiptText({
                  electionId: verifiedRecord.auditRecord?.electionId,
                  electionTitle: verifiedRecord.auditRecord?.details?.electionTitle,
                  txHash: verifiedRecord.auditRecord?.txHash || queryTxHash,
                  blockNumber:
                    verifiedRecord.onChainConfirmation?.blockNumber ||
                    verifiedRecord.auditRecord?.blockNumber,
                  voterHash: verifiedRecord.auditRecord?.voterHash,
                  timestamp: verifiedRecord.auditRecord?.timestamp,
                })}
                label="Copy Verified Receipt 📋"
                copiedLabel="Receipt Copied ✓"
                className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block">Action Type</span>
                <span className="font-semibold text-slate-200">
                  {verifiedRecord.auditRecord?.action || "VOTE_TRANSACTION"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Confirmation Status</span>
                <span className="font-semibold text-emerald-400">
                  {verifiedRecord.onChainConfirmation?.status || "Confirmed"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Block Height</span>
                <span className="font-mono text-slate-300">
                  #{verifiedRecord.onChainConfirmation?.blockNumber ||
                    verifiedRecord.auditRecord?.blockNumber ||
                    "Confirmed"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Timestamp</span>
                <span className="text-slate-300">
                  {formatDate(verifiedRecord.auditRecord?.timestamp)}
                </span>
              </div>
              {verifiedRecord.auditRecord?.voterHash && (
                <div className="sm:col-span-2">
                  <span className="text-slate-500 block">Anonymized Constituent Hash</span>
                  <span className="font-mono text-indigo-400 break-all text-[11px]">
                    {verifiedRecord.auditRecord.voterHash}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
        <h2 className="text-xl font-bold text-white mb-4">Immutable Audit Trail</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Tx Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">
                    No audit records recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-950/40">
                    <td className="py-3 px-4 text-slate-400">{formatDate(log.timestamp)}</td>
                    <td className="py-3 px-4 font-semibold text-white">{log.action}</td>
                    <td className="py-3 px-4 uppercase text-[10px] text-slate-400">
                      {log.actorRole}
                    </td>
                    <td className="py-3 px-4 font-mono text-indigo-400">
                      {log.txHash ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => {
                              setQueryTxHash(log.txHash);
                              handleVerifyReceipt(log.txHash);
                            }}
                            className="hover:underline"
                          >
                            {shortenHash(log.txHash, 6)}
                          </button>
                          <CopyButton
                            text={log.txHash}
                            label="Copy"
                            copiedLabel="Copied ✓"
                            title="Copy transaction hash"
                          />
                        </div>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
