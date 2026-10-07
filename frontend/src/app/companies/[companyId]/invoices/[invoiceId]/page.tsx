"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  subtotalNgn: string;
  vatAmountNgn: string;
  totalNgn: string;
  amountPaidNgn: string;
}

function InvoiceDetailView() {
  const { companyId, invoiceId } = useParams<{ companyId: string; invoiceId: string }>();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [busy, setBusy] = useState(false);

  function reload() {
    api
      .get<InvoiceDetail[]>(`/companies/${companyId}/invoices`)
      .then((all) => setInvoice(all.find((i) => i.id === invoiceId) ?? null))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load invoice."));
  }
  useEffect(reload, [companyId, invoiceId]);

  async function post() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/companies/${companyId}/invoices/${invoiceId}/post`);
      setNotice("Invoice posted to the ledger (Dr Accounts Receivable, Cr Revenue/VAT Payable).");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to post invoice.");
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/companies/${companyId}/invoices/${invoiceId}/payments`, { amountNgn: Number(paymentAmount), paymentDate });
      setNotice("Payment recorded.");
      setPaymentAmount("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record payment.");
    } finally {
      setBusy(false);
    }
  }

  if (!invoice) {
    return <div className="max-w-xl mx-auto mt-10 px-4">{error ? <p className="text-red-600 text-sm">{error}</p> : <p className="text-sm text-gray-500">Loading…</p>}</div>;
  }

  const outstanding = Number(invoice.totalNgn) - Number(invoice.amountPaidNgn);

  return (
    <div className="max-w-xl mx-auto mt-10 px-4 pb-16">
      <Link href={`/companies/${companyId}/invoices`} className="text-sm text-blue-600 hover:underline">
        ← Invoices
      </Link>
      <h1 className="text-xl font-semibold mt-3 mb-1">{invoice.invoiceNumber}</h1>
      <p className="text-sm text-gray-500 mb-4">Status: {invoice.status}</p>

      <div className="text-sm border rounded p-4 mb-6 flex flex-col gap-1">
        <div className="flex justify-between"><span>Subtotal</span><span>₦{Number(invoice.subtotalNgn).toLocaleString()}</span></div>
        <div className="flex justify-between"><span>VAT</span><span>₦{Number(invoice.vatAmountNgn).toLocaleString()}</span></div>
        <div className="flex justify-between font-medium"><span>Total</span><span>₦{Number(invoice.totalNgn).toLocaleString()}</span></div>
        <div className="flex justify-between"><span>Paid</span><span>₦{Number(invoice.amountPaidNgn).toLocaleString()}</span></div>
        <div className="flex justify-between font-medium"><span>Outstanding</span><span>₦{outstanding.toLocaleString()}</span></div>
      </div>

      {invoice.status === "DRAFT" && (
        <button onClick={post} disabled={busy} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50">
          Post to ledger
        </button>
      )}

      {["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status) && outstanding > 0 && (
        <form onSubmit={recordPayment} className="border rounded p-4 flex flex-wrap items-end gap-3 mt-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Amount (₦)</label>
            <input type="number" step="0.01" min="0.01" max={outstanding} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required className="border rounded px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Payment date</label>
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required className="border rounded px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={busy} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50">
            Record payment
          </button>
        </form>
      )}

      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      {notice && <p className="text-gray-700 text-sm mt-3">{notice}</p>}
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <InvoiceDetailView />
    </RequireAuth>
  );
}
