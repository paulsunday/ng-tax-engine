import { EmailService } from "../../src/api/email/email.service";

describe("EmailService", () => {
  const ENV_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "RESEND_API_KEY"];
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

  describe("Resend HTTPS API path (preferred — raw SMTP egress is blocked on some hosts, e.g. Railway)", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    test("isConfigured() is true from RESEND_API_KEY + SMTP_FROM alone, with no SMTP_* vars set", () => {
      process.env.RESEND_API_KEY = "re_test_key";
      process.env.SMTP_FROM = "noreply@example.com";
      expect(new EmailService().isConfigured()).toBe(true);
    });

    test("send() posts to Resend's API (not SMTP) when RESEND_API_KEY is set, even if SMTP_* vars are also present", async () => {
      process.env.RESEND_API_KEY = "re_test_key";
      process.env.SMTP_FROM = "noreply@example.com";
      process.env.SMTP_HOST = "smtp.example.com";
      process.env.SMTP_USER = "user";
      process.env.SMTP_PASSWORD = "pass";
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => "" });
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await new EmailService().send({ to: "a@b.com", subject: "s", text: "t" });

      expect(result).toEqual({ sent: true });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.resend.com/emails",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer re_test_key" }) })
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ from: "noreply@example.com", to: "a@b.com", subject: "s", text: "t" });
    });

    test("send() returns {sent: false} on a non-ok Resend API response, without throwing", async () => {
      process.env.RESEND_API_KEY = "re_test_key";
      process.env.SMTP_FROM = "noreply@example.com";
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 422, text: async () => "domain not verified" }) as unknown as typeof fetch;

      await expect(new EmailService().send({ to: "a@b.com", subject: "s", text: "t" })).resolves.toEqual({ sent: false });
    });

    test("send() returns {sent: false} if the Resend API request itself throws (network error)", async () => {
      process.env.RESEND_API_KEY = "re_test_key";
      process.env.SMTP_FROM = "noreply@example.com";
      global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

      await expect(new EmailService().send({ to: "a@b.com", subject: "s", text: "t" })).resolves.toEqual({ sent: false });
    });
  });
});
