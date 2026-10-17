"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";
import { Badge, Button, Input, PageHeader, Select, Table, Thead, Th, Td, Tr } from "@/components/ui";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

const REPORTS = ["Profit & Loss", "Balance Sheet", "AR Aging", "AP Aging", "Cash Movement"] as const;
type ReportName = (typeof REPORTS)[number];

function ReportsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [active, setActive] = useState<ReportName>("Profit & Loss");
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    api.get<Account[]>(`/companies/${companyId}/accounts`).then(setAccounts).catch(() => setAccounts([]));
  }, [companyId]);

  return (
    <div className="max-w-3xl mx-auto mt-10 px-4 pb-16">
      <CompanySubNav companyId={companyId} active="Reports" />
      <PageHeader title="Financial Statements" />

      <div className="flex gap-1 mb-6 border-b border-border text-sm overflow-x-auto">
        {REPORTS.map((r) => (
          <button
            key={r}
            onClick={() => setActive(r)}
            className={`px-3 py-2 whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active === r ? "border-primary text-primary font-medium" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {active === "Profit & Loss" && <ProfitAndLossReport companyId={companyId} />}
      {active === "Balance Sheet" && <BalanceSheetReport companyId={companyId} />}
      {active === "AR Aging" && <AgingReport companyId={companyId} kind="ar-aging" label="customer" />}
      {active === "AP Aging" && <AgingReport companyId={companyId} kind="ap-aging" label="supplier" />}
      {active === "Cash Movement" && <CashMovementReport companyId={companyId} accounts={accounts} />}
    </div>
  );
}

function ProfitAndLossReport({ companyId }: { companyId: string }) {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [data, setData] = useState<{
    revenue: { code: string; name: string; amountNgn: number }[];
    totalRevenueNgn: number;
    costOfSales: { code: string; name: string; amountNgn: number }[];
    totalCostOfSalesNgn: number;
    grossProfitNgn: number;
    operatingExpenses: { code: string; name: string; amountNgn: number }[];
    totalOperatingExpensesNgn: number;
    netProfitBeforeTaxNgn: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setData(await api.get(`/companies/${companyId}/financial-statements/profit-and-loss?periodStart=${periodStart}&periodEnd=${periodEnd}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load P&L.");
    }
  }

  return (
    <div>
      <PeriodPicker periodStart={periodStart} periodEnd={periodEnd} setPeriodStart={setPeriodStart} setPeriodEnd={setPeriodEnd} onRun={load} />
      {error && <p className="text-danger text-sm mb-3">{error}</p>}
      {data && (
        <div className="bg-surface border border-border rounded-xl p-5 text-sm flex flex-col gap-1">
          <StatementSection title="Revenue" lines={data.revenue} total={data.totalRevenueNgn} />
          <StatementSection title="Cost of Sales" lines={data.costOfSales} total={data.totalCostOfSalesNgn} />
          <div className="flex justify-between font-medium border-t border-border pt-1.5 mt-1">
            <span>Gross Profit</span>
            <span>₦{data.grossProfitNgn.toLocaleString()}</span>
          </div>
          <StatementSection title="Operating Expenses" lines={data.operatingExpenses} total={data.totalOperatingExpensesNgn} />
          <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-1 text-base">
            <span>Net Profit Before Tax</span>
            <span>₦{data.netProfitBeforeTaxNgn.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function BalanceSheetReport({ companyId }: { companyId: string }) {
  const [asOfDate, setAsOfDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [data, setData] = useState<{
    assets: { code: string; name: string; amountNgn: number }[];
    totalAssetsNgn: number;
    liabilities: { code: string; name: string; amountNgn: number }[];
    totalLiabilitiesNgn: number;
    equity: { code: string; name: string; amountNgn: number }[];
    currentPeriodProfitNgn: number;
    totalEquityNgn: number;
    isBalanced: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setData(await api.get(`/companies/${companyId}/financial-statements/balance-sheet?asOfDate=${asOfDate}&periodStart=${periodStart}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load balance sheet.");
    }
  }

  return (
    <div>
      <div className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Profit period start</label>
          <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">As of date</label>
          <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </div>
        <Button onClick={load}>Run</Button>
      </div>
      {error && <p className="text-danger text-sm mb-3">{error}</p>}
      {data && (
        <div className="bg-surface border border-border rounded-xl p-5 text-sm flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge tone={data.isBalanced ? "success" : "danger"}>{data.isBalanced ? "Balanced" : "Out of balance"}</Badge>
          </div>
          <StatementSection title="Assets" lines={data.assets} total={data.totalAssetsNgn} />
          <StatementSection title="Liabilities" lines={data.liabilities} total={data.totalLiabilitiesNgn} />
          <StatementSection title="Equity" lines={data.equity} total={data.totalEquityNgn - data.currentPeriodProfitNgn} />
          <div className="flex justify-between">
            <span className="text-muted">Current period profit (retained)</span>
            <span>₦{data.currentPeriodProfitNgn.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-1 text-base">
            <span>Total Equity</span>
            <span>₦{data.totalEquityNgn.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface AgingItem {
  id: string;
  partyName: string;
  dueDate: string;
  outstandingNgn: number;
  daysOverdue: number;
  bucket: string;
}

function AgingReport({ companyId, kind, label }: { companyId: string; kind: "ar-aging" | "ap-aging"; label: string }) {
  const [asOfDate, setAsOfDate] = useState("");
  const [data, setData] = useState<{ buckets: { label: string; amountNgn: number }[]; items: AgingItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setData(await api.get(`/companies/${companyId}/financial-statements/${kind}${asOfDate ? `?asOfDate=${asOfDate}` : ""}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load aging report.");
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  return (
    <div>
      <div className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">As of date (defaults to today)</label>
          <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </div>
        <Button onClick={load}>Run</Button>
      </div>
      {error && <p className="text-danger text-sm mb-3">{error}</p>}
      {data && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {data.buckets.map((b) => (
              <div key={b.label} className="bg-surface border border-border rounded-lg px-3 py-2 text-xs">
                <div className="text-muted">{b.label.replaceAll("_", " ")}</div>
                <div className="font-medium">₦{b.amountNgn.toLocaleString()}</div>
              </div>
            ))}
          </div>
          <Table>
            <Thead>
              <tr>
                <Th>{label.charAt(0).toUpperCase() + label.slice(1)}</Th>
                <Th>Due date</Th>
                <Th>Days overdue</Th>
                <Th>Outstanding (₦)</Th>
              </tr>
            </Thead>
            <tbody>
              {data.items.map((i) => (
                <Tr key={i.id}>
                  <Td>{i.partyName}</Td>
                  <Td>{new Date(i.dueDate).toLocaleDateString()}</Td>
                  <Td className={i.daysOverdue > 0 ? "text-danger" : ""}>{i.daysOverdue}</Td>
                  <Td>{i.outstandingNgn.toLocaleString()}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}

function CashMovementReport({ companyId, accounts }: { companyId: string; accounts: Account[] }) {
  const [cashAccountId, setCashAccountId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [data, setData] = useState<{ bySource: Record<string, number>; netCashMovementNgn: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cashAccounts = accounts.filter((a) => a.type === "ASSET");

  async function load() {
    setError(null);
    if (!cashAccountId) {
      setError("Select a cash/bank account first.");
      return;
    }
    try {
      setData(await api.get(`/companies/${companyId}/financial-statements/cash-movement?cashAccountId=${cashAccountId}&periodStart=${periodStart}&periodEnd=${periodEnd}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load cash movement.");
    }
  }

  return (
    <div>
      <p className="text-xs text-muted mb-3">
        Simplified direct-method summary grouped by transaction source — not a full IAS-7 Operating/Investing/Financing statement.
      </p>
      <div className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-wrap items-end gap-3">
        <Select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)} className="flex-1">
          <option value="">Select cash/bank account…</option>
          {cashAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.name}
            </option>
          ))}
        </Select>
        <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        <Button onClick={load}>Run</Button>
      </div>
      {error && <p className="text-danger text-sm mb-3">{error}</p>}
      {data && (
        <div className="bg-surface border border-border rounded-xl p-5 text-sm flex flex-col gap-1.5">
          {Object.entries(data.bySource).map(([source, amount]) => (
            <div key={source} className="flex justify-between">
              <span className="text-muted">{source.replaceAll("_", " ")}</span>
              <span>₦{amount.toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-1">
            <span>Net movement</span>
            <span>₦{data.netCashMovementNgn.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PeriodPicker({
  periodStart,
  periodEnd,
  setPeriodStart,
  setPeriodEnd,
  onRun,
}: {
  periodStart: string;
  periodEnd: string;
  setPeriodStart: (v: string) => void;
  setPeriodEnd: (v: string) => void;
  onRun: () => void;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Period start</label>
        <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Period end</label>
        <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
      </div>
      <Button onClick={onRun}>Run</Button>
    </div>
  );
}

function StatementSection({ title, lines, total }: { title: string; lines: { code: string; name: string; amountNgn: number }[]; total: number }) {
  if (lines.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="text-muted font-medium mt-2 mb-1">{title}</div>
      {lines.map((l) => (
        <div key={l.code} className="flex justify-between pl-2">
          <span>{l.name}</span>
          <span>₦{l.amountNgn.toLocaleString()}</span>
        </div>
      ))}
      <div className="flex justify-between pl-2 text-muted">
        <span>Total {title.toLowerCase()}</span>
        <span>₦{total.toLocaleString()}</span>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <ReportsPage />
    </RequireAuth>
  );
}
