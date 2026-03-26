# Technical Debt Health Check Template

**Purpose:** Run this checklist before every epic retrospective to ensure the debt registry stays accurate and no new debt slips through untracked.

**When to use:** Before closing the epic retrospective document. Takes ~30 minutes.

---

## Part 1: Audit Open Items from Previous Epics

Review all `Open` items in [TECHNICAL-DEBT.md](./TECHNICAL-DEBT.md) with P1 or P2 priority.

| Check | Action |
|-------|--------|
| Are any P1 items still open? | **Stop** — P1 items must be resolved before epic closes |
| Are any P2 items now resolved? | Update status to `RESOLVED`, add story reference |
| Have any P3/P4 items changed in risk profile? | Re-prioritize if needed |
| Are any items no longer relevant? | Mark as `CLOSED (no longer applicable)` with reason |

---

## Part 2: Audit New Debt Created This Epic

For each story completed this epic, ask:

- [ ] Were any shortcuts taken to meet scope? If yes → add TD item
- [ ] Are there any `TODO` or `FIXME` comments in new code? → add TD item or resolve
- [ ] Were any `as any` casts added? → add TD item with justification
- [ ] Were any N+1 query patterns introduced? → add TD item
- [ ] Were any deprecated functions used without migration plan? → add TD item
- [ ] Was any in-memory state introduced that won't survive restarts? → add TD item
- [ ] Were integration tests deferred to a later story? → add TD item (P2)

**Rule:** No new debt without a registry entry. If it happened this epic, it must be tracked.

---

## Part 3: Assign New Debt Items

For each new debt item identified in Part 2:

1. **Assign ID** — next available `TD-XXX` from the registry
2. **Write description** — one clear sentence
3. **Assign priority** — P1/P2/P3/P4 per the priority table in TECHNICAL-DEBT.md
4. **Link story** — reference the story where debt was introduced
5. **Add to registry** — under the correct epic section
6. **Set resolution target** — which upcoming epic or sprint will address it

---

## Part 4: Update Summary Statistics

After all changes, recalculate the summary table in TECHNICAL-DEBT.md:

```
| Priority | Open | Resolved | Total |
```

Verify counts match the actual registry entries.

---

## Part 5: Sign-Off

| Item | Owner | Done |
|------|-------|------|
| All P1 items resolved or escalated | Architect | [ ] |
| All new debt items added to registry | Dev lead | [ ] |
| Summary statistics updated | Anyone | [ ] |
| Retrospective action items for next epic noted | Scrum Master | [ ] |

**Sign-off confirms:** Registry is accurate and complete as of this epic's close.

---

## Quick Reference: Priority Levels

| Level | Definition | Must address by |
|-------|------------|-----------------|
| P1 | Security, data integrity, production-blocking | Before epic closes |
| P2 | Performance degradation, maintainability, significant code smell | Within next 1-2 sprints |
| P3 | Quality-of-life, minor refactoring | When capacity allows |
| P4 | Nice-to-have, future considerations | Backlog |

---

*Template created in Story 7.1 — run before every epic retrospective.*
