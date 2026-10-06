import { BadRequestException } from "@nestjs/common";
import { InvoicesService } from "../../src/api/invoices/invoices.service";

function makeMocks() {
  const prisma: any = {
    invoice: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    accountingPayment: { create: jest.fn() },
    $transaction: jest.fn(async (arr: any[]) => Promise.all(arr)),
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const customers: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "cust-1" }) };
  const accounts: any = {
    getByCodeOrThrow: jest.fn((orgId: string, companyId: string, code: string) => Promise.resolve({ id: `account-${code}`, code })),
  };
  const journal: any = { postEntry: jest.fn().mockResolvedValue({ id: "journal-entry-1" }) };
  const auditLog: any = { record: jest.fn() };
  return { prisma, companies, customers, accounts, journal, auditLog };
}

describe("InvoicesService.create", () => {
  test("computes subtotal/VAT/total correctly and creates a DRAFT invoice with no GL impact", async () => {
    const { prisma, companies, customers, accounts, journal, auditLog } = makeMocks();
    prisma.invoice.create.mockImplementation(async ({ data }: any) => ({ ...data, id: "inv-1", items: [] }));
    const service = new InvoicesService(prisma, companies, customers, accounts, journal, auditLog);

    const invoice = await service.create("org-1", "company-1", "user-1", {
      customerId: "cust-1",
      invoiceNumber: "INV-0001",
      issueDate: new Date("2026-06-01"),
      dueDate: new Date("2026-06-15"),
      items: [{ description: "Consulting", quantity: 10, unitPriceNgn: 10_000, vatRate: 0.075 }],
    });

    expect(invoice.subtotalNgn).toBe(100_000);
    expect(invoice.vatAmountNgn).toBe(7_500);
    expect(invoice.totalNgn).toBe(107_500);
    expect(journal.postEntry).not.toHaveBeenCalled(); // create() never posts to the GL
  });
});

describe("InvoicesService.post", () => {
  test("posts Dr Accounts Receivable (total) / Cr Revenue (subtotal) / Cr VAT Payable (vat) — balanced by construction", async () => {
    const { prisma, companies, customers, accounts, journal, auditLog } = makeMocks();
    prisma.invoice.findUnique.mockResolvedValue({
      id: "inv-1",
      companyId: "company-1",
      status: "DRAFT",
      invoiceNumber: "INV-0001",
      issueDate: new Date("2026-06-01"),
      subtotalNgn: "100000",
      vatAmountNgn: "7500",
      totalNgn: "107500",
      customerId: "cust-1",
      items: [],
    });
    prisma.invoice.update.mockResolvedValue({ id: "inv-1", status: "SENT", journalEntryId: "journal-entry-1" });

    const service = new InvoicesService(prisma, companies, customers, accounts, journal, auditLog);
    await service.post("org-1", "company-1", "user-1", "inv-1");

    expect(journal.postEntry).toHaveBeenCalledTimes(1);
    const postedLines = journal.postEntry.mock.calls[0][3].lines;
    const totalDebit = postedLines.reduce((acc: number, l: any) => acc + l.debitNgn, 0);
    const totalCredit = postedLines.reduce((acc: number, l: any) => acc + l.creditNgn, 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(107_500);
    expect(postedLines.find((l: any) => l.accountId === "account-1100")?.debitNgn).toBe(107_500); // AR
    expect(postedLines.find((l: any) => l.accountId === "account-4000")?.creditNgn).toBe(100_000); // Revenue
    expect(postedLines.find((l: any) => l.accountId === "account-2100")?.creditNgn).toBe(7_500); // VAT Payable
  });

  test("an invoice with zero VAT does not include a zero-amount VAT line (which would be invalid)", async () => {
    const { prisma, companies, customers, accounts, journal, auditLog } = makeMocks();
    prisma.invoice.findUnique.mockResolvedValue({
      id: "inv-2",
      companyId: "company-1",
      status: "DRAFT",
      invoiceNumber: "INV-0002",
      issueDate: new Date("2026-06-01"),
      subtotalNgn: "50000",
      vatAmountNgn: "0",
      totalNgn: "50000",
      customerId: "cust-1",
      items: [],
    });
    prisma.invoice.update.mockResolvedValue({});

    const service = new InvoicesService(prisma, companies, customers, accounts, journal, auditLog);
    await service.post("org-1", "company-1", "user-1", "inv-2");

    const postedLines = journal.postEntry.mock.calls[0][3].lines;
    expect(postedLines.length).toBe(2); // AR + Revenue only, no VAT line
  });

  test("refuses to post an invoice that isn't DRAFT", async () => {
    const { prisma, companies, customers, accounts, journal, auditLog } = makeMocks();
    prisma.invoice.findUnique.mockResolvedValue({ id: "inv-3", companyId: "company-1", status: "SENT", items: [] });
    const service = new InvoicesService(prisma, companies, customers, accounts, journal, auditLog);

    await expect(service.post("org-1", "company-1", "user-1", "inv-3")).rejects.toThrow(BadRequestException);
  });
});

describe("InvoicesService.recordPayment", () => {
  function sentInvoice(overrides: Partial<any> = {}) {
    return { id: "inv-1", companyId: "company-1", status: "SENT", totalNgn: "107500", amountPaidNgn: "0", customerId: "cust-1", invoiceNumber: "INV-0001", items: [], ...overrides };
  }

  test("rejects a payment larger than the outstanding balance", async () => {
    const { prisma, companies, customers, accounts, journal, auditLog } = makeMocks();
    prisma.invoice.findUnique.mockResolvedValue(sentInvoice());
    const service = new InvoicesService(prisma, companies, customers, accounts, journal, auditLog);

    await expect(service.recordPayment("org-1", "company-1", "user-1", "inv-1", 999_999, new Date())).rejects.toThrow(BadRequestException);
  });

  test("a partial payment moves status to PARTIALLY_PAID, a full payment moves it to PAID", async () => {
    const { prisma, companies, customers, accounts, journal, auditLog } = makeMocks();
    prisma.invoice.findUnique.mockResolvedValue(sentInvoice());
    prisma.invoice.update.mockImplementation(async ({ data }: any) => ({ ...data }));
    const service = new InvoicesService(prisma, companies, customers, accounts, journal, auditLog);

    const partial = await service.recordPayment("org-1", "company-1", "user-1", "inv-1", 50_000, new Date());
    expect(partial.status).toBe("PARTIALLY_PAID");

    prisma.invoice.findUnique.mockResolvedValue(sentInvoice());
    const full = await service.recordPayment("org-1", "company-1", "user-1", "inv-1", 107_500, new Date());
    expect(full.status).toBe("PAID");
  });
});
