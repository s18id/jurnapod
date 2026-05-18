# Action Items Tracker

**Last Updated:** 2026-05-19T00:00:00Z
**Review Cadence:** Monthly at sprint retrospective

---

## Summary

| Priority | Open | Done | Won't Fix | Total |
|----------|------|------|-----------|-------|
| P0 | 0 | 4 | 0 | 4 |
| P1 | 0 | 12 | 0 | 12 |
| P2 | 3 | 15 | 0 | 18 |
| P3 | 1 | 5 | 3 | 9 |
| **Total** | **5** | **35** | **3** | **43** |

> **Note:** The Historical section (Pre-Epic 8) is tracked separately (32 items) and excluded from summary totals above.

---

## P0 - Critical (Do Immediately)

*(empty — no open P0 items)*

---

## P1 - High (Do Next Sprint)

*(empty — no open P1 items)*

---

## P2 - Medium (Do This Quarter)

| ID | Action | From | Owner | Status |
|----|--------|------|-------|--------|
| E66-A1 | Introduce a dedicated `platform.audit` ACL resource and migrate generic audit explorer routes from `platform.settings.READ` when the ACL migration story is approved | Epic 66 retro | Architecture team | Open — deferred from Epic 67; disposition required before Story 68-4 starts |
| E66-A2 | Align generated OpenAPI query parameter types with runtime Zod validation for generic audit list filters | Epic 66 retro | API platform team | Open — deferred from Epic 67; verify before Story 68-4 spec finalization |
| ~~E67-A1~~ | ~~Verify backend bulk operation endpoint contracts before story specification~~ | ~~Epic 67 retro~~ | ~~Architecture~~ | ~~Closed — Story 68-0 delivered contract artifact `story-68-0-contract.md` with full backend operations/progress/import/export/sync transport contract~~ |
| E67-A2 | Add rendered component interaction tests for ExportDialog and ImportWizard | Epic 67 retro | QA | Open — due at Epic 68 pre-close |


---

---

## Archive: Formally Closed Items

### P0

*(no changes)*

### P1

*(no changes)*

### P2

| ID | Action | From | Closed In | Notes |
|----|--------|------|----------|-------|
| **E67-A1** | Verify backend bulk operation endpoint contracts before story specification | Epic 67 retro | Epic 68 kickoff (Story 68-0) | Contract artifact `_bmad-output/implementation-artifacts/stories/epic-68/story-68-0-contract.md` delivered. Source-inspection evidence covers: route mounts, endpoint inventory, SSE/polling contracts, retry/cancel gaps, auth/CORS/proxy findings, WebSocket `/ws` P0 auth bypass, and dependent story impact table (68-1/68-2/68-3/68-5). |

---

## P3 - Low (Backlog)

