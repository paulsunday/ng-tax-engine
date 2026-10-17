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

interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debitNgn: number;
  creditNgn: number;
}

interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

function JournalPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [showPost, setShowPost] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get<Account[]>(`/companies/${companyId}/accounts`).then(setAccounts).catch(() => setAccounts([]));
    api
      .get<TrialBalance>(`/companies/${companyId}/journal/trial-balance`)
      .then(setTrialBalance)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load trial balance."));
  }
  useEffect(reload, [companyId]);

  return (
    <div className="max-w-3xl mx-auto mt-10 px-4 pb-16">
      <CompanySubNav companyId={companyId} active="Journal" />
      <PageHeader
        title="Journal & Trial Balance"
        action={
          <Button variant={showPost ? "secondary" : "primary"} onClick={() => setShowPost((v) => !v)}>
            {showPost ? "Cancel" : "+ Post manual entry"}
          </Button>
        }
      />

      {showPost && (
        <PostEntryForm
          companyId={companyId}
          accounts={accounts}
          onPosted={() => {
            setShowPost(false);
            reload();
          }}
        />
      )}

      {error && <p className="text-danger text-sm mb-3">{error}</p>}

      {trialBalance && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Badge tone={trialBalance.isBalanced ? "success" : "danger"}>{trialBalance.isBalanced ? "Balanced" : "Out of balance"}</Badge>
          </div>
          <Table>
            <Thead>
              <tr>
                <Th>Code</Th>
                <Th>Account</Th>
                <Th>Debit (₦)</Th>
                <Th>Credit (₦)</Th>
              </tr>
            </Thead>
            <tbody>
              {trialBalance.rows.map((r) => (
                <Tr key={r.accountId}>
                  <Td className="font-mono text-xs">{r.code}</Td>
                  <Td>{r.name}</Td>
                  <Td>{r.debitNgn.toLocaleString()}</Td>
                  <Td>{r.creditNgn.toLocaleString()}</Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium border-t-2 border-border">
                <Td colSpan={2}>Total</Td>
                <Td>{trialBalance.totalDebit.toLocaleString()}</Td>
                <Td>{trialBalance.totalCredit.toLocaleString()}</Td>
              </tr>
            </tfoot>
          </Table>
        </>
      )}
    </div>
  );
}

const SOURCES = ["MANUAL", "ADJUSTMENT"] as const;

function PostEntryForm({ companyId, accounts, onPosted }: { companyId: string; accounts: Account[]; onPosted: () => void }) {
  const [entryDate, setEntryDate] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]>("MANUAL");
  const [lines, setLines] = useState([
    { accountId: "", debitNgn: "", creditNgn: "" },
    { accountId: "", debitNgn: "", creditNgn: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateLine(i: number, patch: Partial<(typeof lines)[number]>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const totalDebit = lines.reduce((acc, l) => acc + (Number(l.debitNgn) || 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (Number(l.creditNgn) || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post(`/companies/${companyId}/journal/entries`, {
        entryDate,
        description,
        source,
        lines: lines.map((l) => ({ accountId: l.accountId, debitNgn: Number(l.debitNgn) || 0, creditNgn: Number(l.creditNgn) || 0 })),
      });
      onPosted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to post entry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-col gap-3">
      <div className="flex gap-3">
        <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required className="flex-1" />
        <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} required className="flex-[2]" />
        <Select value={source} onChange={(e) => setSource(e.target.value as (typeof SOURCES)[number])}>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {lines.map((line, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Select value={line.accountId} onChange={(e) => updateLine(i, { accountId: e.target.value })} required className="flex-[2]">
            <option value="">Select account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </Select>
          <Input type="number" step="0.01" min="0" placeholder="Debit" value={line.debitNgn} onChange={(e) => updateLine(i, { debitNgn: e.target.value })} className="w-28" />
          <Input type="number" step="0.01" min="0" placeholder="Credit" value={line.creditNgn} onChange={(e) => updateLine(i, { creditNgn: e.target.value })} className="w-28" />
          {lines.length > 2 && (
            <button type="button" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} className="text-danger text-xs px-1">
              ✕
            </button>
          )}
        </div>
      ))}

      <div className="flex justify-between items-center">
        <button type="button" onClick={() => setLines((prev) => [...prev, { accountId: "", debitNgn: "", creditNgn: "" }])} className="text-primary text-sm hover:underline">
          + Add line
        </button>
        <span className={`text-xs ${Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0 ? "text-success" : "text-muted"}`}>
          Dr {totalDebit.toLocaleString()} · Cr {totalCredit.toLocaleString()}
        </span>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Posting…" : "Post entry"}
      </Button>
    </form>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <JournalPage />
    </RequireAuth>
  );
}
