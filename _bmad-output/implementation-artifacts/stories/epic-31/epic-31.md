# Epic 31: API Detachment Completion

**Status:** ✅ DONE (with Technical Debt)
**Date:** 2026-04-04
**Completed:** 2026-04-05
**Stories:** 9 total (3 sprints)
**Sprint Plan:** `_bmad-output/planning-artifacts/epic-31-sprint-plan.md`

---

## Executive Summary

Epic 31 completes the API Detachment initiative (Epics 23-30) by extracting the final remaining domain logic from `apps/api/src/lib/` into workspace packages. After 7 epics of extraction work, the remaining items are: Users/RBAC (1,520 LOC), Companies/Provisioning (1,128 LOC), Reservations consolidation (~2,400 LOC), Import/Export (~6,000 LOC), and Notifications (~800 LOC). This epic also enforces route thinning and removes dead code (`lib/modules-*`).

**Key Goals Achieved:**
- ✅ Extract remaining domain logic to packages
- ✅ Thin API routes to pure HTTP adapters (validation/auth/response only)
- ⚠️ Delete dead code left after route flipping (PARTIAL - see Technical Debt)
- ✅ Enforce no `packages/**` importing `apps/api/**`

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

- [ ] All stories completed
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

| Sprint | Stories | Focus | Status |
|--------|---------|-------|--------|
| Sprint 1 | 31.1 – 31.4 | Users, Companies, Reservations extraction + route thinning | ✅ Complete |
| Sprint 2 | 31.5 – 31.7 | Import/Export, Notifications, Route thinning enforcement | ✅ Complete |
| Sprint 3 | 31.8A, 31.8B | Adapter migration prep, import boundaries, deletion verification | ✅ Complete |

---

## Stories

| # | Title | Status | Notes |
|---|-------|--------|-------|
| [story-31.1](./story-31.1.md) | Extract Users/RBAC to `modules-platform` | done | |
| [story-31.2](./story-31.2.md) | Extract Companies/Provisioning to `modules-platform` | done | |
| [story-31.3](./story-31.3.md) | Consolidate Reservations duplicate logic | done | |
| [story-31.4](./story-31.4.md) | Thin `routes/users.ts` and `routes/companies.ts` | done | |
| [story-31.5](./story-31.5.md) | Import/Export infrastructure → `modules-platform` | deferred | Moved to Epic 36 |
| [story-31.6](./story-31.6.md) | Notifications consolidation (email/mailer) | done | |
| [story-31.7a](./story-31.7a.md) | Route thinning - Inventory routes | done | Post-filtering moved to package |
| [story-31.7b](./story-31.7b.md) | Route thinning - Reports routes | done | Context helpers extracted |
| [story-31.7c](./story-31.7c.md) | Route thinning - Accounts routes | done | Already thin, ADR-0016 created |
| [story-31.8A](./story-31.8A.md) | Adapter migration prep + import boundary enforcement | done | Boundaries verified |
| [story-31.8B](./story-31.8B.md) | Deletion verification + dead code cleanup | done | PARTIAL - deferred remaining to Epic 36 |

---

## Technical Debt

The following items were not completed in this epic and are tracked for future work:

### TD-31-1: Delete `lib/modules-accounting/` and `lib/modules-sales/`
**Status:** Deferred to Epic 36
**Reason:** 20+ files still import from `modules-accounting`, 11+ from `modules-sales`
**Impact:** Adapter directories remain until Epic 36 refactoring

### TD-31-2: Import/Export Infrastructure Extraction
**Status:** Deferred to Epic 36
**Reason:** Scope too large for single story (~6,000 LOC)
**Impact:** Import/Export remains in API lib

### TD-31-3: Fiscal Year Service Boundary
**Status:** Documented in ADR-0016
**Reason:** Significant dependencies on company settings
**Impact:** Fiscal year CRUD remains in API lib (acceptable for now)

---

## Post-Epic Test Fixes (2026-04-05)

After Epic 31 completion, test failures were discovered and fixed:

### 1. Date Handling in `normalizeOutletTable`
**File:** `packages/modules/reservations/src/outlet-tables/service.ts`

**Issue:** `row.created_at.toISOString()` failed because Kysely returns strings in tests, not Date objects.

**Fix:** Added `toIsoString()` helper to handle both Date and string types:
```typescript
function toIsoString(val: Date | string): string {
  if (typeof val === 'string') return val;
  return val.toISOString();
}
```

### 2. Temporal Instant Timezone Error
**File:** `apps/api/src/lib/reservation-groups.test.ts`

**Issue:** `reservationAt` was passed as MySQL DATETIME format (`YYYY-MM-DD HH:mm:ss`) but `toUnixMs()` expects RFC3339 instant with timezone (`2026-04-06T10:00:00Z`).

**Fix:** Changed `createTestGroup()` to use `new Date(...).toISOString()` instead of `toDbDateTime(...)` for `reservationAt`.

### 3. Status ID Fixture Bug
**File:** `apps/api/src/lib/reservation-groups.test.ts`

**Issue:** Tests that check "started reservations" only updated `status = 'ARRIVED'` but not `status_id`. The service prefers `status_id` over `status` string, so the check failed silently.

**Fix:** Updated SQL fixtures to update both fields:
```sql
UPDATE reservations SET status = 'ARRIVED', status_id = 3 WHERE ...
```

### Validation Results
- ✅ 1689 API unit tests pass
- ✅ `npm run typecheck -w @jurnapod/api` passes
- ✅ `npm run typecheck -w @jurnapod/modules-reservations` passes
