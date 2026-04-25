# Story 50.3: Posting Flow Integration Tests

> **HARD GATE (E49-A1):** Implementation of this story MUST NOT begin until:
> 1. The PR template at `.github/pull_request_template.md` is in place with second-pass review checklist
> 2. E49-A1 artifacts are reviewed and approved
>
> **Agent-safe language:** "MUST NOT begin implementation until..." — no ambiguity permitted.

**Status:** done

---

## Story Context

**Epic:** Epic 50 — Ledger Correctness Hardening
**Owner:** @bmad-dev
**Type:** Test coverage + correctness verification
**Module:** `modules-accounting`
**Sprint:** 50 (2026-04-27 to 2026-05-08)

---

## Problem Statement

Zero integration tests exist for posting flows. Only unit tests exist for `PostingService`. This is a P1 correctness gap — we cannot prove posting correctness without integration tests.

---

## E49-A1: Second-Pass Determinism Review (MANDATORY)

> **RFC Mandate:** Post-review fixes were needed in 3/7 Epic 49 stories. Self-review alone misses patterns in deterministic hardening work. Second-pass review is **MANDATORY** for new test suite creation because:
> - Epic 49 had post-review catches in 49.2 (`trial-balance.test.ts` line 75), 49.4, 49.5
> - New test suites must be deterministic from the start, not fixed after review
> - Story 50.3 explicitly addresses the gap of "zero integration tests for posting flows" — tests must be correct, not just present

**When required:** This story creates 5 new integration test suites. Second-pass review is **MANDATORY** for every suite because these are correctness-critical tests.

**Second-pass reviewer:** Charlie (Senior Dev) or designated second-pass reviewer

**Second-pass checklist (per suite):**
- [ ] `sales-invoice-posting.test.ts`: deterministic fixtures, no `Date.now()`/`Math.random()`, balanced assertion verified
- [ ] `sales-payment-posting.test.ts`: deterministic fixtures, no `Date.now()`/`Math.random()`, variance handling verified
- [ ] `void-credit-note-posting.test.ts`: deterministic fixtures, no `Date.now()`/`Math.random()`, reversal batch immutability verified
- [ ] `journal-immutability.test.ts`: deterministic fixtures, no `Date.now()`/`Math.random()`, no UPDATE path verified
- [ ] `cogs-posting.test.ts`: deterministic fixtures, no `Date.now()`/`Math.random()`, balanced journal verified
- [ ] All suites 3× consecutive green evidence attached
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** `sales-invoice-posting.test.ts` — invoice → journal flow, balanced, correct account mappings

**AC2:** `sales-payment-posting.test.ts` — payment posting flow, variance handling, imbalance error

**AC3:** `void-credit-note-posting.test.ts` — reversal batch created, original batch untouched

**AC4:** `journal-immutability.test.ts` — no UPDATE path; corrections go through reversal batches only

**AC5:** `cogs-posting.test.ts` — COGS posting with average cost, balanced journal

**AC6:** All suites 3× consecutive green (determinism evidence)

---

## Test Location

All tests go in: `packages/modules/accounting/__test__/integration/posting/`

---

## Exit Criteria

- All 5 test suites written and passing
- 3× consecutive green on all suites:
  ```bash
  npm run test:single -- "packages/modules/accounting/__test__/integration/posting/sales-invoice-posting.test.ts" -w @jurnapod/modules-accounting
  npm run test:single -- "packages/modules/accounting/__test__/integration/posting/sales-payment-posting.test.ts" -w @jurnapod/modules-accounting
  npm run test:single -- "packages/modules/accounting/__test__/integration/posting/void-credit-note-posting.test.ts" -w @jurnapod/modules-accounting
  npm run test:single -- "packages/modules/accounting/__test__/integration/posting/journal-immutability.test.ts" -w @jurnapod/modules-accounting
  npm run test:single -- "packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts" -w @jurnapod/modules-accounting
  ```

---

## Appendix: Cross-Story Traceability (E50-A4)

> **Append-only section — do not modify existing ACs above.**

### Relationship to Story 50.5 (FX Acknowledgment)

Story 50.5 (`story-50.5.md`) implements Sales AR FX Acknowledgment. Story 50.3 test suites MUST account for the following FX-related posting behavior once Story 50.5 is implemented:

| Scenario | Expected Behavior | Story 50.3 Coverage |
|----------|-------------------|---------------------|
| Payment with `payment_delta_idr != 0` and no `fx_acknowledged_at` | 422 `fx_delta_requires_acknowledgment` | `sales-payment-posting.test.ts` MUST verify this guard is exercised |
| Payment with `payment_delta_idr == 0` | Posts without FX ack requirement | `sales-payment-posting.test.ts` MUST verify zero-delta path |
| FX delta journal posting | Debit/credit to `fx_gain_loss` account | `sales-payment-posting.test.ts` MUST verify FX journal entry created |

### Test Behavior During FX Implementation Window

During the window where Story 50.5 is not yet complete:
- Payment posting tests with non-zero delta MAY fail with 422 `fx_delta_requires_acknowledgment` if `fx_acknowledged_at` is not set
- This is **expected behavior** — tests should be written to explicitly acknowledge and set `fx_acknowledged_at` before posting when delta != 0
- Zero-delta payments MUST post without FX ack regardless of Story 50.5 status

### Traceability Matrix

| Story 50.5 AC | Story 50.3 Test Suite | Verification Method |
|---------------|----------------------|----------------------|
| AC1: reject non-zero delta without FX marker | `sales-payment-posting.test.ts` | 422 on POST without ack when delta != 0 |
| AC3: zero-delta path posts without marker | `sales-payment-posting.test.ts` | 200 on POST without ack when delta == 0 |
| AC8: FX delta journal posting | `sales-payment-posting.test.ts` | Journal entry verified in posting transaction |
