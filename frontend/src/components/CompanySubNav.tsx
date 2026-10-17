import Link from "next/link";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/invoices", label: "Invoices" },
  { href: "/expenses", label: "Expenses" },
  { href: "/accounts", label: "Chart of Accounts" },
  { href: "/journal", label: "Journal" },
  { href: "/assets", label: "Assets" },
  { href: "/banking", label: "Banking" },
  { href: "/reports", label: "Reports" },
  { href: "/audit", label: "Audit" },
  { href: "/documents", label: "Documents" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/employees", label: "Payroll" },
];

export function CompanySubNav({ companyId, active }: { companyId: string; active: string }) {
  return (
    <nav className="flex gap-1 mb-6 text-sm overflow-x-auto border-b border-border">
      {TABS.map((tab) => (
        <Link
          key={tab.label}
          href={`/companies/${companyId}${tab.href}`}
          className={`px-3 py-2 whitespace-nowrap border-b-2 -mb-px transition-colors ${
            active === tab.label
              ? "border-primary text-primary font-medium"
              : "border-transparent text-muted hover:text-foreground hover:border-border"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
