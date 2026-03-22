# Story 15.1.3: Refresh Route Migration

Status: done

## Story

As an authenticated user or POS device with an expired access token,
I want to refresh my tokens via the /auth/refresh endpoint,
so that I can obtain a new access token without re-authenticating.

## User Story

As a user or system with an active refresh token,
I want to exchange it for new access and refresh tokens,
so that I can continue using the API without interruption.

## Acceptance Criteria

1. **AC-1:** Hono handler rotates tokens correctly (valid refresh token → new tokens) ✅
2. **AC-2:** Returns new access_token and rotated refresh token in response ✅
3. **AC-3:** Invalid tokens return 401 status with cookie cleared ✅
4. **AC-4:** All error cases clear the refresh token cookie ✅
5. **AC-5:** All unit tests pass ✅
6. **AC-6:** Database pool cleanup hook present (closeDbPool in test.after) ✅

## Tasks / Subtasks

- [x] Task 1: Analyze legacy refresh implementation (AC: 1, 2, 3, 4)
  - [x] Subtask 1.1: Read legacy `apps/api/app/api/auth/refresh/route.ts` (83 lines)
  - [x] Subtask 1.2: Identify token rotation logic
  - [x] Subtask 1.3: Identify error handling and cookie clearing
- [x] Task 2: Implement token rotation logic (AC: 1, 2)
  - [x] Subtask 2.1: Extract refresh token from cookie
  - [x] Subtask 2.2: Validate refresh token
  - [x] Subtask 2.3: Generate new access token
  - [x] Subtask 2.4: Generate new refresh token (rotation)
  - [x] Subtask 2.5: Set new refresh token cookie
- [x] Task 3: Handle invalid/expired tokens (AC: 3, 4)
  - [x] Subtask 3.1: Return 401 for invalid token
  - [x] Subtask 3.2: Clear refresh token cookie on errors
- [x] Task 4: Write 8+ unit tests for all scenarios (AC: 5, 6)
  - [x] Subtask 4.1: Test successful token rotation
  - [x] Subtask 4.2: Test expired refresh token
  - [x] Subtask 4.3: Test invalid refresh token
  - [x] Subtask 4.4: Test missing refresh token
  - [x] Subtask 4.5: Ensure closeDbPool cleanup hook

## Dev Notes

### Technical Context

**Legacy Implementation:**
- File: `apps/api/app/api/auth/refresh/route.ts` (83 lines)
- Framework: Next.js App Router
- Behavior: Validates refresh token, rotates both tokens, sets new cookie
- Error: Returns 401 and clears cookie on invalid token

**Target Implementation:**
- File: `apps/api/src/routes/auth.ts` (POST /auth/refresh)
- Framework: Hono
- Pattern: Standard Hono route with cookie validation and rotation

### Project Structure Notes

- Use `@/lib/db` for database access
- Use `@/lib/auth-guard` patterns for JWT handling
- Route file: `apps/api/src/routes/auth.ts`
- Test file: `apps/api/src/routes/auth.test.ts`

### Key Implementation Details

- Token rotation: Each refresh should generate a new refresh token (not reuse)
- Cookie settings: HttpOnly, Secure, SameSite, Path=/
- Error responses should clear the cookie to allow retry from login

### Testing Standards

- Use Node.js `test` module
- Mock JWT validation
- Test token rotation (refresh token changes each time)
- Test error cases (expired, invalid, missing)
- Ensure closeDbPool cleanup hook

## File List

- `apps/api/src/routes/auth.ts` - Add refresh handler
- `apps/api/src/routes/auth.test.ts` - Add refresh tests (8 new tests)

## Review Follow-ups (AI)

### Code Review Fixes Applied

- **MEDIUM-2**: Standardized header reading to use `c.req.header()` consistently (same pattern as login/logout)
- **LOW-2**: Removed `readClientIpFromRequest()` and `readUserAgentFromRequest()` - now uses shared `readClientIp()` and `readUserAgent()` from login route

### Change Log

- 2026-03-22: Implemented refresh handler in Hono with token rotation. 8 new tests added (29 total tests passing).
- 2026-03-22: Review fixes applied - header reading now uses consistent `c.req.header()` pattern, removed duplicate helper functions.
