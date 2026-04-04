# Epic 31: API Detachment Completion

**Status:** backlog
**Date:** 2026-04-04
**Stories:** 9 total (3 sprints)
**Sprint Plan:** `_bmad-output/planning-artifacts/epic-31-sprint-plan.md`

---

## Executive Summary

Epic 31 completes the API Detachment initiative (Epics 23-30) by extracting the final remaining domain logic from `apps/api/src/lib/` into workspace packages. After 7 epics of extraction work, the remaining items are: Users/RBAC (1,520 LOC), Companies/Provisioning (1,128 LOC), Reservations consolidation (~2,400 LOC), Import/Export (~6,000 LOC), and Notifications (~800 LOC). This epic also enforces route thinning and removes dead code (`lib/modules-*`).

**Key Goals:**
- Extract remaining domain logic to packages
- Thin API routes to pure HTTP adapters (validation/auth/response only)
- Delete dead code left after route flipping
- Enforce no `packages/**` importing `apps/api/**`

---

## Goals & Non-Goals

### Goals
- Extract `users.ts` (1,520 LOC) to `@jurnapod/modules-platform`
- Extract `companies.ts` (1,128 LOC) to `@jurnapod/modules-platform`
- Consolidate duplicate reservations logic from API into `@jurnapod/modules-reservations`
- Move Import/Export infrastructure (~6,000 LOC) to `@jurnapod/modules-platform`
- Consolidate email/mailer infrastructure (~800 LOC) into `@jurnapod/notifications`
- Thin thick routes (`users.ts`, `companies.ts`, `accounts.ts`, `inventory.ts`, `reports.ts`)
- Delete `lib/modules-accounting/` and `lib/modules-sales/` after route flipping
- Full validation gate: typecheck + build + lint across all workspaces

### Non-Goals
- No new business logic or feature development
- No schema changes
- No sync protocol changes
- No POS app changes

---

## Architecture

### Package Boundaries

```
packages/modules/platform/
  src/
    users/         ← Extract from apps/api/src/lib/users.ts
    companies/     ← Extract from apps/api/src/lib/companies.ts
    import-export/ ← Extract from apps/api/src/lib/import/ + export/

packages/modules/reservations/
  table-occupancy/ ← Consolidate from apps/api/src/lib/table-occupancy.ts
  reservation-groups/ ← Consolidate from apps/api/src/lib/reservation-groups.ts
  outlet-tables/  ← Consolidate from apps/api/src/lib/outlet-tables.ts

packages/notifications/
  src/
    mailer.ts      ← Consolidate from apps/api/src/lib/email-*.ts + mailer.ts
```

### Dependency Direction

```
packages/modules/platform (users, companies, import-export)
packages/modules/reservations (consolidated)
packages/notifications (mailer)
        ↓
packages/modules/accounting (journals, posting — already extracted)
packages/modules/sales (already extracted)
packages/modules/inventory (already extracted)
        ↓
apps/api (thin HTTP adapters only)
```

### Key Rule
**No `packages/**` may import from `apps/api/**`**. Enforced by ESLint import boundaries.

---

## Success Criteria

- [ ] All 8 stories completed
- [ ] `users.ts` and `companies.ts` extracted to `modules-platform`
- [ ] Reservations duplicate logic consolidated into `modules-reservations`
- [ ] Import/Export and Notifications extracted to their packages
- [ ] All API routes are thin adapters (HTTP validation/auth/response only)
- [ ] `lib/modules-accounting/` and `lib/modules-sales/` deleted
- [ ] `npm run typecheck --workspaces --if-present` passes
- [ ] `npm run build --workspaces --if-present` passes
- [ ] No package importing `apps/api/**` (enforced by lint)

---

## Sprint Summary

| Sprint | Stories | Focus |
|--------|---------|-------|
| Sprint 1 | 31.1 – 31.4 | Users, Companies, Reservations extraction + route thinning |
| Sprint 2 | 31.5 – 31.7 | Import/Export, Notifications, Route thinning enforcement |
| Sprint 3 | 31.8A, 31.8B | Adapter migration prep, import boundaries, deletion verification |

---

## Stories

| # | Title | Status |
|---|-------|--------|
| [story-31.1](./story-31.1.md) | Extract Users/RBAC to `modules-platform` | pending |
| [story-31.2](./story-31.2.md) | Extract Companies/Provisioning to `modules-platform` | pending |
| [story-31.3](./story-31.3.md) | Consolidate Reservations duplicate logic | pending |
| [story-31.4](./story-31.4.md) | Thin `routes/users.ts` and `routes/companies.ts` | pending |
| [story-31.5](./story-31.5.md) | Import/Export infrastructure → `modules-platform` | pending |
| [story-31.6](./story-31.6.md) | Notifications consolidation (email/mailer) | pending |
| [story-31.7](./story-31.7.md) | Route thinning enforcement (accounts, inventory, reports) | pending |
| [story-31.8A](./story-31.8A.md) | Adapter migration prep + import boundary enforcement | pending |
| [story-31.8B](./story-31.8B.md) | Deletion verification + dead code cleanup | pending |
