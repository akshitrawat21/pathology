import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { CenterSpinner } from "./ui";

export function ProtectedRoute({
  children,
  adminOnly,
}: {
  children: ReactNode;
  adminOnly?: boolean;
}) {
  const { status, isAdmin } = useAuth();

  if (status === "loading") return <CenterSpinner />;
  if (status === "onboarding") return <Navigate to="/onboarding" replace />;
  if (status !== "authenticated") return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
