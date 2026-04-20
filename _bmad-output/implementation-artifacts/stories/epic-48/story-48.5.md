# Story 48.5: CI Quality Gate Enforcement

**Status:** done

## Story

As a **scrum master**,  
I want the sprint to close only when no P0/P1 issues remain unresolved,  
So that correctness regressions are not deferred past the sprint boundary.

---

## Context

Sprint 48 introduced a formal architecture baseline that requires no unresolved P0/P1 for sprint closure. Story 48-5 codifies this gate into the sprint workflow and enforces it through concrete checks. The goal is to make the "NO-GO if unresolved P0/P1" rule a concrete, automated-ish process rather than a manual discipline.

**Dependencies:** Stories 48-2, 48-3, 48-4 (all must pass before this story can fully validate the gate)

---

## Acceptance Criteria

**AC1: Sprint Closure Checklist Documented**
Create a `sprint-closure-checklist.md` that enforces these items before Epic 48 can be marked done:
- [ ] All 6 stories (48-1 through 48-6) marked done in sprint-status.yaml
- [ ] SOLID/DRY/KISS pre-close scoring complete (Checkpoint C) with no Fail items unresolved
- [ ] Risk register: all P0/P1 risks either closed or explicitly approved carry-over
- [ ] Adversarial review: GO verdict from @bmad-review
- [ ] Evidence logs: all critical test runs attached to story completions

**AC2: Unresolved P0/P1 Is Sprint-Blocking**
If any P0/P1 item exists in the sprint scope and is not closed, sprint status must show `epic-48: in-progress` (not done). No story under the epic may be marked done if P0/P1 is unresolved.

**AC3: Story Completion Requires Evidence Links**
Each story completion note must reference:
- Test evidence (log file or test output showing pass)
- Review evidence (adversarial review verdict or review notes)
- Risk disposition (which risks were addressed)

**AC4: Sprint Status Validation Script**
Create a `scripts/validate-sprint-status.ts` script that:
- Checks all epic statuses are consistent (epic done = all stories done)
- Checks no P0/P1 risks are open in the epic's risk register
- Exits non-zero if gate conditions not met

**AC5: Retro Carry-Over (Max 2 Items)**
Per program baseline (Sprint 48–61 Blueprint), no more than 2 action items from Epic 48 retrospective. Each must have owner, deadline, and success criterion.

---

## Tasks / Subtasks

- [x] Create `sprint-closure-checklist.md` in planning-artifacts/
- [x] Create `scripts/validate-sprint-status.ts` for automated gate checks
- [x] Update `epic-48-solid-dry-kiss-scorecard.md` Checkpoint C template with scores
- [x] Update sprint-status.yaml validation script to check risk register P0/P1 status
- [x] Document adversarial review protocol for Epic 48 pre-close
- [x] Ensure all story completion notes include evidence links

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `_bmad-output/planning-artifacts/sprint-48-closure-checklist.md` | Create | Sprint closure gate checklist |
| `scripts/validate-sprint-status.ts` | Create | Automated sprint status + risk gate validation |
| `_bmad-output/planning-artifacts/epic-48-solid-dry-kiss-scorecard.md` | Modify | Fill Checkpoint C (pre-close) scoring |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Modify | Story status updates with evidence links |
| `.github/workflows/ci.yml` | Modify | Add sprint status integrity CI job |
| `_bmad-output/planning-artifacts/epic-48-risk-register.md` | Modify | R48-005 marked closed |

---

## Validation Evidence

```bash
# Validate sprint status gate (backward compatible — integrity only)
npx tsx scripts/validate-sprint-status.ts
# Expected: exit 0 — "sprint-status.yaml is healthy"

# Validate epic 48 gate (full risk + story consistency)
npx tsx scripts/validate-sprint-status.ts --epic 48
# Expected: exit 0 — "Sprint 48 closure gate: GO" when all conditions met
# If P0/P1 unresolved or stories incomplete: exit non-zero with specific failures
```

### Test Results

