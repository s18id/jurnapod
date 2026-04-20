# Epic 47 Retrospective — AP Reconciliation & Period Close Controls

**Date:** 2026-04-20
**Facilitator:** Amelia (Developer)
**Participants:** Amelia (Dev), Alice (Product Owner), Charlie (Senior Dev), Dana (QA Engineer), Elena (Junior Dev), Ahmad (Project Lead)
**Session Mode:** BMAD Party Mode — multi-agent collaborative discussion
**Epic:** 47 — AP Reconciliation & Period Close Controls
**Status:** ✅ Complete

---

## What Went Well

### Wave 0 Gate Discipline
- **10 P0/P1 risks caught and resolved** before story execution (fiscal_periods migration gap, FX semantics enforcement, tenant ownership validation, fail-closed behavior, etc.)
- Initial gate was FAIL but re-review after fixes returned GO (conditional)
- Prevents mid-epic scope expansion and story-level blockers
- **Recommendation:** Wave 0 gate should be standard for complex financial epics (reconciliation, period close, immutable data)

### Epic 46 Action Item Follow-Through
- **E46-A1 (Monetary Conversion Regression Guard):** ✅ Completed — integration tests asserting `base = original * rate` added in purchase-invoices.test.ts
- **E46-A2 (Canonical Purchasing Fixtures):** ✅ Completed — `createTestPurchasingAccounts()` and `createTestPurchasingSettings()` promoted to canonical, verified in Epic 47 execution
- Both items verified in Epic 47 readiness report before stories started
- Demonstrates the 2-item action item cap and pre-epic sync is working

### Architecture & Implementation Quality
- **Layered architecture held up** — domain library → route adapter split consistent across all 6 stories
- Reconciliation service in `modules/accounting` properly encapsulates calculation logic
- Period close guardrail is a reusable service callable from multiple endpoints
- Snapshot immutability enforced at DB level with triggers (no UPDATE/DELETE)
- 7 P0/P1 catches in review across epic, all resolved before merge

### Test Coverage
- **188/188 integration tests passing** across all suites
- Wave 0 gate assertions included: timezone behavior, FX semantics, tenant isolation
- Test coverage for: reconciliation summary, drilldown, supplier statements, exception worklist, period close guardrails, snapshots
- Optimistic locking verified in tests for concurrent state transitions

### Delivery Metrics
- **6/6 stories completed (100%)**
- Zero production incidents
- Zero data loss incidents
- P2 follow-ups documented (not blocking)

---

## What Could Improve

### Epic Closing Cross-Dependency Check Missing
- `fiscal_periods` table was a hard dependency for Story 47.5 (period close guardrails) but wasn't in Epic 46 scope
- Gap was discovered during Wave 0 analysis, not during Epic 46 closing checklist
- **Root cause:** Epic closing process doesn't explicitly flag cross-epic schema dependencies that aren't yet implemented
- **Impact:** Wave 0 required extra pre-story investment that could have been avoided

### Deferred Retro Items Visibility Gap
- **UX danger-point review** (Epic 46 retrospective recommendation) was deferred to Epic 47 prep but not executed
- Story 47.5 (period close guardrails with override path) is exactly the multi-step financial workflow that would have benefited from UX danger-point review
- **Root cause:** Deferred items are documented in retro docs but not visible in sprint planning board
- **Impact:** Recommendations from retrospectives not consistently executed in subsequent epics

### Implementation Self-Review Depth
- **Story 47.2 review catches:** GL lines classification fix, SQL alias mismatch in outer SELECT
- **Story 47.4 review catches:** optimistic locking missing on state transitions, upsert idempotency fix
- **Story 47.5 review catches:** concurrent period-close race condition (P2, documented)
- These were implementation bugs caught in review, not design gaps
- **Root cause:** Implementation-phase self-review before requesting external review could be deeper
- **Recommendation:** Story template checklist item: "Before requesting review, verify: optimistic locking on state transitions, SQL alias alignment in complex joins, timezone behavior on date/cutoff logic"

### Wave 0 Gate Overhead
- Wave 0 gate was the right investment for Epic 47 given its complexity
- But the overhead may be tunable for simpler epics
- **Recommendation:** Define criteria for when Wave 0 is mandatory vs. optional (e.g., mandatory for financial reconciliation, period close, immutable data features; lighter touch for CRUD-heavy epics)

