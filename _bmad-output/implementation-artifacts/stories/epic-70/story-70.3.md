# Story 70.3: Test Pyramid Completion — Unit, Component, E2E, Accessibility, Contract Smoke

Status: backlog

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`, use `npx tsx scripts/update-sprint-status.ts --epic 70 --story 70-3 --title test-pyramid-completion-unit-component-e2e-accessibility-contract-smoke --status <status>` and run `npx tsx scripts/validate-sprint-status.ts --epic 70` after the update.

## Story

As a **release owner**,  
I want **a complete and deterministic backoffice test pyramid**,  
So that **critical admin, operations, purchasing, accounting, audit, and accessibility flows are release-gated**.

## Context

This story completes frontend test coverage for pure helpers, dense primitives, multi-browser critical flows, axe scans, and typed API contract smoke tests.

## Test Scenario Review Checkpoint (MANDATORY)

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Permission, routing, i18n, formatting helpers | Happy / Error | Vitest unit |
| EntityTable, FilterBar, DetailDrawer, AsyncJobDrawer, PermissionMatrix, ReviewPanel | Happy / Edge | Playwright component |
| Login/session refresh and route guard denial | Happy / Error | Playwright e2e across Chromium, Firefox, WebKit |
| User role edit, inventory import validation, operations job progress | Happy / Error | Playwright e2e |
| AP invoice review and journal post review | Happy / Error | Playwright e2e |
| Representative typed API client contracts | Happy / Error | Contract smoke tests |

**Sign-off:** Test scenarios MUST be reviewed before implementation begins.

## API Contract Verification (MANDATORY for UI Stories)

Representative auth, admin, inventory, operations, purchasing, accounting, and audit requests MUST match expected typed-client contract shapes. No raw `fetch`/`axios` calls may be introduced outside `lib/api` boundaries.

## Acceptance Criteria

**AC1: Unit coverage**  
Given the unit suite runs, when helpers for permissions, routing, i18n, formatting, and workflow state machines execute, then they pass.

**AC2: Component coverage**  
Given component tests run, when `EntityTable`, `FilterBar`, `DetailDrawer`, `AsyncJobDrawer`, `PermissionMatrix`, and `ReviewPanel` are exercised, then interaction tests pass.

**AC3: Multi-browser e2e coverage**  
Given e2e runs across Chromium, Firefox, and WebKit, when critical flows run, then login/session refresh, route guard denial, user role edit, inventory import validation, operations job progress, AP invoice review, and journal post review pass.

**AC4: Axe coverage**  
Given axe checks run, when critical pages are scanned, then serious and critical violations are zero.

**AC5: Contract smoke**  
Given typed API contract smoke tests run, when representative route families are checked, then auth, admin, inventory, operations, purchasing, accounting, and audit requests match expected contract shape.

## Tasks / Subtasks

- [ ] Audit current backoffice unit, component, e2e, and axe coverage.
- [ ] Add missing deterministic tests for dense primitives.
- [ ] Add multi-browser critical flow coverage.
- [ ] Add typed API client contract smoke tests.
- [ ] Ensure long-running test commands use logs/PID tracking when run by agents.
- [ ] Record evidence in completion report.

## Files to Modify

| File / Area | Action | Description |
|-------------|--------|-------------|
| `apps/backoffice/__test__/unit/` | Modify/Create | Unit tests |
| `apps/backoffice/e2e/` | Modify/Create | E2E and axe tests |
| `apps/backoffice/playwright*.config.*` | Modify if needed | Deterministic multi-browser configuration |
| `_bmad-output/implementation-artifacts/stories/epic-70/story-70.3.completion.md` | Create | Completion evidence |

## Estimated Effort

4–6 days

## Risk Level

High

## Dev Notes

- Playwright tests MUST use deterministic fixture data and explicit app-state waits.
- Arbitrary sleeps MUST NOT be used as the pass condition.
- DB-backed API behavior MUST NOT be mocked if backend business logic is exercised.

## File List

- `_bmad-output/implementation-artifacts/stories/epic-70/story-70.3.md` (new)
