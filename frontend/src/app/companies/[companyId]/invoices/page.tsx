"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";
import { Button, Card, EmptyState, Input, PageHeader, Select, StatusBadge } from "@/components/ui";
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
      <PageHeader
        title="Invoices"
        action={
          <Button variant={showCreate ? "secondary" : "primary"} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "+ New invoice"}
          </Button>
        }
      />

      {customers.length === 0 && (
        <p className="text-sm text-muted mb-4">
          No customers yet —{" "}
          <Link href={`/companies/${companyId}/customers`} className="text-primary hover:underline">
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

      {error && <p className="text-danger text-sm mb-3">{error}</p>}
      {invoices?.length === 0 && <EmptyState>No invoices yet.</EmptyState>}
      <ul className="flex flex-col gap-2 text-sm">
        {invoices?.map((inv) => (
          <li key={inv.id}>
            <Link href={`/companies/${companyId}/invoices/${inv.id}`}>
              <Card className="hover:border-primary/40 transition-colors !p-4">
                <div className="flex justify-between">
                  <span className="font-medium">{inv.invoiceNumber}</span>
                  <span>₦{Number(inv.totalNgn).toLocaleString()}</span>
                </div>
                <div className="text-muted mt-1 flex items-center gap-2">
                  <StatusBadge status={inv.status} /> due {new Date(inv.dueDate).toLocaleDateString()}
                </div>
              </Card>
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
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-col gap-3">
      <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Input placeholder="Invoice number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required />
      <div className="flex gap-3">
        <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required className="flex-1" />
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required className="flex-1" />
      </div>
      <Input placeholder="Line item description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="flex gap-3">
        <Input type="number" step="0.0001" min="0.0001" placeholder="Qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} required className="flex-1" />
        <Input type="number" step="0.01" min="0" placeholder="Unit price (₦)" value={unitPriceNgn} onChange={(e) => setUnitPriceNgn(e.target.value)} required className="flex-1" />
        <Input type="number" step="0.001" min="0" placeholder="VAT rate (e.g. 0.075)" value={vatRate} onChange={(e) => setVatRate(e.target.value)} required className="flex-1" />
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Creating…" : "Create invoice"}
      </Button>
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
