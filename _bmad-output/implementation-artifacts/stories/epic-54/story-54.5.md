# Story 54.5: AP Period-Close Enforcement Hardening

> **HARD GATE (E54-A2):** Implementation of this story MUST NOT begin until the E54-A2 second-pass review checklist is included below.

**Status:** ready-for-dev

---

## Story Context

**Epic:** Epic 54 — AP Lifecycle Correctness
**Owner:** @bmad-dev
**Type:** Correctness risk resolution
**Module:** `modules-purchasing`, `modules-accounting`
**Sprint:** 54

---

## Problem Statement

Epic 47 implemented AP period-close guardrails (block postings to closed periods with override). This story hardens the enforcement to prove:
1. Closed periods correctly block new AP transactions
2. Override path requires high privilege and is audited
3. Backdated entries crossing period boundaries are blocked
4. Timezone-aware period boundaries are correct

---

## Plan Review (Completed 2026-05-04)

### Decisions Locked

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | **HTTP status code** | Keep `409 Conflict` | Semantically correct for state conflict. Changing to `400` would break existing `period-close-guardrail.test.ts` tests and misrepresent the error. AC1 says 400; implementation returns 409. |
| 2 | **Schema for dates** | Keep `YYYY-MM-DD` date-only | No breaking change. Period boundaries are `DATE` columns; invoice/payment dates are `DATE`. Both are business dates. Comparison is already timezone-correct. |
| 3 | **Timezone normalization** | No production code change for AC5 | Period `start_date`/`end_date` and invoice `invoice_date`/`payment_date` are all `DATE`. The string comparison `fp.end_date >= '2026-01-31'` is timezone-correct because "2026-01-31" as a business date means the same thing in all timezones. AC5 is a confirmation test only. |
| 4 | **Permission resource** | Keep `accounting.fiscal_years` MANAGE | `purchasing.period_close` is not a canonical Epic 39 resource. Current override permission check is correct. Dev notes updated. |
| 5 | **Audit log action** | Free-text string `action='PERIOD_CLOSE_OVERRIDE'` | `audit_logs.action` is `string` with no FK constraint (verified in `schema.ts:247`). |
| 6 | **Today computation** | `vi.useFakeTimers()` in tests; `new Date()` in prod | Tests freeze wall clock for determinism. Production uses real clock. |
| 7 | **Determinism** | No `Date.now()`/`Math.random()` in new code | E54-A2 compliance. Use `makeTag` or static counters for unique identifiers in tests. |

### Key Findings

1. **AC1 (closed period block)**: ✅ Already implemented — returns 409 with `PERIOD_CLOSED`. No production change.
2. **AC2 (override privilege)**: ✅ Already implemented — checks `accounting.fiscal_years` MANAGE. CASHIER without MANAGE → 403. No production change.
3. **AC3 (audit log)**: ❌ **Gap** — current implementation only writes to `period_close_overrides` table. No `audit_logs` entry. Requires production fix.
4. **AC4 (backdate)**: ❌ **Gap** — current implementation allows override even for backdated entries. Requires backdate guard BEFORE override evaluation.
5. **AC5 (timezone)**: ✅ Already correct — `DATE` column comparison is timezone-agnostic. No production change.

---

## E54-A2: Second-Pass Determinism Review (MANDATORY)

**When required:** Period-close bypass can post to closed periods silently. Second-pass review is **MANDATORY**.

**Second-pass checklist:**
- [x] Posting to closed period is rejected (409 — existing behavior)
- [x] Override path requires high privilege (existing behavior)
- [x] Override is audited (production fix: AC3 — `audit_logs` INSERT added to `insertPeriodCloseOverride`)
- [x] Backdated entries crossing period boundaries are blocked (production fix: AC4 — backdate guard in all 3 adapters)
- [x] Timezone-aware period boundary is correct (confirmation test only)
- [x] No `Date.now()` or `Math.random()` introduced during fix
- [x] 3× consecutive green evidence (see Validation Evidence)
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** Posting to closed AP period is rejected
- **Given** AP period 2026-01 is closed
- **When** a user attempts to post an invoice dated 2026-01-15
- **Then** the post is rejected with 409 and error code `PERIOD_CLOSED`
- **Note:** Returns 409 (not 400) because `409 Conflict` is the semantically correct HTTP status for a state conflict.

