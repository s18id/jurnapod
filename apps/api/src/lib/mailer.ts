// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getAppEnv } from "./env";

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

  constructor() {
    const env = getAppEnv();
    const smtpConfig = env.mailer.smtp;

    this.fromName = env.mailer.fromName;
    this.fromEmail = env.mailer.fromEmail;

    this.transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.password
      },
      tls: {
        rejectUnauthorized: smtpConfig.tlsRejectUnauthorized
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

export function getMailer(): Mailer {
  if (mailerInstance) {
    return mailerInstance;
  }

  const env = getAppEnv();

  switch (env.mailer.driver) {
    case "smtp":
      mailerInstance = new SmtpMailer();
      break;
    case "log":
      mailerInstance = new LogMailer();
      break;
    case "disabled":
      mailerInstance = new DisabledMailer();
      break;
    default:
      throw new MailerError(`Unknown mailer driver: ${env.mailer.driver}`);
  }

  return mailerInstance;
}
