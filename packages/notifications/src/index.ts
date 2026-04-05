export { EmailService, createEmailServiceFromEnv } from './email-service';
export { SendGridProvider } from './providers/sendgrid';
export { SmtpProvider, type SmtpConfig } from './providers/smtp';
export { TemplateEngine } from './templates';
export * from './templates/email';
export { createEmailLinkBuilder, type EmailLinkBuilder } from './link-builder/email';
export * from './types';
