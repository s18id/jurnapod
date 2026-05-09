# Story 54.6: Follow-Up Closure Bucket

> **Scope enforcement:** Story 54.6 MUST NOT introduce new scope. It is exclusively a follow-up closure bucket for defects/gaps surfaced by Stories 54.1–54.5.

**Status:** done

---

## Story Context

**Epic:** Epic 54 — AP Lifecycle Correctness
**Owner:** @bmad-dev
**Type:** Defect resolution (follow-up)
**Sprint:** 54
**Design Authority:** Ahmad Faruk
**Finalization Date:** 2026-05-04

---

## Problem Statement

Stories 54.1–54.5 surfaced defects and gaps. This story captures resolving those defects. Epic 54 cannot close until this story is done.

---

## Acceptance Criteria

| AC | Requirement | Maps To |
|----|-------------|---------|
| **AC1** | All Story 54.1–54.5 defects captured with evidence | Defect log below — all 5 defects identified |
| **AC2** | All captured defects resolved with evidence | Each defect has resolution plan and test coverage |
| **AC3** | No new P1/P2 defects introduced in fixes | Verified by review + test suite |
| **AC4** | Post-fix 3-consecutive-green on all affected suites | AP suite (85+ tests), guardrail suite (16 tests) |
| **AC5** | Risk register updated (any R54-XXX elevated or closed) | All R54 risks closed or documented |
| **AC6** | Sprint status updated | `sprint-status.yaml` updated via canonical script |

---

## Defect Log

