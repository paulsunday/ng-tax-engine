"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";

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
    <div className="max-w-2xl mx-auto mt-10 px-4 pb-16">
      <h1 className="text-lg font-semibold mb-4">Suppliers</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required className="border rounded px-3 py-2 text-sm flex-1" />
        <input placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} className="border rounded px-3 py-2 text-sm flex-1" />
        <button type="submit" className="bg-black text-white rounded px-3 py-2 text-sm">Add</button>
      </form>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <ul className="flex flex-col gap-2 text-sm">
        {suppliers?.map((s) => (
          <li key={s.id} className="border rounded px-3 py-2">{s.name} {s.email && <span className="text-gray-500">· {s.email}</span>}</li>
        ))}
        {suppliers?.length === 0 && <p className="text-gray-500">No suppliers yet.</p>}
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
