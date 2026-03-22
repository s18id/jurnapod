# Story 15.1.2: Logout Route Migration

Status: done

## Story

As an authenticated user or POS device,
I want to logout via the /auth/logout endpoint,
so that I can invalidate my session and clear authentication tokens.

## User Story

As a user or system that has an active session with Jurnapod API,
I want to securely logout and clear my authentication tokens,
so that I can ensure my session is properly terminated and no longer accessible.

## Acceptance Criteria

1. **AC-1:** Hono handler revokes token if present (best effort, non-blocking) ✅
2. **AC-2:** Always clears refresh token cookie regardless of token presence ✅
3. **AC-3:** Returns success even if no token present (idempotent behavior) ✅
4. **AC-4:** All unit tests pass ✅
5. **AC-5:** Database pool cleanup hook present (closeDbPool in test.after) ✅

## Tasks / Subtasks

- [x] Task 1: Analyze legacy logout implementation (AC: 1, 2, 3)
  - [x] Subtask 1.1: Read legacy `apps/api/app/api/auth/logout/route.ts` (24 lines)
  - [x] Subtask 1.2: Identify token revocation mechanism
  - [x] Subtask 1.3: Identify cookie clearing pattern
- [x] Task 2: Implement token revocation (AC: 1)
  - [x] Subtask 2.1: Extract token from request
  - [x] Subtask 2.2: Add to revocation list (best effort)
- [x] Task 3: Clear refresh token cookie (AC: 2)
  - [x] Subtask 3.1: Set cookie with expired/max-age=0
  - [x] Subtask 3.2: Ensure Set-Cookie header is returned
- [x] Task 4: Write 5+ unit tests for edge cases (AC: 4, 5)
  - [x] Subtask 4.1: Test with valid token
  - [x] Subtask 4.2: Test with no token (idempotent)
  - [x] Subtask 4.3: Test with invalid/expired token
  - [x] Subtask 4.4: Ensure closeDbPool cleanup hook

## Dev Notes

### Technical Context

**Legacy Implementation:**
- File: `apps/api/app/api/auth/logout/route.ts` (24 lines)
- Framework: Next.js App Router
- Behavior: Clears refresh token cookie, best-effort token revocation
- Returns: Simple success response

**Target Implementation:**
- File: `apps/api/src/routes/auth.ts` (POST /auth/logout)
- Framework: Hono
- Pattern: Standard Hono route with cookie handling

### Project Structure Notes

- Use `@/lib/db` for database access
- Use `@/lib/auth-guard` patterns for token handling
- Route file: `apps/api/src/routes/auth.ts`
- Test file: `apps/api/src/routes/auth.test.ts`

### Key Implementation Details

```typescript
// Cookie clearing pattern
c.header('Set-Cookie', createRefreshTokenClearCookie());
```

### Testing Standards

- Use Node.js `test` module
- Test idempotent behavior (calling logout multiple times should not error)
- Test with various token states (valid, invalid, missing)
- Ensure closeDbPool cleanup hook

## File List

- `apps/api/src/routes/auth.ts` - Add logout handler
- `apps/api/src/routes/auth.test.ts` - Add logout tests (5 new tests)

## Review Follow-ups (AI)

### Code Review Fixes Applied

- **MEDIUM-2**: Standardized cookie header reading to use `c.req.header()` and shared `readRefreshTokenFromCookie()` helper function

### Change Log

- 2026-03-22: Implemented logout handler in Hono with token revocation and cookie clearing. 5 new tests added (21 total tests passing).
- 2026-03-22: Review fixes applied - cookie reading now uses consistent `c.req.header()` pattern.
