// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { EmailOptions, SendResult, EmailProvider } from "../types";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
  tlsRejectUnauthorized: boolean;
}

export class SmtpProvider implements EmailProvider {
  private transporter: Transporter;
  private fromName: string;
  private fromEmail: string;

  constructor(config: SmtpConfig & { fromName: string; fromEmail: string }) {
    this.fromName = config.fromName;
    this.fromEmail = config.fromEmail;

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
      tls: {
        rejectUnauthorized: config.tlsRejectUnauthorized,
      },
    });
  }

  async send(options: EmailOptions): Promise<SendResult> {
    try {
      const recipients = Array.isArray(options.to) ? options.to : [options.to];

      if (recipients.length === 0) {
        return {
          success: false,
          error: "At least one recipient is required",
          retryCount: 0,
        };
      }

      if (!options.html && !options.text) {
        return {
          success: false,
          error: "At least one of html or text body is required",
          retryCount: 0,
        };
      }

      const mailOptions = {
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: recipients.join(", "),
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
      };

      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
        retryCount: 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown SMTP error";
      return {
        success: false,
        error: message,
        retryCount: 0,
      };
    }
  }
}
