import { EmailOptions, SendResult, EmailConfig, TemplateData, EmailProvider } from './types';
import { SendGridProvider } from './providers/sendgrid';
import { SmtpProvider } from './providers/smtp';
import { TemplateEngine } from './templates';

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second

// RFC 5322-compliant email regex (simplified)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export class EmailService {
  private provider: EmailProvider;
  private config: EmailConfig;
  private templateEngine: TemplateEngine;

  constructor(config: EmailConfig) {
    this.config = config;
    this.provider = this.createProvider(config);
    this.templateEngine = new TemplateEngine(config.templateDir);
  }

  private createProvider(config: EmailConfig): EmailProvider {
    switch (config.provider) {
      case 'sendgrid':
        return new SendGridProvider(config.apiKey);
      case 'smtp':
        return new SmtpProvider({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          secure: config.secure,
          tlsRejectUnauthorized: config.tlsRejectUnauthorized,
          fromName: config.fromName,
          fromEmail: config.fromAddress,
        });
      case 'ses':
        // TODO: Implement SES provider
        throw new Error('SES provider not yet implemented');
      default:
        throw new Error(`Unknown provider: ${(config as EmailConfig).provider}`);
    }
  }

  async send(options: EmailOptions): Promise<SendResult> {
    // Validate email address
    if (!options.to || !EMAIL_REGEX.test(options.to)) {
      return {
        success: false,
        error: `Invalid email address: ${options.to}`,
        retryCount: 0,
      };
    }

    const emailOptions: EmailOptions = {
      ...options,
      from: options.from || this.config.fromAddress,
      fromName: options.fromName || this.config.fromName,
    };

    return this.sendWithRetry(emailOptions);
  }

  async sendTemplate(
    templateName: string,
    to: string,
    data: TemplateData
  ): Promise<SendResult> {
    const template = await this.templateEngine.render(templateName, data);
    
    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  private async sendWithRetry(
    options: EmailOptions,
    attempt: number = 1
  ): Promise<SendResult> {
    try {
      const result = await this.provider.send(options);
      
      if (result.success) {
        return { ...result, retryCount: attempt - 1 };
      }

      // Failed but no error thrown - might be retryable
      if (attempt < MAX_RETRIES && this.isRetryableError(result.error)) {
        await this.delay(this.calculateRetryDelay(attempt));
        return this.sendWithRetry(options, attempt + 1);
      }

      return { ...result, retryCount: attempt };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (attempt < MAX_RETRIES && this.isRetryableError(errorMessage)) {
        await this.delay(this.calculateRetryDelay(attempt));
        return this.sendWithRetry(options, attempt + 1);
      }

      return {
        success: false,
        error: errorMessage,
        retryCount: attempt,
      };
    }
  }

  private isRetryableError(error: string | undefined): boolean {
    if (!error) return false;
    
    const retryablePatterns = [
      'timeout',
      'rate limit',
      'temporary',
      '503',
      '504',
      'ECONNREFUSED',
      'ETIMEDOUT',
    ];
    
    return retryablePatterns.some(pattern => 
      error.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s
    return RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Factory function for creating service from environment
export function createEmailServiceFromEnv(): EmailService {
  const provider = process.env.EMAIL_PROVIDER as 'sendgrid' | 'smtp' | 'ses';
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  const fromName = process.env.EMAIL_FROM_NAME;
  const templateDir = process.env.EMAIL_TEMPLATE_DIR;

  if (!provider || !fromAddress) {
    throw new Error(
      'Missing required email configuration. ' +
      'Set EMAIL_PROVIDER and EMAIL_FROM_ADDRESS'
    );
  }

  if (provider === 'sendgrid' || provider === 'ses') {
    const apiKey = process.env.EMAIL_API_KEY;
    if (!apiKey) {
      throw new Error(
        `Missing EMAIL_API_KEY for ${provider.toUpperCase()} provider`
      );
    }
    return new EmailService({
      provider,
      apiKey,
      fromAddress,
      fromName: fromName || 'Jurnapod',
      templateDir,
    });
  }

  if (provider === 'smtp') {
    const host = process.env.EMAIL_SMTP_HOST;
    const port = process.env.EMAIL_SMTP_PORT;
    const user = process.env.EMAIL_SMTP_USER;
    const password = process.env.EMAIL_SMTP_PASSWORD;
    const secure = process.env.EMAIL_SMTP_SECURE;
    const tlsRejectUnauthorized = process.env.EMAIL_SMTP_TLS_REJECT_UNAUTHORIZED;

    if (!host || !user || !password) {
      throw new Error(
        'Missing SMTP configuration. Set EMAIL_SMTP_HOST, EMAIL_SMTP_USER, and EMAIL_SMTP_PASSWORD'
      );
    }

    return new EmailService({
      provider: 'smtp',
      host,
      port: port ? parseInt(port, 10) : 587,
      user,
      password,
      secure: secure === 'true',
      tlsRejectUnauthorized: tlsRejectUnauthorized !== 'false',
      fromAddress,
      fromName: fromName || 'Jurnapod',
      templateDir,
    });
  }

  throw new Error(`Unknown email provider: ${provider}`);
}
