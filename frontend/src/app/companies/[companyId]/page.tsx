"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";

interface Company {
  id: string;
  name: string;
  tin: string | null;
  headOfficeStateCode: string;
}

interface ComplianceEntry {
  id: string;
  taxType: string;
  periodLabel: string;
  statutoryDeadline: string;
  daysRemaining: number;
  isOverdue: boolean;
  amountNgn: string | null;
}

interface TaxReturn {
  id: string;
  taxType: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  complianceState: string;
  taxLiabilityNgn: string | null;
}

const TAX_TYPES = ["CIT", "VAT", "PAYE", "WHT"] as const;

function CompanyDetail() {
  const params = useParams<{ companyId: string }>();
  const companyId = params.companyId;

  const [company, setCompany] = useState<Company | null>(null);
  const [calendar, setCalendar] = useState<ComplianceEntry[] | null>(null);
  const [taxReturns, setTaxReturns] = useState<TaxReturn[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get<Company>(`/companies/${companyId}`).then(setCompany).catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load company."));
    api.get<ComplianceEntry[]>(`/companies/${companyId}/compliance-calendar`).then(setCalendar).catch(() => setCalendar([]));
    api.get<TaxReturn[]>(`/companies/${companyId}/tax-returns`).then(setTaxReturns).catch(() => setTaxReturns([]));
  }

  useEffect(reload, [companyId]);

  return (
    <div className="max-w-4xl mx-auto mt-10 px-4 pb-16">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← All companies
      </Link>
      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      {company && (
        <div className="mt-3 mb-8">
          <h1 className="text-xl font-semibold">{company.name}</h1>
          <p className="text-sm text-gray-500">
            HQ: {company.headOfficeStateCode} {company.tin ? `· TIN: ${company.tin}` : "· No TIN on file"}
          </p>
        </div>
      )}

      <RunCalculationForm companyId={companyId} onComputed={reload} />

      <section className="mt-10">
        <h2 className="text-sm font-semibold mb-3">Compliance calendar</h2>
        {calendar?.length === 0 && <p className="text-sm text-gray-500">No compliance calendar entries yet.</p>}
        {calendar && calendar.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2">Tax type</th>
                <th>Period</th>
                <th>Statutory deadline</th>
                <th>Days remaining</th>
              </tr>
            </thead>
            <tbody>
              {calendar.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="py-2">{e.taxType}</td>
                  <td>{e.periodLabel}</td>
                  <td>{new Date(e.statutoryDeadline).toLocaleDateString()}</td>
                  <td className={e.isOverdue ? "text-red-600 font-medium" : ""}>
                    {e.isOverdue ? "OVERDUE" : `${e.daysRemaining} days`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold mb-3">Tax returns</h2>
        {taxReturns?.length === 0 && <p className="text-sm text-gray-500">No tax returns yet — run a calculation above.</p>}
        {taxReturns && taxReturns.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2">Tax type</th>
                <th>Period</th>
                <th>Status</th>
                <th>Compliance state</th>
                <th>Liability (₦)</th>
              </tr>
            </thead>
            <tbody>
              {taxReturns.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">
                    <Link href={`/companies/${companyId}/tax-returns/${r.id}`} className="text-blue-600 hover:underline">
                      {r.taxType}
                    </Link>
                  </td>
                  <td>
                    {new Date(r.periodStart).toLocaleDateString()} – {new Date(r.periodEnd).toLocaleDateString()}
                  </td>
                  <td>{r.status}</td>
                  <td>
                    <ComplianceStateBadge state={r.complianceState} />
                  </td>
                  <td>{r.taxLiabilityNgn !== null ? Number(r.taxLiabilityNgn).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export function ComplianceStateBadge({ state }: { state: string }) {
  const color =
    state === "CALCULATED"
      ? "bg-green-100 text-green-800"
      : state === "PENDING_RULE_APPROVAL"
        ? "bg-yellow-100 text-yellow-800"
        : state === "CALCULATION_ERROR"
          ? "bg-red-100 text-red-800"
          : "bg-gray-100 text-gray-700";
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{state.replaceAll("_", " ")}</span>;
}

function RunCalculationForm({ companyId, onComputed }: { companyId: string; onComputed: () => void }) {
  const [taxType, setTaxType] = useState<(typeof TAX_TYPES)[number]>("VAT");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      const endpoint = `/companies/${companyId}/tax-calculations/${taxType.toLowerCase()}`;
      await api.post(endpoint, { periodStart, periodEnd });
      setNotice("Calculation complete — see the Tax Returns table below. A \"PENDING RULE APPROVAL\" state means the governing rule hasn't been signed off by a tax professional yet, so there's honestly no liability figure yet, not an error.");
      onComputed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Calculation failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded p-4 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Tax type</label>
        <select value={taxType} onChange={(e) => setTaxType(e.target.value as (typeof TAX_TYPES)[number])} className="border rounded px-3 py-2 text-sm">
          {TAX_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Period start</label>
        <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required className="border rounded px-3 py-2 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Period end</label>
        <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required className="border rounded px-3 py-2 text-sm" />
      </div>
      <button type="submit" disabled={isSubmitting} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50">
        {isSubmitting ? "Calculating…" : "Run calculation"}
      </button>
      {error && <p className="text-red-600 text-sm w-full">{error}</p>}
      {notice && <p className="text-gray-600 text-sm w-full">{notice}</p>}
    </form>
  );
}

export default function CompanyDetailPage() {
  return (
    <RequireAuth>
      <CompanyDetail />
    </RequireAuth>
  );
}
