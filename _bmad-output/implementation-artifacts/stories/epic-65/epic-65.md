# Epic 65: Foundation — Shell, Router, Auth, Typed API Client, Data Grid Primitives

**Status:** planned (queued — requires explicit backoffice unfreeze before execution)
**Sprint/Timebox:** Weeks 1–2 (of Backoffice Frontend Program)
**Theme:** Establish the foundational architecture: role-aware shell, React Router v6, typed API client, session/auth model, server-state caching, reusable table/drawer/scope primitives, and canonical folder structure. All subsequent epics build on this foundation.
**Primary Modules:** `apps/backoffice`, `packages/shared`
**Predecessor:** None (program base epic)
**Exit Gate:** Typed API client MVP works for foundation endpoint families; auth session handles refresh and expiry; shell renders company context + outlet switcher + navigation + permissions-filtered menu; shared table/drawer/scope primitives render; route tree with lazy-loaded chunks renders; TanStack Query fetches first list/detail views with loading/error/empty states; `npm run typecheck -w @jurnapod/backoffice` and `npm run build -w @jurnapod/backoffice` pass.

---

## 1) Charter

### 1.1 Program Alignment

Epic 65 is the base epic of the Backoffice Frontend Hardening Program. It replaces the existing hand-rolled hash router, auth token management, and ad-hoc data fetching with production-grade primitives:

- **React Router v6** for mature data routing with lazy loading, route guards, and deep-link support
- **TanStack Query** for server-state caching (list/detail views, stale-while-revalidate, optimistic updates)
- **Typed API client** generated from the backend OpenAPI spec (via `packages/shared` Zod contracts or OpenAPI generator)
- **Auth session model** with silent refresh, foreground re-auth on sensitive transitions, and explicit session expiry affordances
- **Role-aware shell** with company context, outlet switcher, permission-filtered navigation, and pending-jobs badge
- **Shared admin primitives** (`EntityTable`, `FilterBar`, `DetailDrawer`, `ScopeBadge`) consumed by Epics 66–69

### 1.2 What We Know

- The existing backoffice has a hand-rolled hash router (`src/app/router.tsx`, `src/app/routes.ts`) that works but lacks lazy loading, route guards, and standard URL patterns
- Auth uses access token in app state + refresh token in HttpOnly cookie — this pattern stays; token resolution follows the canonical `getStoredAccessToken()` path from Epic 41
- Dexie is used for reference data caching (accounts, items, etc.) — this stays for offline caches but TanStack Query takes over for server-state list/detail fetches
- The API has OpenAPI-enabled routes via `@hono/zod-openapi` (Epic 36) — typed client generation is feasible
- Mantine already provides `AppShell`, `Navbar`, `Header`, `Menu`, `Badge` — these will be composed into the role-aware shell
- The existing theme (`src/app/theme.ts`) and theme provider (`src/app/theme-provider.tsx`) are in good shape and will be retained with incremental additions

### 1.3 Non-Goals

- No new backend API endpoints (assume existing OpenAPI spec)
- No SSR or server-rendered pages (backoffice is a static SPA)
- No new feature modules (domain screens come in Epics 66–69)
- No sales, dine-in, customer admin, or POS support domain screens — deferred to a future approved backoffice domain program
- No Dexie removal — preserved for offline caches and drafts
- No migration of existing page components beyond what the router rewrite requires
- No a11y/i18n work in this epic (deferred to Epic 70)

---

## 2) Requirements Inventory

### Functional Requirements

| FR | Statement | Story |
|----|-----------|-------|
| FR65-1 | The backoffice MUST scaffold the canonical folder architecture (`app/shell/`, `app/providers/`, `app/router/`, `lib/api/`, `lib/auth/`, `lib/cache/`, etc.) | 65-1 |
| FR65-2 | The backoffice MUST provide a typed API client generated from the backend OpenAPI spec (or Zod contract surface) | 65-2 |
| FR65-3 | The backoffice MUST implement silent auth token refresh with a refresh-token cookie; foreground re-auth MUST be requested for sensitive transitions | 65-3 |
| FR65-4 | The backoffice MUST display session expiry affordances ("session ending soon" banner) | 65-3 |
| FR65-5 | The backoffice MUST provide a role-aware app shell showing: company context, outlet switcher, navigation (permission-filtered), active user, and pending jobs count | 65-4 |
| FR65-6 | The backoffice MUST use React Router v6 with lazy-loaded route chunks and route guards that check permissions before rendering | 65-5 |
| FR65-7 | Route guards MUST use the canonical `module.resource` permission format and MUST reflect backend deny-by-default | 65-5 |
| FR65-8 | The backoffice MUST use TanStack Query (React Query) for all server-state API fetches with standardized list/detail pattern, stale-while-revalidate, loading/error/empty states | 65-6 |
| FR65-9 | The backoffice workspace MUST provide standardized `test:unit`, `test:single`, and `build:report` scripts before later epic validation commands rely on them | 65-1 |
| FR65-10 | The backoffice MUST provide shared `EntityTable`, `FilterBar`, `DetailDrawer`, and `ScopeBadge` primitives for later domain epics | 65-7 |

