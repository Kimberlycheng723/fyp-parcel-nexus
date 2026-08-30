import { useEffect, useState } from "react";

import { ProtectedRoute } from "./components/ProtectedRoute.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ResidentNotificationProvider } from "./context/ResidentNotificationContext.jsx";
import { AccountsPage } from "./pages/AccountsPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { ParcelManagementPage } from "./pages/ParcelManagementPage.jsx";
import { ParcelRegistrationPage } from "./pages/ParcelRegistrationPage.jsx";
import { ProfilePage } from "./pages/ProfilePage.jsx";
import { GuardVerifyCollectionPage } from "./pages/GuardVerifyCollectionPage.jsx";
import { ResidentCollectionPage } from "./pages/ResidentCollectionPage.jsx";
import { ResidentDisputeDetailPage } from "./pages/ResidentDisputeDetailPage.jsx";
import { ResidentDisputesPage } from "./pages/ResidentDisputesPage.jsx";
import { StaffDisputesPage } from "./pages/StaffDisputesPage.jsx";
import { ResidentNotificationsPage } from "./pages/ResidentNotificationsPage.jsx";
import { RaiseDisputePage } from "./pages/RaiseDisputePage.jsx";
import { ActivateAccountPage, ResetPasswordPage, VerifyEmailChangePage } from "./pages/ResetPasswordPage.jsx";
import { getCurrentPath, navigate, replaceNavigate } from "./utils/navigation.js";
import { landingPathForRole } from "./utils/roleLanding.js";

const APP_PATHS = new Set([
  "/",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/activate",
  "/verify-email-change",
  "/profile",
  "/accounts",
  "/dashboard",
  "/parcels",
  "/parcels/new",
  "/parcel-collection",
  "/notifications",
  "/disputes",
  "/disputes/new",
  "/verify-collection"
]);

const DISPUTE_DETAIL_PATH = /^\/disputes\/([0-9a-f-]{36})$/i;

function isKnownAppPath(path) {
  return APP_PATHS.has(path) || DISPUTE_DETAIL_PATH.test(path);
}

function PublicAuthRoute({ children }) {
  const { token, user, isCheckingSession } = useAuth();

  useEffect(() => {
    if (!isCheckingSession && token && user) {
      replaceNavigate(landingPathForRole(user.role));
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
      replaceNavigate(token && user ? landingPathForRole(user.role) : "/login");
    }
  }, [path, token, user, isCheckingSession]);

  useEffect(() => {
    if (!isKnownAppPath(path) && !isCheckingSession) {
      replaceNavigate(token && user ? landingPathForRole(user.role) : "/login");
    }
  }, [path, token, user, isCheckingSession]);

  useEffect(() => {
    if (path === "/dashboard" && !isCheckingSession && token && user?.role === "SUPER_ADMIN") {
      replaceNavigate("/accounts");
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

  if (path === "/verify-email-change") {
    return <VerifyEmailChangePage />;
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

  if (path === "/parcel-collection") {
    return (
      <ProtectedRoute allowedRoles={["RESIDENT"]}>
        <ResidentCollectionPage />
      </ProtectedRoute>
    );
  }

  if (path === "/notifications") {
    return (
      <ProtectedRoute allowedRoles={["SUPER_ADMIN", "ADMIN", "GUARD", "RESIDENT"]}>
        <ResidentNotificationsPage />
      </ProtectedRoute>
    );
  }

  if (path === "/disputes") {
    return (
      <ProtectedRoute allowedRoles={["RESIDENT", "GUARD", "ADMIN"]}>
        {user?.role === "RESIDENT" ? <ResidentDisputesPage /> : <StaffDisputesPage />}
      </ProtectedRoute>
    );
  }

  if (path === "/disputes/new") {
    return (
      <ProtectedRoute allowedRoles={["RESIDENT"]}>
        <RaiseDisputePage />
      </ProtectedRoute>
    );
  }

  const disputeDetailMatch = path.match(DISPUTE_DETAIL_PATH);
  if (disputeDetailMatch) {
    return (
      <ProtectedRoute allowedRoles={["RESIDENT"]}>
        <ResidentDisputeDetailPage disputeId={disputeDetailMatch[1]} />
      </ProtectedRoute>
    );
  }

  if (path === "/verify-collection") {
    return (
      <ProtectedRoute allowedRoles={["GUARD"]}>
        <GuardVerifyCollectionPage />
      </ProtectedRoute>
    );
  }

  return (
    <main className="center-screen">
      <span>{isCheckingSession ? "Checking session..." : "Opening Parcel Nexus..."}</span>
    </main>
  );
}

function App() {
  return (
    <AuthProvider>
      <ResidentNotificationProvider>
        <Router />
      </ResidentNotificationProvider>
    </AuthProvider>
  );
}

export default App;
