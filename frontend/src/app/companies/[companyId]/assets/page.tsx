"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";
import { Button, EmptyState, Input, PageHeader } from "@/components/ui";

interface Asset {
  id: string;
  description: string;
  category: string | null;
  acquisitionDate: string;
  costNgn: string;
  salvageValueNgn: string;
  usefulLifeMonths: number;
  accumulatedDepreciationNgn: string;
}

function AssetsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [depResults, setDepResults] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get<Asset[]>(`/companies/${companyId}/assets`).then(setAssets).catch(() => setAssets([]));
  }
  useEffect(reload, [companyId]);

  return (
    <div className="max-w-3xl mx-auto mt-10 px-4 pb-16">
      <CompanySubNav companyId={companyId} active="Assets" />
      <PageHeader
        title="Fixed Assets"
        action={
          <Button variant={showCreate ? "secondary" : "primary"} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "+ New asset"}
          </Button>
        }
      />

      {showCreate && (
        <CreateAssetForm
          companyId={companyId}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      {error && <p className="text-danger text-sm mb-3">{error}</p>}
      {assets?.length === 0 && <EmptyState>No assets yet.</EmptyState>}
      <ul className="flex flex-col gap-3 text-sm">
        {assets?.map((a) => {
          const netBookValue = Number(a.costNgn) - Number(a.accumulatedDepreciationNgn);
          return (
            <li key={a.id} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex justify-between">
                <span className="font-medium">{a.description}</span>
                <span>₦{Number(a.costNgn).toLocaleString()}</span>
              </div>
              <div className="text-muted mb-2">
                {a.category ?? "Uncategorized"} · acquired {new Date(a.acquisitionDate).toLocaleDateString()} · {a.usefulLifeMonths} months · NBV ₦
                {netBookValue.toLocaleString()}
              </div>
              <PostDepreciationInline companyId={companyId} assetId={a.id} onResult={(msg) => setDepResults((prev) => ({ ...prev, [a.id]: msg }))} onPosted={reload} />
              {depResults[a.id] && <p className="text-xs text-muted mt-2">{depResults[a.id]}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CreateAssetForm({ companyId, onCreated }: { companyId: string; onCreated: () => void }) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [costNgn, setCostNgn] = useState("");
  const [salvageValueNgn, setSalvageValueNgn] = useState("0");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState("36");
  const [paidImmediately, setPaidImmediately] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post(`/companies/${companyId}/assets`, {
        description,
        category: category || undefined,
        acquisitionDate,
        costNgn: Number(costNgn),
        salvageValueNgn: Number(salvageValueNgn),
        usefulLifeMonths: Number(usefulLifeMonths),
        paidImmediately,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create asset.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-col gap-3">
      <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} required />
      <Input placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
      <div className="flex gap-3">
        <Input type="date" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} required className="flex-1" />
        <Input type="number" step="0.01" min="0.01" placeholder="Cost (₦)" value={costNgn} onChange={(e) => setCostNgn(e.target.value)} required className="flex-1" />
      </div>
      <div className="flex gap-3">
        <Input type="number" step="0.01" min="0" placeholder="Salvage value (₦)" value={salvageValueNgn} onChange={(e) => setSalvageValueNgn(e.target.value)} className="flex-1" />
        <Input
          type="number"
          step="1"
          min="1"
          placeholder="Useful life (months)"
          value={usefulLifeMonths}
          onChange={(e) => setUsefulLifeMonths(e.target.value)}
          required
          className="flex-1"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={paidImmediately} onChange={(e) => setPaidImmediately(e.target.checked)} className="accent-primary" />
        Paid immediately (credits Cash — otherwise credits Accounts Payable)
      </label>
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Creating…" : "Create asset"}
      </Button>
    </form>
  );
}

function PostDepreciationInline({ companyId, assetId, onResult, onPosted }: { companyId: string; assetId: string; onResult: (msg: string) => void; onPosted: () => void }) {
  const now = new Date();
  const [periodMonth, setPeriodMonth] = useState(String(now.getMonth() + 1));
  const [periodYear, setPeriodYear] = useState(String(now.getFullYear()));
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api.post<{ netBookValueAfterNgn: number; isFullyDepreciated: boolean }>(`/companies/${companyId}/assets/${assetId}/depreciation`, {
        periodYear: Number(periodYear),
        periodMonth: Number(periodMonth),
      });
      onResult(`Posted — NBV now ₦${result.netBookValueAfterNgn.toLocaleString()}${result.isFullyDepreciated ? " (fully depreciated)" : ""}.`);
      onPosted();
    } catch (err) {
      onResult(err instanceof ApiError ? `Error: ${err.message}` : "Depreciation posting failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={run} className="flex flex-wrap items-end gap-2">
      <Input type="number" min="1" max="12" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} className="w-16 !py-1 !text-xs" title="Month" />
      <Input type="number" value={periodYear} onChange={(e) => setPeriodYear(e.target.value)} className="w-20 !py-1 !text-xs" title="Year" />
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Posting…" : "Post depreciation"}
      </Button>
    </form>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <AssetsPage />
    </RequireAuth>
  );
}
