"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui";

interface RuleVersionDetail {
  id: string;
  ruleVersion: string;
  status: string;
  confidence: string;
  value: unknown;
  calculationMethod: string | null;
  effectiveFrom: string;
  taxRule: { ruleKey: string; taxType: string; jurisdiction: string; description: string };
}

function RuleDetailView() {
  const { ruleVersionId } = useParams<{ ruleVersionId: string }>();
  const { claims } = useAuth();
  const [rule, setRule] = useState<RuleVersionDetail | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    api.get<RuleVersionDetail>(`/tax-rule-governance/rules/${ruleVersionId}`).then(setRule).catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load rule."));
  }
  useEffect(reload, [ruleVersionId]);

  async function act(action: "research" | "verify" | "submit-for-approval" | "approve" | "reject" | "request-revision" | "activate") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const needsNotes = ["research", "request-revision", "reject"].includes(action);
      const body =
        action === "research" ? { researchNotes: notes }
        : action === "request-revision" ? { notes }
        : action === "reject" ? { reason: notes }
        : action === "approve" || action === "activate" ? { reason: notes || undefined }
        : {};
      if (needsNotes && !notes.trim()) {
        setError("Notes/reason required for this action.");
        setBusy(false);
        return;
      }
      await api.post(`/tax-rule-governance/rules/${ruleVersionId}/${action}`, body);
      setNotice(`Rule moved via "${action}".`);
      setNotes("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!claims?.isPlatformAdmin && !claims?.isTaxRuleApprover) {
    return <div className="max-w-2xl mx-auto mt-10 px-4 text-sm text-muted">Restricted to platform administrators and designated tax-rule approvers.</div>;
  }

  if (!rule) {
    return <div className="max-w-2xl mx-auto mt-10 px-4">{error ? <p className="text-danger text-sm">{error}</p> : <p className="text-sm text-muted">Loading…</p>}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto mt-10 px-4 pb-16">
      <Link href="/admin/tax-rules" className="text-sm text-primary hover:underline">
        ← Tax rules
      </Link>
      <h1 className="text-xl font-semibold tracking-tight mt-3 mb-1">{rule.taxRule.ruleKey}</h1>
      <p className="text-sm text-muted mb-4">
        {rule.taxRule.taxType} · {rule.taxRule.jurisdiction} · v{rule.ruleVersion} · status <strong className="text-foreground">{rule.status}</strong> · confidence {rule.confidence}
      </p>
      <p className="text-sm mb-4">{rule.taxRule.description}</p>

      <pre className="text-xs bg-surface-muted border border-border p-3 rounded-lg mb-6 overflow-x-auto">{JSON.stringify(rule.value, null, 2)}</pre>

      <textarea
        placeholder="Notes / reason (required for research, request-revision, reject; optional for approve/activate)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="border border-border rounded-lg px-3 py-2 text-sm bg-surface text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent w-full mb-3"
        rows={3}
      />

      <div className="flex flex-wrap gap-2">
        {rule.status === "DRAFT" && <Button disabled={busy} onClick={() => act("research")}>Mark researched</Button>}
        {rule.status === "RESEARCHED" && <Button disabled={busy} onClick={() => act("verify")}>Mark verified</Button>}
        {rule.status === "VERIFIED" && <Button disabled={busy} onClick={() => act("submit-for-approval")}>Submit for approval</Button>}
        {rule.status === "PENDING_APPROVAL" && (
          <>
            <Button disabled={busy} onClick={() => act("approve")}>Approve</Button>
            <Button variant="danger" disabled={busy} onClick={() => act("reject")}>Reject</Button>
            <Button variant="secondary" disabled={busy} onClick={() => act("request-revision")}>Request revision</Button>
          </>
        )}
        {rule.status === "APPROVED" && <Button disabled={busy} onClick={() => act("activate")}>Activate</Button>}
      </div>

      {error && <p className="text-danger text-sm mt-3">{error}</p>}
      {notice && <p className="text-muted text-sm mt-3">{notice}</p>}
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth requireOrganization={false}>
      <RuleDetailView />
    </RequireAuth>
  );
}
