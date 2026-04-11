# Epic 32 Service Migration: API lib → Packages

## Objective

Move Epic 32 services from `apps/api/src/lib/` to proper packages per ADR-0014.

## Target Locations

| Service | From | To |
|---------|------|-----|
| ReconciliationDashboardService | `apps/api/src/lib/reconciliation-dashboard.ts` | `modules-accounting/src/reconciliation/dashboard-service.ts` |
| TrialBalanceService | `apps/api/src/lib/trial-balance-service.ts` | `modules-accounting/src/trial-balance/service.ts` |
| PeriodTransitionAudit | `apps/api/src/lib/period-transition-audit.ts` | `modules-platform/src/audit/period-transition.ts` |
| FiscalYearService | `apps/api/src/lib/fiscal-years.ts` | `modules-accounting/src/fiscal-year/service.ts` |

## DB Access Pattern

- Packages use `@jurnapod/db` directly (NOT `apps/api/src/lib/db`)
- Services receive `db: KyselySchema` via constructor injection
- API passes db instance when calling package services

## Migration Steps (Per Service)

1. Create new file in package
2. Change import: `../lib/db.js` → `@jurnapod/db`
3. Export from package's `index.ts`
4. Update API route to import from package
5. Delete old file (adapter shim)
6. Run typecheck + build

---

## Phase 1: Reconciliation + Trial Balance + Audit (Stories 32.2–32.4)

### ReconciliationDashboardService ✅
- Created: `packages/modules/accounting/src/reconciliation/dashboard-service.ts`
- Updated: `packages/modules/accounting/src/reconciliation/index.ts` (added re-exports)
- Updated: `packages/modules/accounting/src/index.ts` (already had reconciliation export)
- Updated: `packages/modules/accounting/package.json` (added export path)
- Updated: `apps/api/src/routes/admin-dashboards.ts` (import from package)
- Deleted: `apps/api/src/lib/reconciliation-dashboard.ts`
- Deleted: `apps/api/src/lib/reconciliation-dashboard.test.ts`
- Renamed `GlImbalanceResult` to avoid conflict with journals-service

### TrialBalanceService ✅
- Created: `packages/modules/accounting/src/trial-balance/service.ts`
- Created: `packages/modules/accounting/src/trial-balance/index.ts`
- Updated: `packages/modules/accounting/src/index.ts` (added trial-balance export)
- Updated: `packages/modules/accounting/package.json` (added export path)
- Updated: `apps/api/src/routes/admin-dashboards.ts` (import from package)
- Deleted: `apps/api/src/lib/trial-balance-service.ts`
- Deleted: `apps/api/src/lib/trial-balance-service.test.ts`
- Renamed `GlImbalanceResult` to `TrialBalanceGlImbalanceResult` to avoid conflict

### PeriodTransitionAudit ✅
- Created: `packages/modules/platform/src/audit/period-transition.ts`
- Updated: `packages/modules/platform/src/audit/index.ts` (added export)
- Updated: `packages/modules/platform/package.json` (added export path `./audit/period-transition`)
- Updated: `apps/api/src/routes/audit.ts` (import from package)
- Updated: `apps/api/tests/integration/period-transition-audit.integration.test.mjs` (use new service class)
- Deleted: `apps/api/src/lib/period-transition-audit.ts`
- Converted standalone functions to class-based `PeriodTransitionAuditService` with constructor injection

---

## Phase 2: Fiscal Year Extraction (Post-Story, dc05502)

**Discovered during post-implementation review.** `fiscal-years.ts` (1317 lines) was identified as an ADR-0014 boundary violation — pure domain logic in API lib.

### What was moved

| File | Purpose |
|------|---------|
| `packages/modules/accounting/src/fiscal-year/errors.ts` | All domain errors (12 classes, all with `code` properties) |
| `packages/modules/accounting/src/fiscal-year/types.ts` | Domain types: `CloseFiscalYearContext`, `CloseFiscalYearResult`, `ClosePreviewResult`, `FiscalYearStatusResult`, `ClosingEntryLine`, `FISCAL_YEAR_CLOSE_STATUS` |
| `packages/modules/accounting/src/fiscal-year/service.ts` | `FiscalYearService` class — CRUD, close procedure, idempotency, closing entries |
| `packages/modules/accounting/src/fiscal-year/index.ts` | Public re-exports |

### API adapter (thin, stays in API)

`apps/api/src/lib/fiscal-years.ts` converted to:
- Re-exports errors/types from `@jurnapod/modules-accounting/fiscal-year`
- Per-call factory `createFiscalYearService()` wrapping package service
- **No domain logic** — purely adapter/wiring layer

### Period close workspace (refactored)

`apps/api/src/lib/period-close-workspace.ts` updated to:
- Import `FiscalYearService` from `@jurnapod/modules-accounting/fiscal-year`
- Create its own service instance (no longer calls local lib for fiscal-year domain logic)
- Remains in API as a **composition layer** (orchestrates 4 package services)

### Post-extraction review fixes (dc05502)

| Issue | Severity | Fix |
|-------|----------|-----|
| `executeCloseWithLocking` returned wrong `closeRequestId` | P0 | Thread caller-provided `closeRequestId` through return value |
| Missing error codes | P1 | Added `code` to 6 remaining error classes |
| Adapter singleton risk | P1 | Replaced lazy singleton with per-call factory |

---

## Validation

After all migrations:
- `npm run build -w @jurnapod/modules-accounting` passes ✅
- `npm run build -w @jurnapod/modules-platform` passes ✅
- `npm run typecheck -w @jurnapod/api` passes ✅
- `npm run build -w @jurnapod/api` passes ✅
