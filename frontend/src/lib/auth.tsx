"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [claims, setClaims] = useState<JwtClaims | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const existing = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (existing) setClaims(decodeClaims(existing));
    setIsLoading(false);
  }, []);

  function setAccessToken(token: string) {
    setToken(token);
    setClaims(decodeClaims(token));
  }

  function logout() {
    setToken(null);
    setClaims(null);
    router.push("/login");
  }

  return <AuthContext.Provider value={{ claims, isLoading, setAccessToken, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
