# Epic 1: Foundation - Auth, Company & Outlet Management

**Status:** ✅ COMPLETE (Discovered - Already Existed)  
**Stories:** 7/7 Complete  
**Epic Type:** Core Infrastructure  
**Dependencies:** None (Foundation Layer)

---

## 📋 STORIES

### ✅ Story 1.1: User Login (Email/Password + Google SSO)
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Location:** `apps/api/src/lib/auth.ts` (804 lines)
- **Google OAuth:** `apps/api/src/lib/google-oauth.ts` (211 lines)
- **Login API:** `apps/api/app/api/auth/login/route.ts`
- **Google API:** `apps/api/app/api/auth/google/route.ts`

**Features:**
- Email/password authentication with bcrypt/argon2 hashing
- Multi-tenant company code-based login
- Google SSO with authorization code flow
- Login throttling/brute force protection
- Automatic password rehashing on login
- JWT access token generation with configurable expiration
- Comprehensive audit logging

**Key Files:**
```
apps/api/src/lib/auth.ts
apps/api/src/lib/google-oauth.ts
apps/api/app/api/auth/login/route.ts
apps/api/app/api/auth/google/route.ts
```

---

### ✅ Story 1.2: JWT Token Management & Refresh
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Refresh Tokens:** `apps/api/src/lib/refresh-tokens.ts` (301 lines)
- **Refresh API:** `apps/api/app/api/auth/refresh/route.ts`
- **Logout API:** `apps/api/app/api/auth/logout/route.ts`

**Features:**
- Refresh token rotation (one-time use tokens)
- Secure HttpOnly cookie-based refresh tokens
- Token revocation support (logout)
- Configurable token TTL (time-to-live)
- Cross-site cookie support for production
- IP address and user agent tracking
- Database-backed storage via `auth_refresh_tokens` table

**Key Files:**
```
apps/api/src/lib/refresh-tokens.ts
apps/api/app/api/auth/refresh/route.ts
apps/api/app/api/auth/logout/route.ts
```

---

### ✅ Story 1.3: RBAC Role Definitions & Permissions
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Roles & Permissions:** `apps/api/src/lib/auth.ts` (ROLE_CODES)
- **Auth Guards:** `apps/api/src/lib/auth-guard.ts` (371 lines)
- **Permissions API:** `apps/api/app/api/permissions/route.ts`
- **Roles API:** `apps/api/app/api/roles/route.ts`

**Features:**
- **6 Defined Roles:** SUPER_ADMIN, OWNER, COMPANY_ADMIN, ADMIN, CASHIER, ACCOUNTANT
- **13 Modules:** companies, users, roles, outlets, accounts, journals, cash_bank, sales, inventory, purchasing, reports, settings, pos
- **CRUD Permissions with Bitmasks:** create(1), read(2), update(4), delete(8)
- **Global vs Outlet-scoped:** Some roles global, others outlet-specific
- **Module-role assignments:** Permission masks in `module_roles` table
- **Auth Guards:** requireAccess(), requireRole(), requireModulePermission(), requireOutletAccess()

**Key Files:**
```
apps/api/src/lib/auth.ts
apps/api/src/lib/auth-guard.ts
apps/api/app/api/permissions/route.ts
apps/api/app/api/roles/route.ts
```

---

### ✅ Story 1.4: Admin User Management (CRUD)
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **User Service:** `apps/api/src/lib/users.ts` (1580 lines)
- **User API:** `apps/api/app/api/users/route.ts` (180 lines)
- **User Detail API:** `apps/api/app/api/users/[userId]/route.ts`
- **Role Assignment:** `apps/api/app/api/users/[userId]/roles/route.ts`
- **Outlet Assignment:** `apps/api/app/api/users/[userId]/outlets/route.ts`

