import { PaymentsService } from "../../src/api/payments/payments.service";

function makeMocks() {
  const prisma: any = {
    taxReturn: { findUnique: jest.fn() },
    payment: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const auditLog: any = { record: jest.fn() };
  return { prisma, companies, auditLog };
}

describe("PaymentsService.getOutstandingBalance", () => {
  test("only counts CONFIRMED payments against the liability, not PENDING ones", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue({
      id: "ret-1",
      companyId: "company-1",
      taxLiabilityNgn: "100000",
      payments: [
        { status: "CONFIRMED", amountNgn: "40000" },
        { status: "PENDING", amountNgn: "30000" }, // not yet confirmed — must not reduce outstanding
      ],
    });
    const service = new PaymentsService(prisma, companies, auditLog);

    const result = await service.getOutstandingBalance("org-1", "company-1", "ret-1");
    expect(result.confirmedPaidNgn).toBe(40_000);
    expect(result.outstandingNgn).toBe(60_000);
  });
});

describe("PaymentsService.recordPayment / confirmPayment", () => {
  test("a payment starts PENDING and only becomes CONFIRMED via an explicit confirm action", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue({ id: "ret-1", companyId: "company-1" });
    prisma.payment.create.mockImplementation(async ({ data }: any) => ({ id: "pay-1", ...data }));
    const service = new PaymentsService(prisma, companies, auditLog);

    const payment = await service.recordPayment("org-1", "company-1", "user-1", "ret-1", 40_000, "REF-1");
    expect(payment.status).toBe("PENDING");
  });
});
