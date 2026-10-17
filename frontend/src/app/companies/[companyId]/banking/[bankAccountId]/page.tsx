"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, apiUpload, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge, Button, Input, StatusBadge, Table, Thead, Th, Td, Tr } from "@/components/ui";

interface BankTransaction {
  id: string;
  transactionDate: string;
  narration: string;
  reference: string | null;
  debitNgn: string;
  creditNgn: string;
  matchStatus: "UNMATCHED" | "MATCHED" | "IGNORED";
  matchedEntityType: string | null;
  matchedEntityId: string | null;
  matchConfidence: string | null;
}

interface MatchCandidate {
  entityType: string;
  entityId: string;
  amountNgn: number;
  date: string;
  confidence: "EXACT" | "LIKELY";
}

interface Reconciliation {
  id: string;
  periodLabel: string;
  statementEndDate: string;
  statementBalanceNgn: string;
  ledgerBalanceNgn: string;
  status: string;
}

const MAPPING_FIELDS = ["date", "narration", "reference", "debit", "credit", "balance", "amount"] as const;

function BankAccountDetail() {
  const { companyId, bankAccountId } = useParams<{ companyId: string; bankAccountId: string }>();
  const [transactions, setTransactions] = useState<BankTransaction[] | null>(null);
  const [reconciliations, setReconciliations] = useState<Reconciliation[] | null>(null);
  const [candidatesFor, setCandidatesFor] = useState<Record<string, MatchCandidate[]>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    api.get<BankTransaction[]>(`/companies/${companyId}/bank-accounts/${bankAccountId}/transactions`).then(setTransactions).catch(() => setTransactions([]));
    api
      .get<Reconciliation[]>(`/companies/${companyId}/reconciliations?bankAccountId=${bankAccountId}`)
      .then(setReconciliations)
      .catch(() => setReconciliations([]));
  }
  useEffect(reload, [companyId, bankAccountId]);

  async function autoMatchAll() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ totalChecked: number; autoMatchedCount: number }>(`/companies/${companyId}/bank-accounts/${bankAccountId}/auto-match`);
      setNotice(`Checked ${result.totalChecked} unmatched transactions — ${result.autoMatchedCount} auto-matched on an exact amount+date match.`);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Auto-match failed.");
    } finally {
      setBusy(false);
    }
  }

  async function matchOne(bankTransactionId: string) {
    setError(null);
    try {
      const result = await api.post<{ autoMatched: boolean; candidates: MatchCandidate[] }>(`/companies/${companyId}/bank-accounts/${bankAccountId}/transactions/${bankTransactionId}/match`);
      if (result.autoMatched) {
        setNotice("Matched exactly.");
        reload();
      } else {
        setCandidatesFor((prev) => ({ ...prev, [bankTransactionId]: result.candidates }));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Matching failed.");
    }
  }

  async function confirmCandidate(bankTransactionId: string, candidate: MatchCandidate) {
    setError(null);
    try {
      await api.post(`/companies/${companyId}/bank-accounts/${bankAccountId}/transactions/${bankTransactionId}/confirm-match`, {
        entityType: candidate.entityType,
        entityId: candidate.entityId,
      });
      setCandidatesFor((prev) => {
        const next = { ...prev };
        delete next[bankTransactionId];
        return next;
      });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Confirming match failed.");
    }
  }

  async function unmatch(bankTransactionId: string) {
    setError(null);
    try {
      await api.post(`/companies/${companyId}/bank-accounts/${bankAccountId}/transactions/${bankTransactionId}/unmatch`);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unmatch failed.");
    }
  }

  return (
    <div className="max-w-4xl mx-auto mt-10 px-4 pb-16">
      <Link href={`/companies/${companyId}/banking`} className="text-sm text-primary hover:underline">
        ← Bank accounts
      </Link>
      <h1 className="text-xl font-semibold tracking-tight mt-3 mb-6">Bank Account</h1>

      <StatementUpload companyId={companyId} bankAccountId={bankAccountId} onProcessed={() => { setNotice("Statement processed."); reload(); }} />

      {error && <p className="text-danger text-sm mt-3">{error}</p>}
      {notice && <p className="text-muted text-sm mt-3">{notice}</p>}

      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Transactions</h2>
          <Button variant="secondary" size="sm" onClick={autoMatchAll} disabled={busy}>
            {busy ? "Matching…" : "Auto-match all unmatched"}
          </Button>
        </div>
        {transactions?.length === 0 && <p className="text-sm text-muted">No transactions imported yet — upload a statement above.</p>}
        {transactions && transactions.length > 0 && (
          <Table>
            <Thead>
              <tr>
                <Th>Date</Th>
                <Th>Narration</Th>
                <Th>Debit</Th>
                <Th>Credit</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </Thead>
            <tbody>
              {transactions.map((t) => (
                <Tr key={t.id}>
                  <Td>{new Date(t.transactionDate).toLocaleDateString()}</Td>
                  <Td className="max-w-xs truncate" title={t.narration}>
                    {t.narration}
                  </Td>
                  <Td>{Number(t.debitNgn) > 0 ? Number(t.debitNgn).toLocaleString() : ""}</Td>
                  <Td>{Number(t.creditNgn) > 0 ? Number(t.creditNgn).toLocaleString() : ""}</Td>
                  <Td>
                    <StatusBadge status={t.matchStatus} />
                    {t.matchConfidence && <span className="text-muted text-xs ml-1">({t.matchConfidence})</span>}
                  </Td>
                  <Td>
                    {t.matchStatus === "UNMATCHED" && (
                      <button onClick={() => matchOne(t.id)} className="text-primary hover:underline text-xs">
                        Find match
                      </button>
                    )}
                    {t.matchStatus === "MATCHED" && (
                      <button onClick={() => unmatch(t.id)} className="text-danger hover:underline text-xs">
                        Unmatch
                      </button>
                    )}
                    {candidatesFor[t.id] && (
                      <div className="mt-1 flex flex-col gap-1">
                        {candidatesFor[t.id].length === 0 && <span className="text-xs text-muted">No candidates found.</span>}
                        {candidatesFor[t.id].map((c) => (
                          <button
                            key={c.entityId}
                            onClick={() => confirmCandidate(t.id, c)}
                            className="text-left text-xs bg-surface-muted border border-border rounded px-2 py-1 hover:border-primary/40"
                          >
                            ₦{c.amountNgn.toLocaleString()} on {new Date(c.date).toLocaleDateString()} <Badge tone={c.confidence === "EXACT" ? "success" : "warning"}>{c.confidence}</Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <ReconciliationSection companyId={companyId} bankAccountId={bankAccountId} reconciliations={reconciliations} onChanged={reload} />
    </div>
  );
}

function StatementUpload({ companyId, bankAccountId, onProcessed }: { companyId: string; bankAccountId: string; onProcessed: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mappingState, setMappingState] = useState<{ importId: string; headers: string[]; previewRows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a statement file first.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiUpload<{ requiresManualMapping: boolean; headers?: string[]; previewRows?: string[][]; import: { id: string }; importedCount?: number; duplicateCount?: number }>(
        `/companies/${companyId}/bank-accounts/${bankAccountId}/statements/upload`,
        formData
      );
      if (result.requiresManualMapping) {
        setMappingState({ importId: result.import.id, headers: result.headers ?? [], previewRows: result.previewRows ?? [] });
      } else {
        if (fileInputRef.current) fileInputRef.current.value = "";
        onProcessed();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function confirmMapping() {
    if (!mappingState) return;
    setError(null);
    try {
      const builtMapping: Record<string, number | null> = {};
      for (const field of MAPPING_FIELDS) {
        const v = mapping[field];
        builtMapping[field] = v !== undefined && v !== "" ? Number(v) : null;
      }
      await api.post(`/companies/${companyId}/bank-accounts/${bankAccountId}/statements/${mappingState.importId}/confirm-mapping`, { mapping: builtMapping });
      setMappingState(null);
      setMapping({});
      if (fileInputRef.current) fileInputRef.current.value = "";
      onProcessed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to confirm mapping.");
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold mb-3">Import a bank statement</h2>
      <form onSubmit={handleUpload} className="bg-surface border border-border rounded-xl p-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Statement file (CSV, XLSX, or PDF)</label>
          <input ref={fileInputRef} type="file" className="text-sm" />
        </div>
        <Button type="submit" disabled={uploading}>
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </form>
      {error && <p className="text-danger text-sm mt-2">{error}</p>}

      {mappingState && (
        <div className="bg-surface border border-border rounded-xl p-5 mt-4">
          <p className="text-sm text-muted mb-3">Columns couldn&apos;t be auto-detected — map each field to a column below (preview rows shown for reference).</p>
          <div className="overflow-x-auto mb-4">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  {mappingState.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1 text-left text-muted border-b border-border">
                      [{i}] {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappingState.previewRows.slice(0, 5).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1 border-b border-border">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {MAPPING_FIELDS.map((field) => (
              <div key={field} className="flex items-center gap-2">
                <label className="text-xs text-muted w-20 capitalize">{field}</label>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value }))}
                  className="border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-foreground flex-1"
                >
                  <option value="">—</option>
                  {mappingState.headers.map((h, i) => (
                    <option key={i} value={i}>
                      [{i}] {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <Button onClick={confirmMapping} disabled={!mapping.date}>
            Confirm mapping &amp; import
          </Button>
        </div>
      )}
    </section>
  );
}

function ReconciliationSection({
  companyId,
  bankAccountId,
  reconciliations,
  onChanged,
}: {
  companyId: string;
  bankAccountId: string;
  reconciliations: Reconciliation[] | null;
  onChanged: () => void;
}) {
  const [showStart, setShowStart] = useState(false);
  const [periodLabel, setPeriodLabel] = useState("");
  const [statementEndDate, setStatementEndDate] = useState("");
  const [statementBalanceNgn, setStatementBalanceNgn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post(`/companies/${companyId}/reconciliations`, {
        bankAccountId,
        periodLabel,
        statementEndDate,
        statementBalanceNgn: Number(statementBalanceNgn),
      });
      setShowStart(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start reconciliation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function viewSummary(reconciliationId: string) {
    if (expanded === reconciliationId) {
      setExpanded(null);
      return;
    }
    try {
      const data = await api.get(`/companies/${companyId}/reconciliations/${reconciliationId}`);
      setSummary(data);
      setExpanded(reconciliationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load reconciliation summary.");
    }
  }

  async function complete(reconciliationId: string) {
    setError(null);
    try {
      await api.post(`/companies/${companyId}/reconciliations/${reconciliationId}/complete`);
      setExpanded(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to complete reconciliation.");
    }
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Reconciliations</h2>
        <Button variant={showStart ? "secondary" : "primary"} size="sm" onClick={() => setShowStart((v) => !v)}>
          {showStart ? "Cancel" : "+ Start reconciliation"}
        </Button>
      </div>

      {showStart && (
        <form onSubmit={start} className="bg-surface border border-border rounded-xl p-5 mb-4 flex flex-wrap items-end gap-3">
          <Input placeholder="Period label (e.g. October 2026)" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} required />
          <Input type="date" value={statementEndDate} onChange={(e) => setStatementEndDate(e.target.value)} required />
          <Input type="number" step="0.01" placeholder="Statement balance (₦)" value={statementBalanceNgn} onChange={(e) => setStatementBalanceNgn(e.target.value)} required />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Starting…" : "Start"}
          </Button>
        </form>
      )}

      {error && <p className="text-danger text-sm mb-3">{error}</p>}

      {reconciliations?.length === 0 && <p className="text-sm text-muted">No reconciliations yet.</p>}
      <ul className="flex flex-col gap-2 text-sm">
        {reconciliations?.map((r) => (
          <li key={r.id} className="bg-surface border border-border rounded-xl p-4">
            <button onClick={() => viewSummary(r.id)} className="w-full text-left flex justify-between items-center">
              <span className="font-medium">{r.periodLabel}</span>
              <StatusBadge status={r.status} />
            </button>
            {expanded === r.id && summary && (
              <div className="mt-3 pt-3 border-t border-border text-xs flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-muted">Statement balance</span>
                  <span>₦{summary.statementBalanceNgn.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Ledger balance</span>
                  <span>₦{summary.ledgerBalanceNgn.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Difference</span>
                  <span>₦{summary.balanceDifference.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Outstanding deposits ({summary.outstandingDeposits.length})</span>
                  <span>₦{summary.outstandingDepositsTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Outstanding payments ({summary.outstandingPayments.length})</span>
                  <span>₦{summary.outstandingPaymentsTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Unmatched bank transactions</span>
                  <span>{summary.unmatchedBankTransactions.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Duplicate transaction groups</span>
                  <span>{summary.duplicateTransactionGroupCount}</span>
                </div>
                {r.status === "IN_PROGRESS" && (
                  <Button size="sm" className="self-start mt-2" onClick={() => complete(r.id)}>
                    Mark completed
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <BankAccountDetail />
    </RequireAuth>
  );
}
