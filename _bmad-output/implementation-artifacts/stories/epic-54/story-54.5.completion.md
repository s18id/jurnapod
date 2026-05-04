# Story 54.5 Completion Report

**Story:** AP Period-Close Enforcement Hardening  
**Epic:** Epic 54 — AP Lifecycle Correctness  
**Status:** ✅ DONE  
**Completed:** 2026-05-04

---

## Summary

Hardened AP period-close enforcement by closing two correctness gaps identified in Epic 47:
1. **AC3 (Audit)**: Override entries into closed periods now write an `audit_logs` row in addition to the existing `period_close_overrides` row.
2. **AC4 (Backdate Guard)**: Backdated entries (closed period end_date < today) are now blocked even when the user has MANAGE privilege and provides an override reason.

All changes are in the adapter layer (`apps/api/src/lib/purchasing/`) and service layer (`packages/modules/purchasing/src/services/`). Eight new integration tests validate the behavior, and the full core AP suite (84 tests) passes with no regressions.

---

## Files Created/Modified

### Created
| File | Description |
|------|-------------|
| `apps/api/__test__/integration/purchasing/ap-period-close-enforcement.test.ts` | 8 integration tests covering AC1–AC5 |

### Modified
| File | Changes |
|------|---------|
| `apps/api/src/lib/purchasing/purchase-invoice.ts` | AC4 backdate guard in `postPI`; `PINotFoundError` fix in `postPI`/`voidPI` |
| `apps/api/src/lib/purchasing/ap-payment.ts` | AC4 backdate guard in `postAPPayment`/`voidAPPayment` |
| `apps/api/src/lib/purchasing/purchase-credit.ts` | AC4 backdate guard in `applyPurchaseCredit`/`voidPurchaseCredit` |
| `packages/modules/purchasing/src/services/purchase-invoice-service.ts` | AC3 audit log INSERT in local `insertPeriodCloseOverride` |
| `packages/modules/purchasing/src/services/ap-payment-service.ts` | AC3 audit log INSERT in local `insertPeriodCloseOverride` |
| `packages/modules/purchasing/src/services/purchase-credit-service.ts` | AC3 audit log INSERT in local `insertPeriodCloseOverride` |
| `apps/api/__test__/integration/accounting/period-close-guardrail.test.ts` | Fixed 3 pre-existing test bugs: added POST step, future-closed periods, `PINotFoundError` |
| `_bmad-output/implementation-artifacts/stories/epic-54/story-54.5.md` | Updated with validation evidence and E54-A2 checklist |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Posting to closed AP period rejected with 409 | ✅ Complete (existing behavior) |
| AC2 | Override path requires MANAGE on `accounting.fiscal_years` | ✅ Complete (existing behavior) |
| AC3 | Override audited in `audit_logs` + `period_close_overrides` | ✅ Complete |
| AC4 | Backdated entries blocked even with MANAGE + override | ✅ Complete |
| AC5 | Timezone-aware period boundary correct | ✅ Complete (confirmation test) |
| AC6 | Integration tests written and 3× consecutive green | ✅ Complete |
| AC7 | Code review GO required | ✅ Complete |

---

## Key Features Implemented

### AC3 — Audit Log on Override
- Added `audit_logs` INSERT inside `insertPeriodCloseOverride` in all three AP service files
- `action = 'PERIOD_CLOSE_OVERRIDE'`
- `payload_json` contains `{ periodId, reason, transactionType, transactionId }`
- Written in the same DB transaction as `period_close_overrides` INSERT

### AC4 — Backdate Guard
- Added backdate check BEFORE override evaluation in 6 adapter functions:
  - `postPI`, `voidPI` (purchase-invoice.ts)
  - `postAPPayment`, `voidAPPayment` (ap-payment.ts)
  - `applyPurchaseCredit`, `voidPurchaseCredit` (purchase-credit.ts)
- Logic: if closed period found and `period.end_date < todayLocal` → throw `PERIOD_CLOSED` (409)
- `todayLocal` computed via `Temporal.Now.plainDateISO(tz)` with company timezone resolution

### Pre-existing Bug Fixes (Cleanup)
- `postPI`/`voidPI` now throw `PINotFoundError` instead of generic `Error` → route returns 404 (not 500) for missing invoices
- Story 47.5 test `c)` fixed: added POST step before checking override row
- Story 47.5 tests `e)` and `f)` fixed: use future closed period (2099) to avoid AC4 backdate guard

---

## Technical Implementation

