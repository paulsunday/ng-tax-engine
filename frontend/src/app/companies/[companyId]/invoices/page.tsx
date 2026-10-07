"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";
import type { Customer } from "../customers/page";

interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  totalNgn: string;
  amountPaidNgn: string;
}

function InvoicesPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get<Invoice[]>(`/companies/${companyId}/invoices`).then(setInvoices).catch(() => setInvoices([]));
    api.get<Customer[]>(`/companies/${companyId}/customers`).then(setCustomers).catch(() => setCustomers([]));
  }
  useEffect(reload, [companyId]);

  return (
    <div className="max-w-3xl mx-auto mt-10 px-4 pb-16">
      <CompanySubNav companyId={companyId} active="Invoices" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Invoices</h1>
        <button onClick={() => setShowCreate((v) => !v)} className="bg-black text-white rounded px-3 py-2 text-sm">
          {showCreate ? "Cancel" : "+ New invoice"}
        </button>
      </div>

      {customers.length === 0 && (
        <p className="text-sm text-gray-500 mb-4">
          No customers yet —{" "}
          <Link href={`/companies/${companyId}/customers`} className="text-blue-600 hover:underline">
            add one
          </Link>{" "}
          before creating an invoice.
        </p>
      )}

      {showCreate && customers.length > 0 && (
        <CreateInvoiceForm
          companyId={companyId}
          customers={customers}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {invoices?.length === 0 && <p className="text-sm text-gray-500">No invoices yet.</p>}
      <ul className="flex flex-col gap-2 text-sm">
        {invoices?.map((inv) => (
          <li key={inv.id}>
            <Link href={`/companies/${companyId}/invoices/${inv.id}`} className="block border rounded px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900">
              <div className="flex justify-between">
                <span className="font-medium">{inv.invoiceNumber}</span>
                <span>₦{Number(inv.totalNgn).toLocaleString()}</span>
              </div>
              <div className="text-gray-500">
                {inv.status} · due {new Date(inv.dueDate).toLocaleDateString()}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateInvoiceForm({ companyId, customers, onCreated }: { companyId: string; customers: Customer[]; onCreated: () => void }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPriceNgn, setUnitPriceNgn] = useState("");
  const [vatRate, setVatRate] = useState("0.075");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post(`/companies/${companyId}/invoices`, {
        customerId,
        invoiceNumber,
        issueDate,
        dueDate,
        items: [{ description, quantity: Number(quantity), unitPriceNgn: Number(unitPriceNgn), vatRate: Number(vatRate) }],
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create invoice.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded p-4 mb-6 flex flex-col gap-3">
      <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="border rounded px-3 py-2 text-sm">
        {customers.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input placeholder="Invoice number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required className="border rounded px-3 py-2 text-sm" />
      <div className="flex gap-3">
        <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required className="border rounded px-3 py-2 text-sm flex-1" />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required className="border rounded px-3 py-2 text-sm flex-1" />
      </div>
      <input placeholder="Line item description" value={description} onChange={(e) => setDescription(e.target.value)} className="border rounded px-3 py-2 text-sm" />
      <div className="flex gap-3">
        <input type="number" step="0.0001" min="0.0001" placeholder="Qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} required className="border rounded px-3 py-2 text-sm flex-1" />
        <input type="number" step="0.01" min="0" placeholder="Unit price (₦)" value={unitPriceNgn} onChange={(e) => setUnitPriceNgn(e.target.value)} required className="border rounded px-3 py-2 text-sm flex-1" />
        <input type="number" step="0.001" min="0" placeholder="VAT rate (e.g. 0.075)" value={vatRate} onChange={(e) => setVatRate(e.target.value)} required className="border rounded px-3 py-2 text-sm flex-1" />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={isSubmitting} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50 self-start">
        {isSubmitting ? "Creating…" : "Create invoice"}
      </button>
    </form>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <InvoicesPage />
    </RequireAuth>
  );
}
