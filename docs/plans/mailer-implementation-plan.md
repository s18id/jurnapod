<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Mailer Implementation Plan

**Status:** Draft  
**Date:** 2026-03-02  
**Author:** Ahmad Faruk (Signal18 ID)

## Summary

Add a global SMTP mailer service to Jurnapod API for transactional emails (password reset, user invites, invoices, alerts). Configuration is global (env-based), managed by SUPER_ADMIN only.

## Goals

- Provide a simple, reliable SMTP mailer for transactional use cases.
- Support multiple drivers: `smtp`, `log` (dev mode), `disabled` (safe default).
- Ensure only SUPER_ADMIN can test/verify mailer configuration.
- Keep static pages endpoints SUPER_ADMIN only (security hardening).

## Non-Goals

- Per-company SMTP overrides (deferred to future iteration).
- Rich HTML templating engine (basic helpers only).
- Marketing/bulk email features (transactional only).
- Email queue/retry (can be added later if needed).

## Design

### 1. Configuration (env-based)

All mailer config lives in `apps/api/src/lib/env.ts` and `.env.example`.

**New env keys:**
```env
# Mailer driver: smtp | log | disabled
MAILER_DRIVER=disabled

# From address defaults
MAILER_FROM_NAME=Jurnapod
MAILER_FROM_EMAIL=noreply@example.com

# SMTP settings (required when MAILER_DRIVER=smtp)
MAILER_SMTP_HOST=mail.example.com
MAILER_SMTP_PORT=587
MAILER_SMTP_USER=noreply@example.com
MAILER_SMTP_PASS=secret
MAILER_SMTP_SECURE=false
# Optional: set to false to allow self-signed certs in dev
MAILER_SMTP_TLS_REJECT_UNAUTHORIZED=true
```

**Validation rules:**
- When `MAILER_DRIVER=smtp`, require:
  - `MAILER_FROM_EMAIL`
  - `MAILER_SMTP_HOST`
  - `MAILER_SMTP_PORT`
  - `MAILER_SMTP_USER` and `MAILER_SMTP_PASS` (optional if anonymous SMTP allowed, but recommended to require)
- Default to `disabled` for safety.

### 2. Mailer Module

**File:** `apps/api/src/lib/mailer.ts`

**Interface:**
```ts
export type SendMailParams = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  tags?: Record<string, string>; // for future logging/analytics
};

export interface Mailer {
  sendMail(params: SendMailParams): Promise<void>;
}

export function getMailer(): Mailer;
```

**Drivers:**
1. **SMTP (nodemailer):**
   - Use `nodemailer.createTransport` with SMTP config.
   - Normalize `to` (string or array), enforce `from` defaults.
   - Log errors with correlation id.

2. **Log:**
   - Console.log the email payload (useful for local dev).
   - Do not actually send.

3. **Disabled:**
   - Throw a clear error: "Mailer is disabled. Set MAILER_DRIVER=smtp or log."

**Singleton pattern:**
- Lazy initialization in `getMailer()`.
- Cache transporter instance for SMTP.

**Error handling:**
- Wrap nodemailer errors and log them.
- Return a consistent error type (e.g., `MailerError`).

### 3. Mailer Test Endpoint

**File:** `apps/api/app/api/settings/mailer-test/route.ts`

**Route:** `POST /api/settings/mailer-test`

**Access control:**
- `withAuth` + `requireAccess({ roles: ["SUPER_ADMIN"], module: "settings", permission: "update" })`

**Request schema:**
```ts
{
  to: string;        // recipient email
  subject: string;   // email subject
  html?: string;     // HTML body (optional)
  text?: string;     // plain text body (optional)
}
```

**Response:**
- Success: `{ success: true, data: { message: "Email sent" } }`
- Failure: `{ success: false, error: { code: "MAILER_ERROR", message: "..." } }`

**Validation:**
- Require at least one of `html` or `text`.
- Validate `to` as valid email format.

### 4. Static Pages Access Control

Update all static pages endpoints to **SUPER_ADMIN only**.

