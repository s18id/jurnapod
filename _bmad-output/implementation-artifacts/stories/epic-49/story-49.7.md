# Story 49.7: Pre-Close Validation + Final SOLID/DRY/KISS Gate

**Status:** backlog

## Story

As a **scrum master**,
I want the Epic 49 pre-close gate to verify all acceptance criteria are met, all P0/P1 risks are closed, and the SOLID/DRY/KISS final score is documented,
So that Epic 49 closes only when the test reliability baseline is genuinely stable.

---

## Context

Story 49.7 is the final story in Epic 49 — the pre-close validation gate. It consolidates evidence from stories 49.1–49.6, performs adversarial review, updates the risk register, and produces the final SOLID/DRY/KISS scorecard.

This story can only begin when all of 49.1–49.6 are done or ready-for-dev.

## Acceptance Criteria

**AC1: Pre-Close SOLID/DRY/KISS Scoring**
Complete `epic-49-solid-dry-kiss-scorecard.md` Checkpoint C (Pre-Close Quality Gate) with:
- All items scored as Pass/Fail with evidence links
- Any Fail items must be either resolved OR documented as approved carry-over (P2/P3 only; P0/P1 not allowed)
- Final risk gate summary: unresolved P0/P1 count must be 0

**AC2: 3-Consecutive-Green Evidence Consolidated**
Verify that `epic-49-3consecutive-green-evidence.md` from Story 49.6 includes ALL critical suites. Any missing suites must be resolved before this gate closes. The manifest must show:
- Suite name
- Run 1: pass/fail + test count
- Run 2: pass/fail + test count
- Run 3: pass/fail + test count
- Grand total: all 0 failures

**AC3: Adversarial Review**
Run `bmad-review` (adversarial code review agent) against the changes introduced in Epic 49 (stories 49.2–49.5 fixture changes). Review findings must be severity-tagged (P0/P1/P2/P3). Any P0/P1 finding must be resolved before epic close — or explicitly documented as approved exception.

**AC4: Risk Register Final Update**
Update `epic-49-risk-register.md`:
- All R49-00X risks must have final disposition (closed, mitigating, or approved carry-over)
- Carry-forward items from Epic 48 (R48-006) must have updated status
- No open P0/P1 risks in Epic 49 scope

**AC5: Sprint Status Update**
All 7 Epic 49 stories (49.1–49.7) must be marked `done` in `sprint-status.yaml` using:
```bash
npx tsx scripts/update-sprint-status.ts --epic 49 --story 49-N --status done
```

Epic 49 status updated to `done`.

**AC6: Retrospective Action Items (Max 2)**
Per the program baseline (Sprint 48–61 Blueprint), generate max 2 retrospective action items with:
- Owner
- Deadline (next retro or specific epic number)
- Success criterion

Any candidate items beyond 2 go to `action-items.md` as backlog (not discarded).

---

## Dev Notes

- **Epic 49 can only be marked done if**: all P0/P1 risks closed, all critical suites 3-consecutive-green, adversarial review GO
- **If 3-consecutive-green not achieved**: Epic 49 cannot close. Remaining flaky suites become explicit carry-over items with owner + deadline.
- **Adversarial review scope**: Only review fixture/pool-cleanup changes from 49.2–49.5. Do not re-review Epic 48 fixes.
- **Sprint closure commands**:
  ```bash
  # Story completion
  npx tsx scripts/update-sprint-status.ts --epic 49 --story 49.1 --status done
  # ... repeat for 49.2 through 49.7

  # Epic close
  npx tsx scripts/update-sprint-status.ts --epic 49 --status done

  # Validation
  npx tsx scripts/validate-sprint-status.ts --epic 49
  # Expected: exit 0
  ```

## Epic 49 Exit Gate Checklist

Before Epic 49 can be marked `done`:

- [ ] Stories 49.1–49.7 status updated with evidence links
- [ ] SOLID/DRY/KISS pre-close scoring complete (Checkpoint C) — no unresolved Fail items
- [ ] 3-consecutive-green manifest (`epic-49-3consecutive-green-evidence.md`) — all critical suites 0 failures
- [ ] Risk register: all P0/P1 risks closed or explicitly approved carry-over
- [ ] Adversarial review: GO verdict from @bmad-review
- [ ] `scripts/validate-sprint-status.ts --epic 49` exits 0

---

## Retrospective Action Items Template

```
## Epic 49 Retrospective — Max 2 Action Items

1. Action item:
   - Owner:
   - Deadline:
   - Success criterion:

2. Action item:
   - Owner:
   - Deadline:
   - Success criterion:
```

## Validation Evidence

```bash
# Final validation
npx tsx scripts/validate-sprint-status.ts --epic 49
# Expected: exit 0 — "Sprint 49 closure gate: GO"
```
