import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../services/api.js";
import { getAccessToken, removeAccessToken, setAccessToken } from "../services/tokenStorage.js";
import { navigate, replaceNavigate } from "../utils/navigation.js";

const AuthContext = createContext(null);
const SESSION_NOTICE_KEY = "parcel_nexus_session_notice";
const SESSION_EXPIRED_EVENT = "parcel-nexus-session-expired";
const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please log in again.";

function decodeJwtPayload(tokenValue) {
  try {
    const payload = tokenValue?.split(".")?.[1];

    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");

    return JSON.parse(window.atob(padded));
  } catch (error) {
    return null;
  }
}

function tokenExpiryTime(tokenValue) {
  const payload = decodeJwtPayload(tokenValue);

  if (!payload?.exp) {
    return null;
  }

  return Number(payload.exp) * 1000;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getAccessToken());
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(getAccessToken()));

  function clearSession({ expired = false } = {}) {
    removeAccessToken();
    setToken(null);
    setUser(null);

    if (expired) {
      sessionStorage.setItem(SESSION_NOTICE_KEY, SESSION_EXPIRED_MESSAGE);
      replaceNavigate("/login");
    }
  }

  async function refreshUser() {
    const currentToken = getAccessToken();

    if (!currentToken) {
      clearSession();
      setIsCheckingSession(false);
      return null;
    }

    try {
      const data = await apiRequest("/auth/me");
      setUser(data.user);
      setToken(currentToken);
      return data.user;
    } catch (error) {
      clearSession({ expired: error.status === 401 });
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

    clearSession();
    navigate("/login");
  }

  useEffect(() => {
    refreshUser();
  }, []);

  useEffect(() => {
    function handleSessionExpired() {
      clearSession({ expired: true });
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const expiresAt = tokenExpiryTime(token);

    if (!expiresAt) {
      return undefined;
    }

    const delay = expiresAt - Date.now();

    if (delay <= 0) {
      clearSession({ expired: true });
      return undefined;
    }

    const timer = window.setTimeout(() => {
      clearSession({ expired: true });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      isCheckingSession,
      login,
      logout,
      clearSession,
      refreshUser
    }),
    [token, user, isCheckingSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
