"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { Card } from "@/components/ui";

interface Membership {
  organizationId: string;
  organizationName: string;
  roleName: string;
}

function SelectOrganizationInner() {
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { setAccessToken, claims } = useAuth();
  const router = useRouter();

  useEffect(() => {
    api
      .get<Membership[]>("/auth/memberships")
      .then(setMemberships)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load memberships."));
  }, []);

  useEffect(() => {
    // Already scoped — nothing to pick.
    if (claims?.organizationId) router.replace("/");
  }, [claims, router]);

  async function pick(organizationId: string) {
    try {
      const res = await api.post<{ accessToken: string }>("/auth/switch-organization", { organizationId });
      setAccessToken(res.accessToken);
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to switch organization.");
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 px-4">
      <h1 className="text-xl font-semibold tracking-tight mb-6">Select an organization</h1>
      {error && <p className="text-danger text-sm mb-3">{error}</p>}
      {!memberships && !error && <p className="text-sm text-muted">Loading…</p>}
      <ul className="flex flex-col gap-2">
        {memberships?.map((m) => (
          <li key={m.organizationId}>
            <button onClick={() => pick(m.organizationId)} className="w-full text-left">
              <Card className="hover:border-primary/40 transition-colors flex justify-between items-center !p-4">
                <span>{m.organizationName}</span>
                <span className="text-muted text-sm">{m.roleName}</span>
              </Card>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SelectOrganizationPage() {
  return (
    <RequireAuth requireOrganization={false}>
      <SelectOrganizationInner />
    </RequireAuth>
  );
}