### Non-Functional Requirements

| NFR | Statement | Validation |
|-----|-----------|------------|
| NFR65-1 | Route-level lazy chunking MUST produce separate JS chunks per route module | `npm run build:report -w @jurnapod/backoffice` confirms multiple chunks |
| NFR65-2 | Auth token MUST NOT be logged or exposed in error messages | Code audit + lint rule |
| NFR65-3 | Typed API client MUST cover Epic 65 MVP families and MUST create explicit backlog entries for deferred typed families consumed by Epics 66–69 | Generate + import test |
| NFR65-4 | TanStack Query cache keys MUST follow a deterministic naming convention (`domain.resource.id`) | Code convention documented |
| NFR65-5 | The shell MUST render within 2 seconds on a development machine with mock data | Manual measure |

---

## 3) Story Breakdown

### Story 65-1 — Scaffold folder architecture, consolidate tooling

**Status:** planned
**Type:** foundation
**Risk:** Low
**Dependencies:** None

Create the canonical folder structure under `apps/backoffice/src/` as defined in the program plan. Move existing files to their canonical locations. Update `vite.config.ts` with `@/` alias. Add/update ESLint config for backoffice (import ordering, no-relative-imports, jsx-a11y rules confirmed working). Verify `npm run build` and `npm run typecheck` pass.

**Acceptance Criteria:**
- Folder structure matches program plan: `app/shell/`, `app/providers/`, `app/router/`, `lib/api/`, `lib/auth/`, `lib/cache/`, `lib/i18n/`, `features/`, `components/data-grid/`, `components/forms/`, `components/navigation/`, `components/feedback/`, `components/permissions/`, `routes/` (subdirectories per domain)
- Existing files moved without breaking imports
- `@/` alias resolves to `apps/backoffice/src/`
- ESLint config enforces relative-import ban for cross-directory imports
- Package scripts include standardized validation entry points: `test:unit`, `test:single`, and `build:report`
- `npm run lint -w @jurnapod/backoffice` passes (0 errors, 0 warnings)
- `npm run typecheck -w @jurnapod/backoffice` passes
- `npm run build -w @jurnapod/backoffice` passes

---

### Story 65-0 — OpenAPI generator evaluation and typed-client decision

**Status:** planned
**Type:** spike / decision gate
**Risk:** High
**Dependencies:** None

Timebox the OpenAPI/contract-generation investigation before Story 65-2 begins. The output is a documented decision: use generated client, use Zod contract wrappers, or use a hand-crafted typed client for MVP endpoint families.

**Acceptance Criteria:**
- Existing OpenAPI generation output is evaluated against at least auth, users, inventory items, operations, purchasing invoice, and accounting journal endpoints.
- Gaps are documented as endpoint-by-endpoint findings with severity.
- The implementation path for Story 65-2 is chosen and recorded in dev notes.
- Must-type MVP families for Epic 65 are locked: auth, users, roles, companies, outlets, inventory items, operations.
- Deferred typed families are explicitly assigned to Epics 66–69: audit, import/export, purchasing, accounting, sales/reports as needed by their consuming stories.

---

### Story 65-2 — Typed API client generation

**Status:** planned
**Type:** foundation
**Risk:** Medium
**Dependencies:** 65-1 (folder structure), depends on backend OpenAPI spec stability

Generate or write a typed API client from the backend's OpenAPI spec. The Story 65-0 decision gate determines whether implementation uses generated output, Zod contract wrappers, or a hand-crafted MVP client with Zod response validation at the boundary.

**Acceptance Criteria:**
- MVP endpoint families have typed request/response types in Epic 65: auth, users, roles, companies, outlets, inventory items, operations
- Deferred endpoint families have typed-client backlog entries assigned to their consuming epics: prices/imports/exports (Epic 67), audit/health/notifications (Epic 68), purchasing/accounting/reports (Epic 69), sales/customer/POS support deferred to future program
- Each API function accepts typed parameters and returns typed responses (via Zod or generated types)
- Error responses are typed with `code` + `message` per ADR-0006
- The client handles 401 responses by triggering the silent refresh flow
- Importable as `import { api } from '@/lib/api/client'` or similar
- Unit tests verify request/response type consistency for at least 3 representative endpoints

---

### Story 65-3 — Auth session model: silent refresh, re-auth, expiry affordances

**Status:** planned
**Type:** foundation
**Risk:** Medium
**Dependencies:** 65-1 (folder structure), 65-2 (typed client for auth endpoints)