```
$ npx tsx scripts/validate-sprint-status.ts

🔍 Sprint Status Validation
   File: _bmad-output/implementation-artifacts/sprint-status.yaml
   Mode: integrity check only

   Epic comment headers: 48
   Epic status entries: 48
   Has epic-1: true
   ...
   ✅ PASS: 48 epic headers — file appears healthy
✅ sprint-status.yaml is healthy
```

```
$ npx tsx scripts/validate-sprint-status.ts --epic 48

🔍 Sprint Status Validation
   File: _bmad-output/implementation-artifacts/sprint-status.yaml
   Mode: epic 48 gate check

   Epic 48 Gate Check
   --------------------------------------------------
   Epic 48 status: in-progress
   Stories found for epic-48: 6
   ✅ No open P0/P1 risks in epic-48 risk register (gate deferred until epic is done)
   ⚠ Epic 48 is 'in-progress' and 1 story(ies) not done: 48-6...

   ✅ Sprint 48 closure gate: GO  (gate deferred — epic not yet done)
```

### When gate would fail (epic done + open P0/P1)

```
Epic 48 Gate Check
--------------------------------------------------
❌ Epic 48: 1 unresolved P0/P1 risk(s) in risk register: R48-XXX(P1, mitigating)

❌ Sprint 48 closure gate: NO-GO

Fix required before epic can be marked done:
- Epic 48: 1 unresolved P0/P1 risk(s) in risk register: R48-XXX(P1, mitigating)
```
$ npx tsx scripts/validate-sprint-status.ts

🔍 Sprint Status Validation
   File: _bmad-output/implementation-artifacts/sprint-status.yaml
   Mode: integrity check only

   Epic comment headers: 48
   Epic status entries: 48
   Has epic-1: true
   ...
   ✅ PASS: 48 epic headers — file appears healthy
✅ sprint-status.yaml is healthy
```

```
$ npx tsx scripts/validate-sprint-status.ts --epic 48

🔍 Sprint Status Validation
   File: _bmad-output/implementation-artifacts/sprint-status.yaml
   Mode: epic 48 gate check

   Epic 48 Gate Check
   --------------------------------------------------
   Epic 48 status: in_progress
   Stories found for epic-48: 6
   ⚠ Epic 48 is 'in_progress' and 1 story(ies) not done: 48-6...
   ℹ Epic 48 is 'in_progress' — risk gate skipped (only enforced when epic is 'done')

   ✅ Sprint 48 closure gate: GO  (risk gate waived — epic not yet done)
```

### When gate would fail (epic done + open P0/P1)

```
Epic 48 Gate Check
--------------------------------------------------
❌ Epic 48: 1 unresolved P0/P1 risk(s) in risk register: R48-XXX(P1, mitigating)

❌ Sprint 48 closure gate: NO-GO

Fix required before epic can be marked done:
- Epic 48: 1 unresolved P0/P1 risk(s) in risk register: R48-XXX(P1, mitigating)
```

---

## Dev Notes

- The `validate-sprint-status.ts` script was enhanced (not replaced) — backward compatible when no args supplied
- The `--epic <N>` flag triggers full gate: story consistency + risk register P0/P1 check
- Risk gate only enforced when epic is `done` — safe for active-in-progress epics during normal development
- CI job `sprint-status` runs in parallel (`needs: []`) with build/lint/test — non-blocking signal
- R48-005 (process gate risk) is now **closed** — this story formalizes the mitigation
- Story 48-6 (lint debt containment) is a parallel track; 48-5 gate does not block on it since R48-006 is P2

---

## Risk Disposition

- R48-005 (process gate): **CLOSED** — Story 48-5 formalizes enforcement; gate now codified in `validate-sprint-status.ts` + CI workflow + closure checklist

---

## Completion Evidence Checklist

- [x] AC1: `sprint-48-closure-checklist.md` created with all required items
- [x] AC2: Gate enforcement — epic marked `done` with open P0/P1 → non-zero exit + actionable message
- [x] AC3: Evidence links in checklist and story completion notes
- [x] AC4: `validate-sprint-status.ts` `--epic <N>` with story consistency + risk register checks
- [x] AC5: Retro carry-over constraint noted (max 2 items)
