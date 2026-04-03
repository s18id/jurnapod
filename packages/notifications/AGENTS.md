# AGENTS.md — @jurnapod/notifications

## Package Purpose

Email notification service for Jurnapod ERP using SendGrid and Handlebars templates.

**Core Capabilities:**
- **SendGrid integration**: Email delivery via @sendgrid/mail
- **Template rendering**: Handlebars-based email templates
- **Link building**: Branded email link generation with UTM tracking
- **Provider abstraction**: Pluggable email provider interface

**Boundaries:**
- ✅ In: Email composition, template rendering, email sending, link building
- ❌ Out: Email provider implementation details, webhook handling, queue management

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run test` | Run unit tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint code |

---

## Architecture Patterns

### Provider Abstraction

The package uses a provider abstraction for email delivery:

```typescript
import { EmailService } from './email-service.js';
import { SendGridProvider } from './providers/sendgrid.js';

const provider = new SendGridProvider(apiKey);
const emailService = new EmailService(provider);
```

### Template System

Templates are Handlebars-based with precompiled support:

```typescript
import { renderEmailTemplate } from './templates/email.js';

const html = await renderEmailTemplate('welcome', {
  name: user.name,
  verifyUrl: emailLink,
});
```

### Link Builder

Branded links with UTM tracking:

```typescript
import { buildEmailLink } from './link-builder/email.js';

const link = buildEmailLink({
  baseUrl: 'https://app.jurnapod.com',
  path: '/auth/verify',
  utm: { source: 'email', campaign: 'welcome' }
});
```

---

## Module Organization

| Module | File | Purpose |
|--------|------|---------|
| EmailService | `email-service.ts` | Main email orchestration |
| SendGridProvider | `providers/sendgrid.ts` | SendGrid implementation |
| Templates | `templates/email.ts` | Handlebars template rendering |
| LinkBuilder | `link-builder/email.ts` | Branded link generation |

### File Structure

```
packages/notifications/
├── src/
│   ├── index.ts                    # Main exports
│   ├── email-service.ts           # Email orchestration
│   ├── types.ts                   # Type definitions
│   │
│   ├── providers/
│   │   └── sendgrid.ts            # SendGrid provider
│   │
│   ├── templates/
│   │   ├── index.ts               # Template exports
│   │   └── email.ts               # Handlebars email templates
│   │
│   └── link-builder/
│       └── email.ts               # Link builder with UTM
│
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md (this file)
```

---

## Coding Standards

### TypeScript Conventions

1. **Use `.js` extensions in imports** (ESM compliance):
   ```typescript
   import { EmailService } from './email-service.js';
   ```

2. **Never use `@/` path aliases** — use relative imports

3. **Export types from `index.ts`** for public API surface

### Provider Interface

Providers must implement the email provider contract:

```typescript
interface EmailProvider {
  send(to: string, subject: string, html: string): Promise<void>;
}
```

---

## Testing Approach

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('EmailService', () => {
  it('should send email via provider', async () => {
    const mockProvider = { send: async () => {} };
    const service = new EmailService(mockProvider);
    await service.send('test@example.com', 'Subject', '<p>Body</p>');
    expect(mockProvider.send).toHaveBeenCalled();
  });
});
```

### Running Tests

```bash
npm test         # Run all tests
npm run test:watch  # Watch mode
```

---

## Security Rules

### Critical Constraints

1. **Never log email content or recipient addresses at high frequency**
   ```typescript
   // CORRECT - log only non-sensitive info
   logger.debug('Email sent', { template: 'welcome', userId });
   ```

2. **Validate all template variables** — use Zod schemas if external input

3. **UTM parameters must be allowlisted** — prevent open redirect vulnerabilities

---

## Review Checklist

When modifying this package:

- [ ] No email credentials in source code — use environment variables
- [ ] Template variables are validated/sanitized
- [ ] UTM parameters are allowlisted
- [ ] No PII in log statements
- [ ] Provider interface is properly implemented
- [ ] Tests cover happy path and error cases

---

## Related Packages

- `@jurnapod/api` — Uses this package for sending transactional emails
- `@jurnapod/shared` — Shared contracts for email schemas

For project-wide conventions, see root `AGENTS.md`.