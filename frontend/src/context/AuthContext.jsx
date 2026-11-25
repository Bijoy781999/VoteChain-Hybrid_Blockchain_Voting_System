import React, { createContext, useContext, useState, useEffect } from "react";
import { authAPI } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("vote_auth_token"));
  const [role, setRole] = useState(() => localStorage.getItem("vote_auth_role") || "guest");
  const [loggedOut, setLoggedOut] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      if (token) {
        try {
          const res = await authAPI.getMe();
          if (res.data.success) {
            const resolvedRole = res.data.role || res.data.profile?.role;
            setUser(res.data.profile);
            if (resolvedRole) {
              localStorage.setItem("vote_auth_role", resolvedRole);
              setRole(resolvedRole);
            }
          }
        } catch (err) {
          console.warn("Failed to load user session:", err.message);
          logout(false);
        }
      }
      setLoading(false);
    }
    loadUser();
  }, [token]);

  const login = (authToken, userProfile, userRole) => {
    localStorage.setItem("vote_auth_token", authToken);
    localStorage.setItem("vote_auth_role", userRole);
    setLoggedOut(false);
    setToken(authToken);
    setUser(userProfile);
    setRole(userRole);
  };

  const logout = (manual = true) => {
    localStorage.removeItem("vote_auth_token");
    localStorage.removeItem("vote_auth_role");
    if (manual) {
      setLoggedOut(true);
    }
    setToken(null);
    setUser(null);
    setRole("guest");
  };

  const refreshUser = async () => {
    try {
      const res = await authAPI.getMe();
      if (res.data.success) {
        setUser(res.data.profile);
      }
    } catch (e) {
      console.warn("Error refreshing user profile:", e);
    }
  };

  const value = {
    user,
    token,
    role,
    loggedOut,
    isAuthenticated: !!token,
    isAdmin: role === "admin",
    isVoter: role === "voter",
    isCandidate: role === "candidate",
    isReadOnly: Boolean(user?.isReadOnly),
    loading,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
