import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken } from "../api/client";
import type { AuthConfig, Me, Permission, TokenResponse } from "../api/types";

type Status = "loading" | "unauthenticated" | "onboarding" | "authenticated";

interface AuthState {
  status: Status;
  me: Me | null;
  config: AuthConfig | null;
  onboardingToken: string | null;
  handleLogin: (resp: TokenResponse) => Promise<void>;
  completeOnboarding: (resp: TokenResponse) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  can: (perm: Permission) => boolean;
  isAdmin: boolean;
}

const ONBOARDING_KEY = "pathoslide_onboarding";
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [onboardingToken, setOnboardingToken] = useState<string | null>(
    () => sessionStorage.getItem(ONBOARDING_KEY),
  );

  const refreshMe = useCallback(async () => {
    const { data } = await api.get<Me>("/auth/me");
    setMe(data);
  }, []);

  // Bootstrap: load public auth config + resolve any existing session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = (await api.get<AuthConfig>("/auth/config")).data;
        if (!cancelled) setConfig(cfg);
      } catch {
        /* backend may not be up yet; login page still renders */
      }
      if (getToken()) {
        try {
          const { data } = await api.get<Me>("/auth/me");
          if (!cancelled) {
            setMe(data);
            setStatus("authenticated");
          }
          return;
        } catch {
          setToken(null);
        }
      }
      if (!cancelled) {
        setStatus(sessionStorage.getItem(ONBOARDING_KEY) ? "onboarding" : "unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = useCallback(
    async (resp: TokenResponse) => {
      if (resp.needs_onboarding) {
        sessionStorage.setItem(ONBOARDING_KEY, resp.access_token);
        setOnboardingToken(resp.access_token);
        setStatus("onboarding");
        return;
      }
      setToken(resp.access_token);
      await refreshMe();
      setStatus("authenticated");
    },
    [refreshMe],
  );

  const completeOnboarding = useCallback(
    async (resp: TokenResponse) => {
      setToken(resp.access_token);
      sessionStorage.removeItem(ONBOARDING_KEY);
      setOnboardingToken(null);
      await refreshMe();
      setStatus("authenticated");
    },
    [refreshMe],
  );

  const logout = useCallback(() => {
    setToken(null);
    sessionStorage.removeItem(ONBOARDING_KEY);
    setOnboardingToken(null);
    setMe(null);
    setStatus("unauthenticated");
  }, []);

  const can = useCallback(
    (perm: Permission) => {
      if (!me) return false;
      if (me.user.role === "admin") return true;
      return me.user.permissions.includes(perm);
    },
    [me],
  );

  const value = useMemo<AuthState>(
    () => ({
      status,
      me,
      config,
      onboardingToken,
      handleLogin,
      completeOnboarding,
      logout,
      refreshMe,
      can,
      isAdmin: me?.user.role === "admin",
    }),
    [status, me, config, onboardingToken, handleLogin, completeOnboarding, logout, refreshMe, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
