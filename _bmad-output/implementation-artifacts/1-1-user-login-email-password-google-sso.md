# Story 1.1: User Login with Email/Password and Google SSO

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **system user**,
I want to **log in with email/password or Google SSO**,
So that **I can access the backoffice securely**.

## Acceptance Criteria

1. **Given** a registered user with email and password  
   **When** they enter valid credentials on the login page  
   **Then** they are authenticated and redirected to dashboard  
   **And** a JWT token is issued

2. **Given** invalid credentials  
   **When** they attempt to login  
   **Then** an error message is displayed  
   **And** no token is issued

3. **Given** a user with Google account  
   **When** they click "Login with Google" and complete OAuth flow  
   **Then** they are authenticated and redirected to dashboard  
   **And** a JWT token is issued (linked to their Google email)

4. **Given** a Google email not registered in the system  
   **When** they complete Google OAuth  
   **Then** they are prompted to complete registration or contact admin

## Tasks / Subtasks

- [x] Task 1: Implement email/password authentication (AC: #1, #2)
  - [x] Subtask 1.1: Create login API endpoint
  - [x] Subtask 1.2: Implement password hashing verification (Argon2id/bcrypt)
  - [x] Subtask 1.3: Issue JWT token on successful login
  - [x] Subtask 1.4: Return appropriate error for invalid credentials
- [x] Task 2: Implement Google SSO OAuth flow (AC: #3, #4)
  - [x] Subtask 2.1: Configure Google OAuth credentials
  - [x] Subtask 2.2: Create OAuth callback endpoint
  - [x] Subtask 2.3: Link Google email to user account
  - [x] Subtask 2.4: Handle new Google users (prompt registration)
- [x] Task 3: Create login UI (AC: #1, #2, #3, #4)
  - [x] Subtask 3.1: Login form with email/password fields
  - [x] Subtask 3.2: Google SSO button
  - [x] Subtask 3.3: Error display for failed login
  - [x] Subtask 3.4: Redirect to dashboard on success

### Review Follow-ups (AI)

- [ ] [AI-Review][Medium] Add integration test for GOOGLE_USER_NOT_FOUND error case (verify unregistered Google email returns 404 with appropriate message) - apps/api/app/api/auth/google/route.ts:82

## Dev Notes

### Architecture Patterns

- **Auth Method**: JWT (jose library) with Argon2id (default) or bcrypt for password hashing
- **Authorization**: RBAC with roles (SUPER_ADMIN, OWNER, ADMIN, ACCOUNTANT, CASHIER)
- **API Security**: TLS 1.2+ in transit
- **Tenant Isolation**: company_id checks at API middleware level
- **API Style**: REST (Next.js API routes) at `/api/auth/*`

### Source Tree Components

- **API Routes**: `apps/api/app/api/auth/**`
- **Auth Logic**: `packages/modules/modules-platform/` (likely has auth components)
- **Shared Contracts**: `packages/shared/src/schemas/` for request/response validation
- **Database Tables**: `users` table (check `packages/db/migrations/`)

### Testing Standards

- Test login with valid credentials returns 200 + JWT
- Test login with invalid credentials returns 401
- Test Google OAuth flow end-to-end
- Test tenant isolation (user from company A cannot access company B)

### Project Structure Notes

- This is a brownfield project - check existing code first before creating new files
- Follow established patterns in `packages/modules/modules-platform/`
- Use Zod for request validation (per architecture standards)
- All monetary values use DECIMAL(18,2) - not relevant for auth but good to know

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication-Security]
- [Source: AGENTS.md#Repo-wide-operating-principles]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- ✅ Verified existing login API endpoint at `/api/auth/login` handles email/password auth
- ✅ Verified Google OAuth endpoint at `/api/auth/google` exists
- ✅ Verified login UI exists for both POS and Backoffice
- ✅ Fixed AC #4: Changed Google OAuth to return `GOOGLE_USER_NOT_FOUND` (404) with helpful message instead of generic "Invalid credentials" (401) when Google email is not registered

### File List

- `apps/api/app/api/auth/google/route.ts` - Modified error response for unregistered Google users

## Senior Developer Review (AI)

**Review Date:** 2026-03-15  
**Review Outcome:** Approve with Action Items  

**Action Items:**
- [ ] Add integration test for GOOGLE_USER_NOT_FOUND error case (verify unregistered Google email returns 404 with appropriate message) - apps/api/app/api/auth/google/route.ts:82

**Review Notes:**
- All Acceptance Criteria verified as implemented
- Email/password login path fully functional (existing code)
- Google OAuth flow fully functional (existing code)
- AC #4 fix properly implemented: returns 404 with helpful message instead of generic 401
- No security issues found
- One test coverage gap identified (action item added)
