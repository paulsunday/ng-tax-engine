"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
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
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {!error && <p className="text-sm text-gray-500">Loading…</p>}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto mt-10 px-4 pb-16">
      <Link href={`/companies/${companyId}`} className="text-sm text-blue-600 hover:underline">
        ← Back to company
      </Link>

      <div className="mt-3 mb-6">
        <h1 className="text-xl font-semibold">
          {taxReturn.taxType} — {new Date(taxReturn.periodStart).toLocaleDateString()} to {new Date(taxReturn.periodEnd).toLocaleDateString()}
        </h1>
        <div className="flex items-center gap-2 mt-2 text-sm">
          <span className="text-gray-500">Status: {taxReturn.status}</span>
          <ComplianceStateBadge state={taxReturn.complianceState} />
        </div>
        <p className="text-sm mt-2">
          Liability:{" "}
          {taxReturn.taxLiabilityNgn !== null
            ? `₦${Number(taxReturn.taxLiabilityNgn).toLocaleString()}`
            : "Not available — see compliance state above for why."}
        </p>
        {taxReturn.rejectionReason && <p className="text-sm text-red-600 mt-1">Rejected: {taxReturn.rejectionReason}</p>}
      </div>

      {capability && (
        <div className="border rounded p-4 mb-6 text-sm">
          <p className="font-medium mb-1">Filing authority: {capability.authorityName}</p>
          <p className="text-gray-600">
            Filing capability: {capability.filingCapability.replaceAll("_", " ")} · Payment capability: {capability.paymentCapability.replaceAll("_", " ")}
          </p>
          {!capability.supportsAutomaticSubmission && (
            <p className="text-gray-500 mt-1">No confirmed official e-filing API exists for this authority — submission produces a manual filing package.</p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {taxReturn.status === "DRAFT" && (
          <button onClick={() => act("validate")} disabled={busy} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50">
            Validate
          </button>
        )}
        {taxReturn.status === "VALIDATED" && (
          <button onClick={() => act("approve")} disabled={busy} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50">
            Approve
          </button>
        )}
        {taxReturn.status === "APPROVED" && (
          <button onClick={() => act("submit")} disabled={busy} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50">
            Submit filing
          </button>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      {notice && <p className="text-gray-700 text-sm mt-3">{notice}</p>}

      <details className="mt-8">
        <summary className="text-sm text-gray-500 cursor-pointer">Full calculation breakdown (raw)</summary>
        <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded mt-2 overflow-x-auto">{JSON.stringify(taxReturn.calculationBreakdown, null, 2)}</pre>
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
