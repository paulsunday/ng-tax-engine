import { Injectable } from "@nestjs/common";
import { authenticator } from "otplib";
import * as qrcode from "qrcode";

const ISSUER = "NGTaxEngine";

/**
 * Pure TOTP helper (RFC 6238) — no DB access. AuthService owns persisting mfaSecret/
 * mfaEnabled; this class only generates/verifies codes so it stays trivially unit-testable
 * without a database.
 */
@Injectable()
export class MfaService {
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  buildOtpauthUri(email: string, secret: string): string {
    return authenticator.keyuri(email, ISSUER, secret);
  }

  async buildQrCodeDataUrl(otpauthUri: string): Promise<string> {
    return qrcode.toDataURL(otpauthUri);
  }

  verify(code: string, secret: string): boolean {
    try {
      return authenticator.check(code, secret);
    } catch {
      return false; // malformed code/secret — never throw into caller, just "not valid"
    }
  }
}
