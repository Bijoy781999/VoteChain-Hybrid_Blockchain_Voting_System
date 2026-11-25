import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../services/api";
import { parseErrorMessage } from "../utils/format";
import { useRegistrationCode } from "../hooks/useRegistrationCode";
import PasswordInput from "../components/PasswordInput";
import VerificationCodeField from "../components/VerificationCodeField";

export default function CandidateRegisterPage() {
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
  } = useRegistrationCode("candidate");

  const [candidateData, setCandidateData] = useState({
    name: "",
    password: "",
    party: "",
    manifesto: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRequestCode = async (e) => {
    e.preventDefault();
    await requestCode(email);
  };

  const handleCandidateSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!code || code.trim().length < 6) {
      return setErrorMsg("Please enter the 6-digit verification code.");
    }

    setIsSubmitting(true);
    try {
      const res = await authAPI.registerCandidate({
        name: candidateData.name,
        email,
        password: candidateData.password,
        party: candidateData.party || "Independent",
        manifesto: candidateData.manifesto,
        verificationCode: code,
      });

      if (res.data.success) {
        login(res.data.token, res.data.candidate, "candidate");
        navigate("/candidate-dashboard");
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
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-600 to-indigo-600"></div>

        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold mb-2">
            <span>🏛️</span>
            <span>Candidate Registration • Step {step} of 2</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Candidate Nomination</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
            Register your candidacy to contest official on-chain elections.
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
                Official Candidate Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="candidate@university.edu"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Verify your official email with a 6-digit code before submitting your nomination.
              </span>
            </div>

            <button
              type="submit"
              disabled={isRequestingCode}
              className="w-full py-3 px-4 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
            >
              {isRequestingCode ? "Generating Verification Code..." : "Send Verification Code 📨"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleCandidateSubmit} className="space-y-4">
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Verifying Email: <strong className="text-slate-200">{email}</strong>
              </span>
              <button
                type="button"
                onClick={resetToEmailStep}
                className="text-purple-400 hover:text-purple-300 font-semibold"
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
              focusClass="focus:border-purple-500"
            />

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Candidate Official Name *
              </label>
              <input
                type="text"
                required
                value={candidateData.name}
                onChange={(e) => setCandidateData({ ...candidateData, name: e.target.value })}
                placeholder="e.g. Dr. Jane Hope"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Password *
              </label>
              <PasswordInput
                required
                minLength={6}
                value={candidateData.password}
                onChange={(e) => setCandidateData({ ...candidateData, password: e.target.value })}
                placeholder="Minimum 6 characters"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Political Party / Student Slate
              </label>
              <input
                type="text"
                value={candidateData.party}
                onChange={(e) => setCandidateData({ ...candidateData, party: e.target.value })}
                placeholder="e.g. Progressive Student Alliance (or Independent)"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Note: Party affiliation locks when you submit your nomination to the administrator.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Campaign Manifesto & Key Policies Platform
              </label>
              <textarea
                rows="3"
                value={candidateData.manifesto}
                onChange={(e) => setCandidateData({ ...candidateData, manifesto: e.target.value })}
                placeholder="Briefly state your campaign promises, policy goals, and student representation vision..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500 resize-none"
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
                className="flex-1 py-3 px-4 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
              >
                {isSubmitting ? "Submitting Candidate Nomination..." : "Register Candidate Nomination 🏛️"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-8 pt-5 border-t border-slate-800/80 text-center">
          <p className="text-xs text-slate-400">
            Already contesting?{" "}
            <Link to="/candidate-login" className="font-semibold text-purple-400 hover:text-purple-300 transition-colors">
              Sign In to Candidate Headquarters
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
