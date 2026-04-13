# Action Items Tracker

**Last Updated:** 2026-04-14T00:00:00Z
**Review Cadence:** Monthly at sprint retrospective

---

## Summary

| Priority | Open | Done | Won't Fix | Total |
|----------|------|------|-----------|-------|
| P0 | 0 | 4 | 0 | 4 |
| P1 | 0 | 10 | 0 | 10 |
| P2 | 5 | 13 | 0 | 18 |
| P3 | 1 | 2 | 3 | 6 |
| **Total** | **6** | **29** | **3** | **38** |

---

## P0 - Critical (Do Immediately)

*(empty — no open P0 items)*

---

## P1 - High (Do Next Sprint)

| ID | Action | From | Owner | Status |
|----|--------|------|-------|--------|
| E34-A4 | Add "zero test failures" CI gate | Epic 34 | Quinn | Done |
| E34-A5 | Audit test fixtures for sentinel IDs (all FK constraints) | Epic 34 | Amelia | Done |

---

---

## P2 - Medium (Do This Quarter)

| ID | Action | From | Owner | Status |
|----|--------|------|-------|--------|
| E33-A2 | Add dead code audit step to consolidation stories | Epic 33 | Bob | Open |
| E33-A3 | Document permission bit canonical values in shared/README | Epic 33 | Elena | Open |
| E34-A1 | Create pre-reorganization tool standardization checklist | Epic 34 | Winston | Open |
| E34-A2 | Build automated import path update script | Epic 34 | Barry | Open |
| E34-A3 | Document database fixture standards | Epic 34 | Amelia | Open |
| E34-A6 | Add vitest alias config template to all packages | Epic 34 | Winston | Open |
| E34-A7 | Document DB cleanup hook patterns | Epic 34 | Murat | Open |
| E34-A8 | Create lint rule unit test template | Epic 34 | Barry | Open |
| E41-A4 | Add @deprecated JSDoc to explicit accessToken arg in api-client.ts | Epic 41 | Dev | Done |
| E41-A5 | Update project-context.md with Backoffice API Client section | Epic 41 | Tech Writer | Done |
| E41-A8 | For future bulk migration stories: enumerate every target in story AC | Epic 41 | SM | Done |
| E31-A1 | Document canonical test fixture pattern | Epic 31 | Tech Writer | Done |
| E31-A2 | Add adapter deletion checklist to extraction stories | Epic 31 | Tech Writer | Done |

---

---

## P3 - Low (Backlog)

| ID | Action | From | Owner | Status |
|----|--------|------|-------|--------|
| E41-A7 | Set sunset milestone for removing explicit `accessToken` arg from all production call sites | Epic 41 | PM | Backlog |

---

## Archive: Formally Closed Items

### P0

| ID | Action | From | Closed In | Notes |
|----|--------|------|----------|-------|
| E17-A2 | Create state diagram for two-phase sync architecture | Epic 17 | Epic 24 | `docs/tech-specs/two-phase-sync-architecture.md` |
| E17-A3 | Document Phase 1/Phase 2 handoff contract | Epic 17 | Epic 24 | `docs/tech-specs/two-phase-sync-architecture.md` |
| TD-037 | Resolve ~300+ type errors in API package | Epic 19 | Epic 23 | Resolved during Epic 23 API Detachment |
| E20-A2 | Add typecheck gate to story completion criteria | Epic 20 | Epic 20 | Added to AGENTS.md Definition of Done |
| **E30-A1** | Add "tenant labels for observability" to Definition of Done | Epic 30 | Epic 30 | Added Observability section to AGENTS.md DoD |

### P1

| ID | Action | From | Closed In | Notes |
|----|--------|------|----------|-------|
| E20-A3 | Improve story discovery: verify table data + code usage before drop scope | Epic 20 | Epic 20 | Added Data & Migration Concerns section to story template |
| E21-A2 | Document "analysis before action" checklist for HIGH risk stories | Epic 21 | Epic 21 | Added HIGH Risk Story Analysis section to story template |
| E22-A2 | Establish "action item capacity" in sprint planning (20%) | Epic 22 | Epic 22 | Added action item capacity allocation to retrospective workflow |
| E24-A2 | Establish backlog review as part of epic closeout | Epic 24 | Epic 24 | Backlog review completed 2026-04-04 |
| E25-A1 | Finalize backlog review process in epic closeout checklist | Epic 25 | Epic 25 | Now part of every retrospective |

### P2

