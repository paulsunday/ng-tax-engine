"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";
import { Badge, Button, EmptyState, Input, PageHeader, Select, Table, Thead, Th, Td, Tr } from "@/components/ui";

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
    <div className="max-w-6xl mx-auto mt-10 px-6 pb-16">
      <Link href="/" className="text-sm text-primary hover:underline">
        ← All companies
      </Link>
      {error && <p className="text-danger text-sm mt-3">{error}</p>}
      {company && (
        <div className="mt-3 mb-8">
          <h1 className="text-xl font-semibold tracking-tight">{company.name}</h1>
          <p className="text-sm text-muted">
            HQ: {company.headOfficeStateCode} {company.tin ? `· TIN: ${company.tin}` : "· No TIN on file"}
          </p>
        </div>
      )}

      <CompanySubNav companyId={companyId} active="Overview" />

      <RunCalculationForm companyId={companyId} onComputed={reload} />

      <section className="mt-10">
        <h2 className="text-sm font-semibold mb-3">Compliance calendar</h2>
        {calendar?.length === 0 && <EmptyState>No compliance calendar entries yet.</EmptyState>}
        {calendar && calendar.length > 0 && (
          <Table>
            <Thead>
              <tr>
                <Th>Tax type</Th>
                <Th>Period</Th>
                <Th>Statutory deadline</Th>
                <Th>Days remaining</Th>
              </tr>
            </Thead>
            <tbody>
              {calendar.map((e) => (
                <Tr key={e.id}>
                  <Td>{e.taxType}</Td>
                  <Td>{e.periodLabel}</Td>
                  <Td>{new Date(e.statutoryDeadline).toLocaleDateString()}</Td>
                  <Td className={e.isOverdue ? "text-danger font-medium" : ""}>{e.isOverdue ? "OVERDUE" : `${e.daysRemaining} days`}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold mb-3">Tax returns</h2>
        {taxReturns?.length === 0 && <EmptyState>No tax returns yet — run a calculation above.</EmptyState>}
        {taxReturns && taxReturns.length > 0 && (
          <Table>
            <Thead>
              <tr>
                <Th>Tax type</Th>
                <Th>Period</Th>
                <Th>Status</Th>
                <Th>Compliance state</Th>
                <Th>Liability (₦)</Th>
              </tr>
            </Thead>
            <tbody>
              {taxReturns.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`/companies/${companyId}/tax-returns/${r.id}`} className="text-primary hover:underline font-medium">
                      {r.taxType}
                    </Link>
                  </Td>
                  <Td>
                    {new Date(r.periodStart).toLocaleDateString()} – {new Date(r.periodEnd).toLocaleDateString()}
                  </Td>
                  <Td>{r.status}</Td>
                  <Td>
                    <ComplianceStateBadge state={r.complianceState} />
                  </Td>
                  <Td>{r.taxLiabilityNgn !== null ? Number(r.taxLiabilityNgn).toLocaleString() : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <ExportBusinessRecords companyId={companyId} />
    </div>
  );
}

function ExportBusinessRecords({ companyId }: { companyId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportAndDownload() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.get(`/companies/${companyId}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `business-records-${companyId}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 bg-surface border border-border rounded-xl p-5">
      <h2 className="text-sm font-semibold mb-2">Export business records</h2>
      <p className="text-xs text-muted mb-3">
        Downloads this company&apos;s full business records as JSON — customers, suppliers, invoices, expenses,
        chart of accounts, journal entries, assets, bank accounts, employees, tax returns, compliance calendar, and
        document metadata. This is the organization&apos;s own business data, distinct from an individual user&apos;s
        personal NDPA export under Settings.
      </p>
      <Button variant="secondary" onClick={exportAndDownload} disabled={busy}>
        {busy ? "Exporting…" : "Export business records"}
      </Button>
      {error && <p className="text-danger text-sm mt-2">{error}</p>}
    </section>
  );
}

/** PENDING_RULE_APPROVAL/withheld states must never read as success (brief: never fabricate a result). */
export function ComplianceStateBadge({ state }: { state: string }) {
  const tone = state === "CALCULATED" ? "success" : state === "PENDING_RULE_APPROVAL" ? "warning" : state === "CALCULATION_ERROR" ? "danger" : "neutral";
  return <Badge tone={tone}>{state.replaceAll("_", " ")}</Badge>;
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
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-5 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Tax type</label>
        <Select value={taxType} onChange={(e) => setTaxType(e.target.value as (typeof TAX_TYPES)[number])}>
          {TAX_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Period start</label>
        <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Period end</label>
        <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Calculating…" : "Run calculation"}
      </Button>
      {error && <p className="text-danger text-sm w-full">{error}</p>}
      {notice && <p className="text-muted text-sm w-full">{notice}</p>}
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
