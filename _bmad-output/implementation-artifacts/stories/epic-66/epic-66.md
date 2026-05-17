# Epic 66: Core Admin — Users, Roles, Companies, Permissions UX

**Status:** planned (queued — requires explicit backoffice unfreeze before execution)
**Sprint/Timebox:** Weeks 3–4 (of Backoffice Frontend Program)
**Theme:** Admin surfaces for identity and access management: user CRUD with role assignment and outlet scoping, role management with permission matrix, company/outlet management, permission-aware navigation, and audit log explorer.
**Primary Modules:** `apps/backoffice`, `packages/auth`, `packages/modules/platform`
**Predecessor:** Epic 65 (Foundation) — requires typed API client, auth session, shell, router
**Exit Gate:** Users, roles, companies, outlets all CRUD-capable with permission-aware UX; role assignment has review step; audit log explorer functional; permission matrix editor renders correct bit values; all tests pass.

---

## 1) Charter

### 1.1 Program Alignment

Epic 66 builds on Epic 65's foundation (typed API client, auth session, shell, router, TanStack Query) to deliver the core admin surfaces that govern safe access to the entire system. Every subsequent domain epic (catalog, purchasing, finance) depends on the permission model and navigation filtering established here.

### 1.2 What We Know

- The backend exposes `/api/users`, `/api/users/me`, `/api/roles`, module-role settings — these are the primary endpoint families
- The repo's ACL model uses 8 canonical modules with resource-level permissions, 6 permission bits (READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32), and 5 permission masks
- Role presets exist: SUPER_ADMIN, OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT, CASHIER
- Users can have outlet-scoped role assignments
- The audit back-end exposes period-transition audit APIs and likely general audit query
- Epic 45 already documented canonical permission bit values and fixture standards

### 1.3 Non-Goals

- No changes to backend ACL enforcement
- No new permission bits or modules
- No self-service user registration (admin-created users only)
- No SSO/OIDC integration in this epic (deferred to future program)
- No sales, dine-in, customer admin, or POS support domain screens — deferred to a future approved backoffice domain program

---

## 2) Requirements Inventory

### Functional Requirements

| FR | Statement | Story |
|----|-----------|-------|
| FR66-1 | The backoffice MUST provide a user list with search, filter (by role, outlet, status), pagination, and detail drawer | 66-1 |
| FR66-2 | User creation MUST support: email, name, outlet assignment, role selection (with permission preview) | 66-1 |
| FR66-3 | User editing MUST support: role change, outlet scope change, status toggle, with a change summary review step | 66-1 |
| FR66-4 | The backoffice MUST provide a role detail page with tabs: Overview, Permission Matrix, Outlet Scoping, Change History | 66-2 |
| FR66-5 | The permission matrix editor MUST display modules × resources × permission bits as a grid with preset masks | 66-2 |
| FR66-6 | Role changes MUST show a before/after diff summary before confirmation | 66-2 |
| FR66-7 | The backoffice MUST provide company CRUD with outlet management (create, edit, activate/deactivate) | 66-3 |
| FR66-8 | Every entity that is company- or outlet-scoped MUST display a ScopeBadge showing company/outlet context | 66-3 |
| FR66-9 | Navigation items and action buttons MUST be filtered/hidden based on the authenticated user's permissions (deny-by-default) | 66-4 |
| FR66-10 | The backoffice MUST provide an audit log explorer with filters for: actor, action, date range, object type, company/outlet | 66-5 |
| FR66-11 | Audit log entries MUST have a detail drawer showing the change payload and diff | 66-5 |

### Non-Functional Requirements

| NFR | Statement | Validation |
|-----|-----------|------------|
| NFR66-1 | Permission editor MUST show correct bit values (READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32) | Unit test |
| NFR66-2 | Permission masks MUST show correct summed values (CRUD=15, CRUDA=31, CRUDAM=63) | Unit test |
| NFR66-3 | Role change review MUST show human-readable diff before confirming write | Manual verification |
| NFR66-4 | Audit log list MUST be paginated; low page size default for performance | Load test |

---

## 3) Story Breakdown

### Story 66-1 — User management: list, create, edit, role assignment, outlet scoping

**Status:** planned
**Type:** feature
**Risk:** Medium
**Dependencies:** Epic 65 (typed API client, shell, router, TanStack Query)

