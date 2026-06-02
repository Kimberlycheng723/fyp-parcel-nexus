import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../services/api.js";
import { getAccessToken, removeAccessToken, setAccessToken } from "../services/tokenStorage.js";
import { navigate } from "../utils/navigation.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getAccessToken());
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(getAccessToken()));

  async function refreshUser() {
    const currentToken = getAccessToken();

    if (!currentToken) {
      setUser(null);
      setToken(null);
      setIsCheckingSession(false);
      return null;
    }

    try {
      const data = await apiRequest("/auth/me");
      setUser(data.user);
      setToken(currentToken);
      return data.user;
    } catch (error) {
      removeAccessToken();
      setUser(null);
      setToken(null);
      return null;
    } finally {
      setIsCheckingSession(false);
    }
  }

  async function login({ email, password }) {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: { email, password }
    });

    setAccessToken(data.accessToken);
    setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    try {
      await apiRequest("/auth/logout", {
        method: "POST"
      });
    } catch (error) {
      // Removing the token locally is still the important logout action for JWT.
    }

    removeAccessToken();
    setToken(null);
    setUser(null);
    navigate("/login");
  }

  useEffect(() => {
    refreshUser();
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      isCheckingSession,
      login,
      logout,
      refreshUser
    }),
    [token, user, isCheckingSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
