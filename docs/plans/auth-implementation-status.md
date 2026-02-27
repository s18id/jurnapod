# Authentication & User Management Implementation Status

**Date:** 2026-02-28  
**Status:** In Progress  
**Project:** Jurnapod ERP

---

## Overview

Complete authentication and account management system implementation for Jurnapod, including:
1. Google SSO login for Backoffice and POS
2. Cross-origin refresh token support
3. Progressive login throttling
4. User management UI in Backoffice
5. Database-backed static pages system (for privacy policy required by Google OAuth)

---

## Design Decisions

### Recommended Defaults Applied
- **Google SSO:** Existing users only (no auto-registration), requires companyCode
- **Refresh cookies:** Cross-origin enabled via `AUTH_REFRESH_COOKIE_CROSS_SITE=true`, uses `SameSite=None; Secure`
- **Login throttling:** Starts on 3rd invalid attempt, base 10s delay, max 300s delay
- **User management:** RBAC-protected (OWNER/ADMIN only), placed in new "Platform" navigation section
- **Static pages:** Global (not per-company), Markdown-based, render on read with HTML sanitization, public `/privacy` route

### Production Configuration
**Domains:**
- Backoffice: `https://jurnapod.signal18.id`
- POS: `https://pos.jurnapod.signal18.id`
- API: `https://api.jurnapod.signal18.id`

**Company Details (Privacy Policy):**
- Company: PT Signal Delapan Belas
- Address: Ruko Golden Madrid Blok D No 26 Room 1260, Jl. Letnan Sutopo BSD City, Kota Tangerang Selatan, Banten
- Contact: privacy@signal18.id

---

## Key Discoveries

1. **Google SSO UI already implemented** - Both Backoffice and POS already have Google sign-in buttons and callback handlers. If not visible, it's a config/hosting issue, not missing code.

2. **`.htaccess` already correct** - SPA rewrite rules exist in both apps and will work if Apache honors them.

3. **Refresh token flow exists but unused by frontends** - Server-side refresh token rotation is implemented but clients don't call `/api/auth/refresh`, so sessions expire without renewal.

4. **`VITE_API_BASE_URL` config conflict** - `.env.example` suggests including `/api` suffix, but backoffice `api-client.ts` appends `/api` internally, causing `/api/api` double-path errors.

5. **User management API complete, UI missing** - All backend endpoints for user CRUD/roles/outlets/password exist but there's no Backoffice UI page yet.

---

## Implementation Status

### ✅ Completed

#### 1. Authentication Infrastructure
- [x] DB migration: `auth_refresh_tokens` table
- [x] DB migration: `auth_oauth_accounts` table
- [x] DB migration: `auth_login_throttles` table
- [x] Refresh token issue/rotate/revoke logic
- [x] Cookie helpers for cross-origin refresh tokens
- [x] Progressive login throttling service
- [x] Environment config for auth flags

#### 2. Google SSO Implementation
- [x] API endpoint: `POST /api/auth/google` (code exchange + user lookup)
- [x] Google OAuth helpers (JWKS verification, account linking)
- [x] Backoffice: Google button in login page
- [x] Backoffice: `/auth/callback` handler in router
- [x] POS: Auth gate in `main.tsx`
- [x] POS: Google button + callback handler

#### 3. Auth API Endpoints
- [x] `POST /api/auth/login` (with refresh cookie)
- [x] `POST /api/auth/refresh` (token rotation)
- [x] `POST /api/auth/logout` (revoke + clear cookie)
- [x] `POST /api/auth/google` (SSO)

#### 4. User Management API
- [x] `GET /api/users` - List users with filters
- [x] `POST /api/users` - Create user
- [x] `GET /api/users/:id` - Get user details
- [x] `PATCH /api/users/:id` - Update user
- [x] `POST /api/users/:id/roles` - Assign roles
- [x] `POST /api/users/:id/outlets` - Assign outlets
- [x] `POST /api/users/:id/password` - Change password
- [x] `POST /api/users/:id/deactivate` - Deactivate user
- [x] `POST /api/users/:id/reactivate` - Reactivate user
- [x] `GET /api/roles` - List roles
- [x] `GET /api/outlets` - List outlets
- [x] Audit logging for all user operations
- [x] Integration tests

#### 5. Documentation
- [x] `docs/auth/google-sso.md` - Complete SSO setup guide
- [x] `docs/production-cors.md` - Updated with cross-origin refresh cookies
- [x] `docs/plans/static-pages-db-plan.md` - DB-backed static pages plan
- [x] `.env.example` - Updated with all auth/OAuth env vars
- [x] Privacy policy HTML page: `apps/backoffice/public/privacy.html`
- [x] Auth secret generation scripts

