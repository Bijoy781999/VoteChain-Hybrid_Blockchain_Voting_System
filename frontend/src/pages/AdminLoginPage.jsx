import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../services/api";
import { parseErrorMessage } from "../utils/format";
import PasswordInput from "../components/PasswordInput";
import DemoLoginBox from "../components/DemoLoginBox";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await authAPI.loginAdmin({ email, password });
      if (res.data.success) {
        login(res.data.token, res.data.admin, "admin");
        navigate("/admin");
      }
    } catch (err) {
      setError(parseErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillDemoAdmin = () => {
    setEmail("demo.admin@election.gov");
    setPassword("DemoAdmin123!");
    setError("");
  };

  return (
    <div className="max-w-md mx-auto my-12 px-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        {/* Top Accent Stripe */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-indigo-500"></div>

        {/* Header Badge */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-lg font-semibold mb-3">
            <span>🛡️</span>
            <span>Election Official Portal</span>
          </div>
          <h2 className="text-1xl font-bold text-white tracking-tight">Admin Sign In</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
            Restricted access for authorized election commissioners and auditors.
          </p>
        </div>

        {/* Quick Demo Explorer Credentials Pill */}
        <DemoLoginBox
          title="Default Admin Explorer (Read-Only)"
          email="demo.admin@election.gov"
          password="DemoAdmin123!"
          description="Explore admin dashboard, results & audit UI (actions disabled)"
          accent="amber"
          onFill={fillDemoAdmin}
        />

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleAdminSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Official Admin Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@election.gov"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">
                Password
              </label>
              <Link
                to="/admin-forgot-password"
                className="text-[11px] font-medium text-amber-400 hover:text-amber-300 transition-colors"
              >
                Forgot Password?
              </Link>
            </div>
            <PasswordInput
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 transition-all shadow-lg shadow-amber-900/20 disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            <span>{isSubmitting ? "Authenticating..." : "Sign In to Admin Portal"}</span>
            <span>🔒</span>
          </button>
        </form>

        {/* Links */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 text-center space-y-3">
          <p className="text-xs text-slate-400">
            Need to set up a new officer account?{" "}
            <Link to="/admin-register" className="text-amber-400 hover:text-amber-300 font-semibold">
              Register as Admin
            </Link>
          </p>
          <div>
            <Link to="/login" className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">
              ← Standard Constituent? Go to Voter Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
