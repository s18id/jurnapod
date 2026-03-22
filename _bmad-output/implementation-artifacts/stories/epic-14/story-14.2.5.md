# Story 14.2.5: Migrate Remaining Routes to Hono app.route() Pattern

**Epic:** Epic 14: Hono Full Utilization  
**Phase:** 2 (Route migrations + URL standardization)  
**Status:** in-progress

---

## User Story

As a developer,
I want to migrate the remaining Express-style routes to Hono's `app.route()` pattern,
so that all API routes use consistent middleware ordering, typed context, and the established Hono native handler signature.

---

## Context

Epic 14 Phase 1 established the Hono `app.route()` pattern with the stock routes. Phase 2 continues migration of remaining route groups, following the same patterns established in Stories 14.1.2 and 14.1.4:

- Telemetry middleware applied at route group level
- Auth middleware using `authMiddleware` helper
- zValidator for request validation where applicable
- `c.get("auth")` for typed auth context access
- `c.req.valid()` for validated request data
- Error responses via `errorResponse()` helper

### Routes to Migrate

| Route Group | Path Pattern | Notes |
|-------------|--------------|-------|
| Journal | `/api/journals/*` | 2 files: route.ts, [batchId]/route.ts |
| Reports | `/api/reports/*` | 9 files across general-ledger, trial-balance, worksheet, receivables-ageing, pos-payments, daily-sales, journals, pos-transactions, profit-loss |
| Account | `/api/accounts/*` | 15+ files including types, [accountId], fixed-assets subtrees |
| Account Types | `/api/accounts/types` | Listed separately for clarity |
| Auth | `/api/auth/*` | 10 files; some routes may need special handling (no auth, or refresh token handling) |
| Company | `/api/companies/*` | 5 files: route.ts, [companyId]/route.ts, [companyId]/settings/*, [companyId]/reactivate |
| Role | `/api/roles/*` | 2 files: route.ts, [roleId]/route.ts |
| Dine-in | `/api/dinein/*` | 15+ files across sessions, tables, reservations subtrees |
| Health | `/api/health` | Simple endpoint, no auth required |

---

## Acceptance Criteria

### AC 1: All Remaining Routes Use `app.route()` Pattern

**Given** the route files listed above  
**When** they are refactored  
**Then** each route group uses `new Hono()` and `app.route()` registration pattern consistent with `stock.ts`

- [ ] Task 1.1: Create or update `journals.ts` route file with Hono pattern
- [ ] Task 1.2: Create or update `reports.ts` route file with Hono pattern
- [ ] Task 1.3: Create or update `accounts.ts` route file with Hono pattern (including types)
- [ ] Task 1.4: Create or update `auth.ts` route file with Hono pattern (handle special cases)
- [ ] Task 1.5: Create or update `companies.ts` route file with Hono pattern
- [ ] Task 1.6: Create or update `roles.ts` route file with Hono pattern
- [ ] Task 1.7: Create or update `dinein.ts` route file with Hono pattern (sessions, tables, reservations)
- [ ] Task 1.8: Create or update `health.ts` route file with Hono pattern

### AC 2: Typed Context Works in All Handlers

**Given** migrated route handlers  
**When** accessing auth context or validated data  
**Then** `c.get("auth")` returns properly typed `AuthContext` and `c.req.valid()` returns correctly typed data

- [ ] Task 2.1: Verify `declare module "hono"` context variable map is properly extended
- [ ] Task 2.2: Verify all handlers use typed auth access via `c.get("auth")`
- [ ] Task 2.3: Verify zod schemas are properly typed and imported from `@jurnapod/shared`

### AC 3: zValidator Middleware Applied Where Needed

**Given** routes with request validation needs  
**When** migrating  
**Then** zValidator middleware is applied using the `@hono/zod-validator` pattern established in 14.1.4

- [ ] Task 3.1: Apply zValidator to routes with JSON body validation
- [ ] Task 3.2: Apply zValidator to routes with query param validation
- [ ] Task 3.3: Remove inline `ZodSchema.parse()` calls in favor of middleware

### AC 4: Telemetry Middleware Properly Scoped

**Given** migrated route groups  
**When** HTTP requests are received  
**Then** telemetry middleware is applied at route group level via `route.use(telemetryMiddleware())`

- [ ] Task 4.1: Verify all route groups apply telemetry middleware
- [ ] Task 4.2: Verify telemetry context is properly threaded to handlers
- [ ] Task 4.3: Verify health endpoint does not require telemetry (or has minimal scope)

### AC 5: Build and Tests Pass with No Regressions

**Given** all migrated routes  
**When** running validation  
**Then** `npm run build -w @jurnapod/api` passes  
**And** `npm run typecheck -w @jurnapod/api` passes  
**And** `npm run lint -w @jurnapod/api` passes  
**And** `npm run test:unit -w @jurnapod/api` passes with no regressions

- [ ] Task 5.1: Run API build and verify success
- [ ] Task 5.2: Run API typecheck and verify success
- [ ] Task 5.3: Run API lint and verify no errors
- [ ] Task 5.4: Run API unit tests and verify all pass

### AC 6: URL Paths Follow Standardization Rules

**Given** migrated routes  
**When** URLs are finalized  
**Then** all paths use kebab-case  
**And** nested resources follow RESTful patterns  
**And** no path segments are duplicated or redundant

- [ ] Task 6.1: Verify all URL segments use kebab-case
- [ ] Task 6.2: Verify RESTful nesting (e.g., `/accounts/:accountId/usage`)
- [ ] Task 6.3: Remove any duplicate path segments

---

## Technical Approach

### Migration Pattern

Each route group follows the stock.ts pattern:

```typescript
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { telemetryMiddleware } from "../middleware/telemetry.js";
import { authMiddleware } from "./auth-middleware.js";
import { successResponse, errorResponse } from "../lib/response.js";
import { authenticateRequest, type AuthContext } from "../lib/auth-guard.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// Create route group
const routes = new Hono();

// Apply middleware at group level
routes.use(telemetryMiddleware());
routes.use(authMiddleware);

// Define routes with typed handlers
routes.get("/",
  zValidator('query', SomeQuerySchema),
  requireAccess([...]),
  async (c) => {
    const auth = c.get("auth");
    const { param1, param2 } = c.req.valid('query');
    // ... handler
  }
);

export { routes };
```

### Auth Route Special Handling

Auth routes (`/api/auth/*`) require special consideration:

1. **Login/Logout**: No auth required, but may set cookies
2. **Refresh token**: May use cookie-based auth instead of header
3. **Password reset**: No auth required
4. **Google OAuth**: No auth required (external)
5. **Invite accept**: Token-based one-time action

Each auth sub-route should be evaluated individually for middleware applicability.

### Server Registration

After creating route files, register in `server.ts`:

```typescript
import { journalsRoutes } from "./routes/journals.js";
import { reportsRoutes } from "./routes/reports.js";
// ... other imports

// Register migrated routes
app.route("/journals", journalsRoutes);
app.route("/reports", reportsRoutes);
// ... other registrations
```

Remove from dynamic route loading if previously included.

---

## Files to Create/Modify

### New Route Files (in `apps/api/src/routes/`)

| File | Description |
|------|-------------|
| `journals.ts` | Journal routes (GET /journals, POST /journals, GET /journals/[batchId]) |
| `reports.ts` | Report routes (all /api/reports/* sub-routes) |
| `accounts.ts` | Account routes (all /api/accounts/* sub-routes) |
| `auth.ts` | Auth routes (all /api/auth/* sub-routes) |
| `companies.ts` | Company routes (all /api/companies/* sub-routes) |
| `roles.ts` | Role routes (all /api/roles/* sub-routes) |
| `dinein.ts` | Dine-in routes (sessions, tables, reservations) |
| `health.ts` | Health check route |
| `auth-middleware.ts` | Shared auth middleware helper for route files |

### Modified Files

| File | Change |
|------|--------|
| `apps/api/src/server.ts` | Import and register new route groups, remove from dynamic loading |
| `apps/api/app/api/*/route.ts` | Remove after migration (or keep as wrappers if needed) |

---

## Testing Strategy

1. **Build verification**: Ensure TypeScript compilation succeeds
2. **Type checking**: Verify all typed context access works
3. **Unit tests**: Existing tests should continue to pass
4. **Manual verification**: Test key endpoints with curl/httpie:
   - Health: `GET /api/health`
   - Journals: `GET /api/journals`, `POST /api/journals`
   - Reports: `GET /api/reports/trial-balance?company_id=X`
   - Accounts: `GET /api/accounts`, `POST /api/accounts`
   - Auth: `POST /api/auth/login`
   - Companies: `GET /api/companies`
   - Roles: `GET /api/roles`
   - Dine-in: `GET /api/dinein/tables`

---

## Dev Notes

- Auth routes may need individual evaluation for middleware applicability
- Some legacy routes may have been partially converted; verify current state before starting
- Health endpoint is simple enough to migrate with minimal changes
- URL standardization: ensure kebab-case throughout (e.g., `trial-balance` not `trialBalance`)
- The `auth-middleware.ts` helper should be extracted if it doesn't exist yet
- Consider creating a base route helper pattern for common middleware chains
- Some routes like `/api/reports/pos-payments` may share schemas with sales routes

---

## Dependencies

- Story 14.1.1: `@hono/zod-validator` installed
- Story 14.1.2: Stock routes converted to Hono native pattern
- Story 14.1.4: zValidator applied to stock routes
- Story 14.2.2: Auth middleware helper pattern established
- Story 14.2.4: Base route patterns and conventions documented

---

## Estimate

**8 hours** - Multiple route groups with varying complexity; auth routes require special handling.

---

## Reference Implementation

See `apps/api/src/routes/stock.ts` for the canonical Hono `app.route()` pattern established in Phase 1.

---

## Completion Notes

**Story 14.2.5 implemented - structure created with stubs for all remaining route groups.**

### Implementation Summary

**Created Hono route structure with stubs:**
```
apps/api/src/routes/
├── health.ts        # Health check (GET /health) - no auth required
├── auth.ts         # Auth routes (POST /auth/login, /auth/logout, /auth/refresh)
├── roles.ts        # Role routes (GET/POST /roles) - auth required
├── journals.ts     # Journal routes (GET/POST /journals) - auth required
├── reports.ts      # Report routes (GET /reports/*) - auth required
├── accounts.ts     # Account routes (GET/POST /accounts, /accounts/types) - auth required
├── companies.ts    # Company routes (GET /companies) - auth required
└── dinein.ts       # Dine-in routes (GET /dinein/sessions, /dinein/tables) - auth required
```

### Files Created

| File | Description |
|------|-------------|
| `apps/api/src/routes/health.ts` | Health check route |
| `apps/api/src/routes/auth.ts` | Auth routes stub |
| `apps/api/src/routes/roles.ts` | Role routes stub |
| `apps/api/src/routes/journals.ts` | Journal routes stub |
| `apps/api/src/routes/reports.ts` | Report routes stub |
| `apps/api/src/routes/accounts.ts` | Account routes stub |
| `apps/api/src/routes/companies.ts` | Company routes stub |
| `apps/api/src/routes/dinein.ts` | Dine-in routes stub |

### Files Modified

| File | Change |
|------|--------|
| `apps/api/src/server.ts` | Added imports and registrations for all new route groups |

### Validation

- TypeScript typecheck: ✅ PASSED
- Build: ✅ PASSED
- Lint: ✅ PASSED

### Known Limitations

All route groups are currently stubs. Full migration of business logic from `apps/api/app/api/` is pending. The routes are registered and auth middleware is in place, but actual business logic still uses the old Next.js routes until full migration is completed.

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Fix auth middleware ordering in sync/health.ts - auth middleware applied after route handler [apps/api/src/routes/sync/health.ts:122-130] ✅ FIXED
- [ ] [AI-Review][HIGH] Correct documentation inconsistency - sync routes have full implementation but story claims stubs [apps/api/src/routes/sync/health.ts, apps/api/src/routes/sync/check-duplicate.ts]
- [ ] [AI-Review][HIGH] Document auth requirement for health endpoint or add auth middleware [apps/api/src/routes/health.ts:14-16]
- [ ] [AI-Review][MEDIUM] Standardize middleware ordering across all route groups [Multiple route files]
- [ ] [AI-Review][MEDIUM] Update story File List to include all modified files from git changes [Story documentation vs git status]
- [ ] [AI-Review][LOW] Reorganize route registration order in server.ts for logical grouping [apps/api/src/server.ts:244-267]

### Next Steps

Complete full migration of route business logic from `apps/api/app/api/` to the new Hono-based handlers.
