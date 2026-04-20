# Story 48.2: Financial Correctness Hardening Pack

**Status:** done

## Story

As a **platform engineer**,
I want to harden the most critical financial correctness paths around period-close, snapshot, and reconciliation,
So that no duplicate or incorrect financial effects can occur during concurrent close/approve/override operations.

---

## Context

Story 48.2 is the highest-priority story in Sprint 48 (P0/P1). It targets the financial correctness edge cases identified in the Epic 48 risk register:
- Period-close and snapshot paths may have race conditions under concurrent access
- Replay safety around close/approve/override needs concurrency tests
- Regression tests must prove no duplicate financial effects

**Dependencies:** Story 48.1 (risk register and baseline) must be done.

---

## Acceptance Criteria

**AC1: Period-Close Concurrency Tests**
Integration tests verify that concurrent period-close requests do not produce duplicate close effects or incorrect state transitions. Tests use deterministic concurrency patterns (parallel requests, retry sequences).

**AC2: Snapshot Correctness Tests**
Integration tests verify snapshot immutability — no UPDATE/DELETE on reconciliation snapshots is possible via any API path.

**AC3: Reconciliation Replay Safety**
Integration tests verify that replayed reconciliation runs (same input, same date) produce idempotent results without creating duplicate journal entries or balances.

**AC4: No Duplicate Financial Effects**
For each correctness test, assertions verify that the financial effect (journal balance, account balance) is exactly what is expected — not doubled or missing.

**AC5: Evidence Attached**
Test run logs are captured and referenced in the sprint status update.

---

## Dev Notes

- Critical test files: `__test__/integration/accounting/period-close-guardrail.test.ts`, `__test__/integration/purchasing/ap-reconciliation.test.ts`, `__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts`
- This story's findings drive Stories 48.3 and 48.4 (migration and test determinism)
- Priority: P0/P1 — no sprint close if unresolved findings remain
