"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";
import { Button, Input, PageHeader, Table, Thead, Th, Td, Tr } from "@/components/ui";

interface ScenarioRow {
  id: string;
  scenarioType: string;
  accountingProfitNgn: string;
  taxableProfitNgn: string;
  taxLiabilityNgn: string;
  adjustments?: { sourceType: string; description: string; adjustedValueNgn: string; approvalStatus: string }[];
}

interface Compare {
  normal: ScenarioRow | null;
  profitScenario: ScenarioRow | null;
  lossScenario: ScenarioRow | null;
}

function ScenariosPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [compare, setCompare] = useState<Compare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate(scenarioType: "NORMAL" | "PROFIT_SCENARIO" | "LOSS_SCENARIO") {
    if (!periodStart || !periodEnd) {
      setError("Set both period start and end first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/companies/${companyId}/scenarios`, { scenarioType, periodStart, periodEnd });
      await loadCompare();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate scenario.");
    } finally {
      setBusy(false);
    }
  }

  async function loadCompare() {
    try {
      const result = await api.get<Compare>(`/companies/${companyId}/scenarios/compare?periodStart=${periodStart}&periodEnd=${periodEnd}`);
      setCompare(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load comparison.");
    }
  }

  return (
    <div className="max-w-3xl mx-auto mt-10 px-4 pb-16">
      <CompanySubNav companyId={companyId} active="Scenarios" />
      <PageHeader
        title="Profit / Loss Scenarios"
        subtitle="Every figure below traces to a real, already-existing row (an unposted draft invoice/expense, or depreciation calculable from an asset already on file) — nothing here is fabricated."
      />

      <div className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Period start</label>
          <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Period end</label>
          <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
        <Button onClick={() => generate("NORMAL")} disabled={busy}>
          Generate Normal
        </Button>
        <Button onClick={() => generate("PROFIT_SCENARIO")} disabled={busy}>
          Generate Profit
        </Button>
        <Button onClick={() => generate("LOSS_SCENARIO")} disabled={busy}>
          Generate Loss
        </Button>
        <Button variant="ghost" onClick={loadCompare}>
          Refresh comparison
        </Button>
      </div>

      {error && <p className="text-danger text-sm mb-3">{error}</p>}

      {compare && (
        <Table>
          <Thead>
            <tr>
              <Th>Scenario</Th>
              <Th>Accounting profit</Th>
              <Th>Taxable profit</Th>
              <Th>Tax liability</Th>
            </tr>
          </Thead>
          <tbody>
            {([["Normal", compare.normal], ["Profit", compare.profitScenario], ["Loss", compare.lossScenario]] as const).map(([label, row]) => (
              <Tr key={label}>
                <Td className="font-medium">{label}</Td>
                <Td>{row ? `₦${Number(row.accountingProfitNgn).toLocaleString()}` : "—"}</Td>
                <Td>{row ? `₦${Number(row.taxableProfitNgn).toLocaleString()}` : "—"}</Td>
                <Td>{row ? `₦${Number(row.taxLiabilityNgn).toLocaleString()}` : "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <ScenariosPage />
    </RequireAuth>
  );
}