**Files to update:**
- `apps/api/app/api/settings/pages/route.ts` (GET, POST)
- `apps/api/app/api/settings/pages/[pageId]/route.ts` (GET, PATCH)
- `apps/api/app/api/settings/pages/[pageId]/publish/route.ts` (POST)
- `apps/api/app/api/settings/pages/[pageId]/unpublish/route.ts` (POST)
- `apps/api/app/api/admin/pages/**` (all alias routes)

**Change:**
```ts
// Before:
requireAccess({ roles: ["OWNER", "ADMIN"], module: "settings", permission: "read" })

// After:
requireAccess({ roles: ["SUPER_ADMIN"], module: "settings", permission: "read" })
```

Apply to all permission types (read, create, update, delete).

### 5. Dependency

Add `nodemailer` and its types to `apps/api/package.json`:
```json
{
  "dependencies": {
    "nodemailer": "^6.9.15"
  },
  "devDependencies": {
    "@types/nodemailer": "^6.4.16"
  }
}
```

### 6. Future Enhancements (out of scope)

- Email templates (`apps/api/src/lib/email-templates.ts`):
  - Password reset
  - User invite
  - Invoice/receipt
  - Generic notification wrapper
- Email queue with retry (use DB or Redis).
- Per-company SMTP overrides (encrypted credentials in DB).
- Bounce/complaint handling (webhook from SMTP provider).
- Email audit log (track all sends with correlation id).

## Implementation Checklist

- [ ] Update `apps/api/src/lib/env.ts` with mailer config.
- [ ] Update `.env.example` with placeholder keys.
- [ ] Implement `apps/api/src/lib/mailer.ts` with SMTP/log/disabled drivers.
- [ ] Create `apps/api/app/api/settings/mailer-test/route.ts` endpoint.
- [ ] Update static pages endpoints to SUPER_ADMIN only.
- [ ] Add `nodemailer` dependency to `apps/api/package.json`.
- [ ] Run `npm install` in `apps/api`.
- [ ] Test mailer with `disabled` driver (should error).
- [ ] Test mailer with `log` driver (should console.log).
- [ ] Test mailer with `smtp` driver (manual verification with real SMTP).

## Testing Strategy

### Unit tests (optional, can be added later)
- Mailer module: test driver selection, from defaults, recipient normalization.

### Integration tests (manual)
1. Set `MAILER_DRIVER=disabled`, call `/api/settings/mailer-test` → expect error.
2. Set `MAILER_DRIVER=log`, call `/api/settings/mailer-test` → expect console output.
3. Set `MAILER_DRIVER=smtp` with valid SMTP, call `/api/settings/mailer-test` → expect email delivery.

### Access control tests
- Call `/api/settings/mailer-test` as OWNER → expect 403.
- Call `/api/settings/mailer-test` as SUPER_ADMIN → expect 200.
- Call `/api/settings/pages` as OWNER → expect 403.
- Call `/api/settings/pages` as SUPER_ADMIN → expect 200.

## Security Considerations

- **Credentials in env:** SMTP password lives in `.env`, never commit real values.
- **Access control:** Only SUPER_ADMIN can test mailer (prevents abuse).
- **Rate limiting:** Consider adding throttling to `/api/settings/mailer-test` to prevent spam.
- **TLS enforcement:** Default to `MAILER_SMTP_SECURE=false` (STARTTLS on 587), allow override for 465.
- **From address validation:** Enforce consistent `from` to prevent spoofing.

## Migration Notes

No DB migrations required (env-based config only).

## Documentation Updates

- Update `README.md` or `docs/guides/mailer.md` with:
  - Env key reference
  - How to test mailer config
  - How to integrate mailer into business flows (future)

## Decisions

1. **Anonymous SMTP:** Not allowed. SMTP auth (user/pass) is required.
2. **Static pages access:** SUPER_ADMIN only (single platform use case).
3. **Audit logging:** Add send attempt logging in initial implementation.
4. **Rate limiting:** Add simple throttle to mailer-test endpoint.

## Sign-off

- [x] Plan reviewed by Ahmad Faruk (Signal18 ID)
- [x] Implementation approved
- [x] Ready to proceed

---

**End of Plan**
