"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";
import { Button, Card, EmptyState, Input, PageHeader, StatusBadge } from "@/components/ui";

interface AuditRun {
  id: string;
  runType: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  createdAt: string;
}

function AuditPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [runs, setRuns] = useState<AuditRun[] | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    api.get<AuditRun[]>(`/companies/${companyId}/audit-runs`).then(setRuns).catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load audit runs."));
  }
  useEffect(reload, [companyId]);

  async function runAudit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/audit-runs`, { periodStart, periodEnd });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to run audit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto mt-10 px-4 pb-16">
      <CompanySubNav companyId={companyId} active="Audit" />
      <PageHeader
        title="Normal Audit"
        subtitle="Scans real, already-posted records for anomalies — never fabricates or assumes fraud/theft, only flags findings that require a human's review."
      />

      <form onSubmit={runAudit} className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Period start</label>
          <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Period end</label>
          <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Running…" : "Run audit"}
        </Button>
      </form>

      {error && <p className="text-danger text-sm mb-3">{error}</p>}
      {runs?.length === 0 && <EmptyState>No audit runs yet.</EmptyState>}
      <ul className="flex flex-col gap-2 text-sm">
        {runs?.map((r) => (
          <li key={r.id}>
            <Link href={`/companies/${companyId}/audit/${r.id}`}>
              <Card className="hover:border-primary/40 transition-colors !p-4">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {new Date(r.periodStart).toLocaleDateString()} – {new Date(r.periodEnd).toLocaleDateString()}
                  </span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-muted text-xs mt-1">Run {new Date(r.createdAt).toLocaleString()}</div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <AuditPage />
    </RequireAuth>
  );
}
