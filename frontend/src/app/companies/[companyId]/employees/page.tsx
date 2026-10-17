"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";
import { Button, EmptyState, Input, PageHeader } from "@/components/ui";

interface Employee {
  id: string;
  fullName: string;
  stateOfResidenceCode: string;
  stateOfWorkCode: string;
}

function EmployeesPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [payeResults, setPayeResults] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get<Employee[]>(`/companies/${companyId}/employees`).then(setEmployees).catch(() => setEmployees([]));
  }
  useEffect(reload, [companyId]);

  return (
    <div className="max-w-6xl mx-auto mt-10 px-6 pb-16">
      <CompanySubNav companyId={companyId} active="Payroll" />
      <PageHeader
        title="Employees & PAYE"
        action={
          <Button variant={showCreate ? "secondary" : "primary"} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "+ New employee"}
          </Button>
        }
      />

      {showCreate && (
        <CreateEmployeeForm
          companyId={companyId}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      {error && <p className="text-danger text-sm mb-3">{error}</p>}
      {employees?.length === 0 && <EmptyState>No employees yet.</EmptyState>}
      <ul className="flex flex-col gap-3 text-sm">
        {employees?.map((emp) => (
          <li key={emp.id} className="bg-surface border border-border rounded-xl p-4">
            <div className="font-medium">{emp.fullName}</div>
            <div className="text-muted mb-2">
              Resides: {emp.stateOfResidenceCode} · Works: {emp.stateOfWorkCode}
            </div>
            <RunPayeInline companyId={companyId} employeeId={emp.id} onResult={(msg) => setPayeResults((prev) => ({ ...prev, [emp.id]: msg }))} />
            {payeResults[emp.id] && <p className="text-xs text-muted mt-2">{payeResults[emp.id]}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateEmployeeForm({ companyId, onCreated }: { companyId: string; onCreated: () => void }) {
  const [fullName, setFullName] = useState("");
  const [stateOfResidenceCode, setStateOfResidenceCode] = useState("LA");
  const [stateOfWorkCode, setStateOfWorkCode] = useState("LA");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post(`/companies/${companyId}/employees`, {
        fullName,
        stateOfResidenceCode: stateOfResidenceCode.toUpperCase(),
        stateOfWorkCode: stateOfWorkCode.toUpperCase(),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create employee.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-wrap items-end gap-3">
      <Input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      <Input placeholder="State of residence" value={stateOfResidenceCode} onChange={(e) => setStateOfResidenceCode(e.target.value)} maxLength={2} required className="w-32" />
      <Input placeholder="State of work" value={stateOfWorkCode} onChange={(e) => setStateOfWorkCode(e.target.value)} maxLength={2} required className="w-32" />
      {error && <p className="text-danger text-sm w-full">{error}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating…" : "Add employee"}
      </Button>
    </form>
  );
}

function RunPayeInline({ companyId, employeeId, onResult }: { companyId: string; employeeId: string; onResult: (msg: string) => void }) {
  const now = new Date();
  const [periodMonth, setPeriodMonth] = useState(String(now.getMonth() + 1));
  const [periodYear, setPeriodYear] = useState(String(now.getFullYear()));
  const [grossEmolumentNgn, setGrossEmolumentNgn] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api.post<{ calculation: { taxPayableNgn: string }; relevantTaxAuthority: string }>(
        `/companies/${companyId}/employees/${employeeId}/paye`,
        { periodMonth: Number(periodMonth), periodYear: Number(periodYear), grossEmolumentNgn: Number(grossEmolumentNgn) }
      );
      onResult(`PAYE: ₦${Number(result.calculation.taxPayableNgn).toLocaleString()} — ${result.relevantTaxAuthority}`);
    } catch (err) {
      onResult(err instanceof ApiError ? `Error: ${err.message}` : "PAYE calculation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={run} className="flex flex-wrap items-end gap-2">
      <Input type="number" min="1" max="12" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} className="w-16 !py-1 !text-xs" title="Month" />
      <Input type="number" value={periodYear} onChange={(e) => setPeriodYear(e.target.value)} className="w-20 !py-1 !text-xs" title="Year" />
      <Input
        type="number"
        step="0.01"
        placeholder="Gross emolument (₦)"
        value={grossEmolumentNgn}
        onChange={(e) => setGrossEmolumentNgn(e.target.value)}
        required
        className="w-40 !py-1 !text-xs"
      />
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Running…" : "Run PAYE"}
      </Button>
    </form>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <EmployeesPage />
    </RequireAuth>
  );
}
