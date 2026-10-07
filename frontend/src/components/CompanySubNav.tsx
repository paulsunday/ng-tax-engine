import Link from "next/link";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/invoices", label: "Invoices" },
  { href: "/expenses", label: "Expenses" },
  { href: "/documents", label: "Documents" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/employees", label: "Payroll" },
];

export function CompanySubNav({ companyId, active }: { companyId: string; active: string }) {
  return (
    <nav className="flex gap-4 border-b mb-6 text-sm overflow-x-auto">
      {TABS.map((tab) => (
        <Link
          key={tab.label}
          href={`/companies/${companyId}${tab.href}`}
          className={`pb-2 whitespace-nowrap ${active === tab.label ? "border-b-2 border-black dark:border-white font-medium" : "text-gray-500 hover:text-black dark:hover:text-white"}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