| ID | Action | From | Owner | Status |
|----|--------|------|-------|--------|
| E41-A7 | Set sunset milestone for removing explicit `accessToken` arg from all production call sites | Epic 41 | PM | Sunset at program end (post-Epic 61): bridge removal + `session.ts` migration as first action when backoffice freeze lifts |

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
| **E45-A1** | Add sprint-status.yaml append-only rule to dev story template and AGENTS.md | Epic 45 | Epic 45 | Added rule + canonical utility + validation script to prevent file overwrite |
| **E37-A1** | Create retrospective artifacts immediately at epic close, not retroactively | Epic 37 | Epic 54 retro | All 8 missing retrospectives populated 2026-05-03; retroactive population evidenced in sprint-status validation |
| **E46-A1** | Add sprint-status utility + validation as mandatory pre-step in story template | Epic 46 | Epic 46 | `scripts/update-sprint-status.ts` and `scripts/validate-sprint-status.ts` in active use; enforced in all post-E46 epics |
| **E46-A2** | Limit retrospectives to MAX 2 action items with explicit owners/deadlines | Epic 46 | Epic 46 | Enforced in retrospective workflow; all post-E46 retros (Epics 46–53) respect 2-item cap |
| **E46-A4** | Verify sprint-status.yaml integrity before marking any epic done (human gate) | Epic 46 | Epic 46 | `npx tsx scripts/validate-sprint-status.ts` run as mandatory pre-close gate for all post-E46 epics |
| **E48-A2** | Q49-001 execution planning (critical path) | Epic 48 | Epic 49 | Decomposition passes documented; consumer-path integrity constraints verified; Pass 1 marked `ready-to-execute` in `_bmad-output/planning-artifacts/epic-49-q49-001-test-fixtures-execution-pass-1.md` |
| **E48-A1** | Kickoff debt signal improvement | Epic 48 | Epic 49 | Kickoff scorecard now distinguishes sprint-introduced lint errors from pre-existing debt with explicit evidence paths in `_bmad-output/planning-artifacts/epic-49-solid-dry-kiss-scorecard.md` |
| **E49-A1** | Second-Pass Review for Determinism Work | Epic 49 | Epic 50 | Implemented via `.github/pull_request_template.md` second-pass checklist + Story 50.X mandates |
| **E49-A2** | Tiered Audit Prioritization Template | Epic 49 | Epic 50 | Implemented via Story 50.1 tiered audit table with Critical→High→Medium and rationale |
| **E54-A1** | Add test-scenario-review checkpoint to story kickoff template | Epic 15 retro | E54 batch | Added "Test Scenario Review Checkpoint (MANDATORY — E54-A1)" section to `docs/templates/story-spec-template.md` |
| **E54-A2** | Add `requireAccess` guards to credit-notes route handlers | Epic 39 retro | E54 batch | Added READ/CREATE/UPDATE guards using existing `sales.invoices` resource (matches access-scope-checker mapping); typecheck passes |
| **E51-A1** | Fix auto-snapshot race in fiscal year close | Epic 51 (deferred) | Epic 55 | Race window closed: removed `hasAutoSnapshotForFiscalYearEnd` from `fiscal-years.ts`; snapshot service `SELECT ... FOR UPDATE` + `inputsHash` guard handles idempotency atomically. Evidence: Story 55.1 AC6 concurrent test (2 parallel auto calls → 1 row, same ID), Story 55.5 AC1 race simulation test (manual→auto returns same snapshot). E51-A1 action item closed. |
| **E55-A1** | Add CI lint gate blocking new business-logic DB triggers | Epic 55 retro | Epic 56 | Story 56.2: `scripts/lint-migrations.ts` created; `npm run lint:migrations` exits 0; CI job `lint-migrations` wired as required gate; all 16 existing business-logic triggers grandfathered with `-- lint:allow-business-trigger` |
| **E55-A2** | Resolve archive flow trigger constraint before AR work begins | Epic 55 retro | Epic 56 | Story 56.1: Migration 0201 replaces `trg_ap_reconciliation_snapshots_before_update` to allow `status='ARCHIVED'` transitions while preserving supersession chain path (0193). 24/24 integration tests pass. |

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
| **E45-A2** | Create canonical sprint-status utility function | Epic 45 | Epic 45 | Created `scripts/update-sprint-status.ts` and `scripts/validate-sprint-status.ts` |
| **E45-A3** | Track 156 no-explicit-any warnings as TD-038 | Epic 45 | Epic 45 | Added TD-038 to TECHNICAL-DEBT.md |
| **E45-A4** | Add sprint-status.yaml lint/validation script | Epic 45 | Epic 45 | Created `scripts/validate-sprint-status.ts` health check |
| **E46-A3** | Investigate automated lint warning threshold tracking in CI | Epic 46 | Epic 46 | Pending — E46 backlog |
| **E54-A6** | Clean up orphaned `treasury.accounts` permission matrix entry | Epic 39 retro | E54 batch | Verified no code uses `treasury.accounts`; removed `accounts` from treasury module resource list in AGENTS.md permission matrix |
| **E54-A3** | Author `no-datetime-reimplementation` ESLint rule | Epic 52 retro | E54 batch | Added rule to `eslint-plugin-jurnapod-test-rules.mjs`; detects `toEpochMs`/`fromEpochMs`/`toUtcInstant`/`fromUtcInstant`/`resolveEventTime` outside `packages/shared/src/schemas/datetime.ts`; 13 tests pass |
| **E54-A4** | Create table-sync integration test harness for conflict detection | Epic 52 retro | E54 batch | Created `packages/sync-core/__test__/integration/table-sync-conflict.integration.test.ts` with OK/DUPLICATE/ERROR scenarios; typecheck passes |
| **E45-A5a** | Add automated completion-note check to CI pipeline | Epic 44 | E54 batch | Created `scripts/validate-completion-notes.ts` with baseline+delta policy; 307 historical gaps captured in baseline; only NEW misses fail CI |
| **E45-A5b** | Enhance database compatibility testing (MySQL + MariaDB dual-DB CI) | Epic 44 | E54 batch | Audit confirmed dual-DB CI already implemented: `test-critical` and `test-extended` both run against `[mysql:8.0, mariadb:11.8]` matrix; no gaps found |
| **E54-A5** | Add seeded-data integration test for non-zero inventory reconciliation path | Epic 51 retro | E54 batch | Created `apps/api/__test__/integration/inventory-reconciliation-seeded.integration.test.ts`; tests cost layer creation, `inventory_item_costs` summary, partial consumption via `deductStockWithCost`, and subledger balance verification |
| **E58-A2** | Investigate and size concurrent posting deadlock; choose Option A (<1 sprint in Epic 59) or Option B (>1 sprint backlog with estimate) | Epic 58 retro | Epic 59 | Option A selected and executed via Story 59.3 evidence + gate contract. Validation output: `__EPIC59_GATE__ {"version":1,"gate":"E58_A2_OPTION_A","decision":"OPTION_A","story_59_3_evidence_present":true,"pass":true}` from `scripts/validate-epic-59-gates.ts` (exit 0). |
| **E58-A1** | Add cross-module error boundary verification to story kickoff artifacts and enforce `instanceof` + `error.name` fallback planning | Epic 58 retro | Epic 59 kickoff | Added `Cross-Module Error Boundary Verification (MANDATORY — E58-A1)` to `docs/templates/story-spec-template.md` and populated matrices in `story-59.1.md` through `story-59.6.md` with concrete error classes and fallback determinations. |
| **E60-A1** | Resolve ACCOUNTANT treasury READ seed data gap | Epic 60 retro | Epic 60 post-close | Migrations 0207 seeds canonical `module_roles` for ALL companies from `roles.defaults.json`; ACCOUNTANT `treasury.transactions=1` present for all 3,831 companies; `role-boundary-treasury.test.ts` passes 5/5 with no ad-hoc `setModulePermission` for ACCOUNTANT. |
| **E60-A2** | Eliminate pre-existing typecheck errors in `audit-log-filter.test.ts` | Epic 60 retro | Epic 60 post-close | `npm run typecheck -w @jurnapod/api` exits 0; zero type errors in `audit-log-filter.test.ts`. |

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

_Last Updated: 2026-05-18T00:00:00Z_
