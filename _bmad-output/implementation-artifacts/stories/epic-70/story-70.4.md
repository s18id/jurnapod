# Story 70.4: CI Gates, CSP/Browser Hardening, Bundle/Performance Budgets

Status: backlog

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`, use `npx tsx scripts/update-sprint-status.ts --epic 70 --story 70-4 --title ci-gates-csp-browser-hardening-bundle-performance-budgets --status <status>` and run `npx tsx scripts/validate-sprint-status.ts --epic 70` after the update.

## Story

As a **release engineer**,  
I want **backoffice CI, browser hardening, CSP, and bundle budgets to be enforced**,  
So that **the static SPA release is safe, measurable, and resistant to regressions**.

## Context

Kickoff build evidence shows the backoffice build passes but emits a P2 chunk-size warning. This story owns the bundle baseline, budget gate, route chunk audit, CSP/header verification, and CI gate integration.

## Test Scenario Review Checkpoint (MANDATORY)

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| PR modifies `apps/backoffice` | Happy | CI workflow path filter or equivalent evidence |
| Workspace scripts execute | Happy | Script smoke commands |
| Bundle budget exceeded | Error | Bundle gate test or script fixture |
| Domain route bundles split | Edge | Build report/chunk audit |
| CSP headers present | Happy / Error | Staging/static header verification evidence |
| Raw `fetch` outside typed client | Error | Lint/check gate |

**Sign-off:** Test scenarios MUST be reviewed before implementation begins.

## API Contract Verification (MANDATORY for UI Stories)

No new backend endpoints are in scope. CSP/browser verification MUST include auth refresh and operations progress/WebSocket/SSE behavior where the deployment environment supports it.

## Acceptance Criteria

**AC1: Backoffice CI gates**  
Given a PR modifies `apps/backoffice`, when CI runs, then backoffice lint, typecheck, build, test, e2e, axe, and bundle checks run.

**AC2: Standardized scripts**  
Given CI uses story validation commands, when the backoffice workspace scripts execute, then `test:unit`, `test:single`, and `build:report` exist and run.

**AC3: Bundle budget gate**  
Given bundle size exceeds the approved budget, when the bundle gate runs, then it fails or emits a blocking diagnostic according to configured threshold.

**AC4: Route chunk audit**  
Given route chunks are inspected, when the build report is reviewed, then domain route bundles are split and login does not include large domain pages.

**AC5: CSP ownership and verification**  
Given CSP header verification runs, when required directives are checked, then the static SPA deployment has required directives and the runbook identifies the DevOps/infra owner, or the backoffice squad lead when no separate infra owner exists.

**AC6: Raw API bypass gate**  
Given domain code contains raw `fetch` outside `lib/api`, when lint/check runs, then the gate fails.

## Tasks / Subtasks

- [ ] Capture bundle baseline with `npm run build:report -w @jurnapod/backoffice`.
- [ ] Add or verify CI jobs for lint, typecheck, build, unit, e2e, axe, and bundle gates.
- [ ] Add route chunk audit and budget threshold.
- [ ] Add or verify raw `fetch`/`axios` boundary check.
- [ ] Document CSP and browser-hardening requirements for static SPA deployment.
- [ ] Record evidence and P2/P3 deferrals in completion report.

## Files to Modify

| File / Area | Action | Description |
|-------------|--------|-------------|
| `.github/workflows/` | Modify/Create | Backoffice CI gates |
| `apps/backoffice/package.json` | Modify if needed | Standard scripts and gate commands |
| `apps/backoffice/` build/config files | Modify if needed | Bundle report/budget checks |
| `docs/` | Modify/Create | CSP/browser hardening documentation |
| `_bmad-output/implementation-artifacts/stories/epic-70/story-70.4.completion.md` | Create | Completion evidence |

## Estimated Effort

3–5 days

## Risk Level

Medium

## Dev Notes

- Current P2 kickoff risk: Vite chunk warning includes `pages` at `556.83 kB`.
- CI changes MUST NOT weaken existing API/backend required gates.
- Static SPA CSP MUST be validated against auth refresh and operations progress behavior before production sign-off.

## File List

- `_bmad-output/implementation-artifacts/stories/epic-70/story-70.4.md` (new)
