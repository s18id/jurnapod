# Story 50.3: Posting Flow Integration Tests

> **HARD GATE (E49-A1):** Implementation of this story MUST NOT begin until:
> 1. The PR template at `.github/pull_request_template.md` is in place with second-pass review checklist
> 2. E49-A1 artifacts are reviewed and approved
>
> **Agent-safe language:** "MUST NOT begin implementation until..." — no ambiguity permitted.

**Status:** backlog

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