| Defect ID | Source Story | Description | Severity | Status | Resolution |
|-----------|--------------|-------------|----------|--------|------------|
| **D54-001** | 54.3 | Three-way matching flag absent. AC5 of 54.3 deferred — no `three_way_matching` flag, setting, or enforcement exists. | P2 (feature gap) | **resolved** | Company-level boolean `companies.three_way_matching` (migration 0202) + enforcement in postPI. Caps invoice qty at `min(received_qty, ordered_qty)` when enabled. |
| **D54-002** | 54.3 | `invoiced_qty` tracking missing on PO lines. Cumulative over-invoicing possible when multiple PIs reference same PO line (e.g., received=10, PI#1=6, PI#2=6 → total 12 > 10). | P1 (correctness) | **resolved** | Added `purchase_order_lines.invoiced_qty` accumulator (migration 0201). postPI validates `invoice_qty <= (received_qty - invoiced_qty_old)` and atomically increments. voidPI decrements. |
| **D54-003** | 54.5 | `insertPeriodCloseOverride` duplicated verbatim across 3 service files (40 lines each). Violates DRY. | P2 (maintainability) | **resolved** | Extracted to `packages/modules/purchasing/src/services/period-close-override-utils.ts` with named export. All 3 service files import and delete local copies. |
| **D54-004** | 54.5 | Void override audit log test missing. No test verifies `audit_logs` row on override during void paths (invoice, payment, credit). | P2 (coverage) | **resolved** | Added 3 void audit tests (voidPI, voidAPPayment, voidPurchaseCredit) verifying both `audit_logs` and `period_close_overrides` rows are created with correct `transactionType`. |
| **D54-005** | 54.5 | `Date.now()` used in Story 47.5 tests for deterministic identifiers. Non-deterministic, violates test policy. | P2 (determinism) | **resolved** | Replaced all 22 `Date.now()` calls with `makeTag()` in `period-close-guardrail.test.ts`. All identifiers now deterministic per Q49-001. |

### Deferred Items

| Item | Source | Rationale | Deferred To |
|------|--------|-----------|-------------|
| *(none)* | — | All identified defects resolved in this story | — |

---

## Execution Plan

### Phase 0: Pre-Flight Gate (Mandatory)

```bash
npm run lint -w @jurnapod/api
npm run typecheck -w @jurnapod/api
```

If checks fail, classify as blocking pre-existing issue or tracked follow-up per project-context.md.

### Phase 1: Quick Wins (Sequential, Low Risk)

| Step | Defect | Action | Files |
|------|--------|--------|-------|
| 1.1 | D54-005 | Replace `Date.now()` with `makeTag()` in 3 locations in `period-close-guardrail.test.ts` | `apps/api/__test__/integration/accounting/period-close-guardrail.test.ts` |
| 1.2 | D54-003 | Extract `insertPeriodCloseOverride()` to `period-close-override-utils.ts`; import and delete local copies in 3 service files | `packages/modules/purchasing/src/services/period-close-override-utils.ts` (new), 3 service files (modify) |
| 1.3 | D54-004 | Add 3 void audit tests: `voidPI`, `voidAPPayment`, `voidPurchaseCredit` with override → verify `audit_logs` row | `apps/api/__test__/integration/purchasing/ap-period-close-enforcement.test.ts` |

### Phase 2: `invoiced_qty` Accumulator (D54-002)

| Step | Action | Details |
|------|--------|---------|
| 2.1 | Migration 0201 | `purchase_order_lines.invoiced_qty DECIMAL(19,4) NOT NULL DEFAULT 0.0000` (rerunnable via `information_schema`) |
| 2.2 | postPI service | Read `invoiced_qty` with `FOR UPDATE` lock; validate `invoice_qty <= (received_qty - invoiced_qty)`; `UPDATE SET invoiced_qty = invoiced_qty + invoice_line.qty` |
| 2.3 | voidPI service | `UPDATE SET invoiced_qty = invoiced_qty - line.qty` to reverse accumulator |
| 2.4 | Integration test | Verify: (a) cumulative over-invoicing blocked, (b) void decrements correctly, (c) concurrent posting safe |

### Phase 3: Three-Way Matching Flag (D54-001)

| Step | Action | Details |
|------|--------|---------|
| 3.1 | Migration 0202 | `companies.three_way_matching TINYINT(1) NOT NULL DEFAULT 0` (rerunnable via `information_schema`) |
| 3.2 | postPI service | When company flag is true, cap at `ordered_qty`: `invoice_qty <= min(received_qty, ordered_qty) - invoiced_qty` |
| 3.3 | Integration test | Verify: (a) three-way blocks when ordered_qty < received_qty, (b) disabled flag has no effect |

### Phase 4: Validation

| Gate | Check |
|------|-------|
| Typecheck | `npm run typecheck -w @jurnapod/api` |
| Build | `npm run build -w @jurnapod/api` |
| AP suite | 85+ tests → 3× consecutive green |
| Guardrail suite | 16 tests → 3× consecutive green |
| Determinism | No `Date.now()`/`Math.random()` in test code (lint scan) |
| Fixture flow | `npm run lint:fixture-flow -w @jurnapod/api` |

### Phase 5: Closure

1. Update defect log (all 5 → `resolved`)
2. Write `story-54.6.completion.md`
3. Update `sprint-status.yaml` via canonical script:
   ```bash
   npx tsx scripts/update-sprint-status.ts --epic 54 --story 6 --title ap-closure-bucket --status done
   ```
4. Run E54-A2 second-pass checklist
5. Obtain reviewer GO + story owner sign-off
6. Commit

---

## Design Decisions

### D54-001 — Three-Way Matching Flag

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Scope | Company-level boolean (`companies.three_way_matching`) | KISS: avoids per-supplier/per-PO complexity; default false = backward-compatible |
| Migration | 0202, rerunnable via `information_schema` | Follows canonical migration pattern |
| Enforcement | In postPI, when flag=true: `invoice_qty <= min(received_qty, ordered_qty) - invoiced_qty_old` | Capped by both received and ordered; uses existing `FOR UPDATE` lock |
| Void | No special handling — void decrements `invoiced_qty` regardless of flag | Flag only affects ceiling, not tracking |

### D54-002 — `invoiced_qty` Accumulator

> **⚠️ Correction (Epic 61, 2026-05-09):** The original implementation used `toScaled4(String(line.qty))` for the accumulator update, incorrectly applying money/FX scaling to quantity values. As of Epic 61, the accumulator uses raw `line.qty` (no scaling). The column type `DECIMAL(19,4)` from migration 0201 remains deployed but stores raw decimal quantities; a future migration SHALL reduce precision to `DECIMAL(19,2)`.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Column | `purchase_order_lines.invoiced_qty DECIMAL(19,4) NOT NULL DEFAULT 0.0000` | Same type as `received_qty`; additive-only |
| Migration | 0201, rerunnable via `information_schema` | Follows canonical migration pattern |
| Update | Atomic `UPDATE SET invoiced_qty = invoiced_qty + line.qty` inside posting transaction | Already inside `FOR UPDATE` lock scope; qty is raw decimal, NOT scaled |
| Decrement | Atomic `UPDATE SET invoiced_qty = invoiced_qty - line.qty` inside void transaction | Reverses accumulator; qty is raw decimal, NOT scaled |
| Guard change | From `invoice_qty <= received_qty` to `invoice_qty <= (received_qty - invoiced_qty_old)` | Fixes cumulative over-invoicing bug |

### D54-003 — DRY Extraction

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Location | `packages/modules/purchasing/src/services/period-close-override-utils.ts` | Owns the purchasing domain invariant |
| Export | Named export `insertPeriodCloseOverride` | Same signature as current local functions |
| Consumers | 3 service files import and call | No adapter changes needed |

---

## File Change List

| File | Change | Phase |
|------|--------|-------|
| `packages/db/migrations/0201_purchase_order_lines_invoiced_qty.sql` | **New** | 2.1 |
| `packages/db/migrations/0202_companies_three_way_matching.sql` | **New** | 3.1 |
| `packages/modules/purchasing/src/services/period-close-override-utils.ts` | **New** | 1.2 |
| `packages/modules/purchasing/src/services/purchase-invoice-service.ts` | Modify — import util; add invoiced_qty + three-way logic | 1.2, 2.2, 3.2 |
| `packages/modules/purchasing/src/services/ap-payment-service.ts` | Modify — import util | 1.2 |
| `packages/modules/purchasing/src/services/purchase-credit-service.ts` | Modify — import util | 1.2 |
| `apps/api/__test__/integration/purchasing/ap-period-close-enforcement.test.ts` | Modify — add void audit tests | 1.3 |
| `apps/api/__test__/integration/accounting/period-close-guardrail.test.ts` | Modify — Date.now → makeTag | 1.1 |
| `apps/api/__test__/integration/purchasing/ap-invoice-correctness.test.ts` | Modify — add invoiced_qty + three-way tests | 2.4, 3.3 |

---

## Cross-Story Coordination

| Story | Dependency on 54.6 | Coordination Rule |
|-------|---------------------|-------------------|
| 54.1 | None — all findings resolved in-commit | N/A |
| 54.2 | None — all findings resolved in-commit | N/A |
| 54.3 | D54-001, D54-002 deferred to 54.6 | 54.3 links to 54.6 |
| 54.4 | None — all findings resolved in-commit | N/A |
| 54.5 | D54-003, D54-004, D54-005 deferred to 54.6 | 54.5 links to 54.6 |

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| invoiced_qty migration clashes with multi-tenant DB | Low | Rerunnable DDL; `information_schema` guard |
| Three-way flag changes existing behavior unexpectedly | Low | Default false; only affects new companies if explicitly enabled |
| Concurrent void decrements invoiced_qty below zero | Low | `FOR UPDATE` lock on PO line in void transaction |
| Extracted utility breaks service imports | Low | Identical signature; no behavior change |

---

## SOLID/DRY/KISS/YAGNI Justification

| Principle | How This Plan Honors It |
|-----------|------------------------|
| **SOLID** | D54-003 extraction gives `insertPeriodCloseOverride` single responsibility in one place |
| **DRY** | D54-003 eliminates 3× duplication; D54-002 centralizes invoicing logic |
| **KISS** | Company-level boolean (not per-supplier); simple accumulator (not complex ledger) |
| **YAGNI** | No speculative features — all 5 defects are proven gaps from prior stories |

---

## Exit Criteria

- [ ] All 5 defects resolved with test evidence
- [ ] All affected suites 3× consecutive green
- [ ] No new P1/P2 defects (verified by review)
- [ ] Risk register updated
- [ ] `sprint-status.yaml` updated
- [ ] Story cannot be marked done without explicit reviewer GO

---

_Last Updated: 2026-05-04_