| ID | Action | From | Closed In | Notes |
|----|--------|------|----------|-------|
| E17-A6 | Track action items between epics in shared document | Epic 17 | Epic 17 | This document |
| E21-P2 | Review thumbnail URL behavior difference (legacy vs new) | Epic 21 | Epic 21 | Working as Intended |
| E15-A2 | Create spike template with strict time-box and stop conditions | Epic 15 | Epic 15 | Added Spike Template section to story template |
| E27-A1 | Document parity check methodology for duplicate code deletion | Epic 27 | Epic 27 | Added Duplicate Code Deletion Parity Check section to story template |
| **E30-A2** | Document metric naming conventions (canonical patterns) | Epic 30 | Epic 30 | Updated `packages/telemetry/README.md` with Naming Rules + How to Add |
| **E30-A3** | Create alert authoring guide (rate calculation, heartbeat) | Epic 30 | Epic 30 | Created `docs/alert-authoring-guide.md` |
| **E30-A4** | Add "monitor the monitoring" section to runbook | Epic 30 | Epic 30 | Added section to `apps/api/src/routes/admin-runbook.ts` |
| **E31-A1** | Document canonical test fixture pattern | Epic 31 | Epic 31 | Added Canonical Test Fixtures section to AGENTS.md |
| **E31-A2** | Add adapter deletion checklist to extraction stories | Epic 31 | Epic 31 | Added Extraction Story Checklist section to AGENTS.md |
| **E40-A1** | API Contract Verification: Verify API endpoints return expected shapes before UI stories | Epic 40 | Epic 40 | Added API Contract Verification section to story template |
| **E40-A2** | Formal API Gap Tracking: Create process for documenting discovered API gaps | Epic 40 | Epic 40 | Added API Gaps Found table to story template |
| **E40-A3** | Consistent Story Completion Docs: Ensure all reports have equal depth | Epic 40 | Epic 40 | Created `docs/templates/story-completion-template.md` |
| **E40-A4** | Per-Button Permission Enforcement: Implement granular checks | Epic 40 | Epic 40 | Created `use-permission.ts` hook and `PermissionButton.tsx` component |

### P3

| ID | Action | From | Closed In | Notes |
|----|--------|------|----------|-------|
| E26-A1 | Use domain errors instead of generic Error in stock operations | Epic 26 | Epic 26 | Replaced generic Error with InventoryReferenceError/InventoryConflictError in stock-service.ts |
| **E30-A5** | Document GL imbalance detection design decision | Epic 30 | Epic 30 | Created `docs/tech-specs/gl-imbalance-detection.md` |
| E4-A1 | Audit remaining monolith patterns | Epic 4 | Epic 24 | Won't Fix - Epic 4 was 20+ epics ago; codebase evolved significantly |
| E14-A2 | Create production health metrics dashboard | Epic 14 | Epic 24 | Won't Fix - Nice to have, infrastructure work |
| E15-A4 | Build technical debt burndown dashboard | Epic 15 | Epic 24 | Won't Fix - Nice to have, infrastructure work |

### Historical (Pre-Epic 8)

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
| E10-A1 | Create ESLint rule for hardcoded IDs | Epic 10 | Epic 11 | Done |
| E10-A2 | Add `--sequence.shuffle` to CI | Epic 10 | Epic 11 | Done |
| E11-A1 | ESLint rule to ban INSERT INTO items | Epic 11 | Epic 11 | Done |
| E11-A2 | Extend createItem() with low_stock_threshold | Epic 11 | Epic 12 | Done |
| E11-A3 | Update epic naming guidelines | Epic 11 | Epic 12 | Done |
| E11-A4 | Standardize artifact creation | Epic 11 | Epic 11 | Done |
| E12-A1 | Epic 12 deferred routes | Epic 12 | Epic 13 | Done |
| E13-A4 | Validate library reusability with Epic 14 | Epic 13 | Epic 14 | Done |
| E13-A5 | Add architecture decision notes to route files | Epic 13 | Epic 13 | Ongoing |
| E14-A4 | Plan Epic 15 | Epic 14 | Epic 15 | Done |
| E15-A5-OLD | Include QA in Story kickoff | Epic 15 | Epic 16 | Done |
| E16-A4 | Epic 16 retrospective | Epic 16 | Epic 16 | Done |
| E17-A8 | Epic 17 retrospective | Epic 17 | Epic 17 | Done |
| E20-A8 | Epic 20 retrospective | Epic 20 | Epic 20 | Done |
| E13-A1 | Document patterns "in the moment" | Epic 13 | Epic 14 | Done |
| E13-A2 | Create shared test-fixtures.ts | Epic 13 | Epic 14 | Done |
| E14-A1 | Add Kysely connection guard to library template | Epic 14 | Epic 15 | Done |
| E14-A2 | Improve test-fixtures with unique naming | Epic 14 | Epic 15 | Done |
| E14-A3 | Plan Epic 15 | Epic 14 | Epic 15 | Done |
| E20-A1 | Resolve TD-037: ~300+ type errors in API package | Epic 20 | Epic 23 | Done | Resolved during Epic 23 API Detachment |

---

## How to Update This Document

1. **When an action item is completed:**
   - Move from Priority section above to the corresponding P{0..3} subsection in Archive
   - Update "Last Updated" date

2. **When a new action item is created:**
   - Add to the appropriate Priority section above
   - Include: ID, Action, From (epic), Owner, Status

3. **When verifying unclear items:**
   - Check if item was actually completed in subsequent epics
   - Update status to Done or Won't Fix

---

## ID Format

Format: `E{EpicNumber}-A{ActionNumber}`

Examples:
- `E8-A1` = Epic 8, Action 1
- `E15-A2` = Epic 15, Action 2

_Last Updated: 2026-04-13T00:00:00Z_
