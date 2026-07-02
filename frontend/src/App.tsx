import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { CenterSpinner } from "./components/ui";
import Layout from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import ReportsPage from "./pages/ReportsPage";
import ReportDetailPage from "./pages/ReportDetailPage";
import SlideViewerPage from "./pages/SlideViewerPage";
import SharedSlidePage from "./pages/SharedSlidePage";
import UsersPage from "./pages/UsersPage";
import NotFound from "./pages/NotFound";

/** Redirects away from /login and /onboarding when they don't apply. */
function PublicOnly({ children, requireOnboarding }: { children: React.ReactNode; requireOnboarding?: boolean }) {
  const { status } = useAuth();
  if (status === "loading") return <CenterSpinner />;
  if (status === "authenticated") return <Navigate to="/" replace />;
  if (requireOnboarding && status !== "onboarding") return <Navigate to="/login" replace />;
  if (!requireOnboarding && status === "onboarding") return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/onboarding" element={<PublicOnly requireOnboarding><Onboarding /></PublicOnly>} />
      <Route path="/shared/:token" element={<SharedSlidePage />} />

      {/* Full-screen authenticated viewer (outside the app chrome) */}
      <Route
        path="/slides/:id"
        element={
          <ProtectedRoute>
            <SlideViewerPage />
          </ProtectedRoute>
        }
      />

      {/* App shell */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/:id" element={<ReportDetailPage />} />
        <Route
          path="/users"
          element={
            <ProtectedRoute adminOnly>
              <UsersPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
