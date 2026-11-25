import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { parseErrorMessage } from "../utils/format";
import PasswordInput from "../components/PasswordInput";
import DemoLoginBox from "../components/DemoLoginBox";

export default function CandidateLoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please provide your candidate email and password.");
      return;
    }

    setLoading(true);

    try {
      const res = await authAPI.loginCandidate({ email, password });
      if (res.data.success) {
        login(res.data.token, res.data.candidate, "candidate");
        navigate("/candidate-dashboard");
      }
    } catch (err) {
      setError(parseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCandidate = () => {
    setEmail("demo.candidate@election.gov");
    setPassword("DemoCandidate123!");
    setError("");
  };

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 bg-slate-900/90 border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl">
        <div className="text-center">
          <div className="inline-flex items-center space-x-2 px-3 py-1 mx-auto rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex justify-center text-purple-180 text-lg shadow-lg shadow-purple-600/30 mb-4">
            <span>🏛️</span>
            <span>Candidate's Official Portal</span>
          </div>
          <h2 className="text-1xl font-bold text-white tracking-tight">
            Candidate Sign In
          </h2>
          <p className="mt-2 text-xs text-slate-400">
            Sign in to manage your nomination, manifesto, and election status.
          </p>
        </div>

        <DemoLoginBox
          title="Default Candidate Explorer (Read-Only)"
          email="demo.candidate@election.gov"
          password="DemoCandidate123!"
          description="Explore candidate headquarters & options (actions disabled)"
          accent="purple"
          onFill={fillDemoCandidate}
        />

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center space-x-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Candidate Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="candidate@university.edu"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">
                Password
              </label>
              <Link
                to="/candidate-forgot-password"
                className="text-[11px] font-medium text-purple-400 hover:text-purple-300 transition-colors"
              >
                Forgot Password?
              </Link>
            </div>
            <PasswordInput
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all shadow-lg shadow-purple-600/30 disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign In to Candidate Dashboard"}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-800/80 space-y-3 text-center text-xs text-slate-400">
          <div>
            Want to contest an election?{" "}
            <Link to="/candidate-register" className="text-purple-400 hover:text-purple-300 font-semibold">
              Register as Candidate
            </Link>
          </div>
          <div className="flex justify-center space-x-4 text-[11px] text-slate-500">
            <Link to="/login" className="hover:text-slate-300">
              Voter Portal
            </Link>
            <span>•</span>
            <Link to="/admin-login" className="hover:text-amber-400">
              Admin Portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
