---
epic: 1
story: 1.2
title: JWT Token Management & Refresh
status: done
created: 2026-03-15
---

# Story 1.2: JWT Token Management & Refresh

## Story

As an **authenticated user**,
I want my **session to persist securely with token refresh**,
So that **I don't have to log in repeatedly**.

## Acceptance Criteria

1. **Given** a valid JWT token  
   **When** user makes an API request with the token  
   **Then** the request is authenticated successfully

2. **Given** an expired JWT token  
   **When** user makes an API request  
   **Then** a 401 Unauthorized response is returned

3. **Given** a valid refresh token  
   **When** user requests a new access token  
   **Then** a new JWT access token is issued  
   **And** the refresh token rotation occurs

4. **Given** an invalid or revoked refresh token  
   **When** user requests a new access token  
   **Then** authentication fails and login is required

## Tasks / Subtasks

- [x] Task 1: Verify JWT token validation on API requests (AC: #1, #2)
  - [x] Subtask 1.1: Verify auth middleware validates JWT tokens
  - [x] Subtask 1.2: Verify expired tokens return 401
- [x] Task 2: Verify refresh token endpoint (AC: #3, #4)
  - [x] Subtask 2.1: Verify /auth/refresh endpoint issues new JWT
  - [x] Subtask 2.2: Verify token rotation on refresh
  - [x] Subtask 2.3: Verify invalid/revoked refresh tokens fail appropriately

## Dev Notes

### Architecture Patterns

- **Auth Method**: JWT (jose library) - implemented
- **Refresh Token**: HTTP-only cookie with rotation - implemented
- **Token Storage**: `auth_refresh_tokens` table - exists

### Source Tree Components

- **Auth Middleware**: `apps/api/src/lib/auth.ts` - JWT validation
- **Refresh Token Logic**: `apps/api/src/lib/refresh-tokens.ts` - token rotation
- **Refresh Endpoint**: `apps/api/app/api/auth/refresh/route.ts` - POST /auth/refresh
- **Logout Endpoint**: `apps/api/app/api/auth/logout/route.ts` - revokes refresh tokens

### Testing Standards

- Test valid JWT returns 200
- Test expired JWT returns 401
- Test valid refresh token returns new JWT
- Test invalid refresh token returns 401

### Project Structure Notes

- This is a brownfield project - JWT/refresh already implemented
- Verify existing implementation meets all ACs
- Check token expiry configuration

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication-Security]
- [Source: AGENTS.md#Repo-wide-operating-principles]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- ✅ Verified JWT token validation: `apps/api/src/lib/auth-guard.ts:114` uses `jwtVerify` for token validation
- ✅ Verified expired tokens return 401: `apps/api/src/lib/auth-guard.ts:141` catches errors and returns 401
- ✅ Verified /auth/refresh endpoint: `apps/api/app/api/auth/refresh/route.ts` issues new JWT access tokens
- ✅ Verified token rotation: `apps/api/src/lib/refresh-tokens.ts:198-287` handles rotation with proper tracking
- ✅ Verified invalid/revoked refresh tokens fail: rotation returns `{success: false, reason: ...}` and endpoint returns 401

### File List

- (No new files - brownfield verification only)
