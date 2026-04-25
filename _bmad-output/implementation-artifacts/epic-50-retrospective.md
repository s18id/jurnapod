# Epic 50 Retrospective — Ledger Correctness Hardening

**Date:** 2026-04-25
**Facilitator:** Amelia (Developer)
**Participants:** Amelia (Dev), Alice (Product Owner), Charlie (Senior Dev), Dana (QA Engineer), Elena (Junior Dev), Bob (Scrum Master), Ahmad (Project Lead)
**Session Mode:** BMAD Party Mode — multi-agent collaborative discussion
**Epic:** 50 — Ledger Correctness Hardening
**Status:** ✅ Complete

---

## What Went Well

### Epic 48→49→50 Continuity
- **Epic 49 action items both executed before Epic 50 midpoint** — E49-A1 (second-pass review checklist) and E49-A2 (tiered audit template) demonstrated follow-through
- **Posting integration tests established**: Story 50.3 delivered 5 suites (26 tests) with 3× consecutive green — a first for `modules-accounting`
- **Fixture ownership model corrected**: Epic 49 historical note flagged that `@jurnapod/db/test-fixtures` should be DB-generic only; Epic 50 correctly moved domain fixtures to owner packages (`modules-platform`, `modules-accounting`, `modules-purchasing`)
- **Zero-defect closure on Story 50.4**: Story 50.3 posting tests surfaced no production correctness defects; Story 50.4 closes as a no-op with evidence

### Risk Management
- **R50-001 (SYNC_PUSH_POSTING_FORCE_UNBALANCED leak, P1)**: CLOSED — override removed entirely from runtime code; only historical references in documentation comments remain
- **R50-002 (Q49-001 hidden API-only fixture dependencies, P1)**: CLOSED — owner-package model enforced; consumer flip verified in `apps/api/__test__/fixtures/index.ts`
- **R50-003 (REFUND reversal mechanism missing, P1)**: NOT ELEVATED — Story 50.3 execution did not confirm the gap; R50-003 remains closed
- **R50-004 (Story 50.3 scope creep risk, P2)**: CLOSED — Story 50.3 delivered all 5 suites on schedule; Story 50.4 was a zero-defect no-op

### Second-Pass Review Enforcement
- **E49-A1 HARD GATE applied across all 5 stories**: Every Story 50.X spec included a mandatory second-pass review checklist; no story could begin implementation without it
- **Post-review fixes reduced to 0/5**: Epic 49 had post-review fixes in 3/7 stories; Epic 50 shipped with zero post-review fixes — second-pass review caught patterns before review phase
- **Tiered audit execution (E49-A2)**: Story 50.1 used Critical→High→Medium priority order; audit completed tier-by-tier with evidence before proceeding

### Q49-001 Continuation (Corrected Model)
- **Pass 1 owner-package extraction**: Platform, accounting, and purchasing fixture scaffolds created under `packages/modules/*/src/test-fixtures/*`
- **`@jurnapod/modules-purchasing` introduced**: New package scaffolded and built with `./test-fixtures` export surface
- **Consumer flip verified**: `apps/api/__test__/fixtures/index.ts` sources symbols from owner packages via DB-injecting wrappers
- **Fixture flow lint passes**: `npm run lint:fixture-flow` → 170 files, zero violations

### Sales AR FX Acknowledgment Delivered
- **Story 50.5** implemented FX acknowledgment for non-zero `payment_delta_idr` with 8 ACs verified
- **New columns**: `fx_acknowledged_at`, `fx_acknowledged_by` added via idempotent migration `0194_add_sales_payments_fx_ack.sql`
- **New route**: `PATCH /sales/payments/:id/acknowledge-fx` with ACCOUNTANT+ auth guard
- **Zero-delta path**: Posts without FX ack as required by spec
- **FX delta journal**: Posted to `fx_gain_loss` account within same transaction as payment status → `POSTED`