**Features:**
- List users with filters (status, email search)
- Create user with email, password, name
- Assign global and outlet-specific roles
- Deactivate/reactivate users
- Password change capability
- Role hierarchy enforcement (lower-level admins can't modify higher-level)
- Super Admin protection (only self-modification)
- Email uniqueness validation
- Audit logging for all operations

**Key Files:**
```
apps/api/src/lib/users.ts
apps/api/app/api/users/route.ts
apps/api/app/api/users/[userId]/*
```

---

### ✅ Story 1.5: Company Settings Management (Enhanced)
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Company Service:** `apps/api/src/lib/companies.ts` (1056 lines)
- **Company API:** `apps/api/app/api/companies/route.ts` (104 lines)
- **Settings Config:** `apps/api/app/api/settings/config/route.ts` (263 lines)

**Features:**
- Company CRUD (create, read, update)
- Typed settings registry (12 setting keys)
- Environment variable fallbacks
- Module enablement configuration (9 modules)
- Fiscal year settings
- Tax rate configuration
- Inventory settings (costing, backorder, reorder points)
- Feature flags (auto-sync, tax inclusion)
- Audit logging for changes
- Outlet-scoped settings support

**Key Files:**
```
apps/api/src/lib/companies.ts
apps/api/app/api/companies/route.ts
apps/api/app/api/settings/config/route.ts
```

---

### ✅ Story 1.6: Outlet Management (CRUD)
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Outlet Service:** `apps/api/src/lib/outlets.ts` (483 lines)
- **Outlet API:** `apps/api/app/api/outlets/route.ts` (111 lines)
- **Outlet Detail:** `apps/api/app/api/outlets/[outletId]/route.ts`
- **Tables:** `apps/api/app/api/outlets/[outletId]/tables/route.ts`

**Features:**
- Outlet CRUD with code, name, address (line1, line2), city, postal code
- Phone and email fields
- Timezone support
- Outlet activation/deactivation
- Table management for DINE_IN service
- Company-scoped outlet listing
- Audit logging
- Code uniqueness enforcement per company

**Key Files:**
```
apps/api/src/lib/outlets.ts
apps/api/app/api/outlets/route.ts
apps/api/app/api/outlets/[outletId]/*
```

---

### ✅ Story 1.7: Outlet-Specific Settings (Enhanced)
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Settings Service:** `apps/api/src/lib/settings.ts`
- **Outlet Settings API:** `apps/api/app/api/outlets/[outletId]/settings/route.ts` (124 lines)
- **Settings Tests:** `apps/api/src/lib/settings.test.ts`

**Features:**
- Outlet-specific settings CRUD
- Setting key validation against registry
- Value type validation (string, number, boolean, json)
- Typed settings with defaults
- Audit logging
- Company + Outlet scoped settings
- Environment variable fallbacks

**Key Files:**
```
apps/api/src/lib/settings.ts
apps/api/app/api/outlets/[outletId]/settings/route.ts
apps/api/src/lib/settings.test.ts
```

---

## 📊 TECHNICAL SPECIFICATIONS

### Authentication
- **JWT Algorithm:** HS256
- **Password Hashing:** bcrypt/argon2 (auto-upgrade on login)
- **Refresh Tokens:** Database-backed with rotation
- **Cookie Security:** HttpOnly, Secure, SameSite

### Authorization
- **Role Model:** 6 predefined roles
- **Permission Model:** Bitmask (create=1, read=2, update=4, delete=8)
- **Scope Levels:** Global and Outlet-specific
- **Module Count:** 13 modules

### Database Tables
```
users
companies
outlets
user_outlets
module_roles
auth_refresh_tokens
company_settings
outlet_settings
```

---

## 🔗 DEPENDENCIES

**None** - This is the foundation layer that all other epics depend on.

**Used By:**
- Epic 2 (POS) - Auth, company scoping
- Epic 3 (Accounting) - Role permissions
- Epic 4 (Items) - Company/outlet scoping
- Epic 5 (Settings) - Settings system
- Epic 6 (Reporting) - User permissions
- Epic 7 (Sync) - Auth middleware

---

## ✅ DEFINITION OF DONE

- [x] All 7 stories implemented
- [x] Authentication working (email + Google)
- [x] JWT with refresh token rotation
- [x] RBAC with 6 roles and 13 modules
- [x] User CRUD with role assignments
- [x] Company and outlet management
- [x] Settings system with typed registry
- [x] Audit logging on all mutations
- [x] Tests passing

---

**Epic 1 Status: COMPLETE ✅**  
**All foundation infrastructure operational.**
