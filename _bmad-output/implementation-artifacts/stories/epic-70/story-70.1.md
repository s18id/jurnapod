# Story 70.1: WCAG 2.2 AA Accessibility Audit and Remediation

Status: in-progress

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`, use `npx tsx scripts/update-sprint-status.ts --epic 70 --story 70-1 --title wcag-22-aa-accessibility-audit-and-remediation --status <status>` and run `npx tsx scripts/validate-sprint-status.ts --epic 70` after the update.

## Story

As a **keyboard-only or assistive-technology backoffice user**,  
I want **the redesigned backoffice shell and critical flows to meet WCAG 2.2 AA**,  
So that **admin, operations, and financial review work can be completed without accessibility barriers**.

## Context

Epic 70 has been explicitly unfrozen for `apps/backoffice` by Ahmad on 2026-05-21. This story starts the final hardening epic by auditing and remediating accessibility defects in the redesigned backoffice primitives and critical workflows.

Pre-flight evidence recorded during kickoff:

| Command | Result |
|---------|--------|
| `npm run lint -w @jurnapod/api` | Pass with existing warnings: 163 `no-explicit-any`, 0 errors |
| `npm run typecheck -w @jurnapod/api` | Pass |
| `npm run lint -w @jurnapod/backoffice` | Pass |
| `npm run build:libs` | Pass |
| `npm run typecheck -w @jurnapod/backoffice` | Pass |
| `npm run build -w @jurnapod/backoffice` | Pass with P2 chunk-size warning |

## Epic 69 Carry-Forward Closeout Checklist

This checklist MUST be satisfied before this story moves to `done`:

- [ ] Story-level unfreeze evidence is recorded in the completion note.
- [ ] Contract verification is recorded for any API-backed flow exercised by the accessibility tests.
- [ ] Verified audit-link semantics are recorded for any audit or financial evidence UI touched by the story.
- [ ] Reviewer GO is recorded with no unresolved P0/P1 findings.
- [ ] Story owner sign-off is recorded.
- [ ] `npx tsx scripts/validate-sprint-status.ts --epic 70` passes after status updates.

## Test Scenario Review Checkpoint (MANDATORY)

### Pre-Implementation Checklist

- [x] Happy paths identified: login, navigation, EntityTable filtering, role editor, import/export, financial review.
- [x] Error paths identified: form validation, auth denial, disabled actions, failed save notification.
- [x] Edge cases identified: sticky headers, drawers/dialogs, notification banners, focus return, screen-reader live regions.
- [x] Test fixture needs identified: existing backoffice mock/API test fixtures; no DB-backed business setup is introduced by this story.
- [x] Integration test scope defined: Playwright e2e/axe for critical routes; unit/component tests for primitive behavior as needed.
- [x] Negative auth test role selected: low-privilege or denied-state route fixtures MUST be used for permission-denied UI.

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Keyboard-only login and route navigation | Happy | Playwright e2e |
| EntityTable tab order and visible focus | Happy / Edge | Playwright e2e or component test |
| Drawer/dialog focus trap and focus return | Edge | Component/e2e test |
| Form validation links controls to error text | Error | Component/e2e test |
| Notification live region announcement | Happy / Edge | Component/e2e assertion |
| Automated axe serious/critical scan | Edge | `qa:e2e:axe` |

**Sign-off:** Test scenarios MUST be reviewed before implementation begins.

**Sign-off recorded:** 2026-05-21 — Ahmad approved implementation; primary BMAD build agent recorded the route list and test scenario scope before coding starts.

## Critical Redesigned Route List (Implementation Start Gate)

The Story 70.1 accessibility audit MUST cover this route set. A route MAY use mocked API fixtures for frontend accessibility assertions, but mocked responses MUST preserve the expected typed-client envelope shape.

| Route | Surface / Component Coverage | Priority | Fixture / Permission Notes |
|-------|------------------------------|----------|----------------------------|
| `/` | Login form labels, keyboard submit, validation error announcement | P1 | Unauthenticated health/user mocks |
| `/#/dashboard` | Shell, primary navigation, dashboard panels, notifications | P1 | Authenticated owner/admin fixture |
| `/#/users` | `EntityTable`, filters, pagination, admin list UX | P1 | Users API mock |
| `/#/roles` and `/#/roles/:id` | Role editor, `PermissionMatrix`, review step | P1 | Roles and module-role mocks; owner/admin permissions |
| `/#/module-roles` | Permission matrix management | P1 | Explicit `platform.roles.MANAGE` permission fixture |
| `/#/items` | Dense inventory `EntityTable`, row actions, `DetailDrawer` | P1 | Inventory module enabled and item mocks |
| `/#/items/import` | Import wizard, validation summary, staged form flow | P1 | Import route mocks; no backend business write |
| `/#/prices` or `/#/prices/import` | Pricing grid and import/export-adjacent flow | P2 | Inventory module enabled and price mocks |
| `/#/operations` | Operations center, `AsyncJobDrawer`, job-status indicators | P1 | Explicit `platform.operations.READ` permission fixture |
| `/#/audit` or `/#/audit-logs` | Audit explorer, filters, detail drawer | P1 | Explicit `platform.audit.READ` permission fixture |
| `/#/purchasing/invoices` | AP invoice review surface | P1 | Purchasing module enabled and invoice mocks |
| `/#/purchasing/ap-exceptions` | AP exception worklist and financial evidence links | P1 | Purchasing module enabled; `accounting.journals.ANALYZE` or `purchasing.suppliers.ANALYZE` permission fixture |
| `/#/journals` | Journal post/review financial flow | P1 | `accounting.journals.READ` permission fixture |
| `/#/trial-balance` | Financial report filters and table | P1 | `accounting.reports.ANALYZE` permission fixture |
| `/#/general-ledger` | Financial report filters and table | P1 | `accounting.reports.ANALYZE` permission fixture |

