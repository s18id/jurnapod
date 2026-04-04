# Epic 31 Sprint Plan

## Overview

**Epic:** API Detachment Completion
**Duration:** 2 sprints
**Goal:** Extract remaining domain logic from `apps/api/src/lib/`, thin routes, delete dead code.

## Story Dependencies

### Sprint 1

```
31.1 (users extraction)
  └── 31.2 (companies extraction) ── parallel
        ├── 31.3 (reservations consolidation) ── sequential
        └── 31.4 (route thinning) ── sequential
```

### Sprint 2

```
31.5 (import/export) ── parallel with 31.6 (notifications)
  └── 31.7 (route thinning enforcement) ── sequential
        └── 31.8 (validation gate + cleanup) ── sequential
```

## Sprint 1

### Story 31.1: Extract Users/RBAC to `modules-platform`
- **Estimate:** 8h
- **Priority:** P1
- **Dependencies:** None
- **Focus:** Extract `apps/api/src/lib/users.ts` (1,520 LOC) to `@jurnapod/modules-platform`. User CRUD, role management, module permissions, SuperAdmin protection.

### Story 31.2: Extract Companies/Provisioning to `modules-platform`
- **Estimate:** 6h
- **Priority:** P1
- **Dependencies:** None (parallel with 31.1)
- **Focus:** Extract `apps/api/src/lib/companies.ts` (1,128 LOC). MODULE_DEFINITIONS, ROLE_DEFINITIONS, SETTINGS_DEFINITIONS, company provisioning.

### Story 31.3: Consolidate Reservations duplicate logic
- **Estimate:** 8h
- **Priority:** P1
- **Dependencies:** 31.1 + 31.2
- **Focus:** Merge `table-occupancy.ts`, `reservation-groups.ts`, `outlet-tables.ts` from API into `@jurnapod/modules-reservations`. Remove duplicate implementations.

### Story 31.4: Thin `routes/users.ts` and `routes/companies.ts`
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 31.1 + 31.2
- **Focus:** Refactor routes to delegate to package services. Routes become thin HTTP adapters.

## Sprint 2

### Story 31.5: Import/Export infrastructure → `modules-platform`
- **Estimate:** 12h
- **Priority:** P2
- **Dependencies:** None (can start Sprint 2 independently)
- **Focus:** Move `lib/import/` and `lib/export/` (~6,000 LOC) to `@jurnapod/modules-platform`. Import session management, parsers, validators, batch operations.

### Story 31.6: Notifications consolidation (email/mailer)
- **Estimate:** 4h
- **Priority:** P2
- **Dependencies:** None (parallel with 31.5)
- **Focus:** Move `lib/email-*.ts` and `lib/mailer.ts` (~800 LOC) to `@jurnapod/notifications`. Email templates, mailer, email outbox.

### Story 31.7: Route thinning enforcement (accounts, inventory, reports)
- **Estimate:** 6h
- **Priority:** P2
- **Dependencies:** 31.5 + 31.6
- **Focus:** Refactor `routes/accounts.ts`, `routes/inventory.ts`, `routes/reports.ts` to use package services. Remove business logic from routes.

### Story 31.8: Full validation gate + cleanup `lib/modules-*`
- **Estimate:** 6h
- **Priority:** P1
- **Dependencies:** 31.3 + 31.4 + 31.7
- **Focus:** Delete `lib/modules-accounting/` and `lib/modules-sales/` after route flipping. Run full typecheck + build + lint validation across all workspaces.

---

## Key Risks & Decisions

| # | Risk | Decision |
|---|------|----------|
| 1 | Users/RBAC extraction breaks auth flow | Extensive integration tests on auth flow; rollback plan |
| 2 | Reservations duplicate logic drift | Consolidate quickly; single source of truth |
| 3 | Import/Export is large/complex | Keep in `modules-platform`, not new package |
| 4 | Deleting `lib/modules-*` breaks tests | Migrate tests to use package fixtures before deletion |

---

## Validation Commands

### Story 31.1
```bash
npm run typecheck -w @jurnapod/modules-platform
npm run typecheck -w @jurnapod/api
```

### Story 31.2
```bash
npm run typecheck -w @jurnapod/modules-platform
npm run typecheck -w @jurnapod/api
```

### Story 31.3
```bash
npm run typecheck -w @jurnapod/modules-reservations
npm run typecheck -w @jurnapod/api
npm run test -w @jurnapod/modules-reservations
```

### Story 31.4
```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

### Story 31.5
```bash
npm run typecheck -w @jurnapod/modules-platform
npm run typecheck -w @jurnapod/api
```

### Story 31.6
```bash
npm run typecheck -w @jurnapod/notifications
npm run typecheck -w @jurnapod/api
```

### Story 31.7
```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

### Story 31.8
```bash
npm run typecheck --workspaces --if-present
npm run build --workspaces --if-present
```
