# Email Processes Implementation Plan

## Overview

Implementation of a complete email-based authentication system for Jurnapod ERP:

- Password Reset Flow
- User Invitation Flow
- Email Verification Flow

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Jurnapod System                          │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (Backoffice)                                          │
│  ├── reset-password-page.tsx                                    │
│  ├── invite-page.tsx                                            │
│  └── verify-email-page.tsx                                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│  API Server (Next.js)                                           │
│  ├── POST /api/auth/password-reset/request                     │
│  ├── POST /api/auth/password-reset/confirm                     │
│  ├── POST /api/users/[userId]/invite                            │
│  ├── POST /api/auth/invite/accept                               │
│  ├── POST /api/auth/email/verify                                │
│  └── POST /api/auth/email/verify/confirm                        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│  Service Layer (src/lib/)                                       │
│  ├── email-tokens.ts     - Token CRUD + SHA-256 hashing        │
│  ├── email-outbox.ts     - Queue with exponential backoff      │
│  ├── email-templates.ts  - Bilingual (ID/EN) HTML/text          │
│  └── mailer.ts           - SMTP with DB-override config        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│  Database (MySQL 8.0.44)                                        │
│  ├── email_tokens        - Token storage with expiry            │
│  └── email_outbox       - Queued emails with retry status       │
└─────────────────────────────────────────────────────────────────┘
```

## Completed

### Database Schema (Migration 0046)

| Table | Purpose |
|-------|---------|
| `email_tokens` | Store verification tokens with SHA-256 hash |
| `email_outbox` | Queue emails with retry logic |

### API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/auth/password-reset/request` | Public | Request password reset |
| `POST /api/auth/password-reset/confirm` | Public | Confirm new password |
| `POST /api/users/[userId]/invite` | ADMIN+ | Invite user to outlet |
| `POST /api/auth/invite/accept` | Public | Accept invitation |
| `POST /api/auth/email/verify` | Auth | Request email verification |
| `POST /api/auth/email/verify/confirm` | Public | Confirm email verification |

### Frontend Pages

- `reset-password-page.tsx` - Public page with token param
- `invite-page.tsx` - Public page with token param
- `verify-email-page.tsx` - Public page with token param

### Service Files

- `email-tokens.ts` - Token CRUD with crypto.randomBytes(32) + SHA-256
- `email-outbox.ts` - Queue with 5 retries, exponential backoff
- `email-templates.ts` - Bilingual (Indonesian/English) templates

## Token Configuration

| Token Type | TTL | Length |
|------------|-----|--------|
| Password Reset | 60 minutes | 32 bytes |
| User Invite | 7 days | 32 bytes |
| Email Verify | 24 hours | 32 bytes |

## Email Retry Policy

- Max attempts: 5
- Base delay: 60 seconds
- Backoff: exponential (60s × 2^attempt)
- Statuses: `PENDING` → `SENT` → `FAILED`

## Known Issues (Critical)

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Email outbox worker not implemented | Critical | ✅ Resolved |
| 2 | No transaction boundaries in confirm routes | Critical | ✅ Resolved |
| 3 | No rate limiting on password reset | Critical | ✅ Resolved |
| 4 | Base URL derived from email (insecure) | Critical | ✅ Resolved |
| 5 | Error response inconsistency | High | ✅ Resolved |
| 6 | Missing `email_verified_at` column | High | ✅ Resolved |
| 7 | Incomplete audit logging | Medium | ✅ Resolved |
| 8 | Token reuse race condition | Medium | ✅ Resolved |
| 9 | TypeScript module resolution errors | Low | ✅ Resolved |

## Implementation Summary (Completed)

### Phase 1: Critical Fixes ✅

1. **Email outbox worker** - Implemented cron-based worker
   - Created `/api/cron/email-outbox` endpoint with secret guard
   - Protected by `CRON_EMAIL_OUTBOX_SECRET` header
   - Documented cron setup in README

2. **Transaction boundaries** - Added atomic operations
   - Wrapped confirm routes in `BEGIN/COMMIT` transactions
   - Implemented `validateAndConsumeToken()` for atomic token consumption
   - Rollback on errors ensures consistency

3. **Rate limiting** - Implemented password reset throttling
   - Created `auth_password_reset_throttles` table
   - Limits: 5 requests/hour per email+IP, 10 requests/hour per IP
   - Returns 429 with `Retry-After` header when exceeded

4. **Base URL security** - Fixed insecure URL derivation
   - Added required `APP_PUBLIC_URL` env variable
   - All email links now use secure configured URL
   - No longer derives URL from email domain

### Phase 2: Data & Logging ✅

5. **email_verified_at column** - Added migration 0048
   - Created `email_verified_at` timestamp column on users table
   - Updated verify confirm route to set verification timestamp
   - Added index for querying verified users

6. **Audit logging** - Completed for all flows
   - Password reset confirm: logs `password_reset_confirmed`
   - Invite accept: logs `invite_accepted`
   - Email verify confirm: logs `email_verified`
   - All include company_id, user_id, IP, and action details

### Phase 3: Polish ✅

7. **Error response standardization** - Unified format
   - All endpoints use `errorResponse()` helper
   - Consistent `{ success: false, error: { code, message } }` format
   - Removed duplicate error constant definitions

