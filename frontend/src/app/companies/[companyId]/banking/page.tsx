"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";
import { Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface BankAccount {
  id: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  openingBalanceNgn: string;
}

function BankingPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [bankAccounts, setBankAccounts] = useState<BankAccount[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get<BankAccount[]>(`/companies/${companyId}/bank-accounts`).then(setBankAccounts).catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load bank accounts."));
    api.get<Account[]>(`/companies/${companyId}/accounts`).then(setAccounts).catch(() => setAccounts([]));
  }
  useEffect(reload, [companyId]);

  return (
    <div className="max-w-3xl mx-auto mt-10 px-4 pb-16">
      <CompanySubNav companyId={companyId} active="Banking" />
      <PageHeader
        title="Bank Accounts"
        action={
          <Button variant={showCreate ? "secondary" : "primary"} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "+ New bank account"}
          </Button>
        }
      />

      {showCreate && (
        <CreateBankAccountForm
          companyId={companyId}
          accounts={accounts}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      {error && <p className="text-danger text-sm mb-3">{error}</p>}
      {bankAccounts?.length === 0 && <EmptyState>No bank accounts yet.</EmptyState>}
      <ul className="flex flex-col gap-2 text-sm">
        {bankAccounts?.map((b) => (
          <li key={b.id}>
            <Link href={`/companies/${companyId}/banking/${b.id}`}>
              <Card className="hover:border-primary/40 transition-colors !p-4">
                <div className="flex justify-between">
                  <span className="font-medium">{b.accountName}</span>
                  <span className="text-muted">{b.currency}</span>
                </div>
                <div className="text-muted mt-1">
                  {b.bankName} · {b.accountNumber} · opening ₦{Number(b.openingBalanceNgn).toLocaleString()}
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateBankAccountForm({ companyId, accounts, onCreated }: { companyId: string; accounts: Account[]; onCreated: () => void }) {
  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [openingBalanceNgn, setOpeningBalanceNgn] = useState("0");
  const [glAccountId, setGlAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cashAccounts = accounts.filter((a) => a.type === "ASSET");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post(`/companies/${companyId}/bank-accounts`, {
        accountName,
        bankName,
        accountNumber,
        openingBalanceNgn: Number(openingBalanceNgn),
        glAccountId: glAccountId || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create bank account.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-col gap-3">
      <Input placeholder="Account name (e.g. Operating Account)" value={accountName} onChange={(e) => setAccountName(e.target.value)} required />
      <div className="flex gap-3">
        <Input placeholder="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} required className="flex-1" />
        <Input placeholder="Account number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} required className="flex-1" />
      </div>
      <div className="flex gap-3">
        <Input type="number" step="0.01" placeholder="Opening balance (₦)" value={openingBalanceNgn} onChange={(e) => setOpeningBalanceNgn(e.target.value)} className="flex-1" />
        <Select value={glAccountId} onChange={(e) => setGlAccountId(e.target.value)} className="flex-1">
          <option value="">No linked GL account (reconciliation needs one later)</option>
          {cashAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.name}
            </option>
          ))}
        </Select>
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Creating…" : "Create bank account"}
      </Button>
    </form>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <BankingPage />
    </RequireAuth>
  );
}