#### 6. User Management UI (Partial → Complete)
- [x] Route `/users` added to `apps/backoffice/src/app/routes.ts` (OWNER/ADMIN only)
- [x] Navigation entry added in new "Platform" section
- [x] Full implementation in `apps/backoffice/src/features/users-page.tsx`
- [x] Router mapping added
- [x] API hooks in `apps/backoffice/src/hooks/use-users.ts`

---

#### 7. User Management UI
- [x] API hook `apps/backoffice/src/hooks/use-users.ts` created
- [x] Full CRUD implementation in `apps/backoffice/src/features/users-page.tsx` with:
  - User list table (columns: email, roles, outlets, status)
  - Filters (status, role, search by email)
  - Create user dialog (email, password, roles, outlets, active status)
  - Edit user dialog (email update)
  - Manage roles dialog (assign/remove roles)
  - Manage outlets dialog (assign/remove outlets)
  - Change password dialog
  - Deactivate/reactivate actions
- [x] RBAC gating for OWNER/ADMIN only (via route configuration)
- [x] Build verification (TypeScript compilation successful)
- [x] Documentation updated

---

### 🔄 In Progress

None (User Management UI completed)

---

### ⏳ Not Started

#### 1. Static Pages System
**Priority:** High (required for Google OAuth privacy policy)

**Tasks:**
- [ ] DB migration for `static_pages` table
- [ ] API service layer: `apps/api/src/lib/static-pages.ts`
- [ ] API endpoints:
  - [ ] `GET /api/pages/:slug` (public, renders Markdown to HTML)
  - [ ] `GET /api/admin/pages` (list, OWNER/ADMIN only)
  - [ ] `POST /api/admin/pages` (create, OWNER/ADMIN only)
  - [ ] `GET /api/admin/pages/:id` (get raw, OWNER/ADMIN only)
  - [ ] `PATCH /api/admin/pages/:id` (update, OWNER/ADMIN only)
  - [ ] `DELETE /api/admin/pages/:id` (soft delete, OWNER/ADMIN only)
- [ ] Markdown rendering + HTML sanitization (use `marked` + `DOMPurify` or `sanitize-html`)
- [ ] Backoffice admin UI:
  - [ ] Route `/admin/static-pages` (OWNER/ADMIN only)
  - [ ] Page list table
  - [ ] Create/edit page dialog with Markdown editor
  - [ ] Live preview
- [ ] Public `/privacy` route in Backoffice (fetch from `GET /api/pages/privacy`)
- [ ] Seed privacy page with PT Signal Delapan Belas content
- [ ] Update Google OAuth consent screen with privacy policy URL

**Reference:** See `docs/plans/static-pages-db-plan.md` for detailed implementation plan.

---

#### 2. Frontend Refresh Token Usage
**Priority:** Medium (improves UX, prevents frequent re-login)

**Tasks:**
- [ ] Backoffice: Add automatic refresh flow
  - [ ] Detect token expiry (decode JWT `exp`)
  - [ ] Call `/api/auth/refresh` with `credentials: "include"` before expiry
  - [ ] Update stored access token on success
  - [ ] Handle refresh failure (redirect to login)
- [ ] POS: Add automatic refresh flow
  - [ ] Same logic as Backoffice
  - [ ] Ensure works offline (graceful degradation)
- [ ] Consider using interceptor pattern in `api-client.ts`
- [ ] Test session continuity across browser restart
- [ ] Document refresh flow in `docs/auth/`

---

#### 3. Production Deployment Checklist
**Priority:** High (before going live)

**Tasks:**
- [ ] Environment variables:
  - [ ] Set `AUTH_REFRESH_COOKIE_CROSS_SITE=true` on API server
  - [ ] Set `NODE_ENV=production`
  - [ ] Configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
  - [ ] Generate production `AUTH_REFRESH_SECRET` (use script)
- [ ] DNS/SSL:
  - [ ] Verify all domains point to correct servers
  - [ ] Ensure SSL certificates valid for all domains
- [ ] Apache/hosting:
  - [ ] Verify `.htaccess` rules active (test 404 on `/users`)
  - [ ] Check CORS headers on API server
- [ ] Google OAuth:
  - [ ] Add authorized redirect URIs to Google Console
  - [ ] Update privacy policy URL in consent screen
- [ ] Database:
  - [ ] Run all migrations on production DB
  - [ ] Verify indexes created
- [ ] Testing:
  - [ ] Test Google SSO flow end-to-end
  - [ ] Test refresh token rotation
  - [ ] Test login throttling
  - [ ] Test user management UI

