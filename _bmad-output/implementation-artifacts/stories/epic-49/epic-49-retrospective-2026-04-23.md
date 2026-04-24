# Epic 49 Retrospective — Test Determinism + CI Reliability

**Date:** 2026-04-23
**Facilitator:** Amelia (Developer)
**Participants:** Amelia (Dev), Alice (Product Owner), Charlie (Senior Dev), Dana (QA Engineer), Elena (Junior Dev), Bob (Scrum Master), Ahmad (Project Lead)
**Session Mode:** BMAD Party Mode — multi-agent collaborative discussion
**Epic:** 49 — Test Determinism + CI Reliability
**Status:** ✅ Complete

---

## What Went Well

### Epic 48→49 Continuity
- **Epic 48 action items both completed** before Epic 49 midpoint — E48-A1 (kickoff debt signal) and E48-A2 (Q49-001 execution planning) demonstrated follow-through
- **RWLock pattern reuse**: Story 49.2 adopted RWLock across 8 accounting suites in one pass because Epic 48's fiscal-close work had already proven the pattern
- **Architecture truth map**: Module ownership boundaries from Epic 48 gave Epic 49 clear scope definition

### Risk Management
- **R49-001 (time-dependent tests, P1)**: CLOSED — 504 `Date.now()` + 88 `Math.random()` replaced with `crypto.randomUUID()` across all critical suites
- **R49-002 (pool cleanup gaps, P1)**: CLOSED — All ~82 critical suites verified with `afterAll` pool cleanup
- **R49-004 (canonical fixtures, P1)**: CLOSED — Q49-001 Pass 1 executed cleanly with consumer-path integrity verified (⚠️ **Historical note:** Pass 1 was executed under the DB-first model that assumed domain fixtures canonicalize in `@jurnapod/db/test-fixtures`. This assumption has been superseded by the owner-package model. The correct model: `@jurnapod/db/test-fixtures` = DB-generic primitives/assertions only; domain fixtures belong to owner packages. Q49-001 artifacts remain as historical evidence.)

### Q49-001 Fixture Extraction
- **Pass 1 scope was correct**: Minimal safe scope (AP exception constants only) avoided high-risk fiscal-close extraction
- **Consumer-path integrity verified**: Consumer flip in `apps/api/__test__/fixtures/index.ts` documented and validated
- **Build and typecheck clean**: `npm run build -w @jurnapod/db` ✅, `npm run typecheck -w @jurnapod/api` ✅

### CI Gates Formalized
- **3-consecutive-green evidence** consolidated across all critical suites (~82 suites)
- **Pre-close SOLID/DRY/KISS gate**: All items scored Pass; 0 unresolved P0/P1
- **Adversarial review GO verdict**: No P0/P1 open in scope

### Delivery Metrics
- **7/7 stories completed (100%)**
- **Zero P0/P1 carryover**
- **Zero production incidents**
- **All P1 risks closed before epic close**

---

## What Could Improve

### Post-Review Fixes in 3/7 Stories
- **Root cause**: Initial review pass wasn't deep enough for deterministic hardening work
- **Affected stories**: 49.2 (`trial-balance.test.ts` line 75 second `Date.now()`), 49.4, 49.5
- **Impact**: Post-review catches (e.g., `WF-409` key pattern, `CN-OVR` overrideCustomerCode) indicate first-pass missed patterns
- **Recommendation**: Add explicit "second-pass review" step in story specs for any suite touching time-dependent patterns

### Q49-001 Extraction More Work Than Planned
- **Root cause**: Intake/design thorough but execution required careful consumer-path integrity verification at each step
- **Impact**: Pass 1 took longer than story estimate implied
- **Mitigation**: Scoped correctly as minimal safe scope — no high-risk fiscal-close extraction attempted
- **Recommendation**: Future fixture extraction stories should include explicit consumer-path integrity verification tasks

### Audit Scope Overwhelmed Junior Team Members
- **Root cause**: Story 49.1 audit treated all ~100 suites equally without priority tiers
- **Impact**: Elena (Junior Dev) didn't know where to start — 504 time-dependence patterns felt unmanageable
- **Recommendation**: Epic 50 Story 50.1 should use tiered audit prioritization (Critical/High/Medium) with explicit story assignment rationale

---

## Action Items (E46-A2 Constraint: Max 2)

### Action Item 1 — Second-Pass Review for Determinism Work

| Field | Value |
|-------|-------|
| **Owner** | Charlie (Senior Dev) |
| **Deadline** | Epic 50 retrospective |
| **Success Criterion** | Story 50.X spec includes explicit "second-pass review" step for any suite touching time-dependent patterns; post-review fixes reduced to ≤1 story per epic |

**Rationale:** Post-review fixes were needed in 3/7 Epic 49 stories. Self-review misses patterns in deterministic hardening work. Second-pass review would have caught `trial-balance.test.ts` line 75 and `credit-notes-customer.test.ts` line 555 before the review phase.

---

### Action Item 2 — Tiered Audit Prioritization Template

| Field | Value |
|-------|-------|
| **Owner** | Bob (Scrum Master) |
| **Deadline** | Epic 50 retrospective |
| **Success Criterion** | Story 50.1 audit spec uses priority tiers (Critical/High/Medium) with explicit story assignment rationale; audit table includes tier column |

