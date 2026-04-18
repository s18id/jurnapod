# Epic 32 Fixes & Post-Implementation Review

## Phase 1: Story Implementation Fixes

### Dev 1: Critical Fixes
- `apps/api/src/lib/fiscal-years.ts` (P2-001)
- `apps/api/src/lib/period-close-workspace.ts` (P2-005)
- `packages/modules/accounting/src/reconciliation/dashboard-service.ts` (P2-013)
- `packages/modules/accounting/src/trial-balance/service.ts` (P2-016)

### Dev 2: Important Fixes
- `apps/api/src/lib/fiscal-years.ts` (P2-003) ✅ DONE
- `apps/api/src/routes/admin-dashboards/` (P2-009) ✅ DONE - split into directory structure
- `apps/api/src/routes/accounts.ts` (P2-010) ✅ DONE
- `packages/modules/accounting/src/trial-balance/service.ts` (P2-015) ✅ DONE

### Dev 3: Minor Fixes
- `apps/api/src/lib/fiscal-years.ts` (P2-002, P2-004)
- `apps/api/src/lib/period-close-workspace.ts` (P2-006, P2-007)
- `apps/api/src/routes/admin-dashboards.ts` (P2-008)
- `apps/api/src/routes/accounts.ts` (P2-011)
- `apps/api/src/routes/audit.ts` (P2-012)
- `packages/modules/accounting/src/reconciliation/dashboard-service.ts` (P2-014)
- `packages/modules/platform/src/audit/period-transition.ts` (P2-017, P2-018)

## Phase 2: Post-Implementation Review Fixes (bmad-review)

### P0 Blockers
| ID | File | Issue | Fix |
|----|------|-------|-----|
| P0-001 | `fiscal-year/service.ts:886` | `executeCloseWithLocking` returned `context.requestedAtEpochMs.toString()` as `closeRequestId` — broke idempotency for callers retrying with same request ID | Thread actual `closeRequestId` parameter through call chain; return caller's ID in response |

### P1 Actionables
| ID | File | Issue | Fix |
|----|------|-------|-----|
| P1-001 | `fiscal-year/errors.ts` | 6 error classes missing `code` property for machine-readable API errors | Added `code` to: FiscalYearCodeExistsError, FiscalYearDateRangeError, FiscalYearOverlapError, FiscalYearOpenConflictError, FiscalYearNotOpenError, FiscalYearSelectionError |
| P1-002 | `fiscal-years.ts` (API adapter) | Lazy singleton `_serviceInstance` could bind to stale `getDb()` context across requests | Replaced with per-call `createFiscalYearService()` factory |

### P2 Follow-ups
| ID | File | Issue | Notes |
|----|------|-------|-------|
| P2-001 | `fiscal-year/service.ts` | Floating-point epsilon comparison `> 0.001` for monetary values | Tracked for future decimal precision hardening |
| P2-002 | `fiscal-year/service.ts` | Sign convention in closing entries not explicitly documented | Balance sign convention assumed consistent with AGENTS.md debit-positive rule |

## ADR-0014 Boundary Resolution

**Violation caught:** `fiscal-years.ts` (1317 lines) in `apps/api/src/lib/` — pure domain logic (CRUD, close procedure, closing entries, idempotency state machine).

**Resolution:** Extracted to `packages/modules/accounting/src/fiscal-year/` in commit `dc05502`.

See `epic-32-service-migration.md` for full migration record.

## Files Modified by Each Dev

### Dev 1: Critical Fixes
- `apps/api/src/lib/fiscal-years.ts` (P2-001)
- `apps/api/src/lib/period-close-workspace.ts` (P2-005)
- `packages/modules/accounting/src/reconciliation/dashboard-service.ts` (P2-013)
- `packages/modules/accounting/src/trial-balance/service.ts` (P2-016)

### Dev 2: Important Fixes
- `apps/api/src/lib/fiscal-years.ts` (P2-003) ✅ DONE
- `apps/api/src/routes/admin-dashboards/` (P2-009) ✅ DONE - split into directory structure
- `apps/api/src/routes/accounts.ts` (P2-010) ✅ DONE
- `packages/modules/accounting/src/trial-balance/service.ts` (P2-015) ✅ DONE

### Dev 3: Minor Fixes
- `apps/api/src/lib/fiscal-years.ts` (P2-002, P2-004)
- `apps/api/src/lib/period-close-workspace.ts` (P2-006, P2-007)
- `apps/api/src/routes/admin-dashboards.ts` (P2-008)
- `apps/api/src/routes/accounts.ts` (P2-011)
- `apps/api/src/routes/audit.ts` (P2-012)
- `packages/modules/accounting/src/reconciliation/dashboard-service.ts` (P2-014)
- `packages/modules/platform/src/audit/period-transition.ts` (P2-017, P2-018)

## Conflict Prevention

- Dev 1 modifies: fiscal-years.ts, period-close-workspace.ts, dashboard-service.ts, trial-balance/service.ts
- Dev 2 modifies: fiscal-years.ts (different section), admin-dashboards.ts, accounts.ts, trial-balance/service.ts (different section)
- Dev 3 modifies: fiscal-years.ts (different section), period-close-workspace.ts, admin-dashboards.ts, accounts.ts, audit.ts, dashboard-service.ts (different section), period-transition.ts

All devs can work in parallel - no file conflicts expected.
