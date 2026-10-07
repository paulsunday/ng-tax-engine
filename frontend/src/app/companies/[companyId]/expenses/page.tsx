"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";
import type { Supplier } from "../suppliers/page";

interface Expense {
  id: string;
  description: string;
  expenseDate: string;
  status: string;
  totalNgn: string;
  amountPaidNgn: string;
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

function ExpensesPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  function reload() {
    api.get<Expense[]>(`/companies/${companyId}/expenses`).then(setExpenses).catch(() => setExpenses([]));
    api.get<Supplier[]>(`/companies/${companyId}/suppliers`).then(setSuppliers).catch(() => setSuppliers([]));
    api.get<Account[]>(`/companies/${companyId}/accounts`).then(setAccounts).catch(() => setAccounts([]));
  }
  useEffect(reload, [companyId]);

  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE" || a.type === "ASSET");

  return (
    <div className="max-w-3xl mx-auto mt-10 px-4 pb-16">
      <CompanySubNav companyId={companyId} active="Expenses" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Expenses</h1>
        <button onClick={() => setShowCreate((v) => !v)} className="bg-black text-white rounded px-3 py-2 text-sm">
          {showCreate ? "Cancel" : "+ New expense"}
        </button>
      </div>

      {showCreate && (
        <CreateExpenseForm
          companyId={companyId}
          suppliers={suppliers}
          accounts={expenseAccounts}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      {expenses?.length === 0 && <p className="text-sm text-gray-500">No expenses yet.</p>}
      <ul className="flex flex-col gap-2 text-sm">
        {expenses?.map((ex) => (
          <li key={ex.id}>
            <Link href={`/companies/${companyId}/expenses/${ex.id}`} className="block border rounded px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900">
              <div className="flex justify-between">
                <span className="font-medium">{ex.description}</span>
                <span>₦{Number(ex.totalNgn).toLocaleString()}</span>
              </div>
              <div className="text-gray-500">
                {ex.status} · {new Date(ex.expenseDate).toLocaleDateString()}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateExpenseForm({
  companyId,
  suppliers,
  accounts,
  onCreated,
}: {
  companyId: string;
  suppliers: Supplier[];
  accounts: Account[];
  onCreated: () => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amountNgn, setAmountNgn] = useState("");
  const [vatRate, setVatRate] = useState("0.075");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!accountId) {
      setError("No expense/asset account available — seed the chart of accounts first.");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post(`/companies/${companyId}/expenses`, {
        supplierId: supplierId || undefined,
        expenseDate,
        description,
        vatRate: Number(vatRate),
        items: [{ accountId, description, amountNgn: Number(amountNgn) }],
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create expense.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded p-4 mb-6 flex flex-col gap-3">
      <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="border rounded px-3 py-2 text-sm">
        <option value="">No supplier</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required className="border rounded px-3 py-2 text-sm" />
      <input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} required className="border rounded px-3 py-2 text-sm" />
      <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="border rounded px-3 py-2 text-sm">
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
        ))}
      </select>
      <div className="flex gap-3">
        <input type="number" step="0.01" min="0.01" placeholder="Amount (₦)" value={amountNgn} onChange={(e) => setAmountNgn(e.target.value)} required className="border rounded px-3 py-2 text-sm flex-1" />
        <input type="number" step="0.001" min="0" placeholder="VAT rate" value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="border rounded px-3 py-2 text-sm flex-1" />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={isSubmitting} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50 self-start">
        {isSubmitting ? "Creating…" : "Create expense"}
      </button>
    </form>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <ExpensesPage />
    </RequireAuth>
  );
}
