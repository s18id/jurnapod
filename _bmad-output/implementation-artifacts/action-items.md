# Action Items Tracker

**Last Updated:** 2026-03-29  
**Review Cadence:** Monthly at sprint retrospective

---

## Summary

| Priority | Open | In Progress | Done | Total |
|----------|------|-------------|------|-------|
| P0 | 1 | 0 | 0 | 1 |
| P1 | 2 | 0 | 0 | 2 |
| P2 | 7 | 0 | 0 | 7 |
| P3 | 5 | 0 | 0 | 5 |
| **Total** | **15** | **0** | **0** | **15** |

---

## P0 - Critical (Do Immediately)

| ID | Action | From | Owner | Status | Notes |
|----|--------|------|-------|--------|-------|
| E8-A1 | Verify Story 8.2 implementation status | Epic 8 | — | ⚠️ Unclear | Was marked "verify" in Epic 8 retro, never confirmed |

---

## P1 - High (Do Next Sprint)

| ID | Action | From | Owner | Status | Notes |
|----|--------|------|-------|--------|-------|
| E8-A2 | Fix 16 pre-existing test failures (7 variant + 14 POS service) | Epic 8 | — | ⚠️ Unclear | Pre-existing, not from Epic 8 |
| E8-A3 | Create E2E tests for POS Variant Selection | Epic 8 | — | ⚠️ Unclear | Deferred from Story 8.6 |

---

## P2 - Medium (Do This Quarter)

| ID | Action | From | Owner | Status | Notes |
|----|--------|------|-------|--------|-------|
| E14-A1 | Add CI load test for critical paths | Epic 14 | Quinn | ⏳ Open | Run tests multiple times to catch resource leaks |
| E15-A1 | Add test scenario review checkpoint to infrastructure stories | Epic 15 | Bob | ⏳ Open | Include in story template frontmatter |
| E15-A2 | Create spike template with strict time-box and stop conditions | Epic 15 | Bob | ⏳ Open | Define max lines, max time, explicit stop triggers |
| E15-A3 | Tag infrastructure stories for QA visibility | Epic 15 | Bob | ⏳ Open | Flag infrastructure work in sprint planning |
| E16-A1 | Create reusable testing patterns for async/time-based utilities | Epic 16 | Amelia | ⏳ Open | Apply lesson from Epic 16 |
| E16-A2 | Add "integration test consideration" checkpoint to utility stories | Epic 16 | Bob | ⏳ Open | Document integration points |
| E16-A3 | Draft "Foundation Win" communication format | Epic 16 | John | ⏳ Open | For sprint reviews |

---

## P3 - Low (Backlog)

| ID | Action | From | Owner | Status | Notes |
|----|--------|------|-------|--------|-------|
| E4-A1 | Audit remaining monolith patterns | Epic 4 | — | ⏳ Deferred | From Epic 3, deferred since Epic 4 |
| E4-A2 | Establish P3 action review cadence | Epic 4 | — | ⏳ Deferred | Quarterly review of deferred items |
| E14-A2 | Create production health metrics dashboard | Epic 14 | John | ⏳ Open | Track TD creation vs resolution rate |
| E15-A4 | Build technical debt burndown dashboard | Epic 15 | John | ⏳ Open | Visualize TD progress |
| E15-A5 | Define "foundation win" celebration criteria | Epic 15 | John | ⏳ Open | Quantify risk reduction |

---

## Recently Completed

| ID | Action | From | Completed | Notes |
|----|--------|------|----------|-------|
| E15-A5-OLD | Include QA in Story 16.1 kickoff | Epic 15 | Epic 16 | ✅ Done |
| E13-A1 | Document patterns "in the moment" | Epic 13 | Epic 14 | ✅ Done |
| E13-A2 | Create shared test-fixtures.ts | Epic 13 | Epic 14 | ✅ Done |
| E14-A1 | Add Kysely connection guard to library template | Epic 14 | Epic 15 | ✅ Done |
| E14-A2 | Improve test-fixtures with unique naming | Epic 14 | Epic 15 | ✅ Done |
| E14-A3 | Plan Epic 15 | Epic 14 | Epic 15 | ✅ Done |

---

## Archive: Formally Closed Items

These items have been addressed and closed.

| ID | Action | From | Closed In | Notes |
|----|--------|------|----------|-------|
| E8-A4 | Fix variant-price-resolver migration | Epic 8 | Epic 9 | Story 9.4 |
| E8-A5 | Story template 'Test Debt' section | Epic 8 | Epic 9 | Story 9.9 |
| E8-A6 | Load testing (Story 8.10) | Epic 8 | Epic 13 | Deferred to Epic 9 |
| E9-A1 | Audit all library functions | Epic 9 | Epic 9 | Story 9.1 |
| E9-A2 | Refactor company/item tests | Epic 9 | Epic 9 | Story 9.2 |
| E9-A3 | Refactor import/progress tests | Epic 9 | Epic 9 | Story 9.3 |
| E9-A4 | Refactor variant sync tests | Epic 9 | Epic 9 | Story 9.4 |
| E9-A5 | Refactor user/auth tests | Epic 9 | Epic 9 | Story 9.5 |
| E9-A6 | Refactor route tests | Epic 9 | Epic 9 | Story 9.6 |
| E9-A7 | Batch refactor remaining tests | Epic 9 | Epic 9 | Story 9.7 |
| E9-A8 | Add missing library functions | Epic 9 | Epic 9 | Story 9.8 |
| E9-A9 | Enforce library usage | Epic 9 | Epic 9 | Story 9.9 |
| E10-A1 | Create ESLint rule for hardcoded IDs | Epic 10 | Epic 11 | ✅ |
| E10-A2 | Add `--sequence.shuffle` to CI | Epic 10 | Epic 11 | ✅ |
| E11-A1 | ESLint rule to ban INSERT INTO items | Epic 11 | Epic 11 | ✅ |
| E11-A2 | Extend createItem() with low_stock_threshold | Epic 11 | Epic 12 | ✅ |
| E11-A3 | Update epic naming guidelines | Epic 11 | Epic 12 | ✅ |
| E11-A4 | Standardize artifact creation | Epic 11 | Epic 11 | ✅ |
| E12-A1 | Epic 12 deferred routes | Epic 12 | Epic 13 | ✅ Completed |
| E13-A4 | Validate library reusability with Epic 14 | Epic 13 | Epic 14 | ✅ Done |
| E13-A5 | Add architecture decision notes to route files | Epic 13 | Epic 13 | 🔄 Ongoing |
| E14-A4 | Plan Epic 15 | Epic 14 | Epic 15 | ✅ Done |
| E15-A5-OLD | Include QA in Story kickoff | Epic 15 | Epic 16 | ✅ Done |

---

## How to Update This Document

1. When an action item is completed:
   - Move from Priority section to "Archive: Formally Closed Items"
   - Update "Last Updated" date

2. When a new action item is created:
   - Add to the appropriate Priority section
   - Include: ID, Action, From (epic), Owner, Status

3. When verifying unclear items:
   - Check if item was actually completed in subsequent epics
   - Update status to ✅ Done or ❌ Won't Fix

---

## ID Format

Format: `E{EpicNumber}-A{ActionNumber}`

Examples:
- `E8-A1` = Epic 8, Action 1
- `E15-A2` = Epic 15, Action 2

---

_Last Updated: 2026-03-29_
