import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { RegisterDto } from "../../../src/api/auth/dto/register.dto";

/**
 * Proves the Terms & Conditions gate is enforced by the DTO itself — the same validation
 * NestJS's global ValidationPipe runs on every real request — not merely assumed because
 * the service happens to be called correctly elsewhere.
 */
describe("RegisterDto — Terms & Conditions acceptance gate", () => {
  const base = { email: "new@example.com", password: "password1234", fullName: "New User", organizationName: "New Co" };

  test("rejects registration with acceptedTerms missing", async () => {
    const dto = plainToInstance(RegisterDto, { ...base });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "acceptedTerms")).toBe(true);
  });

  test("rejects registration with acceptedTerms explicitly false", async () => {
    const dto = plainToInstance(RegisterDto, { ...base, acceptedTerms: false });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "acceptedTerms")).toBe(true);
  });

  test("accepts registration with acceptedTerms true", async () => {
    const dto = plainToInstance(RegisterDto, { ...base, acceptedTerms: true });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "acceptedTerms")).toBe(false);
  });
});
