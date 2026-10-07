"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";

interface Company {
  id: string;
  name: string;
  tin: string | null;
  headOfficeStateCode: string;
  incorporationDate: string;
}

function CompaniesDashboard() {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  function reload() {
    api
      .get<Company[]>("/companies")
      .then(setCompanies)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load companies."));
  }

  useEffect(reload, []);

  return (
    <>
    <DisclaimerBanner />
    <div className="max-w-3xl mx-auto mt-10 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Companies</h1>
        <button onClick={() => setShowCreate((v) => !v)} className="bg-black text-white rounded px-3 py-2 text-sm">
          {showCreate ? "Cancel" : "+ New company"}
        </button>
      </div>

      {showCreate && (
        <CreateCompanyForm
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {!companies && !error && <p className="text-sm text-gray-500">Loading…</p>}
      {companies?.length === 0 && <p className="text-sm text-gray-500">No companies yet — create one above.</p>}

      <ul className="flex flex-col gap-2 mt-4">
        {companies?.map((c) => (
          <li key={c.id}>
            <Link href={`/companies/${c.id}`} className="block border rounded px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-900">
              <div className="font-medium">{c.name}</div>
              <div className="text-gray-500">
                HQ: {c.headOfficeStateCode} {c.tin ? `· TIN: ${c.tin}` : "· No TIN on file"}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
    </>
  );
}

function CreateCompanyForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [headOfficeStateCode, setHeadOfficeStateCode] = useState("LA");
  const [incorporationDate, setIncorporationDate] = useState("");
  const [accountingYearEnd, setAccountingYearEnd] = useState("12-31");
  const [tin, setTin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post("/companies", {
        name,
        headOfficeStateCode: headOfficeStateCode.toUpperCase(),
        incorporationDate,
        accountingYearEnd,
        ...(tin ? { tin } : {}),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create company.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded p-4 mb-6 flex flex-col gap-3">
      <input type="text" placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} required className="border rounded px-3 py-2 text-sm" />
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="HQ state code (e.g. LA, EN, FC)"
          value={headOfficeStateCode}
          onChange={(e) => setHeadOfficeStateCode(e.target.value)}
          required
          maxLength={2}
          className="border rounded px-3 py-2 text-sm flex-1"
        />
        <input
          type="text"
          placeholder="Accounting year end (MM-DD)"
          value={accountingYearEnd}
          onChange={(e) => setAccountingYearEnd(e.target.value)}
          required
          className="border rounded px-3 py-2 text-sm flex-1"
        />
      </div>
      <input type="date" value={incorporationDate} onChange={(e) => setIncorporationDate(e.target.value)} required className="border rounded px-3 py-2 text-sm" />
      <input type="text" placeholder="TIN (optional)" value={tin} onChange={(e) => setTin(e.target.value)} className="border rounded px-3 py-2 text-sm" />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={isSubmitting} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50 self-start">
        {isSubmitting ? "Creating…" : "Create company"}
      </button>
    </form>
  );
}

export default function HomePage() {
  return (
    <RequireAuth>
      <CompaniesDashboard />
    </RequireAuth>
  );
}