8. **Token reuse race condition** - Fixed
   - Atomic token validation and consumption within transaction
   - Prevents double-use even with concurrent requests
   - Proper unique constraints on token_hash

9. **TypeScript errors** - All resolved
   - Typecheck passes without errors
   - No module resolution issues

## Files Created/Modified

### Created (Initial Implementation)
- `packages/db/migrations/0046_email_tokens_and_outbox.sql`
- `apps/api/src/lib/email-tokens.ts`
- `apps/api/src/lib/email-outbox.ts`
- `apps/api/src/lib/email-templates.ts`
- `apps/api/app/api/auth/password-reset/route.ts`
- `apps/api/app/api/auth/password-reset/confirm/route.ts`
- `apps/api/app/api/auth/invite/accept/route.ts`
- `apps/api/app/api/auth/email/verify/route.ts`
- `apps/api/app/api/auth/email/verify/confirm/route.ts`
- `apps/api/app/api/users/[userId]/invite/route.ts`
- `apps/backoffice/src/features/reset-password-page.tsx`
- `apps/backoffice/src/features/invite-page.tsx`
- `apps/backoffice/src/features/verify-email-page.tsx`

### Created (Critical Fixes)
- `apps/api/app/api/cron/email-outbox/route.ts` - Cron endpoint for email worker
- `apps/api/src/lib/password-reset-throttle.ts` - Rate limiting service
- `packages/db/migrations/0047_password_reset_throttles.sql` - Rate limit table
- `packages/db/migrations/0048_users_email_verified_at.sql` - Email verification tracking

### Modified
- `apps/api/src/lib/env.ts` - Added APP_PUBLIC_URL and CRON_EMAIL_OUTBOX_SECRET
- `apps/api/src/lib/email-tokens.ts` - Added validateAndConsumeToken() for atomic operations
- `.env.example` - Added new environment variables
- All email auth routes - Transaction boundaries, audit logging, standardized errors

## Environment Variables

```bash
# Email Token TTLs (in minutes)
EMAIL_TOKEN_TTL_RESET_MIN=60              # 60 minutes
EMAIL_TOKEN_TTL_INVITE_MIN=10080          # 7 days
EMAIL_TOKEN_TTL_VERIFY_MIN=1440           # 24 hours

# Email Outbox Retry
EMAIL_OUTBOX_RETRY_MAX=5                  # max retry attempts
EMAIL_OUTBOX_RETRY_BACKOFF=60             # base delay in seconds

# App Configuration
APP_PUBLIC_URL=http://localhost:3000      # REQUIRED: Public URL for email links

# Cron Configuration
CRON_EMAIL_OUTBOX_SECRET=your-secret-here # REQUIRED: Secret for cron endpoints
```

## Cron Setup

Add to system crontab to process pending emails every minute:

```bash
# Edit crontab
crontab -e

# Add this line (adjust port and secret):
* * * * * curl -sS -X POST http://127.0.0.1:3001/api/cron/email-outbox \
  -H "x-cron-secret: YOUR_SECRET_HERE" >> /var/log/jurnapod-cron.log 2>&1
```

For production, consider:
- Running every 1-5 minutes based on email volume
- Monitoring `/var/log/jurnapod-cron.log` for failures
- Using a monitoring service to alert on failures

## Testing Notes

- Migrations 0046-0049 applied successfully
- API server compiles and runs with zero TypeScript errors
- Backoffice TypeScript errors fixed

## Audit Findings & Resolutions (Completed)

All critical and medium-priority audit findings have been resolved:

### High-Risk (Fixed)
1. **Token reuse race condition** - Fixed with atomic `UPDATE ... WHERE used_at IS NULL AND expires_at > NOW()` + affected rows check
   - Files: `apps/api/src/lib/email-tokens.ts`, all confirm routes
   - Concurrent requests now properly handled with one success, one failure

### Medium-Risk (Fixed)
2. **Email outbox double-send** - Fixed with SENDING status claim flow
   - Migration: `0049_email_outbox_sending_status.sql`
   - File: `apps/api/src/lib/email-outbox.ts`
   - Workers atomically claim rows before processing

3. **Password reset throttling atomicity** - Fixed with atomic upsert using IF conditions
   - File: `apps/api/src/lib/password-reset-throttle.ts`
   - Window reset and increment now happen in single query

4. **Audit logging blocking** - Fixed with try/catch wrappers
   - File: `apps/api/app/api/users/[userId]/invite/route.ts`
   - Audit failures logged but don't fail business operations

### Low-Risk (Fixed)
5. **Cron endpoint hardening** - Now uses `getAppEnv()` for consistent validation
   - File: `apps/api/app/api/cron/email-outbox/route.ts`

6. **APP_PUBLIC_URL normalization** - Created centralized helper with URL encoding
   - New file: `apps/api/src/lib/email-link-builder.ts`
   - All email routes updated to use `buildEmailLink()`

7. **Error response consistency** - All routes now use `errorResponse()` helper
   - File: `apps/api/app/api/users/[userId]/invite/route.ts`

8. **TypeScript cleanup** - All types properly declared, no implicit any
   - Files: All confirm routes, `email-tokens.ts`
   - `connection: PoolConnection | undefined`
   - Proper type parameters on execute calls
