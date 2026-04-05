import { EmailOptions, SendResult } from '../types';
import sgMail from '@sendgrid/mail';
import { EmailProvider } from '../types';

export class SendGridProvider implements EmailProvider {
  constructor(apiKey: string) {
    sgMail.setApiKey(apiKey);
  }

  async send(options: EmailOptions): Promise<SendResult> {
    try {
      const fromAddress = options.from || '';
      const from = options.fromName 
        ? `"${options.fromName}" <${fromAddress}>` 
        : fromAddress;

      const msg: sgMail.MailDataRequired = {
        to: options.to,
        from,
        replyTo: options.replyTo,
        subject: options.subject,
        text: options.text || '',
        html: options.html || '',
      };

      const [response] = await sgMail.send(msg);

      return {
        success: true,
        messageId: response.headers['x-message-id'] as string,
        retryCount: 0,
      };
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      
      return {
        success: false,
        error: errorMessage,
        retryCount: 0,
      };
    }
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      // SendGrid errors have response body
      const sgError = error as any;
      if (sgError.response?.body?.errors?.[0]?.message) {
        return sgError.response.body.errors[0].message;
      }
      return error.message;
    }
    return 'Unknown SendGrid error';
  }
}
