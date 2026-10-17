"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { Button, Card, Input, PageHeader, EmptyState } from "@/components/ui";

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
      <div className="max-w-3xl mx-auto mt-10 px-4 pb-16">
        <PageHeader
          title="Companies"
          action={
            <Button variant={showCreate ? "secondary" : "primary"} onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "Cancel" : "+ New company"}
            </Button>
          }
        />

        {showCreate && (
          <CreateCompanyForm
            onCreated={() => {
              setShowCreate(false);
              reload();
            }}
          />
        )}

        {error && <p className="text-danger text-sm mb-3">{error}</p>}
        {!companies && !error && <p className="text-sm text-muted">Loading…</p>}
        {companies?.length === 0 && <EmptyState>No companies yet — create one above.</EmptyState>}

        <ul className="flex flex-col gap-2 mt-4">
          {companies?.map((c) => (
            <li key={c.id}>
              <Link href={`/companies/${c.id}`}>
                <Card className="hover:border-primary/40 transition-colors">
                  <div className="font-medium text-foreground">{c.name}</div>
                  <div className="text-muted text-sm mt-0.5">
                    HQ: {c.headOfficeStateCode} {c.tin ? `· TIN: ${c.tin}` : "· No TIN on file"}
                  </div>
                </Card>
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
      const company = await api.post<{ id: string }>("/companies", {
        name,
        headOfficeStateCode: headOfficeStateCode.toUpperCase(),
        incorporationDate,
        accountingYearEnd,
        ...(tin ? { tin } : {}),
      });
      // Seed the starter chart of accounts immediately — expenses/invoices need accounts
      // to post against, and there's no reason to make every new company do this by hand.
      await api.post(`/companies/${company.id}/accounts/seed-defaults`);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create company.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-col gap-3">
      <Input type="text" placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} required />
      <div className="flex gap-3">
        <Input
          type="text"
          placeholder="HQ state code (e.g. LA, EN, FC)"
          value={headOfficeStateCode}
          onChange={(e) => setHeadOfficeStateCode(e.target.value)}
          required
          maxLength={2}
          className="flex-1"
        />
        <Input
          type="text"
          placeholder="Accounting year end (MM-DD)"
          value={accountingYearEnd}
          onChange={(e) => setAccountingYearEnd(e.target.value)}
          required
          className="flex-1"
        />
      </div>
      <Input type="date" value={incorporationDate} onChange={(e) => setIncorporationDate(e.target.value)} required />
      <Input type="text" placeholder="TIN (optional)" value={tin} onChange={(e) => setTin(e.target.value)} />
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "Creating…" : "Create company"}
      </Button>
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
