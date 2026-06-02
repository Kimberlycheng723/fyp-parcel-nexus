import { useEffect } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import { navigate } from "../utils/navigation.js";
import { Spinner } from "./Spinner.jsx";

export function ProtectedRoute({ children }) {
  const { token, isCheckingSession, user } = useAuth();

  useEffect(() => {
    if (!isCheckingSession && (!token || !user)) {
      navigate("/login");
    }
  }, [isCheckingSession, token, user]);

  if (isCheckingSession) {
    return (
      <main className="center-screen">
        <Spinner label="Checking session" />
      </main>
    );
  }

  if (!token || !user) {
    return null;
  }

  return children;
}
