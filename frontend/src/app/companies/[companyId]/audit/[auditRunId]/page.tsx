"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge, Button, StatusBadge } from "@/components/ui";

interface Finding {
  id: string;
  category: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  description: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  resolutionNotes: string | null;
}

interface AuditRunDetail {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  findings: Finding[];
}

const SEVERITY_TONE = { LOW: "neutral", MEDIUM: "warning", HIGH: "danger" } as const;

function AuditRunDetailView() {
  const { companyId, auditRunId } = useParams<{ companyId: string; auditRunId: string }>();
  const [run, setRun] = useState<AuditRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<Record<string, string>>({});

  function reload() {
    api.get<AuditRunDetail>(`/companies/${companyId}/audit-runs/${auditRunId}`).then(setRun).catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load audit run."));
  }
  useEffect(reload, [companyId, auditRunId]);

  async function resolve(findingId: string, status: "RESOLVED" | "DISMISSED") {
    const resolutionNotes = notesFor[findingId]?.trim();
    if (!resolutionNotes) {
      setError("Enter resolution notes before resolving or dismissing a finding.");
      return;
    }
    setError(null);
    try {
      await api.post(`/companies/${companyId}/audit-runs/findings/${findingId}/resolve`, { status, resolutionNotes });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to resolve finding.");
    }
  }

  if (!run) {
    return <div className="max-w-2xl mx-auto mt-10 px-4">{error ? <p className="text-danger text-sm">{error}</p> : <p className="text-sm text-muted">Loading…</p>}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto mt-10 px-4 pb-16">
      <Link href={`/companies/${companyId}/audit`} className="text-sm text-primary hover:underline">
        ← Audit runs
      </Link>
      <div className="mt-3 mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          {new Date(run.periodStart).toLocaleDateString()} – {new Date(run.periodEnd).toLocaleDateString()}
        </h1>
        <div className="mt-2">
          <StatusBadge status={run.status} />
        </div>
      </div>

      {error && <p className="text-danger text-sm mb-3">{error}</p>}

      {run.findings.length === 0 && <p className="text-sm text-muted">No findings — nothing anomalous detected for this period.</p>}
      <ul className="flex flex-col gap-3">
        {run.findings.map((f) => (
          <li key={f.id} className="bg-surface border border-border rounded-xl p-4 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <Badge tone={SEVERITY_TONE[f.severity]}>{f.severity}</Badge>
              <span className="text-muted text-xs">{f.category.replaceAll("_", " ")}</span>
              <span className="ml-auto">
                <StatusBadge status={f.status} />
              </span>
            </div>
            <p>{f.description}</p>
            {f.status === "OPEN" ? (
              <div className="mt-3 flex flex-col gap-2">
                <textarea
                  placeholder="Resolution notes (required)"
                  value={notesFor[f.id] ?? ""}
                  onChange={(e) => setNotesFor((prev) => ({ ...prev, [f.id]: e.target.value }))}
                  className="border border-border rounded-lg px-3 py-2 text-xs bg-surface text-foreground placeholder:text-muted w-full"
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => resolve(f.id, "RESOLVED")}>
                    Resolve
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => resolve(f.id, "DISMISSED")}>
                    Dismiss
                  </Button>
                </div>
              </div>
            ) : (
              f.resolutionNotes && <p className="text-xs text-muted mt-2 border-t border-border pt-2">{f.resolutionNotes}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <AuditRunDetailView />
    </RequireAuth>
  );
}
