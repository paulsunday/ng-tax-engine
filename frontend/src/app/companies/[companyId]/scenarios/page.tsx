"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";

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
      <h1 className="text-lg font-semibold mb-2">Profit / Loss Scenarios</h1>
      <p className="text-xs text-gray-500 mb-4">
        Every figure below traces to a real, already-existing row (an unposted draft invoice/expense, or depreciation calculable from an asset already on file) — nothing here is fabricated.
      </p>

      <div className="border rounded p-4 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Period start</label>
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Period end</label>
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        </div>
        <button onClick={() => generate("NORMAL")} disabled={busy} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50">Generate Normal</button>
        <button onClick={() => generate("PROFIT_SCENARIO")} disabled={busy} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50">Generate Profit</button>
        <button onClick={() => generate("LOSS_SCENARIO")} disabled={busy} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50">Generate Loss</button>
        <button onClick={loadCompare} className="text-blue-600 hover:underline text-sm">Refresh comparison</button>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {compare && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2">Scenario</th>
              <th>Accounting profit</th>
              <th>Taxable profit</th>
              <th>Tax liability</th>
            </tr>
          </thead>
          <tbody>
            {([["Normal", compare.normal], ["Profit", compare.profitScenario], ["Loss", compare.lossScenario]] as const).map(([label, row]) => (
              <tr key={label} className="border-b">
                <td className="py-2">{label}</td>
                <td>{row ? `₦${Number(row.accountingProfitNgn).toLocaleString()}` : "—"}</td>
                <td>{row ? `₦${Number(row.taxableProfitNgn).toLocaleString()}` : "—"}</td>
                <td>{row ? `₦${Number(row.taxLiabilityNgn).toLocaleString()}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