### Data Flow
```
POST /api/purchasing/invoices/:id/post
  → adapter: postPI()
    → fetch invoice date
    → checkPeriodCloseGuardrail(companyId, invoiceDate)
    → AC4: if closed period found && period.end_date < todayLocal
      → throw PERIOD_CLOSED (409)
    → if overrideRequired
      → evaluateOverrideAccess(auth, overrideReason, decision)
      → if allowed
        → service.postPI({ guardrailDecision, validOverrideReason })
          → trx: update invoice status → POSTED
          → trx: insertPeriodCloseOverride() → writes period_close_overrides + audit_logs
          → return { batchId }
```

### API Endpoints Affected
- `POST /api/purchasing/invoices/:id/post` — AC4 backdate guard added
- `POST /api/purchasing/invoices/:id/void` — AC4 backdate guard added + PINotFoundError fix
- `POST /api/purchasing/payments/:id/post` — AC4 backdate guard added
- `POST /api/purchasing/payments/:id/void` — AC4 backdate guard added
- `POST /api/purchasing/credits/:id/apply` — AC4 backdate guard added
- `POST /api/purchasing/credits/:id/void` — AC4 backdate guard added

### Security
- Backdate guard fires BEFORE override evaluation → prevents privilege escalation via override
- Audit log captures user, company, period, reason, and transaction reference
- No change to ACL model — still uses `accounting.fiscal_years` MANAGE (canonical Epic 39 resource)

---

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes (`npm run typecheck -w @jurnapod/api`) |
| Build | ✅ Successful (`npm run build -w @jurnapod/api`) |
| Tests — Story 54.5 | ✅ 8/8 pass |
| Tests — Full AP Suite | ✅ 84/84 pass (7 files, no regressions) |
| Story 47.5 Tests | ✅ 16/16 pass (fixed 3 pre-existing failures) |
| Determinism | ✅ No `Date.now()`/`Math.random()` in new test code |

---

## Test Evidence

### Story 54.5 Tests
```bash
npx vitest run --reporter=verbose "__test__/integration/purchasing/ap-period-close-enforcement.test.ts"
# Test Files  1 passed (1)
# Tests  8 passed (8)
```

### Full Core AP Suite
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

---

## Code Review Findings & Resolution

**Reviewer:** @bmad-review  
**Date:** 2026-05-04  
**Verdict:** ✅ GO — all P1/P2 items resolved

### P1 Findings (Resolved)
| ID | Finding | Resolution |
|----|---------|------------|
| P1-1 | AC4 backdate guard missing from `voidPI` | ✅ Added identical guard to `voidPI` (purchase-invoice.ts) |
| P1-2 | No test coverage for AC4 on void paths | ✅ Added test: "AC4: backdated void to closed period blocked even with override" |

### P2 Findings (Resolved)
| ID | Finding | Resolution |
|----|---------|------------|
| P2-4 | `GuardrailDecision` reconstructed partially in ap-payment.ts / purchase-credit.ts | ✅ Refactored to pass full `decision` object in all 4 adapter functions |
| P2-3 | `insertPeriodCloseOverride` duplicated across 3 service files | 📝 Action item: extract to shared utility in follow-up |
| P2-5 | No audit log verification for void override path | 📝 Action item: add void audit log test in follow-up |
| P2-6 | Pre-existing `Date.now()` in Story 47.5 tests | 📝 Action item: convert to `makeTag()` in follow-up |

### P3 Findings (Accepted / Deferred)
| ID | Finding | Rationale |
|----|---------|-----------|
| P3-7 | AC4 check outside posting transaction (TOCTOU) | Low risk — period `end_date` is immutable; status re-check inside tx catches changes |
| P3-8 | Generic `Error` in `createDraftPI` guardrail path | Pre-existing pattern; functional behavior identical |
| P3-9 | `decision.periodId` truthiness check | ✅ Fixed — all 6 locations now use `decision.periodId !== null && decision.periodId > 0` |

---

## Reviewer Sign-off

| Reviewer | Date | Verdict |
|----------|------|---------|
| @bmad-review | 2026-05-04 | ✅ GO — no blockers |

---

## Dev Notes

- **Cleanup policy**: Fixed 3 pre-existing test bugs in `period-close-guardrail.test.ts` as part of active sprint cleanup (outdated tests made unreachable by AC4)
- **Fixture mode**: Full fixture mode — all test setup uses canonical production helpers (`createTestFiscalYear`, `createTestFiscalPeriod`, `createTestSupplier`, etc.)
- **Backdate definition**: A transaction is "backdated" when its closed fiscal period's `end_date` is strictly before `todayLocal` (resolved via company timezone). This prevents posting to old closed books even with override privilege.
- **Audit payload**: `audit_logs.payload_json` is a JSON string (not a JSON object column). `JSON.stringify()` is used at insert time.
