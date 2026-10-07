/**
 * SYNTHETIC test/demo data (mandate §23: "production test data must be clearly synthetic,
 * never derived from or resembling real taxpayer information"). Every identifier below
 * uses an obviously-fake "SYNTHETIC-*" / "0000000"-style pattern specifically so it can
 * never be mistaken for a real TIN, RC number, or person — this is NOT anonymized real
 * data, it never existed as real data in the first place.
 *
 * Builds one multi-state company (head office Lagos, branches in Enugu and the FCT —
 * the three states this session fully researched) with employees, a starter chart of
 * accounts, a customer/supplier, and a couple of DRAFT invoices/expenses/assets — enough
 * to exercise onboarding, PAYE, the jurisdiction matrix, filing, and the scenario engine
 * end-to-end without touching anything resembling a real taxpayer.
 *
 * Idempotent: re-running upserts the org/company/accounts and skips employee/invoice/
 * expense/asset creation if they already exist (matched by their synthetic natural keys).
 * Run with `npm run seed:demo-data`. Requires `npm run seed:rbac` to have been run first
 * (needs the COMPANY_OWNER role to exist).
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../src/accounting/defaultChartOfAccounts";

const prisma = new PrismaClient();

const SYNTHETIC_TIN = "SYNTHETIC-TIN-0000000001";
const SYNTHETIC_RC = "SYNTHETIC-RC-00000001";
const DEMO_USER_EMAIL = "demo-synthetic@example.test";

async function main() {
  const ownerRole = await prisma.role.findUnique({ where: { name: "COMPANY_OWNER" } });
  if (!ownerRole) {
    throw new Error('COMPANY_OWNER role not found — run "npm run seed:rbac" before this script.');
  }

  const organization = await prisma.organization.upsert({
    where: { id: "synthetic-demo-org" },
    update: {},
    create: { id: "synthetic-demo-org", name: "SYNTHETIC DEMO ORG — test data only, not a real taxpayer" },
  });

  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      email: DEMO_USER_EMAIL,
      passwordHash: await bcrypt.hash("SyntheticDemoPassword123!", 12),
      fullName: "Synthetic Demo User",
    },
  });

  await prisma.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: demoUser.id } },
    update: {},
    create: { organizationId: organization.id, userId: demoUser.id, roleId: ownerRole.id },
  });

  const company = await prisma.company.upsert({
    where: { tin: SYNTHETIC_TIN },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Synthetic Multi-State Trading Co. (DEMO DATA)",
      rcNumber: SYNTHETIC_RC,
      tin: SYNTHETIC_TIN,
      incorporationDate: new Date("2020-01-01"),
      accountingYearEnd: "12-31",
      sector: "General Trading (synthetic)",
      vatRegistered: true,
      headOfficeStateCode: "LA", // Lagos — fully researched this session
    },
  });

  const enuguBranch = await prisma.branch.upsert({
    where: { id: "synthetic-branch-enugu" },
    update: {},
    create: { id: "synthetic-branch-enugu", companyId: company.id, label: "Enugu Branch (synthetic)", stateCode: "EN", hasBusinessPremises: true },
  });
  const fctBranch = await prisma.branch.upsert({
    where: { id: "synthetic-branch-fct" },
    update: {},
    create: { id: "synthetic-branch-fct", companyId: company.id, label: "FCT Branch (synthetic)", stateCode: "FC", hasBusinessPremises: true },
  });

  const employeeSeeds = [
    { id: "synthetic-employee-la", fullName: "Synthetic Employee — Lagos", stateOfResidenceCode: "LA", stateOfWorkCode: "LA", branchId: null },
    { id: "synthetic-employee-en", fullName: "Synthetic Employee — Enugu", stateOfResidenceCode: "EN", stateOfWorkCode: "EN", branchId: enuguBranch.id },
    { id: "synthetic-employee-fc", fullName: "Synthetic Employee — FCT", stateOfResidenceCode: "FC", stateOfWorkCode: "FC", branchId: fctBranch.id },
  ];
  for (const e of employeeSeeds) {
    await prisma.employee.upsert({
      where: { id: e.id },
      update: {},
      create: { ...e, companyId: company.id, tin: `SYNTHETIC-EMP-TIN-${e.id}` },
    });
  }

  for (const acc of DEFAULT_CHART_OF_ACCOUNTS) {
    await prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: acc.code } },
      update: {},
      create: { organizationId: organization.id, companyId: company.id, code: acc.code, name: acc.name, type: acc.type, isSystemAccount: true },
    });
  }

  const customer = await prisma.customer.upsert({
    where: { id: "synthetic-customer-1" },
    update: {},
    create: { id: "synthetic-customer-1", organizationId: organization.id, companyId: company.id, name: "Synthetic Customer Ltd (demo data)" },
  });
  const supplier = await prisma.supplier.upsert({
    where: { id: "synthetic-supplier-1" },
    update: {},
    create: { id: "synthetic-supplier-1", organizationId: organization.id, companyId: company.id, name: "Synthetic Supplier Ltd (demo data)" },
  });

  await prisma.invoice.upsert({
    where: { id: "synthetic-invoice-1" },
    update: {},
    create: {
      id: "synthetic-invoice-1",
      organizationId: organization.id,
      companyId: company.id,
      customerId: customer.id,
      invoiceNumber: "SYNTH-INV-0001",
      issueDate: new Date("2026-06-10"),
      dueDate: new Date("2026-07-10"),
      status: "DRAFT",
      subtotalNgn: 500_000,
      vatAmountNgn: 37_500,
      totalNgn: 537_500,
    },
  });

  await prisma.expense.upsert({
    where: { id: "synthetic-expense-1" },
    update: {},
    create: {
      id: "synthetic-expense-1",
      organizationId: organization.id,
      companyId: company.id,
      supplierId: supplier.id,
      expenseDate: new Date("2026-06-12"),
      description: "Synthetic office supplies (demo data)",
      status: "DRAFT",
      subtotalNgn: 80_000,
      vatAmountNgn: 6_000,
      totalNgn: 86_000,
    },
  });

  // Required for ExpensesService.post() to build a balanced journal entry — without at
  // least one ExpenseItem, only the VAT-recoverable line exists, leaving the entry
  // unbalanced against the full total (caught live via browser testing, not assumed).
  const officeSuppliesAccount = await prisma.account.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: "6500" } } });
  await prisma.expenseItem.upsert({
    where: { id: "synthetic-expense-item-1" },
    update: {},
    create: {
      id: "synthetic-expense-item-1",
      expenseId: "synthetic-expense-1",
      accountId: officeSuppliesAccount.id,
      description: "Synthetic office supplies (demo data)",
      amountNgn: 80_000,
    },
  });

  await prisma.asset.upsert({
    where: { id: "synthetic-asset-1" },
    update: {},
    create: {
      id: "synthetic-asset-1",
      organizationId: organization.id,
      companyId: company.id,
      description: "Synthetic office equipment (demo data)",
      category: "Office Equipment",
      acquisitionDate: new Date("2025-01-01"),
      costNgn: 2_400_000,
      usefulLifeMonths: 48,
      status: "ACTIVE",
    },
  });

  console.log(`Synthetic demo data ready. Company ID: ${company.id} (TIN ${SYNTHETIC_TIN}). Login: ${DEMO_USER_EMAIL} / SyntheticDemoPassword123!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
