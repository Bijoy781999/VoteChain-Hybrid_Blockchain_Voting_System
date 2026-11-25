import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../services/api";
import { parseErrorMessage } from "../utils/format";
import { useRegistrationCode } from "../hooks/useRegistrationCode";
import PasswordInput from "../components/PasswordInput";
import VerificationCodeField from "../components/VerificationCodeField";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const {
    step,
    email,
    setEmail,
    code,
    setCode,
    devCode,
    statusMsg,
    errorMsg,
    setErrorMsg,
    isRequestingCode,
    requestCode,
    resetToEmailStep,
  } = useRegistrationCode("voter");

  const [voterData, setVoterData] = useState({
    fullName: "",
    govId: "",
    password: "",
    walletAddress: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRequestCode = async (e) => {
    e.preventDefault();
    await requestCode(email);
  };

  const handleVoterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!code || code.trim().length < 6) {
      return setErrorMsg("Please enter the 6-digit verification code.");
    }

    setIsSubmitting(true);
    try {
      const res = await authAPI.registerVoter({
        fullName: voterData.fullName,
        email,
        govId: voterData.govId,
        password: voterData.password,
        walletAddress: voterData.walletAddress || undefined,
        verificationCode: code,
      });

      if (res.data.success) {
        login(res.data.token, res.data.user, "voter");
        navigate("/voter-dashboard");
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto my-10 px-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-600"></div>

        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold mb-2">
            <span>🗳️</span>
            <span>Public / Constituent Registration • Step {step} of 2</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Public Voter Registration</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
            Your government/student ID is hashed securely on-chain to guarantee zero gas fees and absolute privacy.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center space-x-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {statusMsg && (
          <div className="mb-5 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center space-x-2">
            <span>✓</span>
            <span>{statusMsg}</span>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleRequestCode} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Constituent Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="eleanor@university.edu"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                We will issue a 6-digit verification code before completing voter registration.
              </span>
            </div>

            <button
              type="submit"
              disabled={isRequestingCode}
              className="w-full py-3 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
            >
              {isRequestingCode ? "Generating Verification Code..." : "Send Verification Code 📨"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVoterSubmit} className="space-y-4">
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Verifying Email: <strong className="text-slate-200">{email}</strong>
              </span>
              <button
                type="button"
                onClick={resetToEmailStep}
                className="text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                Change
              </button>
            </div>

            <VerificationCodeField
              code={code}
              onChange={setCode}
              devCode={devCode}
              onAutoFill={setCode}
              onResend={() => requestCode(email)}
              resending={isRequestingCode}
              focusClass="focus:border-indigo-500"
            />

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Full Legal Name *
              </label>
              <input
                type="text"
                required
                value={voterData.fullName}
                onChange={(e) => setVoterData({ ...voterData, fullName: e.target.value })}
                placeholder="e.g. Eleanor Vance"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Government / Student ID Number *
              </label>
              <input
                type="text"
                required
                value={voterData.govId}
                onChange={(e) => setVoterData({ ...voterData, govId: e.target.value })}
                placeholder="e.g. STU-882194 or NAT-ID-99201"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                🔒 Never stored in plaintext. Converted into an immutable cryptographic hash.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Password *
              </label>
              <PasswordInput
                required
                minLength={6}
                value={voterData.password}
                onChange={(e) => setVoterData({ ...voterData, password: e.target.value })}
                placeholder="Minimum 6 characters"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Optional Web3 Wallet Address (MetaMask)
              </label>
              <input
                type="text"
                value={voterData.walletAddress}
                onChange={(e) => setVoterData({ ...voterData, walletAddress: e.target.value })}
                placeholder="0x... (Optional, only for direct Web3 voting)"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="flex items-center space-x-3 pt-1">
              <button
                type="button"
                onClick={resetToEmailStep}
                className="py-3 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-950 border border-slate-800 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
              >
                {isSubmitting ? "Registering Voter..." : "Register to Vote 🗳️"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-8 pt-5 border-t border-slate-800/80 text-center">
          <p className="text-xs text-slate-400">
            Already registered constituent?{" "}
            <Link to="/login" className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
              Sign In to Public Portal
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
