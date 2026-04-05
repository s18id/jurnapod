// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**

 @deprecated Use @jurnapod/notifications.EmailService directly.
 This module is kept for API backward compatibility and will be removed in a future release.

 For sending emails, use:
 import { EmailService } from '@jurnapod/notifications';
 import { SmtpProvider } from '@jurnapod/notifications/providers/smtp';
 
 const emailService = new EmailService({
   provider: 'smtp',
   host: '...',
   port: 587,
   user: '...',
   password: '...',
   secure: false,
   tlsRejectUnauthorized: true,
   fromAddress: '...',
   fromName: '...',
 });
*/

import type { MailerDriver } from "./env";
import { ensurePlatformSettingsSeeded, getPlatformSetting } from "./platform-settings";
import { getAppEnv } from "./env";
import {
  buildPasswordResetEmail,
  buildUserInviteEmail,
  buildVerifyEmail,
  type EmailTemplateParams,
} from "@jurnapod/notifications/templates/email";
import { createEmailLinkBuilder } from "@jurnapod/notifications/link-builder/email";
import { EmailService, type SmtpEmailConfig } from "@jurnapod/notifications";

export class MailerError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "MailerError";
  }
}

let emailServiceInstance: EmailService | null = null;
let emailServiceInitialization: Promise<EmailService> | null = null;

const DEFAULT_MAILER_FROM_NAME = "Jurnapod";
const DEFAULT_MAILER_SMTP_PORT = 587;
const DEFAULT_MAILER_SMTP_SECURE = false;
const DEFAULT_MAILER_SMTP_TLS_REJECT_UNAUTHORIZED = true;

/**
 * Resolve SMTP mailer configuration from DB and create EmailService.
 */
async function createEmailService(): Promise<EmailService> {
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

  // For now, we only support SMTP from DB config
  // SendGrid would be configured via env vars
  const smtpConfig: SmtpEmailConfig = {
    provider: "smtp",
    host: smtpHost ?? "",
    port: smtpPort ? parseInt(smtpPort, 10) : DEFAULT_MAILER_SMTP_PORT,
    user: smtpUser ?? "",
    password: smtpPass ?? "",
    secure: smtpSecure !== null ? smtpSecure === "true" : DEFAULT_MAILER_SMTP_SECURE,
    tlsRejectUnauthorized:
      smtpTlsReject !== null ? smtpTlsReject === "true" : DEFAULT_MAILER_SMTP_TLS_REJECT_UNAUTHORIZED,
    fromAddress: fromEmail ?? "",
    fromName: fromName ?? DEFAULT_MAILER_FROM_NAME,
  };

  return new EmailService(smtpConfig);
}

/**
 * Get or create EmailService singleton.
 * @deprecated Use EmailService directly instead.
 */
export async function getMailer(): Promise<EmailService> {
  if (emailServiceInstance) {
    return emailServiceInstance;
  }
  if (!emailServiceInitialization) {
    emailServiceInitialization = createEmailService().then((service) => {
      emailServiceInstance = service;
      return service;
    });
  }
  return emailServiceInitialization;
}

// ============================================================================
// Email Template Helper Functions
// ============================================================================

/**
 * Build an email link using the configured public URL.
 */
function buildEmailLinkFromToken(path: string, token: string): string {
  const env = getAppEnv();
  const linkBuilder = createEmailLinkBuilder(env.app.publicUrl);
  return linkBuilder.buildEmailLink(path, token);
}

export type SendPasswordResetEmailParams = {
  toEmail: string;
  userName: string;
  companyName: string;
  token: string;
  expiryHours: number;
};

export type SendUserInviteEmailParams = {
  toEmail: string;
  userName: string;
  companyName: string;
  token: string;
  expiryHours: number;
};

export type SendVerifyEmailParams = {
  toEmail: string;
  userName: string;
  companyName: string;
  token: string;
  expiryHours: number;
};

/**
 * Send a password reset email using the buildPasswordResetEmail template.
 */
export async function sendPasswordResetEmail(params: SendPasswordResetEmailParams): Promise<void> {
  const { toEmail, userName, companyName, token, expiryHours } = params;

  const actionUrl = buildEmailLinkFromToken("/password-reset", token);

  const templateParams: EmailTemplateParams = {
    userName,
    companyName,
    actionUrl,
    expiryHours,
  };

  const email = buildPasswordResetEmail(templateParams);

  const mailer = await getMailer();
  const result = await mailer.send({
    to: toEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  if (!result.success) {
    throw new MailerError(result.error ?? "Failed to send email");
  }
}

/**
 * Send a user invitation email using the buildUserInviteEmail template.
 */
export async function sendUserInviteEmail(params: SendUserInviteEmailParams): Promise<void> {
  const { toEmail, userName, companyName, token, expiryHours } = params;

  const actionUrl = buildEmailLinkFromToken("/invite", token);

  const templateParams: EmailTemplateParams = {
    userName,
    companyName,
    actionUrl,
    expiryHours,
  };

  const email = buildUserInviteEmail(templateParams);

  const mailer = await getMailer();
  const result = await mailer.send({
    to: toEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  if (!result.success) {
    throw new MailerError(result.error ?? "Failed to send email");
  }
}

/**
 * Send an email verification email using the buildVerifyEmail template.
 */
export async function sendVerifyEmail(params: SendVerifyEmailParams): Promise<void> {
  const { toEmail, userName, companyName, token, expiryHours } = params;

  const actionUrl = buildEmailLinkFromToken("/verify-email", token);

  const templateParams: EmailTemplateParams = {
    userName,
    companyName,
    actionUrl,
    expiryHours,
  };

  const email = buildVerifyEmail(templateParams);

  const mailer = await getMailer();
  const result = await mailer.send({
    to: toEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  if (!result.success) {
    throw new MailerError(result.error ?? "Failed to send email");
  }
}
