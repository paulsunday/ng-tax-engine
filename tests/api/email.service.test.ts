import { EmailService } from "../../src/api/email/email.service";

describe("EmailService", () => {
  const ENV_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"];
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  test("isConfigured() is false when any required SMTP var is missing", () => {
    const service = new EmailService();
    expect(service.isConfigured()).toBe(false);

    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASSWORD = "pass";
    // SMTP_FROM deliberately left unset
    expect(new EmailService().isConfigured()).toBe(false);
  });

  test("isConfigured() is true once all required SMTP vars are set", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASSWORD = "pass";
    process.env.SMTP_FROM = "noreply@example.com";
    expect(new EmailService().isConfigured()).toBe(true);
  });

  test("send() is a safe no-op returning {sent: false} when not configured — never throws", async () => {
    const service = new EmailService();
    await expect(service.send({ to: "a@b.com", subject: "s", text: "t" })).resolves.toEqual({ sent: false });
  });
});
