import { HealthController } from "../../src/api/health/health.controller";

describe("HealthController", () => {
  test("liveness reports ok without touching the database", () => {
    const prisma: any = { $queryRaw: jest.fn() };
    const controller = new HealthController(prisma);

    const result = controller.liveness();

    expect(result.status).toBe("ok");
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  test("readiness reports ok when the database responds", async () => {
    const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]) };
    const controller = new HealthController(prisma);

    const result = await controller.readiness();

    expect(result).toMatchObject({ status: "ok", database: "reachable" });
  });

  test("readiness throws ServiceUnavailableException when the database is unreachable", async () => {
    const prisma: any = { $queryRaw: jest.fn().mockRejectedValue(new Error("connection refused")) };
    const controller = new HealthController(prisma);

    await expect(controller.readiness()).rejects.toThrow(/connection refused|unreachable/i);
  });
});