Implement the auth session model using the existing pattern (access token in app state + refresh token in HttpOnly cookie). Add:
- Silent refresh on 401 via `/api/auth/refresh` before returning the error
- Foreground re-auth for sensitive transitions (fiscal close, void/refund, permission changes)
- "Session ending soon" banner at configurable threshold (e.g., 2 minutes before expiry)
- Clean sign-out that clears app state and redirects to login
- Auth failure recovery (redirect to login with return URL)

**Acceptance Criteria:**
- Given a valid session, when the access token expires, the client silently refreshes via `/api/auth/refresh` before retrying the failed request
- Given a sensitive transition (fiscal close, permission change), the user is prompted for re-authentication before proceeding
- Given a session expiring within the configured threshold, a dismissible banner appears: "Your session will end in N minutes"
- Given sign-out, app state is cleared and the user is redirected to `/login` with a `?return=` parameter
- Given authentication fails permanently (refresh token expired), the user is redirected to login with a "Session expired" message
- Unit tests cover refresh logic, re-auth trigger conditions, and expiry banner behavior

---

### Story 65-4 — Role-aware app shell: company context, outlet switcher, navigation, jobs badge, online/sync status

**Status:** planned
**Type:** foundation
**Risk:** Medium
**Dependencies:** 65-1 (folder structure), 65-3 (auth session)

Build the persistent app shell using Mantine `AppShell`:
- **Header:** Jurnapod logo, company selector (dropdown), outlet switcher, pending jobs badge (count + link to operations), user menu (profile, settings, sign-out)
- **Sidebar:** Navigation tree filtered by current user's permissions (deny-by-default: modules without access are hidden; resources without permission have disabled links)
- **Footer/status bar:** Online/offline status, sync health indicator, last sync timestamp
- The shell persists across route transitions (wraps `<Outlet />` from React Router)

**Acceptance Criteria:**
- Given a user with `OWNER` role, all navigation items are visible
- Given a user with `CASHIER` role (no access to platform/accounting), navigation items for those modules are hidden
- Given a company with multiple outlets, the outlet switcher changes the `outlet_id` context for all subsequent API calls
- Given no jobs in progress, the jobs badge shows `0` or is hidden
- Given jobs exist with status `running` or `failed`, the jobs badge shows the count and links to `/operations`
- The outlet switcher persists the selected outlet in session/localStorage
- The shell always shows online/offline state, sync health, and last sync timestamp
- The shell renders within 2 seconds (first load) on a development machine

---

### Story 65-5 — Mature data router: React Router route tree, lazy loading, guards

**Status:** planned
**Type:** foundation
**Risk:** High (replaces existing router, deep links must redirect)
**Dependencies:** 65-1 (folder structure), 65-4 (shell)

Replace the hand-rolled hash router with React Router v6. Create a route tree with:
- Lazy-loaded page chunks for each domain area
- Route guards that check authentication and permissions before rendering
- Deep-link redirect map for any existing hash-based URLs that external systems may rely on
- 404 catch-all page
- Login route as public; all other routes behind auth guard

**Acceptance Criteria:**
- Given a logged-out user, all routes redirect to `/login`
- Given a logged-in user without `platform.users.READ` permission, navigating to `/admin/users` shows a 403 page (or redirects to dashboard)
- Given a hash-based URL from the old router (e.g., `#/inventory/items`), the app redirects to the new path (`/inventory/items`)
- Given a non-existent route, a 404 page renders
- Given lazy loading, the initial bundle for `/login` does NOT contain route code for `/admin/users` or other domain pages
- Route tree is defined in a single `src/app/router/routes.tsx` file with clear domain groupings
- Dev notes document the route naming convention

---

### Story 65-6 — Server-state caching layer: TanStack Query with list/detail pattern

**Status:** planned
**Type:** foundation
**Risk:** Medium
**Dependencies:** 65-2 (typed client), 65-5 (router)

Integrate TanStack Query (React Query v5) as the server-state caching layer:
- Create a `QueryClient` provider in the app tree with sensible defaults (staleTime, gcTime, retry)
- Define a canonical list/detail query pattern: `useListQuery({ resource, filters, pagination })` and `useDetailQuery({ resource, id })`
- Define mutation hooks: `useCreateMutation`, `useUpdateMutation`, `useDeleteMutation` with automatic cache invalidation
- Loading, error, and empty states are returned as part of the query result shape for immediate use by components
- Dexie is preserved for reference data caches (module config, account types, tax rates) — TanStack Query handles dynamic server data

