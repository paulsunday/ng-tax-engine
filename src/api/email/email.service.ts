import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

/**
 * Thin SMTP wrapper — works with any provider that exposes an SMTP endpoint (SES, SendGrid,
 * Postmark, Mailgun, etc.), so this doesn't lock the project into one vendor's SDK. Configured
 * entirely via env vars; if any are missing, isConfigured() is false and send() is a safe
 * no-op that returns {sent: false} rather than throwing — callers (e.g. AuthService) fall back
 * to their existing honest "no email provider configured" behavior instead of crashing.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      });
    }
    return this.transporter;
  }

  async send(input: SendEmailInput): Promise<{ sent: boolean }> {
    if (!this.isConfigured()) return { sent: false };

    try {
      await this.getTransporter().sendMail({
        from: process.env.SMTP_FROM,
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
      return { sent: true };
    } catch (err) {
      this.logger.error(`Failed to send email to ${input.to}: ${err instanceof Error ? err.message : String(err)}`);
      return { sent: false };
    }
  }
}