### Delivery Metrics
- **5/5 stories completed (100%)**
- **Zero P0/P1 carryover**
- **Zero production incidents**
- **All P1 risks closed before epic close**
- **Build/typecheck gates**: All packages pass (`db`, `modules-platform`, `modules-accounting`, `modules-purchasing`, `modules-sales`), API typecheck passes

---

## What Could Improve

### Story 50.1 Audit Scope Was Larger Than Planned
- **Root cause**: `SYNC_PUSH_POSTING_FORCE_UNBALANCED` had broader usage surface than anticipated; required tracing through multiple consumer paths
- **Impact**: Audit phase took longer than story estimate implied
- **Mitigation**: Tiered execution (Critical→High→Medium) helped prioritize; execution order discipline prevented scope creep
- **Recommendation**: Future P0 risk resolution stories should include explicit "usage surface estimation" task in spec

### Q49-001 Fixture Extraction Required Package Scaffolding
- **Root cause**: Epic 50 introduced a net-new package (`@jurnapod/modules-purchasing`) requiring full scaffold before fixture extraction could start
- **Impact**: Story 50.2 had dependency on package setup before fixture work could begin
- **Recommendation**: Future fixture extraction stories that depend on new package scaffolds should include scaffold task as explicit first sub-task

### Story 50.5 Coordination Complexity
- **Root cause**: Story 50.5 ran concurrently with Story 50.3; payment posting tests needed to explicitly acknowledge and set `fx_acknowledged_at` before posting when delta != 0
- **Impact**: Story 50.3 tests required coordination awareness with Story 50.5 implementation state
- **Mitigation**: Cross-story traceability appendix (E50-A4) documented the interaction protocol before implementation started
- **Recommendation**: Concurrent stories in same epic should have explicit "coordination protocol" section in story spec

---

## Action Items (E46-A2 Constraint: Max 2)

### Action Item 1 — Usage Surface Estimation for P0 Risk Stories

| Field | Value |
|-------|-------|
| **Owner** | Charlie (Senior Dev) |
| **Deadline** | Epic 51 retrospective |
| **Success Criterion** | Story 51.X spec for any P0 risk resolution includes explicit "usage surface estimation" sub-task with pattern search scope and call-site count; estimation deviating >50% from actual requires scope re-baseline |

**Rationale:** Story 50.1 audit surface was larger than planned, extending audit phase. Future P0 risk stories need explicit surface estimation to avoid schedule surprises.

---

### Action Item 2 — Concurrent Story Coordination Protocol

| Field | Value |
|-------|-------|
| **Owner** | Bob (Scrum Master) |
| **Deadline** | Epic 51 retrospective |
| **Success Criterion** | Story 51.X spec includes explicit "coordination protocol" section when story runs concurrently with sibling stories in same epic; protocol documents shared state, dependency ordering, and integration test behavior during implementation window |

**Rationale:** Story 50.5 coordination with Story 50.3 required explicit awareness. Concurrent stories in Epic 50 had the E50-A4 appendix, but this was created reactively. Future concurrent stories should have coordination protocol as a required spec section upfront.

---

## Deferred to Backlog (Not Lost)

The following items were identified but not prioritized for this retro (per 2-item cap):

| Item | Source | Priority Signal |
|------|--------|-----------------|
| T50-001 (P2): `journal-immutability.test.ts` uses fake timers for time-dependent rollback test | Story 50.3 | May need deterministic alternative |
| T50-002 (P2): `sales-payment-posting.test.ts` zero-delta path not explicitly covered | Story 50.3 | Add explicit test case |
| T50-003 (P2): `cogs-posting.test.ts` average cost scenario may miss boundary cases | Story 50.3 | Expand boundary coverage |
| Q49-001 Pass 2+ continuation | Epic 49 risk register | Ongoing — already tracked |
| Subledger reconciliation gaps (RECEIVABLES, PAYABLES, INVENTORY) | Epic 50 risk register | Enter Epic 51 scope |