**Rationale:** Story 49.1 audit treated all suites equally, overwhelming junior team members. Tiered prioritization (critical suites first, then high, then medium) would make large audits manageable and ensure critical path is covered first.

---

## Deferred to Backlog (Not Lost)

The following items were identified but not prioritized for this retro (per 2-item cap):

| Item | Source | Priority Signal |
|------|--------|-----------------|
| Q49-001 Pass 2+ continuation | Epic 49 risk register | Ongoing — already tracked |
| T49-002 (P2): Silent cleanup error swallowing | Epic 49 adversarial review | Add `console.error` in catch blocks |
| T49-007 (P2): Pre-existing lint error (`'InventoryConflictError' is defined but never used`) | Epic 49 adversarial review | Fix separately |
| T49-004 (P3): Missing cross-tenant GET-by-ID negative tests | Epic 49 adversarial review | Backlog |
| T49-005 (P3): Lock acquisition return values not verified | Epic 49 adversarial review | Backlog |
| T49-006 (P2): Suite-specific lock proliferation (belt-and-suspenders consolidation) | Epic 49 adversarial review | Backlog |
| T49-008 (P3): `login-throttle.test.ts` fake timer coverage verification | Epic 49 adversarial review | Backlog |

---

## Epic 49 Achievement Summary

| Metric | Value |
|--------|-------|
| Stories committed | 7/7 (100%) ✅ |
| P1 risks identified | 3 (all CLOSED) ✅ |
| P0/P1 carryover | 0 ✅ |
| Test determinism | ~82 suites × 3 runs, zero flakes ✅ |
| CI gates formalized | 3-consecutive-green evidence consolidated ✅ |
| Production incidents | 0 ✅ |
| Epic 48 action items | 2/2 completed ✅ |

**Epic 49 shipped:**
- Accounting suite determinism hardening (8 suites, RWLock + `crypto.randomUUID()`)
- Purchasing suite determinism hardening (13 suites)
- Platform + ACL suite determinism hardening (22 suites)
- Sync + POS + Inventory suite determinism hardening (~30 suites)
- CI pipeline reliability enforcement (3-consecutive-green gate)
- Pre-close validation with full SOLID/DRY/KISS gate (0 P0/P1 unresolved)
- Q49-001 Pass 1: AP exception constants extracted (⚠️ **Historical note:** Pass 1 was executed under the DB-first model; domain fixtures now belong to owner packages per Sprint 48-61 blueprint)

---

## Previous Retro Follow-Through (Epic 48 → Epic 49)

| Action Item | Status | Notes |
|-------------|--------|-------|
| E48-A1: Kickoff Debt Signal Improvement | ✅ Done | Epic 49 kickoff scorecard includes dedicated lint debt classification section with evidence paths |
| E48-A2: Q49-001 Execution Planning | ✅ Done | Pass 1 plan documented and executed; consumer-path integrity verified |

---

## Process Updates from Retrospective

| Update | Owner | Status |
|-------|-------|--------|
| Second-pass review for determinism work | Charlie | Action Item 1 — Epic 50 |
| Tiered audit prioritization template | Bob | Action Item 2 — Epic 50 |
| Q49-001 continuation | @bmad-dev | Ongoing — already tracked |

---

## Epic 50 Preview

**Epic 50: Ledger Correctness Hardening** builds directly on Epic 49's stability foundation.

### Story Sequencing (Ahmad approved)

| Story | Title | Priority Rationale |
|-------|-------|-------------------|
| 50.1 | POS Sync Unbalanced Posting Override Investigation | P1 correctness risk — must resolve before Epic 50 close |
| 50.2 | Q49-001 Fixture Extraction Pass 1 | Continuation of Epic 49's fixture work |
| 50.3 | Posting Flow Integration Tests | 5 test suites, 3× green required, journal-immutability proof |
| 50.4 | Correctness Fixes from Testing | Epic cannot close without this — absorbs 50.3 defects |

### Epic 50 Exit Gate Requirements

1. Story 50.1: Override resolved, reviewer GO attached
2. Story 50.2: Q49-001 Pass 1 complete, `npm run build -w @jurnapod/db` passes, API typecheck passes
3. Story 50.3: All 5 posting integration test suites written and 3× consecutive green
4. Story 50.4: All Story 50.3 defects fixed, 3× green post-fix, risk register updated
5. No unresolved P0/P1 in Epic 50 scope
6. Sprint status validated: `npx tsx scripts/validate-sprint-status.ts --epic 50` exits 0

---

## Epic 50 Preparation

Epic 50 preparation work already underway:
- Q49-001 Pass 1 complete — continuation passes tracked in backlog
- Test determinism baseline established — Epic 50 can build on stable foundation
- 3-consecutive-green protocol documented — reusable for Epic 50 posting suites
- Epic 50 stories created (4 stories, all backlog): stories/epic-50/story-50.1.md through story-50.4.md
- Sprint status updated with Epic 50 entry (2026-04-23)
- Epic 50 validation gate passed: `npx tsx scripts/validate-sprint-status.ts --epic 50` → exit 0 ✅

---

*Retrospective complete. Epic 49 closed. Party Mode session concluded 2026-04-23.*
