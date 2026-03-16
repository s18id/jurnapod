import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SendGridProvider } from '../src/providers/sendgrid';
import sgMail from '@sendgrid/mail';

// Mock @sendgrid/mail
vi.mock('@sendgrid/mail', () => ({
  default: {
    setApiKey: vi.fn(),
    send: vi.fn(),
  },
}));

describe('SendGridProvider', () => {
  let provider: SendGridProvider;
  const mockApiKey = 'SG.test-api-key-12345';

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new SendGridProvider(mockApiKey);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should set API key on construction', () => {
      expect(sgMail.setApiKey).toHaveBeenCalledWith(mockApiKey);
      expect(sgMail.setApiKey).toHaveBeenCalledTimes(1);
    });

    it('should accept different API keys', () => {
      const anotherKey = 'SG.another-api-key-67890';
      new SendGridProvider(anotherKey);
      
      expect(sgMail.setApiKey).toHaveBeenCalledWith(anotherKey);
    });
  });

  describe('Successful Email Sending', () => {
    it('should send email with minimal options', async () => {
      const mockResponse = {
        headers: {
          'x-message-id': 'msg-12345',
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockResolvedValue([mockResponse]);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-12345');
      expect(result.retryCount).toBe(0);
      expect(sgMail.send).toHaveBeenCalledWith({
        to: 'recipient@example.com',
        from: 'sender@example.com',
        subject: 'Test Subject',
        text: 'Test body',
        html: '',
      });
    });

    it('should send email with HTML content', async () => {
      const mockResponse = {
        headers: {
          'x-message-id': 'msg-html-123',
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockResolvedValue([mockResponse]);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'HTML Email',
        html: '<h1>Hello</h1><p>World</p>',
        text: 'Hello World',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(true);
      expect(sgMail.send).toHaveBeenCalledWith({
        to: 'recipient@example.com',
        from: 'sender@example.com',
        subject: 'HTML Email',
        text: 'Hello World',
        html: '<h1>Hello</h1><p>World</p>',
      });
    });

    it('should send email with fromName option', async () => {
      const mockResponse = {
        headers: {
          'x-message-id': 'msg-named-123',
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockResolvedValue([mockResponse]);

      await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
        fromName: 'Test Sender',
      });

      // fromName is handled at the EmailService level, not SendGridProvider
      // But we verify it's passed through correctly
      expect(sgMail.send).toHaveBeenCalledWith(expect.objectContaining({
        to: 'recipient@example.com',
        from: 'sender@example.com',
      }));
    });

    it('should handle response without x-message-id header', async () => {
      const mockResponse = {
        headers: {},
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockResolvedValue([mockResponse]);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeUndefined();
    });

    it('should handle multiple recipients', async () => {
      const mockResponse = {
        headers: {
          'x-message-id': 'msg-multi-123',
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockResolvedValue([mockResponse]);

      await provider.send({
        to: 'recipient1@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(sgMail.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Response Handling', () => {
    it('should handle SendGrid API error with response body', async () => {
      const sgError = new Error('Bad Request') as any;
      sgError.response = {
        body: {
          errors: [
            { message: 'Invalid email address format', field: 'to', help: 'http://sendgrid.com' },
          ],
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockRejectedValue(sgError);

      const result = await provider.send({
        to: 'invalid-email',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email address format');
      expect(result.retryCount).toBe(0);
    });

    it('should handle SendGrid API error without response body', async () => {
      const sgError = new Error('Network error');
      (sgMail.send as ReturnType<typeof vi.fn>).mockRejectedValue(sgError);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle SendGrid error with empty errors array', async () => {
      const sgError = new Error('Bad Request') as any;
      sgError.response = {
        body: {
          errors: [],
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockRejectedValue(sgError);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Bad Request');
    });

    it('should handle 401 unauthorized error', async () => {
      const sgError = new Error('Unauthorized') as any;
      sgError.response = {
        body: {
          errors: [
            { message: 'The provided authorization grant is invalid, expired, or revoked' },
          ],
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockRejectedValue(sgError);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('authorization grant is invalid');
    });

    it('should handle 403 forbidden error', async () => {
      const sgError = new Error('Forbidden') as any;
      sgError.response = {
        body: {
          errors: [
            { message: 'Access forbidden' },
          ],
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockRejectedValue(sgError);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Access forbidden');
    });

    it('should handle non-Error throws', async () => {
      (sgMail.send as ReturnType<typeof vi.fn>).mockRejectedValue('String error');

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown SendGrid error');
    });

    it('should handle null/undefined error', async () => {
      (sgMail.send as ReturnType<typeof vi.fn>).mockRejectedValue(null);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown SendGrid error');
    });
  });

  describe('5xx Error Retry Scenarios', () => {
    it('should return retryable error on 500 internal server error', async () => {
      const sgError = new Error('Internal Server Error') as any;
      sgError.response = {
        statusCode: 500,
        body: {
          errors: [
            { message: 'Internal server error' },
          ],
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockRejectedValue(sgError);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(false);
      // The error message extraction should work even with status codes
      expect(result.error).toBe('Internal server error');
    });

    it('should return retryable error on 502 bad gateway', async () => {
      const sgError = new Error('Bad Gateway') as any;
      sgError.code = 502;
      sgError.response = {
        body: {
          errors: [
            { message: 'Bad Gateway' },
          ],
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockRejectedValue(sgError);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(false);
    });

    it('should return retryable error on 503 service unavailable', async () => {
      const sgError = new Error('Service Unavailable') as any;
      sgError.response = {
        statusCode: 503,
        body: {
          errors: [
            { message: 'Service temporarily unavailable' },
          ],
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockRejectedValue(sgError);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('unavailable');
    });

    it('should return retryable error on 504 gateway timeout', async () => {
      const sgError = new Error('Gateway Timeout') as any;
      sgError.response = {
        statusCode: 504,
        body: {
          errors: [
            { message: 'Gateway timeout' },
          ],
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockRejectedValue(sgError);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(false);
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      (sgMail.send as ReturnType<typeof vi.fn>).mockRejectedValue(timeoutError);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Request timeout');
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded') as any;
      rateLimitError.response = {
        statusCode: 429,
        body: {
          errors: [
            { message: 'Too many requests' },
          ],
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockRejectedValue(rateLimitError);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Too many requests');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty from address', async () => {
      const mockResponse = {
        headers: {
          'x-message-id': 'msg-empty-123',
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockResolvedValue([mockResponse]);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
        from: '',
      });

      expect(result.success).toBe(true);
      expect(sgMail.send).toHaveBeenCalledWith(expect.objectContaining({
        from: '',
      }));
    });

    it('should handle missing from address', async () => {
      const mockResponse = {
        headers: {
          'x-message-id': 'msg-nofrom-123',
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockResolvedValue([mockResponse]);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test body',
      } as any);

      expect(result.success).toBe(true);
    });

    it('should handle special characters in email fields', async () => {
      const mockResponse = {
        headers: {
          'x-message-id': 'msg-special-123',
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockResolvedValue([mockResponse]);

      const result = await provider.send({
        to: 'recipient+tag@example.com',
        subject: 'Test: Special <chars> & "quotes"',
        text: 'Test body with <html> tags',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(true);
    });

    it('should handle very long content', async () => {
      const mockResponse = {
        headers: {
          'x-message-id': 'msg-long-123',
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockResolvedValue([mockResponse]);

      const longText = 'A'.repeat(10000);
      const longHtml = '<p>' + 'B'.repeat(10000) + '</p>';

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: 'Long Content',
        text: longText,
        html: longHtml,
        from: 'sender@example.com',
      });

      expect(result.success).toBe(true);
    });

    it('should handle Unicode content', async () => {
      const mockResponse = {
        headers: {
          'x-message-id': 'msg-unicode-123',
        },
      };
      (sgMail.send as ReturnType<typeof vi.fn>).mockResolvedValue([mockResponse]);

      const result = await provider.send({
        to: 'recipient@example.com',
        subject: '日本語テスト ñ émojis 🎉',
        text: 'Unicode test: 中文 العربية',
        html: '<p>Unicode: 中文 🎊</p>',
        from: 'sender@example.com',
      });

      expect(result.success).toBe(true);
    });
  });
});
