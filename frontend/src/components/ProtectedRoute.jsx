import { useEffect } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import { navigate, replaceNavigate } from "../utils/navigation.js";
import { landingPathForRole } from "../utils/roleLanding.js";
import { Spinner } from "./Spinner.jsx";

export function ProtectedRoute({ children, allowedRoles }) {
  const { token, isCheckingSession, user } = useAuth();
  const hasAllowedRole = !allowedRoles || allowedRoles.includes(user?.role);

  useEffect(() => {
    if (!isCheckingSession && (!token || !user)) {
      navigate("/login");
    }
  }, [isCheckingSession, token, user]);

  useEffect(() => {
    if (!isCheckingSession && token && user && !hasAllowedRole) {
      replaceNavigate(landingPathForRole(user.role));
    }
  }, [hasAllowedRole, isCheckingSession, token, user]);

  if (isCheckingSession) {
    return (
      <main className="center-screen">
        <Spinner label="Checking session" />
      </main>
    );
  }

  if (!token || !user || !hasAllowedRole) {
    return null;
  }

  return children;
}
