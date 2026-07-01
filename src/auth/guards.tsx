import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth, roleHome } from "./AuthProvider";
import type { ApiRole } from "@/api/types";
import { Loading } from "@/components/states";

/** Gate that requires an authenticated session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Loading label="Checking your session…" />;
  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Gate that requires the session role to be one of `roles`. */
export function RequireRole({ roles, children }: { roles: ApiRole[]; children: ReactNode }) {
  const { status, role } = useAuth();
  if (status === "loading") return <Loading label="Checking access…" />;
  if (status === "anonymous") return <Navigate to="/login" replace />;
  if (!role || !roles.includes(role)) {
    // Authenticated but wrong role → send to the user's own home.
    return <Navigate to={roleHome(role)} replace />;
  }
  return <>{children}</>;
}
