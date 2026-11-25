import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../services/api";
import { parseErrorMessage } from "../utils/format";
import { useRegistrationCode } from "../hooks/useRegistrationCode";
import PasswordInput from "../components/PasswordInput";
import VerificationCodeField from "../components/VerificationCodeField";

export default function AdminRegisterPage() {
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
  } = useRegistrationCode("admin");

  const [formData, setFormData] = useState({
    fullName: "",
    password: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleRequestCode = async (e) => {
    e.preventDefault();
    await requestCode(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!code || code.trim().length < 6) {
      return setErrorMsg("Please enter the 6-digit verification code.");
    }

    if (formData.password.length < 6) {
      return setErrorMsg("Password must be at least 6 characters.");
    }

    setIsSubmitting(true);
    try {
      const res = await authAPI.registerAdmin({
        fullName: formData.fullName,
        email,
        password: formData.password,
        verificationCode: code,
      });

      if (res.data.success) {
        login(res.data.token, res.data.admin, "admin");
        navigate("/admin");
      }
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 px-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-indigo-500"></div>

        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-3">
            <span>🛡️</span>
            <span>Commission Officer Setup • Step {step} of 2</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Admin Registration</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
            Create an Election Official account with email verification and password. No browser extension required.
          </p>
        </div>

        {/* Optional MetaMask Info Banner */}
        <div className="mb-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-[11px] leading-relaxed">
          <span className="font-semibold text-amber-300">🦊 Optional Web3 Wallet:</span> You can connect and link a MetaMask wallet anytime inside the{" "}
          <span className="font-semibold text-white">Admin Dashboard</span>, or rely seamlessly on the backend relayer when no extension is installed.
        </div>

        {errorMsg && (
          <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center">
            {errorMsg}
          </div>
        )}

        {statusMsg && (
          <div className="mb-5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs text-center">
            ✓ {statusMsg}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleRequestCode} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Official Commission Email *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="commissioner@election.gov"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-amber-500 transition-colors"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Verify your commission email with a 6-digit code before setting up the Admin account.
              </span>
            </div>

            <button
              type="submit"
              disabled={isRequestingCode}
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 transition-all shadow-lg shadow-amber-900/20 disabled:opacity-50"
            >
              {isRequestingCode ? "Generating Verification Code..." : "Send Verification Code 📨"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Verifying Email: <strong className="text-slate-200">{email}</strong>
              </span>
              <button
                type="button"
                onClick={resetToEmailStep}
                className="text-amber-400 hover:text-amber-300 font-semibold"
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
              focusClass="focus:border-amber-500"
            />

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Official Admin Name
              </label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Commissioner Jane Doe"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Password
              </label>
              <PasswordInput
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Minimum 6 characters"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-amber-500 transition-colors"
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
                className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 transition-all shadow-lg shadow-amber-900/20 disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <span>{isSubmitting ? "Creating Admin Account..." : "Create Admin Account 🛡️"}</span>
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 pt-5 border-t border-slate-800/80 text-center space-y-3">
          <p className="text-xs text-slate-400">
            Already registered as an official?{" "}
            <Link to="/admin-login" className="text-amber-400 hover:text-amber-300 font-semibold">
              Admin Sign In
            </Link>
          </p>
          <div>
            <Link to="/register" className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">
              ← Constituent Voter Registration
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
