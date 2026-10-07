"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

function CustomersPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get<Customer[]>(`/companies/${companyId}/customers`).then(setCustomers).catch(() => setCustomers([]));
  }
  useEffect(reload, [companyId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/companies/${companyId}/customers`, { name, email: email || undefined });
      setName("");
      setEmail("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create customer.");
    }
  }

  return (
    <div className="max-w-2xl mx-auto mt-10 px-4 pb-16">
      <h1 className="text-lg font-semibold mb-4">Customers</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required className="border rounded px-3 py-2 text-sm flex-1" />
        <input placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} className="border rounded px-3 py-2 text-sm flex-1" />
        <button type="submit" className="bg-black text-white rounded px-3 py-2 text-sm">Add</button>
      </form>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <ul className="flex flex-col gap-2 text-sm">
        {customers?.map((c) => (
          <li key={c.id} className="border rounded px-3 py-2">{c.name} {c.email && <span className="text-gray-500">· {c.email}</span>}</li>
        ))}
        {customers?.length === 0 && <p className="text-gray-500">No customers yet.</p>}
      </ul>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <CustomersPage />
    </RequireAuth>
  );
}
