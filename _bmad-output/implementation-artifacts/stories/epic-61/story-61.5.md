# Story 61.5: Deferred Debt Closure (Epic 55–60 Carry-Over)

**Status:** ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 61 --story 61-5 --status done --title deferred-debt-closure-epic-55-60`

---

## Story

As a **technical lead**,  
I want **all remaining P2/P3 deferred items from Epics 55–60 to be audited and either closed or formally tracked**,  
So that **no unresolved debt carries forward beyond the S48–S61 program window**.

## Context

- Source: Epic 61 (FR6) — Deferred debt from Epics 55–60
- Depends on: Stories 61.1–61.4 (correctness work may resolve some items)
- Scope: Documentation, audit, tracking updates
- Risk: P2 — deferred debt accumulation across multiple epics

### Debt Items to Audit (from epic-61.md §3)

| # | Item | Epic | Severity |
|---|------|------|----------|
| D1 | ACCOUNTANT treasury READ blocked (seed data or matrix) | E60 | P2 |
| D2 | No void route for payments (feature gap assessment) | E57 | P2 |
| D3 | Multi-currency AP reconciliation edge case (Epic 54 F5) | E54 | P2 |
| D4 | Snapshot race condition follow-up (Epic 55 F1) | E55 | P2 |
| D5 | Out-of-order push reconciliation (Story 59.8c descoped) | E59 | P2 |

---

## Acceptance Criteria

**AC1: D1 — ACCOUNTANT treasury READ — CONFIRMED RESOLVED**
**Given** migration 0207 seeded canonical module_roles for all companies,
**When** the ACCOUNTANT treasury READ test runs,
**Then** `role-boundary-treasury.test.ts` passes with no ad-hoc `setModulePermission`.

**AC2: D2 — Void route for payments — ASSESSED**
**Given** the sales payments route,
**When** the void endpoint is reviewed,
**Then** a finding is documented: feature exists? gap? blocked?
**And** the finding is tracked with owner + deadline OR closed.

**AC3: D3 — Multi-currency AP reconciliation edge case — TRACKED**
**Given** the Epic 54 F5 finding,
**When** the current state is audited,
**Then** it is either confirmed resolved OR tracked with explicit owner + deadline.

**AC4: D4 — Snapshot race condition follow-up — CONFIRMED RESOLVED**
**Given** the E51-A1 / E55-A1 action items already closed,
**When** the snapshot race condition evidence is reviewed,
**Then** it is confirmed closed with evidence OR reopened with owner.

**AC5: D5 — Out-of-order push reconciliation — TRACKED**
**Given** Story 59.8c was descoped,
**When** the current state is assessed,
**Then** it is formally tracked with owner, deadline, and success criterion.

**AC6: Debt register updated**
**Given** all 5 debt items are audited,
**When** the audit completes,
**Then** `action-items.md` and `TECHNICAL-DEBT.md` reflect current status of each item.

---

## Tasks / Subtasks

- [ ] Task 1: Audit D1 (ACCOUNTANT treasury READ) — CONFIRMED RESOLVED (migration 0207)
- [ ] Task 2: Audit D2 (payments void route) — assess and document
- [ ] Task 3: Audit D3 (multi-currency AP reconciliation) — assess and track
- [ ] Task 4: Audit D4 (snapshot race condition) — confirm closed
- [ ] Task 5: Audit D5 (out-of-order push reconciliation) — track formally
- [ ] Task 6: Update action-items.md + TECHNICAL-DEBT.md (AC: 6)

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `_bmad-output/implementation-artifacts/action-items.md` | Modify | Update D1-D5 status |
| `_bmad-output/implementation-artifacts/TECHNICAL-DEBT.md` | Modify | Sync debt register |

## Dev Notes

- D1 is already resolved — migration 0207 + role-boundary-treasury.test.ts passes
- D4 was resolved by E51-A1 (auto-snapshot race fix) and E55-A1 (CI lint gate)
- Document findings in story completion report; no code changes expected unless D2/D3/D5 require fixes

## Dependencies

- Stories 61.1–61.4 (may resolve some items automatically)
- Epic 60 action items (E60-A1, E60-A2 already closed)

## Risk Level

P2 — Deferred debt accumulation is manageable but must not carry forward
