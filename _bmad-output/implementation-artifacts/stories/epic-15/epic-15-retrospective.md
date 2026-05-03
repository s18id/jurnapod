# Epic 15 Retrospective

**Date:** 2026-03-29
**Epic:** 15 — Foundation Hardening & TD Resolution
**Status:** ✅ Complete (with partial story deferral)

---

## Story Summary

| Story | Title | Status | Evidence |
|-------|-------|--------|----------|
| 15.1 | Connection Guard | done | 11/11 tests pass; `withKysely()` wrapper created |
| 15.2 | Test Fixtures Unique Naming | done | 14 tests pass; unique naming pattern implemented |
| 15.3 | TD-030 Effective Date Filtering | done | 90/90 tests pass; migration 0128 created |
| 15.4 | Epic 15 Documentation | partial | 0/4 AC checked; TD-030 resolved in TD doc only |
| 15.5 | TD-031 Spike | done | 321-line spike doc; Epic 16 breakdown created |

---

## What Went Well

1. **Connection Guard Pattern (Story 15.1):** The `withKysely()` wrapper was implemented in ~45 minutes and immediately eliminated the P1 connection leak risk identified in Epic 14. All library functions updated (`validation.ts`, `permissions.ts`). Test results: `validation.test.ts` 4/4 pass, `permissions.test.ts` 7/7 pass.

2. **Effective Date Filtering Resolution (Story 15.3):** TD-030, open since Epic 8, was systematically resolved through: migration `0128_story_15_3_effective_date_columns.sql` with `information_schema` checks, query logic updated in `variant-price-resolver.ts` using BIGINT unix ms, backward compatibility preserved (filter disabled by default). Test results: 8/8 resolver tests pass, 82/82 sync tests pass.

3. **Test Fixture Reliability (Story 15.2):** The pattern `Date.now().toString(36) + Math.random().toString(36).substring(2, 6)` eliminated unique constraint collisions in parallel test runs. All existing tests passed: permissions 7/7, validation 4/4, batch-operations 3/3.

4. **Technical Debt Planning (Story 15.5):** The TD-031 spike produced a comprehensive 321-line document analyzing current implementation (`alert-manager.ts` `dispatchAlert()` lines 178-206), designing exponential backoff pattern (1s → 2s → 4s with max 3 retries), and creating a 3-story breakdown for Epic 16 with risk assessment.

5. **Epic 14 Retrospective Items Addressed:** All Epic 14 action items (connection guard, test fixtures unique naming, Epic 15 planning) were systematically resolved, demonstrating team learning and adaptation.

---

## What Could Improve

1. **Story 15.4 Documentation Incomplete:** All four acceptance criteria for Epic 15 Documentation are unchecked in the story spec: ADR-0011 update, TECHNICAL-DEBT.md update, Epic 16 initial scope draft, project-context.md update. Evidence shows TD-030 was resolved in documentation but other documentation tasks were not completed within the epic.

2. **Spike Scope Discipline (Story 15.5):** The spike expanded from "analyze current implementation" to a full solution design (320+ line document). While the output was valuable, the time spent approximated a full story rather than a 2-hour investigation. Story spec states "if we find ourselves designing solutions, we should convert to an implementation story."

3. **Migration Complexity Underestimation (Story 15.3):** Story 15.3 was estimated at 4 hours but involved more edge-case handling than anticipated: `information_schema` checks for rerunnability, query updates across multiple files, backward compatibility with filter disabled by default, timezone resolution following outlet → company order.

---

## Action Items (Max 2)

1. **Create spike template with explicit stop conditions** — Owner: Bob (Scrum Master), Due: Sprint 17, Priority: P2, Success Criterion: Template includes max time-box, max output size, and explicit triggers for converting spike to implementation story. Evidence: Story 15.5 scope creep showed need for clearer boundaries.

2. **Add QA to infrastructure story kickoffs** — Owner: Amelia (Developer), Due: Story 16.1 start, Priority: P1, Success Criterion: Test scenario review checkpoint included in all infrastructure stories. Evidence: Story 15.1 connection guard had some edge cases discovered in review rather than tests.

---

## Deferred Items

1. **Story 15.4 Documentation (Partial):** ADR-0011 Kysely Migration Guide update with connection guard pattern was not completed in this epic. Story 15.3 dev notes reference "docs/adr/ADR-0011-kysely-migration-guide.md" for the update, but the file shows no evidence of the connection guard pattern being added. Epic 16 should include Story 16.4 to complete this documentation update.

2. **Epic 14 Action Item A4 (CI Load Test):** Deferred to backlog. Epic 14 retrospective shows "Add CI load test for critical paths" status: deferred, Priority: P2.

3. **Epic 14 Action Item A5 (Production Health Dashboard):** Deferred to backlog. Epic 14 retrospective shows "Create production health metrics dashboard" status: deferred, Priority: P3.

---

## Metrics

| Metric | Value | Evidence |
|--------|-------|----------|
| Stories Completed | 4.5/5 (90%) | Story 15.4 partial |
| Test Pass Rate | 115/115 (100%) | 11+14+90=115 tests passing |
| Time Spent (Story 15.1) | ~45 minutes | vs. 2 hour estimate |
| TD Resolved | TD-030 (P1) | Migration 0128 + query updates |
| TD Identified | TD-031 spike complete | 321-line document, Epic 16 planned |

---

*Retrospective populated from artifact evidence: story specs, completion reports, test results, and spike document.*  
*Epic 15 closed: 2026-03-28*