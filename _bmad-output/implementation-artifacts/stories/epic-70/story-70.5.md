# Story 70.5: Production Rollout, Rollback, Observability, and Runbook

Status: backlog

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`, use `npx tsx scripts/update-sprint-status.ts --epic 70 --story 70-5 --title production-rollout-rollback-observability-and-runbook --status <status>` and run `npx tsx scripts/validate-sprint-status.ts --epic 70` after the update.

## Story

As a **release engineer or operator**,  
I want **a production rollout and rollback runbook for the static backoffice SPA**,  
So that **deployments can be executed, verified, and reversed without extra context**.

## Context

The production guide deploys static backoffice assets under `public_html/backoffice`. This story creates the operational runbook, smoke checklist, rollback procedure, and release evidence format.

## Test Scenario Review Checkpoint (MANDATORY)

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Fresh static asset deployment | Happy | Runbook command review |
| Rollback to previous backup directory | Error / Recovery | Runbook command review |
| Service-worker stale asset recovery | Edge | Checklist evidence |
| API health/auth/progress/static asset smoke | Happy | Post-deploy checklist |
| Release evidence capture | Happy | Runbook artifact table |

**Sign-off:** Test scenarios MUST be reviewed before implementation begins.

## API Contract Verification (MANDATORY for UI Stories)

No new backend endpoints are in scope. Production smoke verification MUST cover API health, auth refresh, operations progress, and static asset serving.

## Acceptance Criteria

**AC1: Deployable runbook**  
Given a release engineer reads the runbook, when they follow the documented steps, then they can deploy the backoffice static assets without extra context.

**AC2: Rollback procedure**  
Given rollback is required, when the release engineer follows the runbook, then exact commands and verification steps are available.

**AC3: Cache and stale-client recovery**  
Given service-worker cache is active, when stale clients exist, then cache-busting and stale-client recovery instructions are documented.

**AC4: Production health verification**  
Given production health verification runs, when checks execute, then API health, auth refresh, operations progress, and static asset serving are verified.

**AC5: Artifact capture**  
Given deployment completes, when the release record is filled, then build hash, bundle report, e2e result, axe result, and rollback point are recorded.

## Tasks / Subtasks

- [ ] Create `docs/runbooks/backoffice-frontend-rollout.md`.
- [ ] Document build/deploy command sequence.
- [ ] Document pre-deploy and post-deploy smoke checklist.
- [ ] Document rollback using existing backup directory pattern from `docs/PRODUCTION.md`.
- [ ] Document auth, CORS, CSP, WebSocket/SSE, cache invalidation, and stale service-worker risks.
- [ ] Add operator-facing release notes template.

## Files to Create

| File | Description |
|------|-------------|
| `docs/runbooks/backoffice-frontend-rollout.md` | Production rollout, rollback, smoke, and release evidence runbook |
| `_bmad-output/implementation-artifacts/stories/epic-70/story-70.5.completion.md` | Completion evidence |

## Estimated Effort

2–3 days

## Risk Level

Medium

## Dev Notes

- Runbook language MUST use RFC-style keywords for policy statements.
- Header/CSP ownership MUST match Story 70.4 output.
- If staging environment is unavailable, the gap MUST be recorded as P1/P2 depending on release impact.

## File List

- `_bmad-output/implementation-artifacts/stories/epic-70/story-70.5.md` (new)