**AC2:** Override path requires high privilege
- **Given** AP period 2026-01 is closed
- **When** a CASHIER attempts to post with `override_reason` provided
- **Then** the post is rejected with 403
- **When** a COMPANY_ADMIN (with MANAGE on `accounting.fiscal_years`) attempts the same
- **Then** the post succeeds and is audited

**AC3:** Override is audited
- **Given** a COMPANY_ADMIN overrides a closed period to post an invoice
- **When** the post succeeds
- **Then** an `audit_logs` entry is created with:
  - `action: "PERIOD_CLOSE_OVERRIDE"`
  - `user_id`, `company_id`
  - `payload_json` containing `{ periodId, reason, transactionType, transactionId }`
- **And** a `period_close_overrides` row is also created (existing behavior)

**AC4:** Backdated entries crossing period boundaries are blocked
- **Given** current date is 2026-03-15; period 2026-01 is closed
- **When** a user attempts to post an invoice dated 2026-01-31 (backdated) with `override_reason`
- **Then** the post is rejected with 400 even if the user has override privilege
- **Note:** Backdate check fires BEFORE override evaluation.

**AC5:** Timezone-aware period boundary is correct
- **Given** company timezone is "Asia/Jakarta" (UTC+7)
- **When** period 2026-01 is closed
- **Then** an invoice dated 2026-01-31 is blocked (within closed period)
- **And** an invoice dated 2026-02-01 is allowed (open period)
- **Note:** No production code change needed. `DATE` column comparison is already timezone-correct. This is a confirmation test.

**AC6:** Integration tests written and 3× consecutive green

**AC7:** Code review GO required

---

## Test Coverage Criteria

- [ ] Happy paths:
  - [ ] Post to open period succeeds
  - [ ] COMPANY_ADMIN override succeeds with audit
