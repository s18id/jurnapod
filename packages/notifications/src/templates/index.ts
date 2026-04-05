import { EmailTemplate, TemplateData } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import Handlebars from 'handlebars';

export class TemplateEngine {
  private templateDir: string;
  private compiledTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(templateDir?: string) {
    this.templateDir = templateDir || path.join(__dirname, 'templates');
    this.registerBuiltInTemplates();
  }

  private registerBuiltInTemplates(): void {
    // Register built-in templates
    this.compiledTemplates.set('user-invitation', Handlebars.compile(userInvitationTemplate));
    this.compiledTemplates.set('role-change', Handlebars.compile(roleChangeTemplate));
    this.compiledTemplates.set('password-reset', Handlebars.compile(passwordResetTemplate));
  }

  async render(templateName: string, data: TemplateData): Promise<EmailTemplate> {
    // Validate template name
    if (!templateName || typeof templateName !== 'string') {
      throw new Error('Template name is required and must be a string');
    }

    // Ensure data is an object
    const safeData = data && typeof data === 'object' ? data : {};

    // Check for custom template first
    const customTemplate = await this.loadCustomTemplate(templateName);
    if (customTemplate) {
      return this.renderCustomTemplate(customTemplate, safeData);
    }

    // Use built-in template
    const compiled = this.compiledTemplates.get(templateName);
    if (!compiled) {
      throw new Error(`Template not found: ${templateName}`);
    }

    return this.renderBuiltInTemplate(compiled, safeData);
  }

  private async loadCustomTemplate(templateName: string): Promise<{html: string, text: string, subject: string} | null> {
    const templatePath = path.join(this.templateDir, `${templateName}.hbs`);
    
    try {
      await fs.access(templatePath);
      const content = await fs.readFile(templatePath, 'utf-8');
      // Parse template for subject line
      const lines = content.split('\n');
      const subjectLine = lines.find((line: string) => line.startsWith('Subject:'));
      const subject = subjectLine ? subjectLine.replace('Subject:', '').trim() : 'Notification';
      
      // Remove subject line and get body
      const body = lines.filter((line: string) => !line.startsWith('Subject:')).join('\n');
      
      return {
        html: body,
        text: this.htmlToText(body),
        subject
      };
    } catch {
      // Fall back to built-in
    }
    
    return null;
  }

  private renderBuiltInTemplate(
    compiled: HandlebarsTemplateDelegate,
    data: TemplateData
  ): EmailTemplate {
    const html = compiled(data);
    
    // Extract subject from HTML comment if present
    const subjectMatch = html.match(/<!--\s*Subject:\s*(.+?)\s*-->/);
    const subject = subjectMatch ? subjectMatch[1] : 'Notification';
    
    // Remove subject comment from HTML
    const cleanHtml = html.replace(/<!--\s*Subject:.+?-->/, '').trim();
    
    return {
      subject,
      html: cleanHtml,
      text: this.htmlToText(cleanHtml)
    };
  }

  private renderCustomTemplate(
    template: {html: string, text: string, subject: string},
    data: TemplateData
  ): EmailTemplate {
    const compiledHtml = Handlebars.compile(template.html);
    const compiledText = Handlebars.compile(template.text);
    const compiledSubject = Handlebars.compile(template.subject);

    return {
      subject: compiledSubject(data),
      html: compiledHtml(data),
      text: compiledText(data)
    };
  }

  private htmlToText(html: string): string {
    // Simple HTML to text conversion
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }
}

type HandlebarsTemplateDelegate = (context: any) => string;

// Built-in templates
const userInvitationTemplate = `
<!-- Subject: Welcome to {{companyName}} -->
<h1>Welcome to {{companyName}}</h1>
<p>Hello {{name}},</p>
<p>You've been invited to join {{companyName}} as a {{role}}.</p>
<p>Your temporary password is: <strong>{{tempPassword}}</strong></p>
<p>Please login and change your password at your earliest convenience.</p>
<p><a href="{{loginUrl}}">Login to Jurnapod</a></p>
<p>Best regards,<br>{{companyName}} Team</p>
`;

const roleChangeTemplate = `
<!-- Subject: Your role has been updated -->
<h1>Role Update Notification</h1>
<p>Hello {{name}},</p>
<p>Your role at {{companyName}} has been updated to <strong>{{newRole}}</strong>.</p>
<p>If you did not expect this change, please contact your administrator.</p>
<p>Best regards,<br>{{companyName}} Team</p>
`;

const passwordResetTemplate = `
<!-- Subject: Password reset request -->
<h1>Password Reset</h1>
<p>Hello {{name}},</p>
<p>We received a request to reset your password for {{companyName}}.</p>
<p>Click the link below to reset your password:</p>
<p><a href="{{resetUrl}}">Reset Password</a></p>
<p>This link will expire in 24 hours.</p>
<p>If you did not request this reset, please ignore this email.</p>
<p>Best regards,<br>{{companyName}} Team</p>
`;