---

## Action Items (E46-A2 Constraint: Max 2)

### Action Item 1 — Epic Closing Cross-Dependency Checklist

| Field | Value |
|-------|-------|
| **Owner** | Amelia (Dev/SM) |
| **Deadline** | Before Epic 48 retrospective |
| **Success Criterion** | Epic closing checklist includes explicit step: "Identify all schema dependencies on other epics that are not yet implemented. Flag as blocking or non-blocking with owner and target epic." Attach to both epic closing template and story creation checklist. |

**Rationale:** `fiscal_periods` gap was known but not surfaced during Epic 46 closing. Wave 0 caught it but it should have been flagged during Epic 46's retrospective or closing process, not discovered during Epic 47's Wave 0 gate.

---

### Action Item 2 — Deferred Retro Items Visibility

| Field | Value |
|-------|-------|
| **Owner** | Alice (Product Owner) |
| **Deadline** | Before Epic 48 planning |
| **Success Criterion** | All deferred items from previous retrospectives are visible in the sprint planning board with owner and priority. No deferred item goes unseen for more than 2 epics. Epic 47 P2 items (PDF export, audit trail attribution, timezone normalization, CSV scalability) must be triaged before Epic 48 planning. |

**Rationale:** UX danger-point review (Epic 46 recommendation) was deferred to Epic 47 prep but not executed. Deferred items must be visible and actionable, not just documented and forgotten.

---

## Deferred to Backlog (Not Lost)

The following items were identified but not prioritized for this retro (per 2-item cap), to be triaged into Epic 48 sprint planning:

| Item | Source | Priority Signal |
|------|--------|----------------|
| P2: Concurrent period-close race condition (guardrail check vs mutation commit) | Story 47.5 review | Non-blocking, follow-up hardening |
| P2: PDF export for reconciliation snapshots | Story 47.6 scope freeze | Explicit deferral, enhancement |
| P2: Audit trail transaction-level attribution | Story 47.6 review | Follow-up hardening |
| P2: DATETIME timezone normalization in snapshot responses | Story 47.6 review | Follow-up hardening |
| P2: CSV export scalability for large datasets (streaming/background job) | Stories 47.2/47.3 review | Performance enhancement |

---

## Epic 47 Achievement Summary

| Metric | Value |
|--------|-------|
| Stories committed | 6/6 (47.1–47.6) ✅ |
| Wave 0 gate | Initially FAIL → GO (conditional) ✅ |
| P0/P1 catches in review | 7 across epic ✅ |
| Post-review P0/P1 fixes | 7 (all resolved before merge) |
| Data loss incidents | 0 ✅ |
| Production incidents | 0 ✅ |
| Total integration tests | 188/188 passing ✅ |

**AP Reconciliation capability shipped:**
- AP↔GL reconciliation summary dashboard with configurable account set
- Variance drilldown with attribution (timing differences, posting errors, missing transactions, rounding)
- Supplier statement matching (manual entry MVP)
- AP exception worklist with assignment/resolution workflow
- Period close guardrails with high-privilege override and audit trail
- Immutable reconciliation snapshots with versioned audit trail

**Epic 48 scope (pending definition):** TBD — P2 backlog items from Epic 47 available for triage.

---

## Process Updates from Retrospective

| Update | Owner | Status |
|--------|-------|--------|
| Wave 0 gate for complex financial epics | Amelia | Confirmed — formalize criteria |
| Epic closing cross-dependency checklist | Amelia | New action item |
| Deferred retro items visibility in sprint board | Alice | New action item |
| Implementation self-review checklist (optimistic locking, SQL aliases, timezone) | Charlie | Deferred to story template update |

---

## Previous Retro Follow-Through (Epic 46 → Epic 47)

| Action Item | Status | Notes |
|-------------|--------|-------|
| E46-A1: Monetary Conversion Regression Guard | ✅ Done | Integration tests added, verified in Epic 47 |
| E46-A2: Canonical Purchasing Fixtures | ✅ Done | Fixtures promoted, verified in Epic 47 |
| UX danger-point review deferred to Epic 47 | ❌ Not Addressed | Not executed in Epic 47; carried forward |

---

*Retrospective complete. Epic 47 closed. Party Mode session concluded 2026-04-20.*