## Known Implementation Risks From Readiness Audit

| Risk ID | Severity | Finding | Required Treatment |
|---------|----------|---------|--------------------|
| R70-1-001 | P1 | Existing accessibility tests use stale report paths such as `/#/reports/trial-balance` and `/#/reports/general-ledger`; current routes are `/#/trial-balance` and `/#/general-ledger`. | Update tests to use current canonical routes before relying on axe evidence. |
| R70-1-002 | P1 | Existing axe checks exclude `color-contrast`, `scrollable-region-focusable`, and `page-has-heading-one`. | Remove exclusions or document a blocking exception with owner and deadline. |
| R70-1-003 | P1 | Existing authenticated test module mocks omit `purchasing`. | Expand mocks before testing purchasing routes. |
| R70-1-004 | P1 | Routes requiring explicit permissions (`/operations`, `/audit`, `/module-roles`) need `MOCK_USER.permissions`. | Add explicit permission fixtures for critical route coverage. |
| R70-1-005 | P2 | Existing Playwright tests use arbitrary `waitForTimeout`. | Replace waits touched by this story with app-state waits. |

## API Contract Verification (MANDATORY for UI Stories)

No new backend endpoints are in scope. Any route used by accessibility tests MUST rely on the existing typed API client or established route fixtures.

| Endpoint / Boundary | Expected Shape | Verified | Notes |
|---------------------|----------------|----------|-------|
| Auth/session route family | Existing typed-client contract | Pending | Required if login/session flows are exercised against API |
| Platform roles/users route family | Existing typed-client contract | Pending | Required if role editor is exercised against API |
| Import/export route family | Existing typed-client contract | Pending | Required if import/export flow is exercised against API |
| Accounting/purchasing review routes | Existing typed-client contract | Pending | Required if financial review flow is exercised against API |

## Acceptance Criteria

**AC1: Keyboard completion**  
Given keyboard-only navigation, when a user completes login → dashboard → user list → role editor → save review, then the flow completes without mouse input.

**AC2: EntityTable focus visibility**  
Given EntityTable focus movement, when the user tabs through filters, rows, and actions, then tab order is logical and visible focus is never hidden behind sticky headers.

**AC3: Drawer/dialog focus management**  
Given a dialog or drawer opens, when the user interacts by keyboard, then focus is trapped inside it and returns to the triggering element on close.

**AC4: Programmatic validation errors**  
Given validation errors exist, when a screen reader or keyboard user reviews the form, then each control exposes error text programmatically and a form-level summary links to invalid fields.

**AC5: Notification announcement**  
Given a notification appears, when assistive technology observes live regions, then an appropriate live-region announcement is available.

**AC6: Axe gate**  
Given `npm run qa:e2e:axe -w @jurnapod/backoffice` runs, then serious and critical axe violations are zero for critical routes.

## Tasks / Subtasks

- [ ] Finalize the critical route list used by accessibility scans.
- [ ] Audit shell, navigation, tables, drawers, dialogs, forms, notifications, permission matrix, dashboards, and review panels.
- [ ] Remediate shared primitives directly; do not patch each consumer independently.
- [ ] Add or update Playwright/axe coverage for the critical route list.
- [ ] Record any P2/P3 deferrals with owner, deadline, and success criterion.

## Files to Modify

| File / Area | Action | Description |
|-------------|--------|-------------|
| `apps/backoffice/src/` | Modify | Accessibility remediation in shared primitives and affected consumers |
| `apps/backoffice/e2e/` or Playwright test locations | Modify/Create | Keyboard and axe coverage |
| `_bmad-output/implementation-artifacts/stories/epic-70/story-70.1.completion.md` | Create | Completion evidence |

## Estimated Effort

3–5 days

## Risk Level

High

## Dev Notes

- Backend ACL remains authoritative; frontend permission checks are UX mirrors only.
- No new domain feature scope is allowed.
- No raw `fetch`/`axios` calls may be introduced outside the typed API client boundary.
- Shared accessibility defects MUST be fixed in reusable primitives unless the defect is unique to one consumer.
- The kickoff bundle warning is tracked as P2 for Story 70.4, not as a blocker for this story.

## File List

- `_bmad-output/implementation-artifacts/stories/epic-70/story-70.1.md` (new)