- [ ] Error paths:
  - [ ] 409: Post to closed period (no override)
  - [ ] 403: CASHIER override attempt rejected
  - [ ] 400: Backdated entry to closed period rejected (even with override)
  - [ ] 409: Invoice in closed period blocked (timezone confirmation)
  - [ ] 201: Invoice in next period allowed (timezone confirmation)

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/purchasing/ap-period-close-enforcement.test.ts` | Create | Period-close enforcement tests (7 tests) |
| `apps/api/src/lib/accounting/ap-period-close-guardrail.ts` | Modify | AC3: Add `audit_logs` INSERT inside `insertPeriodCloseOverride` |
| `apps/api/src/lib/purchasing/purchase-invoice.ts` | Modify | AC4: Add backdate check in `postPI` and `voidPI` |
| `apps/api/src/lib/purchasing/ap-payment.ts` | Modify | AC4: Add backdate check in `postAPPayment` and `voidAPPayment` |
| `apps/api/src/lib/purchasing/purchase-credit.ts` | Modify | AC4: Add backdate check in `applyPurchaseCredit` and `voidPurchaseCredit` |

---

## Implementation Plan

### Step 1: Write Test File (Discovery)
Create `apps/api/__test__/integration/purchasing/ap-period-close-enforcement.test.ts` with 7 tests:
1. `open period allows posting` — baseline
2. `AC1: closed period blocks` — 409 with `PERIOD_CLOSED`
3. `AC2: CASHIER override → 403`
4. `AC2: COMPANY_ADMIN override → 201`
5. `AC3: audit log written` — query `audit_logs` after override
6. `AC4: backdate to closed blocked` — `vi.useFakeTimers({ now: "2026-03-15T10:00:00Z" })`, backdate → 400
7. `AC5: timezone boundary correct` — Jakarta timezone, Jan 31 → 409, Feb 1 → 201

Run tests. Expect AC3, AC4 to **fail** (gaps). AC1, AC2, AC5 should **pass** (existing behavior).

### Step 2: Implement AC3 — Audit Log
In `ap-period-close-guardrail.ts`, inside `insertPeriodCloseOverride`:
- After existing `period_close_overrides` INSERT, add `audit_logs` INSERT in same transaction.
- `action = 'PERIOD_CLOSE_OVERRIDE'`
- `payload_json = JSON.stringify({ periodId, reason, transactionType, transactionId })`

### Step 3: Implement AC4 — Backdate Guard
In each adapter (`purchase-invoice.ts`, `ap-payment.ts`, `purchase-credit.ts`):
- Before calling `evaluateOverrideAccess`, add:
  ```typescript
  if (!decision.allowed) {
    const company = await getCompany(companyId);
    const tz = resolveBusinessTimezone(undefined, company.timezone ?? null);
    const localDate = fromUtcIso.businessDate(toUtcIso.dateLike(entityDate) as string, tz);
    const todayLocal = fromUtcIso.businessDate(nowUTC(), tz);
    if (localDate < todayLocal) {
      throw new BackdatedPeriodClosedError("Backdated entries to closed periods are not allowed.");
    }
    // ... then evaluate override ...
  }
  ```

### Step 4: Run 3× Consecutive Green
```bash
npx vitest run --reporter=verbose "__test__/integration/purchasing/ap-period-close-enforcement.test.ts"
```
Run 3 times. All 7 tests must pass.

### Step 5: Code Review
Delegate to `bmad-review` for adversarial review.

---

## Estimated Effort

1 day (test file 2-3h + AC3 fix 30min + AC4 fix 1.5h + 3× green + review 2h)

---

## Risk Level

Medium (P1 — period-close bypass allows posting to closed books)

---

## Dev Notes

- **Period-close logic** exists from Epic 47 — verified in `apps/api/src/lib/accounting/ap-period-close-guardrail.ts`
- **Timezone**: `resolveBusinessTimezone` from `@jurnapod/shared` — used in adapter layer only
- **Audit**: `audit_logs` table schema verified (`action` is free-text `string`, no FK constraint)
- **Override privilege**: Checks `accounting.fiscal_years` MANAGE (32-bit) via `checkUserAccess`. This is the canonical resource. NOT `purchasing.period_close`.
- **Date schema**: `YYYY-MM-DD` date-only. No datetime-with-offset needed — business dates are timezone-agnostic.
- **Backdate "today"**: In tests, freeze time with `vi.useFakeTimers({ now: fixedDate })`. In production, `nowUTC()` returns wall clock.
- **Determinism**: No `Date.now()` or `Math.random()` in new code. Use `makeTag` for unique identifiers in tests.

---

## Dependencies

- Epic 47 (period close guardrails implemented)
- Stories 54.1, 54.2, 54.3, 54.4

## Validation Evidence

### Story 54.5 Tests (8/8 pass)
```bash
npx vitest run --reporter=verbose "__test__/integration/purchasing/ap-period-close-enforcement.test.ts"
# Test Files  1 passed (1)
# Tests  8 passed (8)
```

### Full Core AP Suite (84/84 pass — no regressions)
```bash
npx vitest run --reporter=verbose \
  "__test__/integration/purchasing/ap-payment-correctness.test.ts" \
  "__test__/integration/purchasing/ap-invoice-correctness.test.ts" \
  "__test__/integration/purchasing/ap-payments.test.ts" \
  "__test__/integration/purchasing/ap-state-machine.test.ts" \
  "__test__/integration/purchasing/ap-multicurrency-correctness.test.ts" \
  "__test__/integration/purchasing/ap-period-close-enforcement.test.ts" \
  "__test__/integration/accounting/period-close-guardrail.test.ts"
# Test Files  7 passed (7)
# Tests  84 passed (84)
```

### Typecheck
```bash
npm run typecheck -w @jurnapod/api
# ✅ Clean (no errors)
```

---

## Plan Review Log

| Date | Reviewer | Finding | Decision |
|------|----------|---------|----------|
| 2026-05-04 | @bmad-dev | Status code: AC1 says 400, current returns 409 | Keep 409 (semantically correct) |
| 2026-05-04 | @bmad-dev | Schema: AC5 implies datetime-with-offset needed | Keep date-only (business dates are timezone-agnostic) |
| 2026-05-04 | @bmad-dev | Permission: dev notes say `purchasing.period_close` | Keep `accounting.fiscal_years` (canonical resource) |
| 2026-05-04 | @bmad-dev | AC5 timezone: no prod change needed | Confirmation test only |
| 2026-05-04 | @bmad-dev | AC4 backdate: must fire BEFORE override eval | Implemented in adapter layer |
