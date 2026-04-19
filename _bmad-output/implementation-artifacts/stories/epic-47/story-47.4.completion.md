# Story 47.4 — Completion Report

## Story
**AP Exception Worklist** — As a finance controller, I want a consolidated worklist of all AP reconciliation exceptions, so that I can prioritize and resolve discrepancies efficiently.

**Epic:** 47 (AP Reconciliation & Period Close Controls)
**Status:** Done
**Completed:** 2026-04-20

---

## What Was Built

### Service: `apps/api/src/lib/accounting/ap-exceptions.ts`
- **Detection sources:** AP↔GL variance, statement mismatch, disputed transaction, overdue invoice
- **Upsert logic:** Idempotent via `ON DUPLICATE KEY UPDATE` — refreshes dynamic fields for OPEN/ASSIGNED rows; keeps RESOLVED/DISMISSED immutable
- **Worklist:** Paginated, filterable by type/supplier/status/assignment/date-range
- **Assign:** Optimistic locking (expected status in WHERE + affected row check); validates user-company membership
- **Resolve:** Requires resolution note; optimistic locking; status transition enforcement
- **Detect-then-list:** AC8 entry point — runs full detection sweep then returns updated worklist

### Route: `apps/api/src/routes/accounting/ap-exceptions.ts`
- `GET /api/accounting/ap-exceptions/worklist` — OR ACL: `accounting.journals ANALYZE` OR `purchasing.suppliers ANALYZE`
- `PUT /api/accounting/ap-exceptions/{id}/assign` — requires `accounting.journals UPDATE`
- `PUT /api/accounting/ap-exceptions/{id}/resolve` — requires `accounting.journals UPDATE`
- Registered in `app.ts` at `/api/accounting/ap-exceptions`

### Shared Contracts: `packages/shared/`
- `AP_EXCEPTION_TYPE` / `AP_EXCEPTION_STATUS` int-enum constants with bidirectional mappers
- `ApExceptionWorklistQuerySchema`, `ApExceptionAssignPayloadSchema`, `ApExceptionResolvePayloadSchema`, `ApExceptionResponseSchema` Zod schemas

### Test Fixture: `apps/api/src/lib/test-fixtures.ts`
- `createTestAPException` aligned to migration 0188 schema (`variance_amount`, `currency_code`, `exception_key`, `source_type`, `source_id`)

---

## Key Design Decisions

### 1. Int Enums Internally, String Labels on API
AP exception types and statuses are stored as TINYINT in the DB. The service maps to/from integer constants internally and string labels at the API boundary. No DB schema changes required.

### 2. OR ACL Policy via `requireAccessOr`
Standard `requireAccess` is single-check. A new `requireAccessOr` helper was composed from two `requireAccess` guards to satisfy the AC7 requirement that either `accounting.journals ANALYZE` OR `purchasing.suppliers ANALYZE` grants access.

### 3. SQL Alias Fix (P1 — Runtime Bug Caught by Review)
The overdue detection subquery exposed `total_paid`/`total_credited` as column names, but the outer SELECT referenced `paid_base`/`credited_base`. Fixed to match aliases.

### 4. Upsert Idempotency Fix (P1)
`ON DUPLICATE KEY UPDATE` was a no-op that left stale variance amounts on re-detection. Now explicitly refreshes `variance_amount`, `currency_code`, `exception_key`, `detected_at` for OPEN/ASSIGNED rows on duplicate key.

### 5. Optimistic Locking for State Transitions (P1)
`assignException` and `resolveException` now include `WHERE status = expectedStatus` and verify `affectedRows === 1` before returning. Prevents race conditions from concurrent assign/resolve calls.

### 6. System Role Protection in Tests
Tests were initially using `allowSystemRoleMutation: true` on `OWNER` — a P0 policy violation. Fixed by using `getTestAccessToken` for role creation API and attaching custom workflow roles to the owner user.

---

## Test Results

```
apps/api/__test__/integration/accounting/ap-exceptions.test.ts
  ✓ 11 tests passed

Typecheck: apps/api  — pass
Shared build: packages/shared  — pass
```

**Test coverage:**
- ACL: GET worklist OR policy (accounting ANALYZE ✓, purchasing ANALYZE ✓, neither → 403 ✓)
- ACL: PUT assign/resolve require accounting UPDATE (purchasing ANALYZE → 403 ✓)
- Tenant isolation: company B cannot see company A exceptions ✓
- Assignment: self-assign, assign to other user, idempotency ✓
- Resolution: requires note, concurrent resolution rejection ✓
- Detection: AP↔GL variance, statement mismatch, overdue ✓
- AC8 detect-then-list: creates variance + returns worklist in one call ✓

---

## Review Gate

**`@bmad-review` conducted:** No P0/P1 blockers found.

---

## Files Created / Modified

| File | Action |
|------|--------|
| `apps/api/src/lib/accounting/ap-exceptions.ts` | Created |
| `apps/api/src/routes/accounting/ap-exceptions.ts` | Created |
| `apps/api/src/app.ts` | Modified (route registration) |
| `apps/api/src/lib/test-fixtures.ts` | Modified (add `createTestAPException`) |
| `packages/shared/src/constants/purchasing.ts` | Modified (add AP exception constants/mappers) |
| `packages/shared/src/schemas/purchasing.ts` | Modified (add AP exception Zod schemas) |
| `packages/shared/src/index.ts` | Modified (exports) |
| `apps/api/__test__/integration/accounting/ap-exceptions.test.ts` | Created |

---

## Remaining Epic 47 Stories

```
47-5-period-close-guardrails-ap:          backlog
47-6-reconciliation-snapshot-audit-trail: backlog
```
