import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

/**
 * Two delivery paths, tried in this order:
 *
 * 1. Resend's HTTPS API (`RESEND_API_KEY` + `SMTP_FROM`) — preferred. Confirmed in
 *    production (2026-10-18) that Railway's outbound network silently blocks SMTP egress
 *    (ports 465 AND 587 both hung until nodemailer's own connection timeout) even though
 *    the SMTP credentials themselves were correct — an HTTPS POST on 443 doesn't hit that
 *    block.
 * 2. Generic SMTP via nodemailer (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM`) —
 *    kept for hosts that don't block SMTP egress, so this doesn't lock the project into
 *    one vendor/transport.
 *
 * Configured entirely via env vars; if neither is configured, isConfigured() is false and
 * send() is a safe no-op that returns {sent: false} rather than throwing — callers (e.g.
 * AuthService) fall back to their existing honest "no email provider configured" behavior
 * instead of crashing.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  isConfigured(): boolean {
    return this.isResendConfigured() || this.isSmtpConfigured();
  }

  private isResendConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY && process.env.SMTP_FROM);
  }

  private isSmtpConfigured(): boolean {
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
    if (this.isResendConfigured()) return this.sendViaResendApi(input);
    if (this.isSmtpConfigured()) return this.sendViaSmtp(input);
    return { sent: false };
  }

  private async sendViaResendApi(input: SendEmailInput): Promise<{ sent: boolean }> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.SMTP_FROM, to: input.to, subject: input.subject, text: input.text }),
      });
      if (!res.ok) {
        this.logger.error(`Resend API send to ${input.to} failed: ${res.status} ${await res.text()}`);
        return { sent: false };
      }
      return { sent: true };
    } catch (err) {
      this.logger.error(`Resend API send to ${input.to} failed: ${err instanceof Error ? err.message : String(err)}`);
      return { sent: false };
    }
  }

  private async sendViaSmtp(input: SendEmailInput): Promise<{ sent: boolean }> {
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
