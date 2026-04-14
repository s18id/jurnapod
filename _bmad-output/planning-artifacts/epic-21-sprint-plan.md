# Epic 21 Sprint Plan (Implementation-First)

**Epic:** 21 — API Sync Runtime Consolidation (Package-First)  
**Sprint Focus:** Infrastructure-first execution with strict sync contract safety  
**Prepared By:** @bmad-agent-sm  
**Date:** 2026-04-01

---

## Sprint Goal

Deliver Epic 21 in a dependency-safe sequence that consolidates API sync runtime ownership into packages while preserving canonical sync protocol (`since_version` / `data_version`), idempotency authority, and tenant/outlet scoping.

## Scope

### In Scope
- Story 21.1: Centralize `PosSyncModule` lifecycle.
- Story 21.2: Extract sync push adapters from route.
- Story 21.4: Keep and bound `/sync/check-duplicate` semantics.
- Story 21.3: Retire legacy API pull builder runtime path.
- Required validation gates across API + sync packages for each story handoff.

### Out of Scope
- Protocol version/field changes (no new alias fields such as `sync_data_version`).
- Storage model redesign beyond existing canonical `sync_versions` usage.
- Frontend sync behavior redesign.
- New feature scope outside Epic 21 acceptance criteria.

---

## Story Order and Dependency Rationale

1. **21.1 → Centralize PosSyncModule lifecycle**  
   Foundation step to remove route-level lifecycle duplication and establish one runtime owner.

2. **21.2 → Extract sync push adapters from route**  
   Depends on 21.1 so push route can be cleanly reduced to thin orchestration over stable module lifecycle.

3. **21.4 → Bound `/sync/check-duplicate` semantics**  
   Depends on 21.2 to finalize route boundary semantics after push route responsibilities are clarified.

4. **21.3 → Retire legacy API pull builder runtime path**  
   Deliberately last due to highest regression risk; execute after lifecycle and boundary controls are stabilized.

---

## Risk Register (P-Severity)

| ID | Risk | Severity | Trigger | Mitigation | Owner |
|----|------|----------|---------|------------|-------|
| R21-1 | Sync protocol drift (`since_version` / `data_version`) | P1 | Any payload contract mismatch in pull/push | Gate on sync route tests + contract spot checks before merge | Dev + Reviewer |
| R21-2 | Idempotency regression in push flow (`client_tx_id`) | P1 | Adapter extraction alters duplicate handling path | Run push route + sync suite per story; block progression on failures | Dev |
| R21-3 | Tenant/outlet scoping or auth regression | P1 | Route thinning removes/relocates guard logic incorrectly | Explicit guard checklist in story review; run critical suite | Dev + Reviewer |
| R21-4 | Coverage gap during legacy pull runtime retirement | P2 | Legacy test deletion without equivalent route/module tests | Require replacement tests before removing legacy path | Dev |
| R21-5 | Cross-story mixed commits obscure rollback | P2 | Commits include unrelated files from multiple stories | Enforce per-story commit boundaries and verification | Dev |

---

## Execution Checklist with Validation Gates

### Pre-Execution
- [ ] Confirm story statuses and dependency order in `sprint-status.yaml`.
- [ ] Confirm no coding starts on downstream story before upstream story reaches `done`.

### Story Gates

#### Gate A — Story 21.1 completion
- [ ] `npm run test:unit:single -w @jurnapod/api src/routes/sync/pull.test.ts`
- [ ] `npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts`
- [ ] Story review completed before 21.2 starts.

#### Gate B — Story 21.2 completion
- [ ] `npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts`
- [ ] `npm run test:unit:sync -w @jurnapod/api`
- [ ] Adapter edge cases covered and reviewed before 21.4 starts.

#### Gate C — Story 21.4 completion
- [ ] `npm run test:unit:single -w @jurnapod/api src/routes/sync/sync.test.ts`
- [ ] `npm run test:unit:sync -w @jurnapod/api`
- [ ] `/sync/check-duplicate` semantics explicitly bounded in route/library docs/comments.

#### Gate D — Story 21.3 completion
- [ ] `npm run test:unit:single -w @jurnapod/api src/routes/sync/pull.test.ts`
- [ ] `npm run test:unit:sync -w @jurnapod/api`
- [ ] `npm run test:unit:critical -w @jurnapod/api`
- [ ] Verify no runtime dependency remains on legacy API pull builder path.

### Epic Exit Gate
- [ ] `npm run test:run -w @jurnapod/pos-sync`
- [ ] `npm run test:run -w @jurnapod/backoffice-sync`
- [ ] `npm run test -w @jurnapod/sync-core`
- [ ] Epic 21 DoD evidence recorded in story completion notes.

---

## Explicit Commit Strategy (Per Story)

1. **One primary commit per story** (21.1, 21.2, 21.4, 21.3), in sequence.
2. **No cross-story file mixing** in a single commit.
3. **Commit only after story gate passes** for that story.
4. **Optional follow-up commit** allowed only for review fixes tied to the same story.
5. **Suggested commit message format:**
   - `feat(epic-21): story 21.1 centralize pos sync module lifecycle`
   - `refactor(epic-21): story 21.2 extract sync push adapters`
   - `docs(test)(epic-21): story 21.4 bound sync check-duplicate semantics`
   - `refactor(test)(epic-21): story 21.3 retire legacy pull builder runtime path`
