// Email service types and interfaces

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  retryCount: number;
}

export interface SmtpEmailConfig {
  provider: 'smtp';
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
  tlsRejectUnauthorized: boolean;
  fromAddress: string;
  fromName: string;
  templateDir?: string;
}

export interface SendGridEmailConfig {
  provider: 'sendgrid';
  apiKey: string;
  fromAddress: string;
  fromName: string;
  templateDir?: string;
}

export interface SesEmailConfig {
  provider: 'ses';
  apiKey: string;
  fromAddress: string;
  fromName: string;
  templateDir?: string;
}

export type EmailConfig = SmtpEmailConfig | SendGridEmailConfig | SesEmailConfig;

export interface TemplateData {
  [key: string]: string | number | boolean | object | undefined;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  send(options: EmailOptions): Promise<SendResult>;
}

export interface NotificationService {
  sendEmail(options: EmailOptions): Promise<SendResult>;
  sendTemplate(templateName: string, to: string, data: TemplateData): Promise<SendResult>;
}
