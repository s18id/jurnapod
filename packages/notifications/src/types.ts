// Email service types and interfaces

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  fromName?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  retryCount: number;
}

export interface EmailConfig {
  provider: 'sendgrid' | 'ses';
  apiKey: string;
  fromAddress: string;
  fromName: string;
  templateDir?: string;
}

export interface TemplateData {
  [key: string]: string | number | boolean | object | undefined;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export abstract class EmailProvider {
  abstract send(options: EmailOptions): Promise<SendResult>;
}

export interface NotificationService {
  sendEmail(options: EmailOptions): Promise<SendResult>;
  sendTemplate(templateName: string, to: string, data: TemplateData): Promise<SendResult>;
}
