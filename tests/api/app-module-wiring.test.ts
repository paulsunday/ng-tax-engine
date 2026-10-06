/**
 * Proves the NestJS dependency-injection graph for the whole API wires up correctly —
 * every module/controller/service/guard resolves its dependencies — WITHOUT needing a
 * live database. Test.createTestingModule().compile() builds the DI container but does
 * NOT invoke lifecycle hooks (onModuleInit), so PrismaService never attempts a real
 * $connect() here. A genuine end-to-end boot test against a live Postgres instance is a
 * separate, currently-blocked task (no Postgres available in this environment) — see
 * research/REGULATORY_RESEARCH_REPORT.md and the project memory for that open item.
 */
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/api/app.module";
import { PrismaService } from "../../src/api/prisma/prisma.service";
import { AuthController } from "../../src/api/auth/auth.controller";
import { CompaniesController } from "../../src/api/companies/companies.controller";
import { OrganizationsController } from "../../src/api/organizations/organizations.controller";

describe("AppModule DI wiring", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-not-for-production";
  });

  test("compiles the full module graph with PrismaService mocked out", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(AuthController)).toBeDefined();
    expect(moduleRef.get(CompaniesController)).toBeDefined();
    expect(moduleRef.get(OrganizationsController)).toBeDefined();
  });
});