---

## Epic 50 Achievement Summary

| Metric | Value |
|--------|-------|
| Stories committed | 5/5 (100%) ✅ |
| P1 risks identified | 4 (all CLOSED) ✅ |
| P0/P1 carryover | 0 ✅ |
| Posting integration tests | 5 suites, 26 tests, 3× green ✅ |
| Fixture ownership correction | Owner-package model enforced ✅ |
| FX Acknowledgment | 8 ACs, all verified ✅ |
| Build/typecheck gates | All pass ✅ |
| Production incidents | 0 ✅ |
| Epic 49 action items | 2/2 completed ✅ |

**Epic 50 shipped:**
- SYNC_PUSH_POSTING_FORCE_UNBALANCED override removed (production correctness P0 closed)
- Q49-001 Pass 1 fixture extraction with corrected owner-package model
- 5 new posting integration test suites (26 tests, 3× consecutive green)
- Zero-defect closure on Story 50.4 (no correctness defects surfaced by tests)
- Sales AR FX Acknowledgment with idempotent migration and ACCOUNTANT+ auth guard
- All P1 risks closed (R50-001, R50-002, R50-003, R50-004)
- Second-pass review enforcement (E49-A1) applied to all 5 stories — zero post-review fixes
- Tiered audit execution (E49-A2) applied in Story 50.1

---

## Previous Retro Follow-Through (Epic 49 → Epic 50)

| Action Item | Status | Notes |
|-------------|--------|-------|
| E49-A1: Second-Pass Review for Determinism Work | ✅ Done | All 5 Epic 50 stories enforced E49-A1 HARD GATE; second-pass review checklist included in every story spec; zero post-review fixes in Epic 50 |
| E49-A2: Tiered Audit Prioritization Template | ✅ Done | Story 50.1 included tiered audit table (Critical/High/Medium) with explicit tier column, execution order rationale, and tier-by-tier evidence requirement |

---

## Process Updates from Retrospective

| Update | Owner | Status |
|-------|-------|--------|
| Usage surface estimation for P0 risk stories | Charlie | Action Item 1 — Epic 51 |
| Concurrent story coordination protocol | Bob | Action Item 2 — Epic 51 |
| Q49-001 Pass 2+ continuation | @bmad-dev | Ongoing — already tracked |
| Subledger reconciliation gaps | @bmad-dev | Enter Epic 51 scope |

---

## Epic 51 Preparation

Epic 51 continues the S48-61 Correctness-First Architecture Blueprint with **Fiscal correctness hardening**.

**Known preparation needed:**
- Story 50.3 posting integration tests (5 suites, 26 tests) are prerequisite for Epic 51 subledger work
- Story 50.5 FX acknowledgment tech spec (`docs/tech-specs/sales-ar-fx-ack-settlement.md`) is a stable reference for Epic 51 AR reconciliation work
- Subledger reconciliation gaps (RECEIVABLES, PAYABLES, INVENTORY) enter Epic 51 scope — Epic 50's R50-005 was deferred
- Q49-001 fixture extraction continues with Pass 2+ (already tracked in backlog)

**Epic 51 stories tentatively planned:**
- Story 51.1: Fiscal year close correctness hardening
- Story 51.2: Receivables subledger reconciliation implementation
- Story 51.3: Payables subledger reconciliation implementation
- Story 51.4: Inventory subledger reconciliation implementation
- Story 51.5: Epic 50 correctness fixes follow-up (if any)

**Preparation work already underway:**
- Q49-001 Pass 1 complete — continuation passes tracked in backlog
- Posting integration test baseline established — Epic 51 can build on stable test foundation
- 3-consecutive-green protocol documented — reusable for future sprints
- FX acknowledgment mechanism delivered — provides AR reconciliation building block

---

*Retrospective complete. Epic 50 closed. Party Mode session concluded 2026-04-25.*
