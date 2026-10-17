"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { Button, Card } from "@/components/ui";
import { ComplianceStateBadge } from "../../page";

interface TaxReturnDetail {
  id: string;
  taxType: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  complianceState: string;
  confidence: string;
  taxLiabilityNgn: string | null;
  rejectionReason: string | null;
  calculationBreakdown: unknown;
}

interface FilingCapability {
  authorityName: string;
  supportsAutomaticSubmission: boolean;
  filingCapability: string;
  paymentCapability: string;
}

function TaxReturnDetailView() {
  const params = useParams<{ companyId: string; taxReturnId: string }>();
  const { companyId, taxReturnId } = params;

  const [taxReturn, setTaxReturn] = useState<TaxReturnDetail | null>(null);
  const [capability, setCapability] = useState<FilingCapability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    api
      .get<TaxReturnDetail>(`/companies/${companyId}/tax-returns/${taxReturnId}`)
      .then((r) => {
        setTaxReturn(r);
        return api.get<FilingCapability>(`/companies/${companyId}/filing-capability?taxType=${r.taxType}`);
      })
      .then(setCapability)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load tax return."));
  }

  useEffect(reload, [companyId, taxReturnId]);

  async function act(action: "validate" | "approve" | "submit") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (action === "validate") {
        const result = await api.post<{ valid: boolean; errors: string[] }>(`/companies/${companyId}/tax-returns/${taxReturnId}/validate`);
        setNotice(result.valid ? "Validated." : `Validation failed: ${result.errors.join("; ")}`);
      } else if (action === "approve") {
        await api.post(`/companies/${companyId}/tax-returns/${taxReturnId}/approve`);
        setNotice("Approved.");
      } else if (action === "submit") {
        const result = await api.post<{ succeeded: boolean; errors?: string[] }>(`/companies/${companyId}/tax-returns/${taxReturnId}/filing/submit`, { mode: "MANUAL" });
        setNotice(
          result.succeeded
            ? "Filing package generated — this authority has no confirmed e-filing API, so manual submission via the official portal is still required."
            : `Filing not completed: ${result.errors?.join("; ") ?? "see filing attempt history."}`
        );
      }
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!taxReturn) {
    return (
      <div className="max-w-2xl mx-auto mt-10 px-4">
        {error && <p className="text-danger text-sm">{error}</p>}
        {!error && <p className="text-sm text-muted">Loading…</p>}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto mt-10 px-4 pb-16">
      <Link href={`/companies/${companyId}`} className="text-sm text-primary hover:underline">
        ← Back to company
      </Link>

      <div className="mt-3 mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          {taxReturn.taxType} — {new Date(taxReturn.periodStart).toLocaleDateString()} to {new Date(taxReturn.periodEnd).toLocaleDateString()}
        </h1>
        <div className="flex items-center gap-2 mt-2 text-sm">
          <span className="text-muted">Status: {taxReturn.status}</span>
          <ComplianceStateBadge state={taxReturn.complianceState} />
        </div>
        <p className="text-sm mt-2">
          Liability:{" "}
          {taxReturn.taxLiabilityNgn !== null
            ? `₦${Number(taxReturn.taxLiabilityNgn).toLocaleString()}`
            : "Not available — see compliance state above for why."}
        </p>
        {taxReturn.rejectionReason && <p className="text-sm text-danger mt-1">Rejected: {taxReturn.rejectionReason}</p>}
      </div>

      {capability && (
        <Card className="mb-6 text-sm">
          <p className="font-medium mb-1">Filing authority: {capability.authorityName}</p>
          <p className="text-muted">
            Filing capability: {capability.filingCapability.replaceAll("_", " ")} · Payment capability: {capability.paymentCapability.replaceAll("_", " ")}
          </p>
          {!capability.supportsAutomaticSubmission && (
            <p className="text-muted mt-1">No confirmed official e-filing API exists for this authority — submission produces a manual filing package.</p>
          )}
        </Card>
      )}

      <div className="flex gap-2">
        {taxReturn.status === "DRAFT" && (
          <Button onClick={() => act("validate")} disabled={busy}>
            Validate
          </Button>
        )}
        {taxReturn.status === "VALIDATED" && (
          <Button onClick={() => act("approve")} disabled={busy}>
            Approve
          </Button>
        )}
        {taxReturn.status === "APPROVED" && (
          <Button onClick={() => act("submit")} disabled={busy}>
            Submit filing
          </Button>
        )}
      </div>

      {error && <p className="text-danger text-sm mt-3">{error}</p>}
      {notice && <p className="text-muted text-sm mt-3">{notice}</p>}

      <details className="mt-8">
        <summary className="text-sm text-muted cursor-pointer">Full calculation breakdown (raw)</summary>
        <pre className="text-xs bg-surface-muted p-3 rounded-lg mt-2 overflow-x-auto">{JSON.stringify(taxReturn.calculationBreakdown, null, 2)}</pre>
      </details>
    </div>
  );
}

export default function TaxReturnDetailPage() {
  return (
    <RequireAuth>
      <TaxReturnDetailView />
    </RequireAuth>
  );
}
