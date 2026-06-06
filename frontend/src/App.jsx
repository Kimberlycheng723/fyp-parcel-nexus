import { useEffect, useState } from "react";

import { ProtectedRoute } from "./components/ProtectedRoute.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { AccountsPage } from "./pages/AccountsPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { ParcelManagementPage } from "./pages/ParcelManagementPage.jsx";
import { ParcelRegistrationPage } from "./pages/ParcelRegistrationPage.jsx";
import { ProfilePage } from "./pages/ProfilePage.jsx";
import { ActivateAccountPage, ResetPasswordPage } from "./pages/ResetPasswordPage.jsx";
import { getCurrentPath, navigate, replaceNavigate } from "./utils/navigation.js";

function PublicAuthRoute({ children }) {
  const { token, user, isCheckingSession } = useAuth();

  useEffect(() => {
    if (!isCheckingSession && token && user) {
      replaceNavigate("/dashboard");
    }
  }, [token, user, isCheckingSession]);

  if (isCheckingSession) {
    return (
      <main className="center-screen">
        <span>Checking session...</span>
      </main>
    );
  }

  if (token && user) {
    return null;
  }

  return children;
}

function Router() {
  const [path, setPath] = useState(getCurrentPath());
  const { token, user, isCheckingSession } = useAuth();

  useEffect(() => {
    function handleRouteChange() {
      setPath(getCurrentPath());
    }

    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  useEffect(() => {
    if (path === "/" && !isCheckingSession) {
      navigate(token && user ? "/dashboard" : "/login");
    }
  }, [path, token, user, isCheckingSession]);

  if (path === "/login") {
    return (
      <PublicAuthRoute>
        <LoginPage />
      </PublicAuthRoute>
    );
  }

  if (path === "/forgot-password") {
    return (
      <PublicAuthRoute>
        <ForgotPasswordPage />
      </PublicAuthRoute>
    );
  }

  if (path === "/reset-password") {
    return <ResetPasswordPage />;
  }

  if (path === "/activate") {
    return <ActivateAccountPage />;
  }

  if (path === "/profile") {
    return (
      <ProtectedRoute>
        <ProfilePage />
      </ProtectedRoute>
    );
  }

  if (path === "/accounts") {
    return (
      <ProtectedRoute>
        <AccountsPage />
      </ProtectedRoute>
    );
  }

  if (path === "/dashboard") {
    return (
      <ProtectedRoute>
        <DashboardPage />
      </ProtectedRoute>
    );
  }

  if (path === "/parcels") {
    return (
      <ProtectedRoute>
        <ParcelManagementPage />
      </ProtectedRoute>
    );
  }

  if (path === "/parcels/new") {
    return (
      <ProtectedRoute>
        <ParcelRegistrationPage />
      </ProtectedRoute>
    );
  }

  return null;
}

function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}

export default App;
