import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor to inject JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("vote_auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auth Endpoints
export const authAPI = {
  requestRegistrationCode: (data) => api.post("/auth/request-registration-code", data),
  registerVoter: (data) => api.post("/auth/register", data),
  loginVoter: (data) => api.post("/auth/login", data),
  registerAdmin: (data) => api.post("/auth/admin/register", data),
  loginAdmin: (data) => api.post("/auth/admin/login", data),
  linkAdminWallet: (walletAddress) => api.post("/auth/admin/link-wallet", { walletAddress }),
  listAdmins: () => api.get("/auth/admins"),
  deleteAdmin: (adminId) => api.delete(`/auth/admins/${adminId}`),
  registerCandidate: (data) => api.post("/auth/candidate/register", data),
  loginCandidate: (data) => api.post("/auth/candidate/login", data),
  forgotPassword: (data) => api.post("/auth/forgot-password", data),
  resetPassword: (data) => api.post("/auth/reset-password", data),
  getMe: () => api.get("/auth/me"),
};

// Elections Endpoints
export const electionAPI = {
  list: () => api.get("/elections"),
  getById: (id) => api.get(`/elections/${id}`),
  getPublicResults: (id) => api.get(`/elections/${id}/public-results`),
  create: (data) => api.post("/elections", data),
  updatePhase: (id, phase, extra = {}) => api.patch(`/elections/${id}/phase`, { phase, ...extra }),
  delete: (id) => api.delete(`/elections/${id}`),
};

// Candidates Endpoints
export const candidateAPI = {
  listByElection: (electionId) => api.get(`/candidates/election/${electionId}`),
  add: (data) => api.post("/candidates", data),
  delete: (candidateId) => api.delete(`/candidates/${candidateId}`),
  // Candidate Self-Service
  getProfile: () => api.get("/candidates/me"),
  updateProfile: (data) => api.put("/candidates/me", data),
  requestApproval: () => api.post("/candidates/me/request-approval"),
  // Admin Management & Nomination Review
  listAllAdmin: () => api.get("/candidates/admin/all"),
  listNominations: (status) =>
    api.get(`/candidates/admin/nominations${status ? `?status=${status}` : ""}`),
  reviewNomination: (candidateId, data) =>
    api.post(`/candidates/admin/nominations/${candidateId}/review`, data),
};

// Voter Management Endpoints
export const voterAPI = {
  getProfile: () => api.get("/voters/profile"),
  updateProfile: (data) => api.put("/voters/profile", data),
  linkWallet: (walletAddress) => api.post("/voters/link-wallet", { walletAddress }),
  getNotifications: () => api.get("/voters/notifications"),
  markNotificationsRead: (ids) => api.post("/voters/notifications/read", { ids }),
  listVoters: (status) => api.get(`/voters${status ? `?status=${status}` : ""}`),
  approveVoter: (voterId, electionId) =>
    api.post(`/voters/${voterId}/approve`, { electionId }),
  rejectVoter: (voterId, reason) =>
    api.post(`/voters/${voterId}/reject`, { reason }),
  deleteVoter: (voterId) => api.delete(`/voters/${voterId}`),
};

// Vote Cast Endpoints
export const voteAPI = {
  submitRelayerVote: (electionId, candidateId) =>
    api.post("/votes/relayer", { electionId, candidateId }),
  recordDirectVote: (data) => api.post("/votes/direct-record", data),
  getHistory: () => api.get("/votes/history"),
  verifyReceipt: (txHash) => api.get(`/votes/verify/${encodeURIComponent(txHash)}`),
  checkStatus: (electionId) => api.get(`/votes/status/${electionId}`),
};

// Audit and Verification Endpoints
export const auditAPI = {
  getLogs: (params) => api.get("/audit/logs", { params }),
  verifyReceipt: (txHash) => api.get(`/audit/receipt/${txHash}`),
  getResults: (electionId) => api.get(`/audit/results/${electionId}`),
};

export default api;
