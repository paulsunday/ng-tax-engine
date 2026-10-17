"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";
import { Badge, Button, Input, PageHeader, Select, Table, Thead, Th, Td, Tr } from "@/components/ui";

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;

interface Account {
  id: string;
  code: string;
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  isSystemAccount: boolean;
  isActive: boolean;
}

function AccountsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get<Account[]>(`/companies/${companyId}/accounts`).then(setAccounts).catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load accounts."));
  }
  useEffect(reload, [companyId]);

  async function seedDefaults() {
    setError(null);
    try {
      const seeded = await api.post<Account[]>(`/companies/${companyId}/accounts/seed-defaults`);
      setAccounts(seeded);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to seed chart of accounts.");
    }
  }

  return (
    <div className="max-w-3xl mx-auto mt-10 px-4 pb-16">
      <CompanySubNav companyId={companyId} active="Chart of Accounts" />
      <PageHeader
        title="Chart of Accounts"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={seedDefaults}>
              Seed defaults
            </Button>
            <Button variant={showCreate ? "secondary" : "primary"} onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "Cancel" : "+ New account"}
            </Button>
          </div>
        }
      />

      {showCreate && (
        <CreateAccountForm
          companyId={companyId}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      {error && <p className="text-danger text-sm mb-3">{error}</p>}

      {ACCOUNT_TYPES.map((type) => {
        const rows = accounts?.filter((a) => a.type === type) ?? [];
        if (rows.length === 0) return null;
        return (
          <div key={type} className="mb-6">
            <h2 className="text-sm font-semibold mb-2">{type.charAt(0) + type.slice(1).toLowerCase()}</h2>
            <Table>
              <Thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Name</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <tbody>
                {rows.map((a) => (
                  <Tr key={a.id}>
                    <Td className="font-mono text-xs">{a.code}</Td>
                    <Td>{a.name}</Td>
                    <Td>
                      {a.isSystemAccount && <Badge>System</Badge>} {!a.isActive && <Badge tone="danger">Inactive</Badge>}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}

function CreateAccountForm({ companyId, onCreated }: { companyId: string; onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof ACCOUNT_TYPES)[number]>("EXPENSE");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post(`/companies/${companyId}/accounts`, { code, name, type });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create account.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-wrap items-end gap-3">
      <Input placeholder="Code (e.g. 5100)" value={code} onChange={(e) => setCode(e.target.value)} required className="w-32" />
      <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required className="flex-1" />
      <Select value={type} onChange={(e) => setType(e.target.value as (typeof ACCOUNT_TYPES)[number])}>
        {ACCOUNT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>
      {error && <p className="text-danger text-sm w-full">{error}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <AccountsPage />
    </RequireAuth>
  );
}
