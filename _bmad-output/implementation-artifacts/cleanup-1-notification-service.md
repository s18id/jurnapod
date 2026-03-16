# Cleanup Task: Build Notification Service Infrastructure

## Status: ready-for-dev

**Type**: Technical Debt / Epic 1 Retro Commitment  
**Priority**: P0 - Critical (Blocks multiple features)  
**Estimated Points**: 8  
**Estimated Hours**: 8

## Story

As a **system**,  
I want **a notification service that can send transactional emails**,  
So that **features requiring notifications (user invitations, role changes, etc.) can be implemented**.

## Background

This task completes the Epic 1 retro commitment to build notification infrastructure. Multiple stories (1.4 User Management, future stories) require email notifications, but the service was never built.

## Acceptance Criteria

### AC1: Email Service Implementation
**Given** a configured email provider  
**When** the notification service sends an email  
**Then** the email is delivered to the recipient

**Requirements:**
- Support SendGrid or AWS SES (configurable via env vars)
- Template-based emails (HTML + plain text)
- Retry logic for transient failures (exponential backoff, max 3 retries)
- Error logging for failed deliveries

### AC2: Configuration Management
**Given** environment variables set  
**When** the service starts  
**Then** it loads configuration securely

**Required Config:**
- `EMAIL_PROVIDER` (sendgrid|ses)
- `EMAIL_API_KEY` (provider API key)
- `EMAIL_FROM_ADDRESS` (default sender)
- `EMAIL_FROM_NAME` (default sender name)
- `EMAIL_TEMPLATE_DIR` (optional, defaults to built-in templates)

### AC3: Template System
**Given** an email template  
**When** sending a notification  
**Then** template variables are replaced with actual values

**Templates Required:**
- `user_invitation` - Welcome email with temporary password
- `role_change` - Notification of role assignment change
- `password_reset` - Password reset link

### AC4: Error Handling & Logging
**Given** an email send failure  
**When** all retries are exhausted  
**Then** the failure is logged with context for debugging

**Logging Requirements:**
- Recipient email (hashed for privacy)
- Template used
- Error message
- Timestamp
- Retry count

### AC5: Integration Testing
**Given** the notification service  
**When** integration tests run  
**Then** emails are verifiably sent (or mock validated)

**Test Requirements:**
- Test with mock provider in CI
- Test with real provider in staging (manual trigger)
- Verify template rendering
- Verify retry logic

## Technical Requirements

### Architecture
```
packages/notifications/
├── src/
│   ├── index.ts              # Main exports
│   ├── email-service.ts      # Core email service
│   ├── templates/
│   │   ├── index.ts          # Template registry
│   │   ├── user-invitation.ts
│   │   ├── role-change.ts
│   │   └── password-reset.ts
│   └── types.ts              # TypeScript types
├── tests/
│   ├── email-service.test.ts
│   └── templates.test.ts
└── package.json
```

### API Interface
```typescript
interface NotificationService {
  sendEmail(options: EmailOptions): Promise<SendResult>;
  sendTemplate(template: string, to: string, data: object): Promise<SendResult>;
}

interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}
```

### Dependencies
- `nodemailer` or provider-specific SDK
- Handlebars or similar for templating
- Existing logger from `@jurnapod/shared`

## Implementation Notes

### Files to Create
1. `packages/notifications/package.json` - Package manifest
2. `packages/notifications/src/index.ts` - Public API
3. `packages/notifications/src/email-service.ts` - Core implementation
4. `packages/notifications/src/types.ts` - Type definitions
5. `packages/notifications/src/templates/index.ts` - Template registry
6. `packages/notifications/src/templates/user-invitation.ts` - Welcome template
7. `packages/notifications/src/templates/role-change.ts` - Role change template
8. `packages/notifications/src/templates/password-reset.ts` - Reset template
9. `packages/notifications/tests/email-service.test.ts` - Unit tests
10. `packages/notifications/tests/integration.test.ts` - Integration tests

### Integration Points
- Import in `apps/api/src/lib/notifications.ts` for API usage
- Will be used by Story 1.4 (user invitations) once complete
- Future use: password reset, alerts, reports

### Testing Strategy
**Unit Tests:**
- Template rendering with various data inputs
- Retry logic behavior
- Configuration loading

**Integration Tests:**
- Mock provider test (automated in CI)
- Real provider test (manual, staging only)

### Security Considerations
- API keys in environment variables (never in code)
- Email addresses logged hashed, not plain text
- Rate limiting to prevent abuse (future enhancement)

## Dev Notes

### Brownfield Considerations
This is greenfield development - no existing notification infrastructure.

### Dependencies on Other Work
- None blocking (self-contained)
- Will unblock Story 1.4 completion (user invitation emails)
- Enables future notification-dependent features

## Dev Agent Record

### Agent Model Used
TBD

### Debug Log References
TBD

### Completion Notes
TBD

### File List
- packages/notifications/package.json
- packages/notifications/src/index.ts
- packages/notifications/src/email-service.ts
- packages/notifications/src/types.ts
- packages/notifications/src/templates/index.ts
- packages/notifications/src/templates/user-invitation.ts
- packages/notifications/src/templates/role-change.ts
- packages/notifications/src/templates/password-reset.ts
- packages/notifications/tests/email-service.test.ts
- packages/notifications/tests/integration.test.ts
