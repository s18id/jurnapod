# Story 67-4 Completion Report

**Story:** Import Workflow Redesign — Upload → Map → Validate → Apply → Complete  
**Epic:** 67 - Backoffice Catalog Operations  
**Status:** Done — Reviewer GO-WITH-FOLLOWUPS + Owner Sign-off  
**Completed:** 2026-05-18

---

## Summary

Story 67-4 implements a staged backoffice import workflow for items and prices using the existing backend import contract. The implementation replaces the row-by-row page import entry points with a staged flow that supports upload, mapping, validation, synchronous apply with XHR progress, inline completion results, client-side error CSV generation, sessionStorage recovery, and permission gating.

The final reviewer recommendation is **GO-WITH-FOLLOWUPS**. The story remains in `review` until owner sign-off is explicit.

---

## Files Created/Modified

| File | Change |
|------|--------|
| `apps/backoffice/src/hooks/use-import.ts` | Extended staged import hook with sessionStorage persistence, recovery normalization, file hash tracking, expiry clearing on 404/410, and synchronous apply progress semantics. |
| `apps/backoffice/src/lib/api-client.ts` | Adjusted XHR progress semantics to support byte progress mode without fake row counts. |
| `apps/backoffice/src/components/import-step-badges.tsx` | Updated staged import step badge behavior for the new workflow. |
| `apps/backoffice/src/components/import-progress.tsx` | Updated progress display so byte-based apply progress shows request percentage and row counts only appear when real result counts exist. |
| `apps/backoffice/src/features/import/import-fields.ts` | Added import field definitions for staged item/price mapping. |
| `apps/backoffice/src/features/import/import-permission-gates.ts` | Added explicit import permission gate helpers for items and prices entry points. |
| `apps/backoffice/src/features/import/error-csv-generator.ts` | Added client-side CSV generation for validation and apply errors. |
| `apps/backoffice/src/features/import/upload-step.tsx` | Added staged upload step with CSV/XLSX validation, preview, template download, and mobile file picker behavior. |
| `apps/backoffice/src/features/import/map-step.tsx` | Added staged mapping step with required-field enforcement and mobile one-row navigation. |
| `apps/backoffice/src/features/import/validate-step.tsx` | Added staged validation summary/report step with error CSV support and remap path. |
| `apps/backoffice/src/features/import/apply-step.tsx` | Added apply confirmation/completion step for synchronous apply and inline result summary. |
| `apps/backoffice/src/features/import/staged-import-workflow.tsx` | Added workflow container composing existing import assets and new staged steps. |
| `apps/backoffice/src/features/items-page.tsx` | Wired items import modal to staged workflow while preserving permission gating. |
| `apps/backoffice/src/features/prices-page.tsx` | Wired prices import modal to staged workflow using existing pricing mutation permission UX. |
| `apps/backoffice/src/features/item-import-page.tsx` | Wired direct item import page with staged workflow and permission-denied guard. |
| `apps/backoffice/src/features/price-import-page.tsx` | Wired direct price import page with staged workflow and permission-denied guard. |
| `apps/backoffice/__test__/unit/features/import/staged-import-workflow.test.ts` | Added focused unit coverage for helper behavior, permission gates, session recovery normalization, error CSV generation, and progress semantics. |
| `apps/backoffice/vitest.config.ts` | Included staged import unit test path. |

---

## Acceptance Criteria Evidence

| AC | Status | Evidence |
|----|--------|----------|
| AC1 | ✅ Complete | Upload step validates CSV/XLSX, calls staged upload, and displays first-five-row preview. |
| AC2 | ✅ Complete | Mapping step shows detected columns, required fields, and blocks validation until required mappings exist. |
| AC3 | ✅ Complete | Validate step calls staged validate endpoint and displays valid/invalid counts with grouped errors. |
| AC4 | ✅ Complete | Validation report supports row-level errors, remap path, and client-side validation error CSV generation. |
| AC5 | ✅ Complete | Apply step shows confirmation before calling staged apply. |
| AC6 | ✅ Complete | Apply uses synchronous `applyWithProgress`; completion shows inline result counts and error CSV action when failures exist. |
| AC7 | ✅ Complete with follow-up | sessionStorage persists upload ID, file hash, step, columns, sample data, and mappings; recovered validation/apply/results states normalize to mapping unless required state exists; 404/410 clears storage on retry. Proactive mount-time server verification remains a P2 follow-up because no lightweight session check exists. |
| AC8 | ✅ Complete | Client-side error CSV generation covers validation and apply error outputs. |
| AC9 | ✅ Complete | Template download uses existing backend template hook. |
| AC10 | ✅ Complete | Items direct/page import gates require `inventory.items.CREATE`; prices import preserves existing pricing mutation UX gate; unauthorized direct pages show permission alert and no workflow. |
| AC11 | ✅ Complete | Mobile workflow uses full-screen/modal-oriented layout, native picker behavior, single-row mapping navigation, validation details expander, and full-screen apply confirmation behavior. |

---

## Validation Evidence

| Gate | Result | Evidence |
|------|--------|----------|
| Focused unit tests | ✅ Pass — 8/8 | `logs/story-67-4-import-workflow-tests-r2.log` |
| Lint | ✅ Pass | `logs/story-67-4-lint-r2.log` |
| Typecheck | ✅ Pass | `logs/story-67-4-typecheck-r2.log` |
| Build | ✅ Pass | `logs/story-67-4-build-r2.log` |
| Diff whitespace | ✅ Pass | `git diff --check` |

---

## Review Outcome

**Decision:** GO-WITH-FOLLOWUPS.

| Severity | Finding | Resolution |
|----------|---------|------------|
| P0 | None | No action required. |
| P1 | Direct import pages bypassed permission gating | Fixed with direct page permission guards and focused tests. |
| P1 | Recovered sessions could land on blocked validation/apply/results steps | Fixed by normalizing recovered states to mapping unless required result state exists; 404/410 clears storage on retry. |
| P1 | Sequencing guardrail risk from staged switchover | Accepted after permission/session/progress fixes and focused tests; no duplicate row-by-row logic reintroduced. |
| P2 | Apply progress showed fake row counts for XHR byte progress | Fixed by displaying byte/request percentage and showing row counts only from real apply results. |
| P2 | Helper-only tests were insufficient | Expanded focused tests to cover permission gates, session normalization, progress semantics, and CSV helpers. |

Final targeted verification returned **GO-WITH-FOLLOWUPS** with no P0/P1 blockers.

---

## Known Follow-ups

| Severity | Follow-up | Rationale |
|----------|-----------|-----------|
| P2 | Add proactive mount-time recovered-session verification if backend exposes a lightweight session check. | Current implementation safely resumes at mapping and clears storage on 404/410 during validate/apply retry; no lightweight check exists. |
| P2 | Add component-level render tests for direct import page denied/allowed states. | Permission helper coverage exists; component render coverage would improve regression confidence. |
| P2 | Add API real-DB integration tests for import upload/validate/apply and CASHIER denial. | DB-backed backend import behavior belongs in `apps/api/__test__/integration/import/` and MUST use real DB. |
| P2 | Run full backoffice E2E import journey including mobile viewport. | Focused unit/build gates passed; browser-level import journey remains future validation. |

---

## Owner Sign-off

- ✅ Ahmad granted owner sign-off on 2026-05-18.
- ✅ Story marked done after sprint-status validation passed.

---

**Story has reviewer GO-WITH-FOLLOWUPS and owner sign-off.**
