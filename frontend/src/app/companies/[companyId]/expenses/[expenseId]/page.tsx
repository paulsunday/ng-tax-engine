"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { Button, Card, Input, StatusBadge } from "@/components/ui";

interface ExpenseDetail {
  id: string;
  description: string;
  expenseDate: string;
  status: string;
  subtotalNgn: string;
  vatAmountNgn: string;
  totalNgn: string;
  amountPaidNgn: string;
}

function ExpenseDetailView() {
  const { companyId, expenseId } = useParams<{ companyId: string; expenseId: string }>();
  const [expense, setExpense] = useState<ExpenseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [busy, setBusy] = useState(false);

  function reload() {
    api
      .get<ExpenseDetail[]>(`/companies/${companyId}/expenses`)
      .then((all) => setExpense(all.find((e) => e.id === expenseId) ?? null))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load expense."));
  }
  useEffect(reload, [companyId, expenseId]);

  async function post() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/companies/${companyId}/expenses/${expenseId}/post`);
      setNotice("Expense posted to the ledger.");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to post expense.");
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/companies/${companyId}/expenses/${expenseId}/payments`, { amountNgn: Number(paymentAmount), paymentDate });
      setNotice("Payment recorded.");
      setPaymentAmount("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record payment.");
    } finally {
      setBusy(false);
    }
  }

  if (!expense) {
    return <div className="max-w-6xl mx-auto mt-10 px-6 *:max-w-xl">{error ? <p className="text-danger text-sm">{error}</p> : <p className="text-sm text-muted">Loading…</p>}</div>;
  }

  const outstanding = Number(expense.totalNgn) - Number(expense.amountPaidNgn);

  return (
    <div className="max-w-6xl mx-auto mt-10 px-6 *:max-w-xl pb-16">
      <Link href={`/companies/${companyId}/expenses`} className="text-sm text-primary hover:underline">
        ← Expenses
      </Link>
      <h1 className="text-xl font-semibold tracking-tight mt-3 mb-1">{expense.description}</h1>
      <div className="mb-4">
        <StatusBadge status={expense.status} />
      </div>

      <Card className="text-sm mb-6 flex flex-col gap-1.5">
        <div className="flex justify-between">
          <span className="text-muted">Subtotal</span>
          <span>₦{Number(expense.subtotalNgn).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">VAT</span>
          <span>₦{Number(expense.vatAmountNgn).toLocaleString()}</span>
        </div>
        <div className="flex justify-between font-medium border-t border-border pt-1.5 mt-1">
          <span>Total</span>
          <span>₦{Number(expense.totalNgn).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Paid</span>
          <span>₦{Number(expense.amountPaidNgn).toLocaleString()}</span>
        </div>
        <div className="flex justify-between font-medium">
          <span>Outstanding</span>
          <span>₦{outstanding.toLocaleString()}</span>
        </div>
      </Card>

      {expense.status === "DRAFT" && (
        <Button onClick={post} disabled={busy}>
          Post to ledger
        </Button>
      )}

      {expense.status === "APPROVED" && outstanding > 0 && (
        <form onSubmit={recordPayment} className="bg-surface border border-border rounded-xl p-5 flex flex-wrap items-end gap-3 mt-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Amount (₦)</label>
            <Input type="number" step="0.01" min="0.01" max={outstanding} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Payment date</label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
          </div>
          <Button type="submit" disabled={busy}>
            Record payment
          </Button>
        </form>
      )}

      {error && <p className="text-danger text-sm mt-3">{error}</p>}
      {notice && <p className="text-muted text-sm mt-3">{notice}</p>}
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <ExpenseDetailView />
    </RequireAuth>
  );
}