**Acceptance Criteria:**
- Given a list page that fetches `/api/inventory/items`, TanStack Query caches the response and shows stale data on re-visit while refetching in background
- Given a mutation (create item), the list cache for `/api/inventory/items` is invalidated and refetched
- Given a network error, the query returns an error state that can be rendered as a Mantine Alert
- Given an empty list, the query returns an empty state that renders an Empty component
- Given existing Dexie caches for reference data, those continue to work unchanged
- Unit tests verify query hook behavior with mocked API client

---

### Story 65-7 — Shared admin primitives: EntityTable, FilterBar, DetailDrawer, ScopeBadge

**Status:** planned
**Type:** foundation (reusable component)
**Risk:** High
**Dependencies:** 65-2 (typed client), 65-6 (TanStack Query)

Build the shared admin primitives consumed by Epics 66–69. Domain epics MUST use these primitives and MUST NOT create inline duplicates.

**Acceptance Criteria:**
- `EntityTable` supports server-side pagination, sort, filter URL sync, row selection, column visibility, loading state, empty state, and error state.
- `FilterBar` supports debounced text search, dropdown filters, date ranges, clear filters, and persisted saved views.
- `DetailDrawer` opens from table rows, renders typed detail content, and supports close/back/full-details actions.
- `ScopeBadge` renders current company/outlet/status context and updates when the shell outlet context changes.
- Unit/component tests cover table rendering, sort/filter URL sync, selection state, drawer open/close, and scope badge updates.

---

## 4) Epic Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R65-001 | P1 | OpenAPI generator from Epic 36 may not produce usable client code for all endpoints | Fall back to hand-crafted typed client; timebox auto-gen integration to 1 day |
| R65-002 | P1 | Replacing hand-rolled hash router may break existing deep links used by external systems | Map all existing hash routes before removal; add redirect map with e2e test |
| R65-003 | P1 | TanStack Query + Dexie dual caching may cause stale data conflicts | Define clear ownership: Dexie for reference data only, TanStack Query for dynamic data; document in dev notes |
| R65-004 | P2 | Permission-filtered navigation requires fetching user permissions on every nav rebuild | Cache permissions in TanStack Query with long `staleTime`; invalidate on role change |
| R65-005 | P2 | Typed API client effort may exceed story estimate if many endpoints have incomplete types | Prioritise route families by epic dependency order (auth, admin, inventory first; accounting/purchasing later) |

---

## 5) Preconditions

| # | Precondition | Enforcement | Status |
|---|--------------|-------------|--------|
| 1 | Backoffice scope freeze explicitly lifted for Epic 65 | Written authorization | ❌ (HOLDING — program is queued) |
| 2 | `npm run build -w @jurnapod/backoffice` passes on baseline | Pre-flight gate | ✅ (baseline confirmed) |
| 3 | `npm run typecheck -w @jurnapod/backoffice` passes on baseline | Pre-flight gate | ✅ (baseline confirmed) |
| 4 | `npm run lint -w @jurnapod/backoffice` passes on baseline | Pre-flight gate | ✅ (baseline confirmed) |
| 5 | Backend OpenAPI spec is stable or generator compatibility confirmed | Technical spike | TBD |
| 6 | SOLID/DRY/KISS kickoff gate scored | Manual review | TBD |

---

## 6) Exit Gate

1. **Build Gate:** `npm run build -w @jurnapod/backoffice` and `npm run typecheck -w @jurnapod/backoffice` pass
2. **Lint Gate:** `npm run lint -w @jurnapod/backoffice` passes (0 errors, 0 warnings)
3. **Auth Gate:** Silent refresh, foreground re-auth, and session expiry affordances all functional and tested
4. **Shell Gate:** Company/outlet context, permission-filtered navigation, jobs badge, user menu all render correctly
5. **Router Gate:** All routes lazy-loaded; hash redirects work; auth and permission guards enforced; 404 page renders
6. **Query Gate:** TanStack Query list/detail pattern works with loading/error/empty states; Dexie reference caches preserved
7. **Test Gate:** Unit tests for auth, API client, query hooks, and router guards all pass
8. **SOLID/DRY/KISS Gate:** Full rescore passes at pre-close

---

## 7) Validation Commands

```bash
# Pre-flight
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice

# Typed API client smoke test
npm run test:single -w @jurnapod/backoffice -- __test__/unit/lib-api-client.test.ts

# Auth session tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/lib-auth.test.ts

# Router guard tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/app-router-guards.test.ts

# Query hook tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/lib-cache-hooks.test.ts

# Full suite
npm run test -w @jurnapod/backoffice

# Bundle analysis (script added by 65-1)
npm run build:report -w @jurnapod/backoffice

# Migration lint (no new business triggers)
npm run lint:migrations

# Sprint status
npx tsx scripts/validate-sprint-status.ts --epic 65

# Program-level (after all epics)
npm run qa:e2e -w @jurnapod/backoffice
```

---

_Last Updated: 2026-05-17_