---

## File Map

### Backend (API)
| File | Purpose |
|------|---------|
| `apps/api/src/lib/auth.ts` | Core auth (JWT, login, user lookup) |
| `apps/api/src/lib/auth-guard.ts` | RBAC middleware |
| `apps/api/src/lib/auth-throttle.ts` | Login throttling logic |
| `apps/api/src/lib/refresh-tokens.ts` | Refresh token cookie helpers |
| `apps/api/src/lib/google-oauth.ts` | Google SSO code exchange + verification |
| `apps/api/src/lib/users.ts` | User management service layer |
| `apps/api/src/lib/env.ts` | Environment config (includes auth flags) |
| `apps/api/src/lib/request-meta.ts` | IP/user-agent helpers |
| `apps/api/app/api/auth/login/route.ts` | Login endpoint |
| `apps/api/app/api/auth/refresh/route.ts` | Refresh endpoint |
| `apps/api/app/api/auth/logout/route.ts` | Logout endpoint |
| `apps/api/app/api/auth/google/route.ts` | Google SSO endpoint |
| `apps/api/app/api/users/` | User management endpoints (7 route files) |
| `apps/api/app/api/roles/route.ts` | Roles list endpoint |
| `apps/api/app/api/outlets/route.ts` | Outlets list endpoint |
| `apps/api/middleware.ts` | CORS middleware |
| `apps/api/tests/integration/users.integration.test.mjs` | User management tests |

### Frontend (Backoffice)
| File | Purpose |
|------|---------|
| `apps/backoffice/src/app/routes.ts` | Route definitions (includes `/users`) |
| `apps/backoffice/src/app/router.tsx` | Router + Google SSO callback handler |
| `apps/backoffice/src/app/layout.tsx` | Navigation with Platform section |
| `apps/backoffice/src/features/auth/login-page.tsx` | Login UI with Google button |
| `apps/backoffice/src/features/pages.tsx` | Page component exports (includes UsersPage) |
| `apps/backoffice/src/features/users-page.tsx` | User management UI (full CRUD) |
| `apps/backoffice/src/hooks/use-users.ts` | User management API hooks |
| `apps/backoffice/src/lib/session.ts` | Auth session helpers (login, loginWithGoogle) |
| `apps/backoffice/src/lib/api-client.ts` | API request helper |
| `apps/backoffice/public/privacy.html` | Static privacy policy page |
| `apps/backoffice/.htaccess` | SPA rewrite rules |

### Frontend (POS)
| File | Purpose |
|------|---------|
| `apps/pos/src/main.tsx` | Auth gate + Google SSO callback handler |
| `apps/pos/.htaccess` | SPA rewrite rules |

### Database
| File | Purpose |
|------|---------|
| `packages/db/migrations/0029_auth_refresh_tokens.sql` | Refresh tokens table |
| `packages/db/migrations/0030_auth_oauth_accounts.sql` | OAuth links table |
| `packages/db/migrations/0031_auth_login_throttles.sql` | Login throttling table |

### Shared
| File | Purpose |
|------|---------|
| `packages/shared/src/schemas/users.ts` | User/role/outlet Zod schemas |

### Documentation
| File | Purpose |
|------|---------|
| `docs/auth/google-sso.md` | Google SSO setup guide |
| `docs/production-cors.md` | CORS + cross-origin cookies |
| `docs/plans/static-pages-db-plan.md` | Static pages implementation plan |
| `docs/plans/auth-implementation-status.md` | This document |
| `docs/README.md` | Documentation index |
| `.env.example` | Complete env var examples |

### Scripts
| File | Purpose |
|------|---------|
| `scripts/auth-refresh-secret-generate.mjs` | Generate refresh secret |
| `scripts/auth-refresh-secret-regenerate.mjs` | Rotate refresh secret |

---

## Next Actions (Priority Order)

1. **Implement Static Pages System** (high priority)
   - Required for Google OAuth privacy policy
   - See `docs/plans/static-pages-db-plan.md` for detailed plan

2. **Add Frontend Refresh Token Usage** (medium priority)
   - Improves UX, prevents frequent re-login
   - Implement in both Backoffice and POS

3. **Production Deployment** (before launch)
   - Follow checklist above
   - Test all flows in production environment

---

## Related Documents

- [Google SSO Setup Guide](../auth/google-sso.md)
- [Production CORS Configuration](../production-cors.md)
- [Static Pages Implementation Plan](./static-pages-db-plan.md)
- [AGENTS.md](../../AGENTS.md) - Project guidelines

---

**Last Updated:** 2026-02-28
