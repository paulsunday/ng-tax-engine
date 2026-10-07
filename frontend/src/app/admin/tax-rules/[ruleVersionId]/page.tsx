"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";

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
    return <div className="max-w-2xl mx-auto mt-10 px-4 text-sm text-gray-500">Restricted to platform administrators and designated tax-rule approvers.</div>;
  }

  if (!rule) {
    return <div className="max-w-2xl mx-auto mt-10 px-4">{error ? <p className="text-red-600 text-sm">{error}</p> : <p className="text-sm text-gray-500">Loading…</p>}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto mt-10 px-4 pb-16">
      <Link href="/admin/tax-rules" className="text-sm text-blue-600 hover:underline">
        ← Tax rules
      </Link>
      <h1 className="text-xl font-semibold mt-3 mb-1">{rule.taxRule.ruleKey}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {rule.taxRule.taxType} · {rule.taxRule.jurisdiction} · v{rule.ruleVersion} · status <strong>{rule.status}</strong> · confidence {rule.confidence}
      </p>
      <p className="text-sm mb-4">{rule.taxRule.description}</p>

      <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded mb-6 overflow-x-auto">{JSON.stringify(rule.value, null, 2)}</pre>

      <textarea
        placeholder="Notes / reason (required for research, request-revision, reject; optional for approve/activate)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="border rounded px-3 py-2 text-sm w-full mb-3"
        rows={3}
      />

      <div className="flex flex-wrap gap-2">
        {rule.status === "DRAFT" && <ActionButton label="Mark researched" busy={busy} onClick={() => act("research")} />}
        {rule.status === "RESEARCHED" && <ActionButton label="Mark verified" busy={busy} onClick={() => act("verify")} />}
        {rule.status === "VERIFIED" && <ActionButton label="Submit for approval" busy={busy} onClick={() => act("submit-for-approval")} />}
        {rule.status === "PENDING_APPROVAL" && (
          <>
            <ActionButton label="Approve" busy={busy} onClick={() => act("approve")} />
            <ActionButton label="Reject" busy={busy} onClick={() => act("reject")} />
            <ActionButton label="Request revision" busy={busy} onClick={() => act("request-revision")} />
          </>
        )}
        {rule.status === "APPROVED" && <ActionButton label="Activate" busy={busy} onClick={() => act("activate")} />}
      </div>

      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      {notice && <p className="text-gray-700 text-sm mt-3">{notice}</p>}
    </div>
  );
}

function ActionButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={busy} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50">
      {label}
    </button>
  );
}

export default function Page() {
  return (
    <RequireAuth requireOrganization={false}>
      <RuleDetailView />
    </RequireAuth>
  );
}
