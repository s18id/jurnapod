# Story 62.5: Reporting Code Migration to Packages

**Status:** ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 62 --story 62-5 --title reporting-code-migration-to-packages --status done`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **platform architect**,
I want **reporting domain logic migrated from `apps/api/src/lib/` to canonical packages**, with thin adapter routes remaining in the API layer,
so that **the reporting module is independently testable, reusable, and follows canonical package boundaries**.

## Context

- **Source:** Epic 62 (FR5) — Projection Correctness Hardening
- **Predecessor:** Stories 62.1–62.4 (projection accuracy and security validated)
- **Scope:** `apps/api/src/lib/reports.ts`, `apps/api/src/lib/report-context.ts`, `apps/api/src/lib/report-error-handler.ts`, `apps/api/src/lib/report-telemetry.ts`, admin dashboard helpers
- **Risk:** P1 — extraction may break existing report consumers if not flipped correctly

## Acceptance Criteria

**AC1: `reports.ts` migrated to `packages/modules/reporting`**
**Given** the existing report service logic in `apps/api/src/lib/reports.ts`,
**When** the migration is complete,
**Then** all report generation logic resides in `packages/modules/reporting/src/reports/`,
**And** `apps/api/src/routes/reports.ts` contains only thin adapter routes,
**And** no adapter shim remains in `apps/api/src/lib/`.

**AC2: `report-context.ts` migrated**
**Given** the report context logic (timezone resolution, company settings, outlet filtering),
**When** migrated,
**Then** the logic resides in `packages/modules/reporting/src/context/`,
**And** the API layer imports it via `@jurnapod/modules-reporting`.

**AC3: `report-error-handler.ts` migrated**
**Given** the report error handling logic,
**When** migrated,
**Then** the logic resides in `packages/modules/reporting/src/errors/`,
**And** API routes delegate error handling to the package.

**AC4: `report-telemetry.ts` migrated to `packages/telemetry`**
**Given** report telemetry (performance, usage) logic,
**When** migrated,
**Then** the logic resides in `packages/telemetry/src/reporting/`,
**And** `@jurnapod/telemetry` is the canonical package for reporting telemetry.

**AC5: Admin dashboard read-model helpers migrated**
**Given** admin dashboard helpers in `apps/api/src/lib/admin-dashboards/`,
**When** migrated,
**Then** projection logic resides in `packages/modules/reporting/src/admin/`,
**And** API routes are thin adapters only.

**AC6: Route flip + shim deletion**
**When** each migration is complete,
**Then** API routes are updated to import from the canonical package,
**And** any adapter shim in `apps/api/src/lib/` is IMMEDIATELY deleted (per extraction policy),
**And** `npm run typecheck -w @jurnapod/api` passes.

**AC7: No regression on existing report tests**
**Given** the existing integration test suite,
**When** all migrations are complete,
**Then** all reporting-related tests pass (AR aging, AP aging, trial balance, daily sales, admin dashboards),
**And** no test assertion changes are needed (only import path changes).

## Tasks / Subtasks

- [ ] Task 1: Audit existing code locations (AC: pre-migration)
  - [ ] 1.1 Map all functions in `apps/api/src/lib/reports.ts` to migration targets
  - [ ] 1.2 Map `report-context.ts` functions
  - [ ] 1.3 Map `report-error-handler.ts`
  - [ ] 1.4 Map `report-telemetry.ts`
  - [ ] 1.5 Map admin dashboard helpers in `apps/api/src/lib/admin-dashboards/`
  - [ ] 1.6 Document migration map in story completion notes
- [ ] Task 2: Migrate `reports.ts` → `packages/modules/reporting` (AC: 1, 6)
  - [ ] 2.1 Extract report generation functions to `packages/modules/reporting/src/reports/`
  - [ ] 2.2 Export from package `index.ts`
  - [ ] 2.3 Flip API routes to import from `@jurnapod/modules-reporting`
  - [ ] 2.4 Delete adapter shim in `apps/api/src/lib/reports.ts`
  - [ ] 2.5 Verify `npm run typecheck -w @jurnapod/api` passes
- [ ] Task 3: Migrate `report-context.ts` (AC: 2, 6)
  - [ ] 3.1 Extract to `packages/modules/reporting/src/context/`
  - [ ] 3.2 Flip consumers, delete shim
- [ ] Task 4: Migrate `report-error-handler.ts` (AC: 3, 6)
  - [ ] 4.1 Extract to `packages/modules/reporting/src/errors/`
  - [ ] 4.2 Flip consumers, delete shim
- [ ] Task 5: Migrate `report-telemetry.ts` → `packages/telemetry` (AC: 4, 6)
  - [ ] 5.1 Extract to `packages/telemetry/src/reporting/`
  - [ ] 5.2 Flip consumers, delete shim
- [ ] Task 6: Migrate admin dashboard helpers (AC: 5, 6)
  - [ ] 6.1 Extract to `packages/modules/reporting/src/admin/`
  - [ ] 6.2 Flip consumers, delete shims
- [ ] Task 7: Full regression test (AC: 7)
  - [ ] 7.1 Run all reporting integration tests
  - [ ] 7.2 Run full `test:integration` suite
  - [ ] 7.3 Verify `typecheck` and `lint` pass

## Files to Migrate

| Source (`apps/api/src/lib/`) | Target Package | Target Path |
|------------------------------|----------------|-------------|
| `reports.ts` | `packages/modules/reporting` | `src/reports/` |
| `report-context.ts` | `packages/modules/reporting` | `src/context/` |
| `report-error-handler.ts` | `packages/modules/reporting` | `src/errors/` |
| `report-telemetry.ts` | `packages/telemetry` | `src/reporting/` |
| `admin-dashboards/*` | `packages/modules/reporting` | `src/admin/` |

## Estimated Effort

3 days

## Risk Level

P1 — Route flipping can break consumers if not done correctly. Shim deletion must be immediate per policy.

## Dev Notes

### Extraction checklist (per policy)

- [ ] Identify all consumers of the code being extracted
- [ ] Establish canonical test fixtures if needed
- [ ] Flip routes to use package imports
- [ ] Verify all consumers updated to new import paths
- [ ] **Immediately delete adapter shim** in `apps/api/src/lib/{domain}/`
- [ ] Audit existing tests against new canonical patterns
- [ ] Run full test suite to verify no regressions
- [ ] `npm run build -w @jurnapod/<package>` before building/testing dependent apps

### Route pattern before/after

```typescript
// BEFORE (migration target — logic in lib)
import { getReceivablesAgeing } from "@/lib/reports";

// AFTER (thin adapter — logic in package)
import { getReceivablesAgeingReport } from "@jurnapod/modules-reporting";
```

### Build order

```bash
npm run build -w @jurnapod/modules-reporting
npm run build -w @jurnapod/telemetry
npm run build -w @jurnapod/api
npm test -w @jurnapod/api
```

## Dependencies

- Story 62.1–62.4 — projection accuracy and security validated before migration (ensures tests protect against regressions)
- `packages/modules/reporting` — target package must exist
- `packages/telemetry` — target package must exist

---

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
