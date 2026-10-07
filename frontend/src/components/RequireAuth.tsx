"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/** Redirects to /login if no token, or to /select-organization if the token has no org
 * scope yet — the same two-step login flow the backend enforces (mandate §10). */
export function RequireAuth({ children, requireOrganization = true }: { children: ReactNode; requireOrganization?: boolean }) {
  const { claims, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!claims) {
      router.replace("/login");
    } else if (requireOrganization && !claims.organizationId) {
      router.replace("/select-organization");
    }
  }, [isLoading, claims, requireOrganization, router]);

  if (isLoading || !claims || (requireOrganization && !claims.organizationId)) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return <>{children}</>;
}
