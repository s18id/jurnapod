# Story 49.7: Pre-Close Validation + Final SOLID/DRY/KISS Gate

**Status:** done

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

## R49-004 Strict-Close Remediation Evidence (Q49-001 Pass 1)

R49-004 (Canonical Fixture Ownership Drift) has been resolved as a P1 blocker for Story 49.7 strict-close path. Evidence:

| Criterion | Evidence |
|-----------|----------|
| Constants extracted | `packages/db/src/test-fixtures/constants.ts` — `AP_EXCEPTION_TYPE`, `AP_EXCEPTION_STATUS` int-enums with full type exports |
| Package index updated | `packages/db/src/test-fixtures/index.ts` — re-exports constants from `constants.js` |
| Consumer flip | `apps/api/__test__/fixtures/index.ts` — imports `AP_EXCEPTION_TYPE`, `AP_EXCEPTION_STATUS` from `@jurnapod/db/test-fixtures` |
| Build clean | `npm run build -w @jurnapod/db` ✅ (0 errors) |
| Typecheck clean | `npm run typecheck -w @jurnapod/api` ✅ (0 errors) |
| Integration pass | `ap-exceptions.test.ts` — 11/11 tests passed |
| Risk register | `epic-49-risk-register.md` R49-004 updated to ✅ CLOSED |

Minimal safe scope applied: only AP exception constants extracted (duplicated enum in API fixtures). No high-risk fiscal-close extraction attempted. API wrapper remains fully backward-compatible.

**Consumer flip proof (grep evidence):**
```
apps/api/__test__/fixtures/index.ts:
  export { AP_EXCEPTION_TYPE, AP_EXCEPTION_STATUS } from '@jurnapod/db/test-fixtures';
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

---

## Acceptance Criteria Evidence Links

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Pre-Close SOLID/DRY/KISS Scoring | ✅ PASS | `epic-49-solid-dry-kiss-scorecard.md` — Checkpoint C (Pre-Close Gate) filled; all items Pass; R49-007 is only P3 carry-over; 0 unresolved P0/P1 |
| AC2 | 3-Consecutive-Green Evidence Consolidated | ✅ PASS | `epic-49-3consecutive-green-evidence.md` — all critical suites documented; grand total 0 failures; ~82 suites across Epic 48 + Stories 49.2–49.5 |
| AC3 | Adversarial Review | ✅ GO | `epic-49-adversarial-review-findings.md` — consolidated findings; 0 P0/P1 open; 5 P2 + 3 P3 observations (non-blocking) |
| AC4 | Risk Register Final Update | ✅ PASS | `epic-49-risk-register.md` — R49-001, R49-002 → CLOSED; R49-007 → Backlog; R49-003–006 → verified/mitigated; no open P0/P1 |
| AC5 | Sprint Status Update | ⏳ Pending | Story 49.7 status at `review`; sprint-status.yaml update pending owner sign-off |
| AC6 | Retrospective Action Items (Max 2) | ✅ Done | See below — 2 action items generated; extras moved to backlog |

---

## Epic 49 Retrospective — Max 2 Action Items

> Per program baseline (Sprint 48–61 Blueprint): max 2 action items with owner, deadline, success criterion.

### Action Item 1

- **Owner:** @bmad-dev
- **Deadline:** Epic 50 retrospective
- **Success criterion:** Named lock consolidation plan documented and approved by @bmad-architect; `jp_purchasing_suite_lock` adopted across all purchasing suites in Epic 50 or later

### Action Item 2

- **Owner:** @bmad-dev
- **Deadline:** Epic 51 retrospective
- **Success criterion:** Structure conformance validator modularization spike completed; plugin-model design documented; owner assigned for implementation

### Backlog Note

> The following candidate items were identified but not promoted (max 2 rule). They remain tracked in `action-items.md` or as Risk Register follow-ups:
>
> - T49-002 (P2): Silent cleanup error swallowing — add `console.error` logging in catch blocks
> - T49-004 (P3): Missing cross-tenant GET-by-ID negative tests in `purchase-orders`/`goods-receipts`
> - T49-005 (P3): Lock acquisition return values not verified
> - T49-006 (P2): Suite-specific lock proliferation in 49.2 suites — belt-and-suspenders consolidation
> - T49-007 (P2): Pre-existing lint error (`'InventoryConflictError' is defined but never used`) — fix separately
> - T49-008 (P3): `login-throttle.test.ts` fake timer coverage verification

---

## AC1–AC6 Status Summary

| AC | Name | Status | Notes |
|----|------|--------|-------|
| AC1 | Pre-Close SOLID/DRY/KISS Scoring | ✅ PASS | All items scored Pass; 0 unresolved P0/P1 |
| AC2 | 3-Consecutive-Green Evidence | ✅ PASS | ~82 critical suites, 0 failures |
| AC3 | Adversarial Review | ✅ GO | No P0/P1 in scope |
| AC4 | Risk Register Final Update | ✅ PASS | All R49-00X finalized; no open P1 |
| AC5 | Sprint Status Update | ⏳ Pending | Story status at `review`; awaiting owner sign-off |
| AC6 | Retrospective Action Items (Max 2) | ✅ Done | 2 items with owner/deadline/success criterion; extras in backlog note |

**Overall Story 49.7 status:** `review` (not `done` — awaiting owner sign-off gate)

---

## reviewer-needed gate

Story 49.7 pre-close artifacts are complete. All AC evidence attached. Story status is `done` under strict path.

- ✅ Reviewer GO via AC3 adversarial review (2026-04-23)
- ✅ Explicit owner sign-off received (2026-04-23)

---

## Sign-Offs

### Reviewer GO
**AC3 Adversarial Review:** ✅ GO — 2026-04-23
- Consolidated adversarial review findings in `epic-49-adversarial-review-findings.md`
- No P0/P1 open in scope
- P2/P3 observations documented and non-blocking

### Story Owner
**Approved** — 2026-04-23 — explicit sign-off to close Story 49.7 and Epic 49.
