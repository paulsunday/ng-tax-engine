import { MfaService } from "../../src/api/auth/mfa.service";

describe("MfaService — real TOTP round trip (no mocks)", () => {
  test("a code generated from a secret verifies successfully against that same secret", () => {
    const mfa = new MfaService();
    const secret = mfa.generateSecret();

    const { authenticator } = require("otplib");
    const code = authenticator.generate(secret);

    expect(mfa.verify(code, secret)).toBe(true);
  });

  test("a code generated from a different secret does not verify", () => {
    const mfa = new MfaService();
    const secretA = mfa.generateSecret();
    const secretB = mfa.generateSecret();

    const { authenticator } = require("otplib");
    const codeForB = authenticator.generate(secretB);

    expect(mfa.verify(codeForB, secretA)).toBe(false);
  });

  test("an obviously malformed code is rejected, not thrown", () => {
    const mfa = new MfaService();
    const secret = mfa.generateSecret();
    expect(mfa.verify("not-a-code", secret)).toBe(false);
  });

  test("buildOtpauthUri embeds the issuer and account email for authenticator apps", () => {
    const mfa = new MfaService();
    const secret = mfa.generateSecret();
    const uri = mfa.buildOtpauthUri("user@example.com", secret);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("NGTaxEngine");
    expect(uri).toContain(encodeURIComponent("user@example.com").replace(/%40/g, "%40"));
  });

  test("buildQrCodeDataUrl produces a scannable PNG data URL", async () => {
    const mfa = new MfaService();
    const secret = mfa.generateSecret();
    const uri = mfa.buildOtpauthUri("user@example.com", secret);
    const dataUrl = await mfa.buildQrCodeDataUrl(uri);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
