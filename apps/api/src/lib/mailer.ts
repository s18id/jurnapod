// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { MailerDriver } from "./env";
import { ensurePlatformSettingsSeeded, getPlatformSetting } from "./platform-settings";

export class MailerError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "MailerError";
  }
}

export type SendMailParams = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  tags?: Record<string, string>; // for future logging/analytics
};

export interface Mailer {
  sendMail(params: SendMailParams): Promise<void>;
}

class DisabledMailer implements Mailer {
  async sendMail(_params: SendMailParams): Promise<void> {
    throw new MailerError(
      "Mailer is disabled. Set MAILER_DRIVER=smtp or log to enable email functionality."
    );
  }
}

class LogMailer implements Mailer {
  async sendMail(params: SendMailParams): Promise<void> {
    console.log("[MAILER:LOG] Email payload:", {
      to: params.to,
      subject: params.subject,
      html: params.html ? `[HTML ${params.html.length} chars]` : undefined,
      text: params.text ? `[TEXT ${params.text.length} chars]` : undefined,
      replyTo: params.replyTo,
      tags: params.tags
    });
  }
}

class SmtpMailer implements Mailer {
  private transporter: Transporter;
  private fromName: string;
  private fromEmail: string;

  constructor(config: {
    fromName: string;
    fromEmail: string;
    host: string;
    port: number;
    user: string;
    password: string;
    secure: boolean;
    tlsRejectUnauthorized: boolean;
  }) {
    this.fromName = config.fromName;
    this.fromEmail = config.fromEmail;

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password
      },
      tls: {
        rejectUnauthorized: config.tlsRejectUnauthorized
      }
    });
  }

  async sendMail(params: SendMailParams): Promise<void> {
    try {
      const recipients = Array.isArray(params.to) ? params.to : [params.to];

      if (recipients.length === 0) {
        throw new MailerError("At least one recipient is required");
      }

      if (!params.html && !params.text) {
        throw new MailerError("At least one of html or text body is required");
      }

      const mailOptions = {
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: recipients.join(", "),
        subject: params.subject,
        html: params.html,
        text: params.text,
        replyTo: params.replyTo
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      if (error instanceof MailerError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "Unknown SMTP error";
      throw new MailerError(`Failed to send email: ${message}`, error);
    }
  }
}

let mailerInstance: Mailer | null = null;

const DEFAULT_MAILER_DRIVER: MailerDriver = "disabled";
const DEFAULT_MAILER_FROM_NAME = "Jurnapod";
const DEFAULT_MAILER_SMTP_PORT = 587;
const DEFAULT_MAILER_SMTP_SECURE = false;
const DEFAULT_MAILER_SMTP_TLS_REJECT_UNAUTHORIZED = true;

/**
 * Resolve mailer configuration from DB
 */
async function resolveMailerConfig() {
  await ensurePlatformSettingsSeeded();

  const driver = (await getPlatformSetting("mailer.driver")) as MailerDriver | null;
  const fromName = await getPlatformSetting("mailer.from_name");
  const fromEmail = await getPlatformSetting("mailer.from_email");
  const smtpHost = await getPlatformSetting("mailer.smtp.host");
  const smtpPort = await getPlatformSetting("mailer.smtp.port");
  const smtpUser = await getPlatformSetting("mailer.smtp.user");
  const smtpPass = await getPlatformSetting("mailer.smtp.pass");
  const smtpSecure = await getPlatformSetting("mailer.smtp.secure");
  const smtpTlsReject = await getPlatformSetting("mailer.smtp.tls_reject_unauthorized");

  return {
    driver: driver ?? DEFAULT_MAILER_DRIVER,
    fromName: fromName ?? DEFAULT_MAILER_FROM_NAME,
    fromEmail: fromEmail ?? "",
    smtp: {
      host: smtpHost ?? "",
      port: smtpPort ? parseInt(smtpPort, 10) : DEFAULT_MAILER_SMTP_PORT,
      user: smtpUser ?? "",
      password: smtpPass ?? "",
      secure: smtpSecure !== null ? smtpSecure === "true" : DEFAULT_MAILER_SMTP_SECURE,
      tlsRejectUnauthorized:
        smtpTlsReject !== null ? smtpTlsReject === "true" : DEFAULT_MAILER_SMTP_TLS_REJECT_UNAUTHORIZED
    }
  };
}

export async function getMailer(): Promise<Mailer> {
  if (mailerInstance) {
    return mailerInstance;
  }

  const config = await resolveMailerConfig();

  switch (config.driver) {
    case "smtp":
      mailerInstance = new SmtpMailer({
        fromName: config.fromName,
        fromEmail: config.fromEmail,
        host: config.smtp.host,
        port: config.smtp.port,
        user: config.smtp.user,
        password: config.smtp.password,
        secure: config.smtp.secure,
        tlsRejectUnauthorized: config.smtp.tlsRejectUnauthorized
      });
      break;
    case "log":
      mailerInstance = new LogMailer();
      break;
    case "disabled":
      mailerInstance = new DisabledMailer();
      break;
    default:
      throw new MailerError(`Unknown mailer driver: ${config.driver}`);
  }

  return mailerInstance;
}
