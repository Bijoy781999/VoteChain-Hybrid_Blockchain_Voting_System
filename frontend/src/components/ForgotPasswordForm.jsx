import React, { useState } from "react";
import { Link } from "react-router-dom";
import { authAPI } from "../services/api";
import { parseErrorMessage } from "../utils/format";
import PasswordInput from "./PasswordInput";
import VerificationCodeField from "./VerificationCodeField";

const ROLE_CONFIG = {
  voter: {
    title: "Public / Voter",
    badge: "Public Account Recovery",
    icon: "🗳️",
    placeholder: "voter@university.edu",
    accentClass: "from-indigo-500 to-purple-600",
    buttonClass: "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30",
    linkClass: "text-indigo-400 hover:text-indigo-300",
    focusClass: "focus:border-indigo-500",
    loginPath: "/login",
  },
  candidate: {
    title: "Candidate",
    badge: "Candidate Portal Recovery",
    icon: "🏛️",
    placeholder: "candidate@university.edu",
    accentClass: "from-purple-600 to-indigo-600",
    buttonClass: "bg-purple-600 hover:bg-purple-500 shadow-purple-600/30",
    linkClass: "text-purple-400 hover:text-purple-300",
    focusClass: "focus:border-purple-500",
    loginPath: "/candidate-login",
  },
  admin: {
    title: "Admin",
    badge: "Election Officer Recovery",
    icon: "🛡️",
    placeholder: "admin@election.gov",
    accentClass: "from-amber-500 to-indigo-600",
    buttonClass: "bg-amber-600 hover:bg-amber-500 shadow-amber-600/30",
    linkClass: "text-amber-400 hover:text-amber-300",
    focusClass: "focus:border-amber-500",
    loginPath: "/admin-login",
  },
};

export default function ForgotPasswordForm({ role = "voter" }) {
  const roleMeta = ROLE_CONFIG[role] || ROLE_CONFIG.voter;

  const [step, setStep] = useState(1); // 1: Request Code, 2: Reset Password, 3: Success
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [devCode, setDevCode] = useState(null);

  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setStatusMsg("");

    if (!email) {
      setErrorMsg("Please provide your registered account email.");
      return;
    }

    setLoading(true);
    try {
      const res = await authAPI.forgotPassword({ email, role });
      if (res.data.success) {
        setStatusMsg(res.data.message);
        if (res.data.resetCode) {
          setDevCode(res.data.resetCode);
        }
        setStep(2);
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setStatusMsg("");

    if (!code || !newPassword || !confirmPassword) {
      setErrorMsg("Please enter the verification code, new password, and re-enter the new password.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("New password and re-entered password do not match. Please verify.");
      return;
    }

    setLoading(true);
    try {
      const res = await authAPI.resetPassword({
        email,
        role,
        code,
        newPassword,
        confirmPassword,
      });

      if (res.data.success) {
        setStatusMsg(res.data.message);
        setStep(3);
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const passwordsMatch = confirmPassword.length > 0 && newPassword.length >= 6 && newPassword === confirmPassword;

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${roleMeta.accentClass}`}></div>

        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold mb-3">
            <span>{roleMeta.icon}</span>
            <span>{roleMeta.badge}</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {roleMeta.title} Forgot Password
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
            Recover and set a new password for your {roleMeta.title} account.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center space-x-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {statusMsg && step !== 3 && (
          <div className="mb-5 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center space-x-2">
            <span>✓</span>
            <span>{statusMsg}</span>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleRequestCode} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Registered {roleMeta.title} Email *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={roleMeta.placeholder}
                className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none transition-colors ${roleMeta.focusClass}`}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 rounded-xl text-xs font-semibold text-white transition-all shadow-lg disabled:opacity-50 ${roleMeta.buttonClass}`}
            >
              {loading ? "Generating Verification Code..." : "Send Verification Code 📨"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <VerificationCodeField
              code={code}
              onChange={setCode}
              devCode={devCode}
              onAutoFill={setCode}
              focusClass={roleMeta.focusClass}
            />

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                New Password (minimum 6 characters) *
              </label>
              <PasswordInput
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none ${roleMeta.focusClass}`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Re-enter New Password *
              </label>
              <PasswordInput
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border text-slate-200 text-xs focus:outline-none ${
                  passwordsMismatch
                    ? "border-rose-500 focus:border-rose-500"
                    : `border-slate-800 ${roleMeta.focusClass}`
                }`}
              />
              {passwordsMismatch && (
                <span className="text-[11px] text-rose-400 mt-1 block">
                  ⚠️ Passwords do not match.
                </span>
              )}
              {passwordsMatch && (
                <span className="text-[11px] text-emerald-400 mt-1 block">
                  ✓ Passwords match.
                </span>
              )}
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setErrorMsg("");
                  setStatusMsg("");
                }}
                className="py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-950 border border-slate-800 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || passwordsMismatch}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-white transition-all shadow-lg disabled:opacity-50 ${roleMeta.buttonClass}`}
              >
                {loading ? "Resetting Password..." : "Set New Password 🔒"}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="text-center space-y-5 py-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-3xl text-emerald-400">
              ✓
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Password Reset Successfully!</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                Your credentials have been updated. You can now log in using your new password.
              </p>
            </div>
            <Link
              to={roleMeta.loginPath}
              className={`block w-full py-3 px-4 rounded-xl text-xs font-semibold text-white text-center transition-all shadow-lg ${roleMeta.buttonClass}`}
            >
              Sign In to {roleMeta.title} Portal →
            </Link>
          </div>
        )}

        <div className="mt-8 pt-5 border-t border-slate-800/80 text-center">
          <p className="text-xs text-slate-400">
            Remembered your credentials?{" "}
            <Link
              to={roleMeta.loginPath}
              className={`font-semibold transition-colors ${roleMeta.linkClass}`}
            >
              Back to {roleMeta.title} Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
