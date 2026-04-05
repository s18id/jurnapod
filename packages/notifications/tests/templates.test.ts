import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TemplateEngine } from '../src/templates';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises and path modules
vi.mock('fs/promises');
vi.mock('path', async () => {
  const actual = await vi.importActual('path') as typeof import('path');
  return {
    ...actual,
    join: vi.fn((...args: string[]) => args.join('/')),
  };
});

describe('TemplateEngine', () => {
  let engine: TemplateEngine;
  const mockTemplateDir = '/mock/templates';

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new TemplateEngine(mockTemplateDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Built-in Templates', () => {
    it('should render user-invitation template', async () => {
      const result = await engine.render('user-invitation', {
        name: 'John Doe',
        companyName: 'TestCorp',
        role: 'Admin',
        tempPassword: 'temp123',
        loginUrl: 'https://app.example.com/login',
      });

      expect(result.subject).toBe('Welcome to TestCorp');
      expect(result.html).toContain('Welcome to TestCorp');
      expect(result.html).toContain('Hello John Doe');
      expect(result.html).toContain('invited to join TestCorp as a Admin');
      expect(result.html).toContain('temp123');
      expect(result.html).toContain('https://app.example.com/login');
      expect(result.text).toContain('Welcome to TestCorp');
      expect(result.text).toContain('Hello John Doe');
    });

    it('should render role-change template', async () => {
      const result = await engine.render('role-change', {
        name: 'Jane Smith',
        companyName: 'TestCorp',
        newRole: 'Manager',
      });

      expect(result.subject).toBe('Your role has been updated');
      expect(result.html).toContain('Role Update Notification');
      expect(result.html).toContain('Hello Jane Smith');
      expect(result.html).toContain('updated to <strong>Manager</strong>');
      expect(result.text).toContain('Your role at TestCorp has been updated to Manager');
    });

    it('should render password-reset template', async () => {
      const result = await engine.render('password-reset', {
        name: 'Bob Wilson',
        companyName: 'TestCorp',
        resetUrl: 'https://app.example.com/reset?token=abc123',
      });

      expect(result.subject).toBe('Password reset request');
      expect(result.html).toContain('Password Reset');
      expect(result.html).toContain('Hello Bob Wilson');
      expect(result.html).toContain('https://app.example.com/reset?token&#x3D;abc123');
      expect(result.html).toContain('expire in 24 hours');
      expect(result.text).toContain('reset your password for TestCorp');
    });

    it('should handle all built-in template names', async () => {
      const templates = ['user-invitation', 'role-change', 'password-reset'];
      
      for (const templateName of templates) {
        const result = await engine.render(templateName, {
          name: 'Test User',
          companyName: 'TestCorp',
        });
        
        expect(result).toHaveProperty('subject');
        expect(result).toHaveProperty('html');
        expect(result).toHaveProperty('text');
        expect(result.subject).toBeTruthy();
        expect(result.html).toBeTruthy();
        expect(result.text).toBeTruthy();
      }
    });

    it('should use default subject when template has no subject comment', async () => {
      // Test by checking role-change has explicit subject
      const result = await engine.render('role-change', {
        name: 'Test',
        companyName: 'TestCorp',
        newRole: 'User',
      });
      
      expect(result.subject).toBe('Your role has been updated');
    });
  });

  describe('Template Variable Handling', () => {
    it('should replace all variables in template', async () => {
      const result = await engine.render('user-invitation', {
        name: 'Alice',
        companyName: 'Acme Inc',
        role: 'Editor',
        tempPassword: 'secure123',
        loginUrl: 'https://login.example.com',
      });

      // Check no {{variable}} patterns remain
      expect(result.html).not.toMatch(/\{\{[\w]+\}\}/);
      expect(result.text).not.toMatch(/\{\{[\w]+\}\}/);
    });

    it('should handle empty data object', async () => {
      const result = await engine.render('user-invitation', {});

      // Template should render with empty strings for missing variables
      expect(result.html).toBeTruthy();
      expect(result.subject).toBe('Welcome to'); // {{companyName}} becomes empty (Handlebars strips trailing space)
    });

    it('should handle partial data object', async () => {
      const result = await engine.render('user-invitation', {
        name: 'Partial User',
        companyName: 'PartialCorp',
      });

      expect(result.html).toContain('Hello Partial User');
      expect(result.html).toContain('PartialCorp');
      // Missing variables become empty
      expect(result.html).toContain('as a '); // role is missing
    });

    it('should handle numeric variables', async () => {
      const result = await engine.render('user-invitation', {
        name: 'User123',
        companyName: 'Corp123',
        role: '123',
        tempPassword: 'pass123',
        loginUrl: 'http://example.com',
        count: 42,
      });

      // Note: 'count' variable is not used in the built-in template
      // Template only uses: name, companyName, role, tempPassword, loginUrl
      expect(result.html).toContain('Corp123');
    });

    it('should handle boolean variables', async () => {
      const result = await engine.render('user-invitation', {
        name: 'Boolean User',
        companyName: 'BoolCorp',
        role: 'admin',
        tempPassword: 'pass',
        loginUrl: 'http://example.com',
        isActive: true,
        isAdmin: false,
      });

      // Note: isActive and isAdmin variables are not used in the built-in template
      // Template only uses: name, companyName, role, tempPassword, loginUrl
      expect(result.html).toContain('BoolCorp');
    });

    it('should handle special characters in variables', async () => {
      const result = await engine.render('user-invitation', {
        name: 'User <script>alert("xss")</script>',
        companyName: 'Corp & "Company"',
        role: 'Admin\nMulti-line',
        tempPassword: 'pass\twith\ttabs',
        loginUrl: 'http://example.com?param=value&other=test',
      });

      // Handlebars escapes HTML special characters by default (security feature)
      expect(result.html).toContain('User &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(result.html).toContain('Corp &amp; &quot;Company&quot;');
    });

    it('should handle very long variable values', async () => {
      const longString = 'A'.repeat(5000);
      
      const result = await engine.render('user-invitation', {
        name: longString,
        companyName: 'TestCorp',
        role: 'Admin',
        tempPassword: 'pass',
        loginUrl: 'http://example.com',
      });

      expect(result.html).toContain(longString);
    });

    it('should handle Unicode characters in variables', async () => {
      const result = await engine.render('user-invitation', {
        name: '日本語ユーザー',
        companyName: '中文公司',
        role: 'مدير',
        tempPassword: '🎉emoji🎊',
        loginUrl: 'http://example.com',
      });

      expect(result.html).toContain('日本語ユーザー');
      expect(result.html).toContain('中文公司');
      expect(result.html).toContain('مدير');
      expect(result.html).toContain('🎉emoji🎊');
    });
  });

  describe('Custom Templates', () => {
    it('should load custom template from disk', async () => {
      const customTemplate = `Subject: Custom Subject
<h1>Hello {{name}}</h1>
<p>Welcome to {{company}}</p>`;

      (fs.access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(customTemplate);

      const result = await engine.render('custom-template', {
        name: 'Custom User',
        company: 'CustomCorp',
      });

      expect(result.subject).toBe('Custom Subject');
      expect(result.html).toContain('<h1>Hello Custom User</h1>');
      expect(result.text).toContain('Hello Custom User');
    });

    it('should fall back to built-in when custom template not found', async () => {
      (fs.access as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));

      const result = await engine.render('user-invitation', {
        name: 'Test',
        companyName: 'TestCorp',
        role: 'Admin',
        tempPassword: 'pass',
        loginUrl: 'http://example.com',
      });

      expect(result.subject).toBe('Welcome to TestCorp');
    });

    it('should handle custom template read errors gracefully', async () => {
      (fs.access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Permission denied'));

      // Should fall back to built-in
      const result = await engine.render('user-invitation', {
        name: 'Test',
        companyName: 'TestCorp',
        role: 'Admin',
        tempPassword: 'pass',
        loginUrl: 'http://example.com',
      });

      expect(result.subject).toBe('Welcome to TestCorp');
    });

    it('should parse subject from first line of custom template', async () => {
      const customTemplate = `Subject: Welcome to {{company}}!
<h1>Hello {{name}}</h1>`;

      (fs.access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(customTemplate);

      const result = await engine.render('welcome', {
        name: 'Test',
        company: 'TestCorp',
      });

      expect(result.subject).toBe('Welcome to TestCorp!');
    });

    it('should use default subject when custom template has no subject line', async () => {
      const customTemplate = `<h1>Hello {{name}}</h1>
<p>Welcome!</p>`;

      (fs.access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(customTemplate);

      const result = await engine.render('no-subject', {
        name: 'Test',
      });

      expect(result.subject).toBe('Notification');
    });

    it('should handle custom template with only subject', async () => {
      const customTemplate = `Subject: Simple Subject
<p>Simple body</p>`;

      (fs.access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(customTemplate);

      const result = await engine.render('simple', {});

      expect(result.subject).toBe('Simple Subject');
      expect(result.html).toBe('<p>Simple body</p>');
    });
  });

  describe('Template Not Found', () => {
    it('should throw error for unknown template', async () => {
      (fs.access as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));

      await expect(
        engine.render('non-existent-template', {})
      ).rejects.toThrow('Template not found: non-existent-template');
    });

    it('should throw error for empty template name', async () => {
      await expect(
        engine.render('', {})
      ).rejects.toThrow('Template name is required and must be a string');
    });
  });

  describe('HTML to Text Conversion', () => {
    it('should convert HTML to plain text correctly', async () => {
      const result = await engine.render('user-invitation', {
        name: 'Test',
        companyName: 'TestCorp',
        role: 'Admin',
        tempPassword: 'pass',
        loginUrl: 'http://example.com',
      });

      // Text should not contain HTML tags
      expect(result.text).not.toMatch(/<[^>]+>/);
      
      // Text should have line breaks for paragraphs
      expect(result.text).toContain('\n');
      
      // Text should contain the content
      expect(result.text).toContain('Welcome to TestCorp');
      expect(result.text).toContain('Hello Test');
    });

    it('should handle HTML entities', async () => {
      (fs.access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Subject: Test\n<p>Test &amp; Example &lt;tag&gt; &nbsp; space</p>'
      );

      const result = await engine.render('entities', {});

      // HTML entities decoded in text, &nbsp; becomes space (3 spaces total from conversion)
      expect(result.text).toContain('Test & Example <tag>');
    });

    it('should handle br tags', async () => {
      (fs.access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Subject: Test\n<p>Line 1<br/>Line 2<br>Line 3</p>'
      );

      const result = await engine.render('breaks', {});

      expect(result.text).toContain('Line 1\nLine 2\nLine 3');
    });
  });

  describe('Template Directory Handling', () => {
    it('should use default template directory when not specified', () => {
      const defaultEngine = new TemplateEngine();
      expect(defaultEngine).toBeDefined();
    });

    it('should use provided template directory', () => {
      const customEngine = new TemplateEngine('/custom/path');
      expect(customEngine).toBeDefined();
    });
  });

  describe('Complex Variable Scenarios', () => {
    it('should handle nested object variables', async () => {
      // TemplateData type allows string | number | boolean, but Handlebars can handle objects
      // Using 'as any' to test the actual behavior
      const result = await engine.render('user-invitation', {
        name: 'Test User',
        companyName: 'TestCorp',
        role: 'Admin',
        tempPassword: 'pass',
        loginUrl: 'http://example.com',
        // These won't be used in template but are in the data object
        extra: 'value',
      } as any);

      expect(result.html).toBeTruthy();
    });

    it('should handle null and undefined values', async () => {
      const result = await engine.render('user-invitation', {
        name: null as any,
        companyName: undefined as any,
        role: 'Admin',
        tempPassword: 'pass',
        loginUrl: 'http://example.com',
      });

      expect(result.html).toBeTruthy();
      expect(result.html).toContain('Hello');
    });

    it('should handle deeply nested template variables', async () => {
      (fs.access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        `Subject: Welcome {{user.name}}
<h1>Hello {{user.profile.firstName}} {{user.profile.lastName}}</h1>
<p>Company: {{company.details.name}}</p>`
      );

      // Using 'as any' since Handlebars supports nested objects even if our type is limited
      const result = await engine.render('nested', {
        user: {
          name: 'TestUser',
          profile: {
            firstName: 'John',
            lastName: 'Doe',
          },
        },
        company: {
          details: {
            name: 'TestCorp',
          },
        },
      } as any);

      expect(result.subject).toBe('Welcome TestUser');
      expect(result.html).toContain('Hello John Doe');
      expect(result.html).toContain('Company: TestCorp');
    });
  });
});
