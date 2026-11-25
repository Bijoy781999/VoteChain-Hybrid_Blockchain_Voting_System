import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../services/api";
import { parseErrorMessage } from "../utils/format";
import PasswordInput from "../components/PasswordInput";
import DemoLoginBox from "../components/DemoLoginBox";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleVoterSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await authAPI.loginVoter({ email, password });
      if (res.data.success) {
        login(res.data.token, res.data.user, "voter");
        navigate("/voter-dashboard");
      }
    } catch (err) {
      setError(parseErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillDemoVoter = () => {
    setEmail("demo.voter@election.gov");
    setPassword("DemoVoter123!");
    setError("");
  };

  return (
    <div className="max-w-md mx-auto my-14 px-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        {/* Top Accent Stripe */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-600"></div>

        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-lg font-semibold mb-3">
            <span>🗳️</span>
            <span>Voter's Official Portal</span>
          </div>
          <h2 className="text-1xl font-bold text-white tracking-tight">Public Sign In</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
            Enter your constituent email and password to access your ballot and cast gasless votes.
          </p>
        </div>

        <DemoLoginBox
          title="Default Public Explorer (Read-Only)"
          email="demo.voter@election.gov"
          password="DemoVoter123!"
          description="Browse voter dashboard & ballot options (actions disabled)"
          accent="indigo"
          onFill={fillDemoVoter}
        />

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleVoterSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Constituent Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voter@university.edu"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Forgot Password?
              </Link>
            </div>
            <PasswordInput
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50"
          >
            {isSubmitting ? "Authenticating..." : "Sign In as Voter"}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800/80 text-center space-y-3">
          <p className="text-xs text-slate-400">
            Don't have a registered voter account?{" "}
            <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-semibold">
              Register here
            </Link>
          </p>
          <div>
            <Link
              to="/admin-login"
              className="text-xs text-amber-400/90 hover:text-amber-300 font-medium inline-flex items-center space-x-1"
            >
              <span>Election Official? Go to Admin Portal</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