Implement the user management surface:
- List page with the shared EntityTable from Epic 65: search by email/name, filter by role/outlet/status, pagination
- Detail drawer for quick inspection (roles, outlets, last login, status)
- Create/edit form with sections: Identity (email, name, status), Outlet Assignments (multi-select), Role Selection (role presets with permission preview)
- Role selection includes a permission preview panel showing what the selected role can access
- Change summary review step before saving (before/after roles, outlets, status)

**Acceptance Criteria:**
- Given an admin with `platform.users.READ`, they can view the user list
- Given an admin with `platform.users.CREATE`, they can create a new user with email, name, outlet, and role
- Given an admin editing a user, changing the role shows a permission preview of what the new role grants
- Given the save button is clicked, a change summary modal shows before the mutation is sent
- Given a user is deactivated, they cannot log in (verified by backend enforcement — frontend reflects status)
- TanStack Query caches the user list; creating/editing a user invalidates the cache
- Unit tests cover: form validation, permission preview calculation, role assignment logic

---

### Story 66-2 — Role management: presets, permission matrix editor, change review

**Status:** planned
**Type:** feature
**Risk:** High (permission matrix is data-dense and error-prone)
**Dependencies:** 66-1 (role assignment pattern)

Implement role management:
- Role list with detail page: tabs for Overview (name, description, member count), Permission Matrix (grid), Outlet Scoping, Change History
- Permission Matrix: rows = modules (platform, pos, sales, inventory, accounting, treasury, purchasing, reservations), columns = resources (e.g., for platform: users, roles, companies, outlets, settings), cells = dropdown with bit mask options (None, READ, WRITE, CRUD, CRUDA, CRUDAM) plus custom bit toggle
- The matrix editor must show correct canonical bit values and mask sums
- Role presets (SUPER_ADMIN, OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT, CASHIER) are read-only templates; custom roles are editable
- Before/after diff summary before saving any role change
- Change history tab shows audit trail for this role

**Acceptance Criteria:**
- Given the Permission Matrix tab, the grid shows all 8 modules with their respective resources and current permission masks
- Given a cell is changed from CRUD to READ, the save button shows a diff: `inventory.items: CRUD(15) → READ(1)`
- Given a custom role, all permission cells are editable; given a system role (e.g., CASHIER), cells are read-only with a "System role" badge
- Given a preset mask is selected (e.g., CRUDA=31), the individual bits are correctly reflected (READ + CREATE + UPDATE + DELETE + ANALYZE)
- Given a custom mask is built from individual bits, the mask value is computed correctly
- Unit tests cover: bit-to-mask conversion, mask-to-bits decomposition, diff calculation, preset readonly enforcement

---

### Story 66-3 — Company/outlet management with ScopeBadge

**Status:** planned
**Type:** feature
**Risk:** Low
**Dependencies:** Epic 65 (shell, typed API client)

Implement company and outlet management:
- Company list: name, code, status, creation date
- Company detail: edit name/code/status, manage outlets
- Outlet list within company: name, code, address, status
- Outlet create/edit: name, code, address, status
- ScopeBadge component: shows `Company: Name | Outlet: Name` as a Mantine Badge
- ScopeBadge appears on every list page and detail page that is scope-sensitive

**Acceptance Criteria:**
- Given an admin with `platform.companies.READ`, they can view company list and detail
- Given an admin with `platform.companies.MANAGE`, they can create/edit companies
- Given a company is deactivated, its outlets are shown as inactive
- Given any page that is outlet-scoped (inventory items, prices, sales, etc.), the ScopeBadge component renders the current company/outlet
- Given the outlet switcher in the shell changes outlet, ScopeBadge updates on all open pages

---

### Story 66-4 — Permission-aware navigation and route guards

**Status:** planned
**Type:** feature
**Risk:** Low
**Dependencies:** 66-1, 66-2 (permission data model), Epic 65 (route guards shell)

Integrate permission data into the shell navigation and route guards built in Epic 65:
- The navigation sidebar queries the current user's effective permissions (from session/permission cache)
- Modules without ANY resource access are hidden from the sidebar
- Resources within a module that the user cannot READ display as disabled/italic labels rather than links
- Action buttons (Create, Edit, Delete, Void) are hidden or disabled based on the required permission
- Route guards from Epic 65 verify module.resource permissions before rendering route pages

