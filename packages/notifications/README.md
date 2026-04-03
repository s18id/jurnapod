# @jurnapod/notifications

Email notification service for Jurnapod ERP using SendGrid and Handlebars templates.

## Overview

The `@jurnapod/notifications` package provides:

- **SendGrid integration** for reliable email delivery
- **Handlebars templates** for dynamic email content
- **Link builder** with UTM tracking parameters
- **Provider abstraction** for testability and future provider swaps

## Installation

```bash
npm install @jurnapod/notifications
```

## Quick Start

```typescript
import { EmailService } from '@jurnapod/notifications';
import { SendGridProvider } from '@jurnapod/notifications/providers/sendgrid';

// Initialize provider
const provider = new SendGridProvider(process.env.SENDGRID_API_KEY!);

// Create email service
const emailService = new EmailService(provider);

// Send email
await emailService.send({
  to: 'user@example.com',
  subject: 'Welcome to Jurnapod',
  template: 'welcome',
  variables: { name: 'John', verifyUrl: 'https://app.jurnapod.com/verify?token=xxx' }
});
```

## Usage

### Email Templates

```typescript
import { renderEmailTemplate } from '@jurnapod/notifications/templates/email';

const html = await renderEmailTemplate('password-reset', {
  resetUrl: 'https://app.jurnapod.com/reset?token=abc123',
  expiresIn: '1 hour'
});
```

### Link Builder

```typescript
import { buildEmailLink } from '@jurnapod/notifications/link-builder/email';

const link = buildEmailLink({
  baseUrl: 'https://app.jurnapod.com',
  path: '/auth/verify',
  utm: {
    source: 'email',
    medium: 'button',
    campaign: 'welcome-2024'
  }
});
// → https://app.jurnapod.com/auth/verify?utm_source=email&utm_medium=button&utm_campaign=welcome-2024
```

### Template Variables

| Template | Variables |
|----------|-----------|
| `welcome` | `name`, `verifyUrl` |
| `password-reset` | `resetUrl`, `expiresIn` |
| `invite` | `inviterName`, `inviteUrl`, `expiresIn` |

## Architecture

```
packages/notifications/
├── src/
│   ├── index.ts                    # Main exports
│   ├── email-service.ts           # Email orchestration
│   ├── types.ts                   # Type definitions
│   ├── providers/
│   │   └── sendgrid.ts            # SendGrid provider
│   ├── templates/
│   │   ├── index.ts               # Template exports
│   │   └── email.ts               # Handlebars email templates
│   └── link-builder/
│       └── email.ts               # Link builder with UTM
```

## Related Packages

- [@jurnapod/api](../../apps/api) - Uses this package for transactional emails
- [@jurnapod/shared](../shared) - Shared contracts and Zod schemas