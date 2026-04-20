# Story 48.5: CI Quality Gate Enforcement

**Status:** ready-for-dev

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

- [ ] Create `sprint-closure-checklist.md` in planning-artifacts/
- [ ] Create `scripts/validate-sprint-status.ts` for automated gate checks
- [ ] Update `epic-48-solid-dry-kiss-scorecard.md` Checkpoint C template with scores
- [ ] Update sprint-status.yaml validation script to check risk register P0/P1 status
- [ ] Document adversarial review protocol for Epic 48 pre-close
- [ ] Ensure all story completion notes include evidence links

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `_bmad-output/planning-artifacts/sprint-48-closure-checklist.md` | Create | Sprint closure gate checklist |
| `scripts/validate-sprint-status.ts` | Create | Automated sprint status + risk gate validation |
| `_bmad-output/planning-artifacts/epic-48-solid-dry-kiss-scorecard.md` | Modify | Fill Checkpoint C (pre-close) scoring |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Modify | Story status updates with evidence links |
| `AGENTS.md` | Modify | Add sprint closure gate rule if not already documented |

---

## Validation Evidence

```bash
# Validate sprint status gate
npx tsx scripts/validate-sprint-status.ts --epic 48

# Expected: exit 0 with "Sprint 48 closure gate: GO" if all conditions met
# If P0/P1 unresolved or stories incomplete: exit non-zero with specific failures

# Manual checklist review
# Open _bmad-output/planning-artifacts/sprint-48-closure-checklist.md
# Walk through each item and confirm evidence is attached
```

---

## Dev Notes

- The `validate-sprint-status.ts` script already exists in `scripts/`. Verify it supports risk-register checking before assuming it needs to be created.
- The adversarial review for Epic 48 should be run by @bmad-review after all other stories are closed. The GO/NO-GO verdict from that review is a hard requirement for Epic 48 closure.
- The retro carry-over of max 2 action items is per the program baseline; ensure the epic-48 retrospective output respects this constraint.

---

## Risk Disposition

- R48-005 (process gate): This story directly formalizes the mitigation. Target is **mitigating** → **closed** after checklist and validation script are in place and verified.