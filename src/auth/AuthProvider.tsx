import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { authApi, AUTH_LOGOUT_EVENT, tokenStore } from "@/api";
import type { ApiRole, UserProfile } from "@/api/types";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: UserProfile | null;
  role: ApiRole | null;
  login: (email: string, password: string) => Promise<UserProfile>;
  register: (input: { fullName: string; email: string; password: string }) => Promise<UserProfile>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Home route for a given role — used by guards after login. */
export function roleHome(role: ApiRole | null): string {
  if (role === "instructor") return "/instructor";
  if (role === "admin") return "/admin";
  return "/student";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const loadUser = async () => {
    if (!tokenStore.access()) {
      setUser(null);
      setStatus("anonymous");
      return;
    }
    try {
      const me = await authApi.me();
      setUser(me);
      setStatus("authenticated");
    } catch {
      tokenStore.clear();
      setUser(null);
      setStatus("anonymous");
    }
  };

  // Bootstrap session on mount.
  useEffect(() => {
    void loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to the client's unrecoverable-auth signal (failed refresh).
  useEffect(() => {
    const onLogout = () => {
      setUser(null);
      setStatus("anonymous");
      navigate("/login", { replace: true });
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout);
  }, [navigate]);

  const login = async (email: string, password: string) => {
    await authApi.login(email, password);
    const me = await authApi.me();
    setUser(me);
    setStatus("authenticated");
    return me;
  };

  const register = async (input: { fullName: string; email: string; password: string }) => {
    const created = await authApi.register(input);
    // Registration does not return tokens — log in immediately.
    await login(input.email, input.password);
    return created;
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
    setStatus("anonymous");
    navigate("/login", { replace: true });
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      role: user?.role ?? null,
      login,
      register,
      logout,
      refreshUser: loadUser,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
