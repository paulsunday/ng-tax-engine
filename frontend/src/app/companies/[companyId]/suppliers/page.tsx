"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { Button, EmptyState, Input, PageHeader } from "@/components/ui";

export interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

function SuppliersPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get<Supplier[]>(`/companies/${companyId}/suppliers`).then(setSuppliers).catch(() => setSuppliers([]));
  }
  useEffect(reload, [companyId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/companies/${companyId}/suppliers`, { name, email: email || undefined });
      setName("");
      setEmail("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create supplier.");
    }
  }

  return (
    <div className="max-w-6xl mx-auto mt-10 px-6 pb-16">
      <PageHeader title="Suppliers" />
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required className="flex-1" />
        <Input placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
        <Button type="submit">Add</Button>
      </form>
      {error && <p className="text-danger text-sm mb-3">{error}</p>}
      <ul className="flex flex-col gap-2 text-sm">
        {suppliers?.map((s) => (
          <li key={s.id} className="bg-surface border border-border rounded-lg px-3 py-2.5">
            {s.name} {s.email && <span className="text-muted">· {s.email}</span>}
          </li>
        ))}
        {suppliers?.length === 0 && <EmptyState>No suppliers yet.</EmptyState>}
      </ul>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <SuppliersPage />
    </RequireAuth>
  );
}