**Acceptance Criteria:**
- Given a user with only `inventory.items.READ`, the navigation shows Inventory → Items but hides Inventory → Prices
- Given a user with no accounting module access, the Accounting section is entirely hidden from the sidebar
- Given a user navigates directly to a URL for a module they lack READ access to, the route guard redirects to `/403` or dashboard
- Given a user opens a detail page but lacks UPDATE permission, the Edit button is hidden
- Given a user opens a detail page but lacks DELETE permission, the Void/Delete button is hidden
- The permission check for route guards and button visibility uses the canonical `module.resource` format

---

### Story 66-5 — Audit log explorer

**Status:** planned
**Type:** feature
**Risk:** Medium
**Dependencies:** 66-4 (permission-aware navigation), Epic 65 (data table primitives)

Implement the audit log explorer:
- List page with filters: actor (user selector), action (CREATE, UPDATE, DELETE, VOID, etc.), date range (start/end), object type (user, role, item, invoice, journal, etc.), company/outlet scope
- Result list with columns: timestamp, actor, action, object type, object ID, summary, scope badges
- Detail drawer: full change payload (before/after JSON), actor details, IP/session info if available
- Deep-link support: `/audit?actor=123&action=UPDATE&from=2026-01-01`

**Acceptance Criteria:**
- Given a filter combination, the correct audit entries are returned and displayed
- Given the date range filter, the list only shows entries within the specified range (half-open interval: `col >= startUTC AND col < nextDayUTC`)
- Given an audit entry with a known change payload, the detail drawer shows the before/after diff
- Given the object type filter, only entries for that entity type are shown
- The audit list is paginated with a default page size of 25
- TanStack Query caches the audit list; applying new filters refreshes the query

---

## 4) Epic Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R66-001 | P1 | Permission matrix grid may be too wide for standard viewport (8 modules × up to 5 resources each) | Use horizontal scroll + sticky first column; test at 1280px viewport minimum |
| R66-002 | P1 | Audit log API may not support all filter combinations required | Backend dependency: verify endpoint capabilities before implementing UI; flag gaps |
| R66-003 | P2 | Role change diff for complex permission changes may be hard to read | Group diffs by module and show both old and new mask in human-readable form (e.g., "READ + WRITE" not "6") |
| R66-004 | P2 | User list with many users may be slow without server-side search | Use server-side search/pagination from the start; EntityTable pattern enforces this |

---

## 5) Preconditions

| # | Precondition | Enforcement | Status |
|---|--------------|-------------|--------|
| 1 | Epic 65 (Foundation) complete with exit gate passed | sprint-status.yaml | ❌ (HOLDING) |
| 2 | Backoffice unfreeze authorized | Written authorization | ❌ (HOLDING) |
| 3 | Typed API client covers user/role/company/outlet/audit endpoints | 65-2 completion | ❌ (HOLDING) |
| 4 | Route guards from Epic 65 functional | 65-5 completion | ❌ (HOLDING) |
| 5 | TanStack Query from Epic 65 available | 65-6 completion | ❌ (HOLDING) |

---

## 6) Exit Gate

1. **Build Gate:** `npm run build` and `npm run typecheck` pass
2. **User Admin Gate:** User CRUD, role assignment with permission preview, outlet scoping all functional
3. **Role Admin Gate:** Permission matrix renders, system roles locked, custom roles editable, before/after diff on changes
4. **Company/Outlet Gate:** CRUD functional, ScopeBadge renders on scope-sensitive pages
5. **Permission UX Gate:** Navigation filtered, route guards enforce, action buttons hidden for unauthorized users
6. **Audit Explorer Gate:** Filters functional, detail drawer shows before/after diff, deep-link support
7. **Test Gate:** Unit tests for permission bits, matrix editor, diff calculation, audit list filtering all pass
8. **SOLID/DRY/KISS Gate:** Full rescore passes at pre-close

---

## 7) Validation Commands

```bash
# Pre-flight
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice

# Permission bit tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/permission-bits.test.ts

# Permission matrix editor tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/permission-matrix.test.ts

# User management tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/users.test.ts

# Audit explorer tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/audit.test.ts

# Route guard integration tests (with mock auth)
npm run test:single -w @jurnapod/backoffice -- __test__/unit/app-router-guards-permissions.test.ts

# Full suite
npm run test -w @jurnapod/backoffice

# E2E smoke test
npm run qa:e2e -w @jurnapod/backoffice -- --grep "admin|users|roles|permissions"

# Sprint status
npx tsx scripts/validate-sprint-status.ts --epic 66
```

---

_Last Updated: 2026-05-17_
