import React from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminRegisterPage from "./pages/AdminRegisterPage";
import RegisterPage from "./pages/RegisterPage";
import CandidateLoginPage from "./pages/CandidateLoginPage";
import CandidateRegisterPage from "./pages/CandidateRegisterPage";
import CandidateDashboardPage from "./pages/CandidateDashboardPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import CandidateForgotPasswordPage from "./pages/CandidateForgotPasswordPage";
import AdminForgotPasswordPage from "./pages/AdminForgotPasswordPage";
import VoterDashboard from "./pages/VoterDashboard";
import ElectionRoomPage from "./pages/ElectionRoomPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import ResultsPage from "./pages/ResultsPage";
import { useAuth } from "./context/AuthContext";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("UI Error Caught by Boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-3xl">
              ⚠️
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              {this.state.error?.message || "An unexpected rendering error occurred."}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/";
              }}
              className="py-2.5 px-6 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md shadow-indigo-600/30"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, role, loggedOut, loading } = useAuth();

  if (loading) {
    return (
      <div className="text-center py-24 text-slate-400 text-sm flex items-center justify-center space-x-2">
        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
        <span>Checking constituent credentials...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (loggedOut) return <Navigate to="/" replace />;
    if (requiredRole === "admin") return <Navigate to="/admin-login" replace />;
    if (requiredRole === "candidate") return <Navigate to="/candidate-login" replace />;
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  const { isAdmin, isCandidate } = useAuth();

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
        <Navbar />

        <main className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />

            {/* Dedicated Voter & Admin Login / Register Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/voter-login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/voter-register" element={<RegisterPage />} />

            <Route path="/admin-login" element={<AdminLoginPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin-register" element={<AdminRegisterPage />} />
            <Route path="/admin/register" element={<AdminRegisterPage />} />

            {/* Candidate Login & Register Routes */}
            <Route path="/candidate-login" element={<CandidateLoginPage />} />
            <Route path="/candidate/login" element={<CandidateLoginPage />} />
            <Route path="/candidate-register" element={<CandidateRegisterPage />} />
            <Route path="/candidate/register" element={<CandidateRegisterPage />} />

            {/* Separated Password Recovery Routes (Public/Voter, Candidate, Admin) */}
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/voter-forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ForgotPasswordPage />} />
            <Route path="/candidate-forgot-password" element={<CandidateForgotPasswordPage />} />
            <Route path="/candidate/forgot-password" element={<CandidateForgotPasswordPage />} />
            <Route path="/admin-forgot-password" element={<AdminForgotPasswordPage />} />
            <Route path="/admin/forgot-password" element={<AdminForgotPasswordPage />} />

            <Route path="/election/:id" element={<ElectionRoomPage />} />

            {/* Candidate Protected Headquarters */}
            <Route
              path="/candidate-dashboard"
              element={
                <ProtectedRoute requiredRole="candidate">
                  <CandidateDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/candidate/dashboard"
              element={
                <ProtectedRoute requiredRole="candidate">
                  <CandidateDashboardPage />
                </ProtectedRoute>
              }
            />

            {/* Admin Protected Results & Audit Route */}
            <Route
              path="/results"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ResultsPage />
                </ProtectedRoute>
              }
            />

            {/* Voter Protected Route (Public Portal) */}
            <Route
              path="/voter-dashboard"
              element={
                <ProtectedRoute requiredRole="voter">
                  <VoterDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/public-portal"
              element={
                <ProtectedRoute requiredRole="voter">
                  <VoterDashboard />
                </ProtectedRoute>
              }
            />

            {/* Admin Protected Route */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-900 bg-slate-950/60 py-8 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>© 2026 VoteChain Systems. Hybrid Gasless & Direct Web3 Blockchain Governance.</p>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-slate-400">
              <Link to="/login" className="hover:text-white transition-colors">
                Voter Portal
              </Link>
              <Link to="/candidate-login" className="hover:text-purple-400 text-purple-400/90 transition-colors">
                Candidate Portal
              </Link>
              <Link to="/admin-login" className="hover:text-amber-400 transition-colors">
                Official Admin Portal
              </Link>
              {isAdmin && (
                <Link to="/results" className="hover:text-amber-300 text-amber-400 transition-colors">
                  Audit & Results (Admin)
                </Link>
              )}
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
