# Story 31.6: Notifications Consolidation (email/mailer)

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.6 |
| Title | Notifications Consolidation (email/mailer) |
| Status | pending |
| Type | Extraction |
| Sprint | 2 of 2 |
| Priority | P2 |
| Estimate | 4h |

---

## Story

As a Notifications Engineer,
I want the email/mailer infrastructure to live in `@jurnapod/notifications`,
So that email sending is a reusable package capability and not tied to the API.

---

## Background

`apps/api/src/lib/` contains email infrastructure:
- `mailer.ts` — SMTP sender
- `email-outbox.ts` — email queue/outbox pattern
- `email-tokens.ts` — email verification tokens
- `email-link-builder.ts` — email link generation
- `email-templates.ts` — email template rendering

This should consolidate into `@jurnapod/notifications` which already has notification capabilities.

---

## Acceptance Criteria

1. `mailer.ts`, `email-outbox.ts`, `email-tokens.ts`, `email-link-builder.ts`, `email-templates.ts` moved to `@jurnapod/notifications`
2. API routes that send email delegate to `@jurnapod/notifications`
3. `@jurnapod/notifications` exports EmailService, EmailOutbox, EmailTemplates
4. No `packages/notifications` importing from `apps/api/**`
5. `npm run typecheck -w @jurnapod/notifications` passes
6. `npm run typecheck -w @jurnapod/api` passes

---

## Technical Notes

### Target Structure

```
packages/notifications/src/
  email/
    index.ts
    mailer.ts         # SMTP sender
    email-outbox.ts   # Email queue
    email-tokens.ts   # Verification tokens
    email-link-builder.ts
    email-templates.ts
  types/
  contracts/
```

### Architecture Rules

- No package imports from `apps/api/**`
- AWS S3 upload (`image-storage.ts`) stays in API (infrastructure concern)
- Email templates (HTML) can stay as static assets
- NO MOCK DB for DB-backed business logic tests

---

## Tasks

- [ ] Read all email lib files
- [ ] Create `packages/notifications/src/email/` structure
- [ ] Move all email files to package
- [ ] Update API routes that send email to use package
- [ ] Run typecheck + build
- [ ] Test email sending flow

---

## Validation

```bash
npm run typecheck -w @jurnapod/notifications
npm run typecheck -w @jurnapod/api
```
