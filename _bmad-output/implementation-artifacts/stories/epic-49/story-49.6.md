# Story 49.6: CI Pipeline Reliability Enforcement

**Status:** backlog

## Story

As a **scrum master**,
I want the CI pipeline to enforce lint, typecheck, and 3-consecutive-green integration test evidence as a formal sprint gate,
So that no PR can be merged that degrades test reliability or reintroduces flaky behavior.

---

## Context

Epic 48 story 48.5 established the `validate-sprint-status.ts` script for sprint closure gating. Story 49.6 builds on that by wiring the full CI pipeline to enforce:
1. Lint passes (0 errors, warnings acceptable)
2. Typecheck passes
3. All critical integration suites pass
4. 3-consecutive-green rerun evidence for critical suites is captured and attached to the epic completion

**Prerequisite**: Epic 48 story 48.6 (Type/Lint Debt Containment) must be landed before this story can close the lint/typecheck gate. If 48.6 is not landed, this story updates the CI gate to reflect the current state (0 errors target vs 180 warnings baseline).

## Acceptance Criteria

**AC1: CI Lint Gate**
`.github/workflows/ci.yml` (or equivalent) enforces `npm run lint -w @jurnapod/api` as a required check. Non-zero lint exit = CI failure. Log output captured as CI artifact.

**AC2: CI Typecheck Gate**
CI enforces `npm run typecheck -w @jurnapod/api` as a required check. Non-zero typecheck exit = CI failure.

**AC3: CI Integration Test Gate**
CI runs critical suite integration tests as a required check. All suites must pass (0 failures) for CI to be green. Failed suite output captured as CI artifact.

**AC4: 3-Consecutive-Green Evidence Capture**
Story 49.6 coordinates the full 3×rerun of all critical suites across stories 49.2–49.5 and produces a consolidated evidence manifest at:
- `_bmad-output/planning-artifacts/epic-49-3consecutive-green-evidence.md`

The manifest lists each suite, run 1/2/3 results, total test count, and log file path.

**AC5: Sprint Status Validation**
`scripts/validate-sprint-status.ts --epic 49` must return exit 0 (no P0/P1 open in `epic-49-risk-register.md`) when all Epic 49 stories are marked done.

**AC6: CI Workflow Documentation**
Document the CI gate structure in `docs/ci-gates.md` or inline in `.github/workflows/ci.yml` with comments explaining:
- Required vs optional checks
- How to bypass (not allowed for required checks without explicit override)
- Artifact retention policy for rerun evidence logs

---

## Dev Notes

- **Epic 48.6 prerequisite**: If lint has 0 errors but 180 warnings (current state), the lint gate is green. If 48.6 introduces new warnings, it must fix them before 49.6 closes.
- **CI runner time**: Running all critical suites 3 times in CI may exceed runner time limits. Prioritization: (a) financial + ACL suites, (b) sync suites, (c) remaining suites. Non-critical suites may run in a separate "extended" job.
- **Artifact retention**: Store rerun evidence logs as CI artifacts for 30 days post-epic-close.
- **GitHub Actions**: Use `actions/upload-artifact` to capture log files; `actions/download-artifact` in a dependent job to assemble the evidence manifest.

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/ci.yml` | Modify | Add lint + typecheck + 3-consecutive-green as required checks |
| `docs/ci-gates.md` | Create | CI gate structure documentation |
| `_bmad-output/planning-artifacts/epic-49-3consecutive-green-evidence.md` | Create | Consolidated evidence manifest |

## Validation Evidence

```bash
# Lint gate
npm run lint -w @jurnapod/api
# Expected: exit 0

# Typecheck gate
npm run typecheck -w @jurnapod/api
# Expected: exit 0

# Sprint status gate
npx tsx scripts/validate-sprint-status.ts --epic 49
# Expected: exit 0 when all 49.x stories done + no open P0/P1
```

### CI Gate Flow

```
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint -w @jurnapod/api
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - run: npm run typecheck -w @jurnapod/api
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:integration -w @jurnapod/api
    artifacts: logs/
  evidence-capture:
    runs-on: ubuntu-latest
    needs: [lint, typecheck, integration-tests]
    steps:
      - assemble 3-consecutive-green manifest
```

All jobs must pass for `epic-49` to be marked `done`.
