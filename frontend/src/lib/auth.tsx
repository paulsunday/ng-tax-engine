"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "./api";

export interface JwtClaims {
  sub: string;
  email: string;
  organizationId: string | null;
  roleId: string | null;
  roleName: string | null;
  isPlatformAdmin: boolean;
  isTaxRuleApprover: boolean;
}

/** Decodes the JWT payload client-side for display purposes only — the API is the only
 * party that ever verifies the signature. Never trust this for an authorization decision. */
function decodeClaims(token: string): JwtClaims | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

interface AuthContextValue {
  claims: JwtClaims | null;
  isLoading: boolean;
  setAccessToken: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// The stored token is external state (localStorage), so it's read through
// useSyncExternalStore rather than copied into React state from an effect. The server
// snapshot is `undefined`, which is what marks the pre-hydration "still loading" phase.
const tokenListeners = new Set<() => void>();

function subscribeToToken(listener: () => void) {
  tokenListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    tokenListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function notifyTokenChanged() {
  tokenListeners.forEach((listener) => listener());
}

const readStoredToken = () => window.localStorage.getItem("accessToken");
const readServerToken = () => undefined;

export function AuthProvider({ children }: { children: ReactNode }) {
  const storedToken = useSyncExternalStore<string | null | undefined>(subscribeToToken, readStoredToken, readServerToken);
  const claims = useMemo(() => (storedToken ? decodeClaims(storedToken) : null), [storedToken]);
  const isLoading = storedToken === undefined;
  const router = useRouter();

  function setAccessToken(token: string) {
    setToken(token);
    notifyTokenChanged();
  }

  function logout() {
    setToken(null);
    notifyTokenChanged();
    router.push("/login");
  }

  return <AuthContext.Provider value={{ claims, isLoading, setAccessToken, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
