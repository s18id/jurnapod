# Story 51.1 Completion Notes

**Story:** Epic 51 / Story 51-1 — Fiscal Year Close Correctness Hardening
**Status:** ✅ DONE (2026-04-27)
**Reviewer:** Independent review (bmad-master) — GO granted
**Implementation:** @bmad-dev

---

## Summary

Hardened fiscal year close execution paths to eliminate race conditions, non-deterministic behavior, and silent failures. All three close paths (`executeCloseWithLocking`, `closeFiscalYearWithTransaction`, `approveFiscalYearClose`) now use deterministic timestamps and row-count-verified guarded transitions.

---

## Changes

| File | Change |
|------|--------|
| `packages/modules/accounting/src/fiscal-year/service.ts` | Deterministic timestamps (`requestedAtEpochMs`); guarded `PENDING→IN_PROGRESS` row-count guard; guarded `OPEN→CLOSED` row-count guard; unreachable dead throw removed |
| `apps/api/src/lib/fiscal-years.ts` | `approveFiscalYearClose` timestamp fix (`Date.now()` → `context.requestedAtEpochMs`) |
| `packages/modules/accounting/__test__/integration/fiscal-year/service-execute-close.test.ts` | **NEW** — 6 service-layer integration tests |
| `apps/api/__test__/integration/accounting/fiscal-year-close.test.ts` | AC-6 concurrent-approve evidence strengthened; AC-8 deterministic timestamp proof added; AC-9 post-close bypass rejection added |

---

## Validation

| Command | Result |
|---------|--------|
| `npm run build -w @jurnapod/modules-accounting` | ✅ PASS |
| `npm run typecheck -w @jurnapod/modules-accounting` | ✅ PASS |
| `npm run build -w @jurnapod/api` | ✅ PASS |
| `npm run typecheck -w @jurnapod/api` | ✅ PASS |
| `npm test -w @jurnapod/modules-accounting -- --run __test__/integration/fiscal-year/service-execute-close.test.ts` | ✅ 6/6 PASS |
| `npm test -w @jurnapod/api -- --run __test__/integration/accounting/fiscal-year-close.test.ts` | ✅ 9/9 PASS |

---

## Residual Risks

| Severity | Risk | Note |
|----------|------|------|
| P1 | Auto-snapshot race (`hasAutoSnapshotForFiscalYearEnd` check outside transaction) | Pre-existing infrastructure pattern, not introduced by 51.1. Snapshot infrastructure needs `SELECT ... FOR UPDATE` or transactional check-then-insert. Tracked for follow-up. |
| P3 | `closeFiscalYearWithTransaction` duplicates locking/idempotency pattern from `executeCloseWithLocking` | Intentional — preserves existing error semantics without behavioral scope expansion |

---

## Dependencies Unblocked

- **Story 51.2** — AR subledger reconciliation: now unblocked (51.1 close-state contract frozen)
- **Story 51.3** — AP subledger reconciliation: concurrent with 51.2/51.4 per coordination protocol
- **Story 51.4** — Inventory subledger reconciliation: concurrent with 51.2/51.3 per coordination protocol
