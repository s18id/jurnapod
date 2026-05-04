# Epic 54 Retrospective

**Epic:** Accounts Payable Correctness
**Date:** 2026-04-15
**Stories:** 54.1 · 54.2 · 54.3 · 54.4 · 54.5 · 54.6
**Status:** CLOSED — all 6 stories committed to `main`

---

## SOLID / DRY / KISS / YAGNI Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| **SOLID** | ✅ Pass | Single responsibility on service functions; no God-methods; FK ordering respected |
| **DRY** | ✅ Pass | `insertPeriodCloseOverride` extracted once, consumed in 3 services |
| **KISS** | ✅ Pass | Three-way matching as company-level boolean (not supplier-level config); invoiced_qty as simple accumulator |
| **YAGNI** | ✅ Pass | No supplier-level three-way matching; no pre-payment validation hooks |

---

## What Went Well

### Story Execution
- **54.1** — P0 race condition (concurrent post/void) and tax calculation 10× inflation fixed before any user encounter. DoD completion-report gate added to prevent future regressions.
- **54.2** — AP payment write-path proof suite established: 88 tests across 7 files, 3× consecutive green.
- **54.3** — AP state machine hardened; GRN qty enforcement closed cumulative over-invoicing gap.
- **54.4** — Multi-currency AP with FX gain/loss journals implemented cleanly. Three-way matching decision resolved at company level.
- **54.5** — Period-close audit trail (AC3) and backdate guard (AC4) added with explicit `audit_logs` + `period_close_overrides` enforcement.
- **54.6** — All 5 defects (D54-001 through D54-005) resolved in a single closure bucket. No new scope introduced.

### Technical Quality
- `insertPeriodCloseOverride` extracted to `period-close-override-utils.ts` — eliminated 3× duplication across service files.
- `purchase_order_lines.invoiced_qty` accumulator with atomic `UPDATE SET invoiced_qty = invoiced_qty + qty` inside `FOR UPDATE` lock — no race condition possible.
- `companies.three_way_matching` TINYINT(1) default 0 — backward-compatible, company-level KISS design.
- FK constraint ordering in `cleanupTestFixtures()` — `period_close_overrides` and `audit_logs` deleted BEFORE `users` — eliminates sporadic 500 errors in batch test runs (Q49-001).

### Defect Resolution
| ID | Description | Resolution |
|----|-------------|------------|
| D54-001 | Three-way matching not enforced | `companies.three_way_matching` flag; postPI caps at `min(received_qty, ordered_qty)` |
| D54-002 | GRN qty enforcement gap | `purchase_order_lines.invoiced_qty` accumulator; voidPI reverses atomically |
| D54-003 | Duplicate `insertPeriodCloseOverride` | Extracted to `period-close-override-utils.ts` |
| D54-004 | Missing void audit trail tests | 3 void audit tests added: voidPI, voidAPPayment, voidPurchaseCredit |
| D54-005 | Non-deterministic `Date.now()` in tests | 22× replaced with `makeTag()` in `period-close-guardrail.test.ts` |

---

## What Didn't Go Well

### Cross-Module Decision Timing
The three-way matching granularity decision (company-level vs. supplier-level) was debated during 54.4's execution. It should have been resolved in 54.3's planning phase. This caused minor scope discussion in 54.4 and a brief async alignment delay.

**Mitigation for next epic:** Cross-module architectural decisions must be documented with Winston's sign-off before story work begins.

### Edge Case Coverage Visibility
The GRN boundary condition tests (null received_qty, zero ordered_qty, negative invoice scenarios) were folded into 54.6's closure bucket rather than a standalone story. This made coverage gaps less obvious during the epic.

**Mitigation for next epic:** Boundary case coverage should be a named story or explicitly tracked AC item.

### Documentation Gap
Period-close audit trail, backdate guard, and three-way matching flag all have operator-facing compliance implications not yet reflected in user-facing documentation.

**Mitigation for next epic:** Compliance-relevant features must have a documentation AC alongside the implementation AC.

---

## SOLID/DRY/KISS/YAGNI Enforcement Notes

- **Q49-001 FK ordering fix** — The most impactful cleanup was in `test-fixtures.ts`. When tests share a DB connection pool, cleanup order matters. `period_close_overrides.user_id` FK prevents `DELETE FROM users` without first removing override rows. This was causing sporadic 500s in batch runs that were invisible in single-file test runs.
- **`invoiceDate` vs system date** — Invoice date (not system date) is used for period boundary resolution. Correct behavior for backdate scenarios, confirmed by test coverage.
- **`purchase_invoice_lines.invoice_id`** — voidPI was reading the wrong column; fixed to `purchase_invoice_id`.
- **`Math.min` with bigint** — Replaced with manual comparison in postPI three-way matching check to avoid bigint incompatibility.

---

## Action Items — Status

### 1. Architectural Decision Gates ✅ DONE
**Owner:** Bob (SM) + Winston (Architect)
**Completed:** 2026-04-15 (same retro)
**Deliverable:** `docs/templates/story-spec-template.md` — new section **"Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)"** added after the Test Scenario Review Checkpoint. All stories touching multiple modules now require a `Decisions` table with Winston's explicit sign-off before implementation begins.

```markdown
## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)
- [ ] Modules touched (list)
- [ ] Cross-module decisions identified
- [ ] Winston sign-off obtained (date + ✓)
- [ ] Decisions recorded in table below

| # | Decision | Modules | Rationale | Alternatives | Winston ✓ |
|---|----------|---------|-----------|-------------|----------|
| 1 | ...      | ...     | ...       | ...         | 2026-04-15 ✓ |
```
Hard gate: stories without this section completed are returned to planning.

### 2. AP Invariants ADR ✅ DONE
**Owner:** Winston (Architect) + Quinn (QA)
**Completed:** 2026-04-15 (same session)
**Deliverable:** `docs/adr/ADR-0024-ap-correctness-invariants.md`

Documents all AP invariants established by Epic 54:
- AP state machine (DRAFT → POSTED → VOID) with status labels and transition guards
- `invoiced_qty` accumulator logic — atomic `UPDATE ... SET invoiced_qty = invoiced_qty + qty` inside `FOR UPDATE` lock; voidPI reverses atomically
- Three-way matching — `companies.three_way_matching` TINYINT(1), company-level KISS decision, `min(received - invoiced, ordered - invoiced)` cap
- Period-close override audit trail — `insertPeriodCloseOverride` in same transaction as business event; transaction types for all 6 AP operations
- Multi-currency FX gain/loss posting rules — no FX on PI posting; at full/over-settlement only; `fxDiff > 0` = loss, `fxDiff < 0` = gain
- AP Payment state machine + Purchase Credit state machine

Additionally, `ADR-0025-date-time-policy.md` was refreshed to incorporate the canonical datetime-standardization-summary content (Rule 1–6 structure, namespace API tables, prohibited patterns).

---

## Story Summary

| Story | Commit | Status |
|-------|--------|--------|
| 54.1 | `2b1fbf1a` | ✅ Done |
| 54.2 | `07df3823` | ✅ Done |
| 54.3 | `c8e45331` | ✅ Done |
| 54.4 | `8db2a34c` | ✅ Done |
| 54.5 | `530479c6` | ✅ Done |
| 54.6 | `90075c00` | ✅ Done |

---

## Closing Note

Epic 54 shipped all 6 stories with zero P0/P1 items unresolved. The AP correctness program now enforces: state machine integrity, GRN qty enforcement, three-way matching, multi-currency FX, period-close audit trail, and backdate guard. These are the invariants that keep the GL trustworthy. The journal is the source of truth — Epic 54 ensured AP respects that contract.