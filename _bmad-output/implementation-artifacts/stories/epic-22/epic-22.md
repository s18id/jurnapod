# Epic 22: Core Package Consolidation (Direct Removal)

**Status:** done  
**Epic Number:** 22  
**Story Count:** 4  
**Priority:** P1  
**Risk:** MEDIUM (financial posting contract migration)

---

## Objective

Retire `@jurnapod/core` and consolidate its posting contract into `@jurnapod/modules-accounting` with no runtime behavior drift in posting, sync, or accounting flows.

---

## Definitive Decisions

1. **Direct removal only**
   - No compatibility bridge package.
   - All consumers must migrate to `@jurnapod/modules-accounting` before deleting `@jurnapod/core`.

2. **Behavior stability is mandatory**
   - No changes to posting outcomes, journal effects, or sync side effects.
   - This epic is structural consolidation, not business logic redesign.

3. **Risk gating is strict**
   - Any P0/P1 regression in accounting/sync correctness blocks completion.

---

## In Scope

- Re-home posting contract exports currently provided by `@jurnapod/core` into `@jurnapod/modules-accounting`.
- Migrate API/package imports from `@jurnapod/core` to `@jurnapod/modules-accounting`.
- Remove `packages/core` and clean lockfile/workspace references.
- Run full validation gates and review.

## Out of Scope

- Merging other package boundaries (`db`, `shared`, `auth`, `sync-*`).
- Functional changes to posting business logic.
- Feature changes in API routes.

---

## Stories

| Story | Title | Status | Priority | Risk |
|-------|-------|--------|----------|------|
| 22.1 | Re-home core posting contract to modules-accounting | done | P1 | HIGH |
| 22.2 | Migrate `@jurnapod/core` imports to modules-accounting | done | P1 | HIGH |
| 22.3 | Remove core package and clean lockfile/workspace refs | done | P1 | MEDIUM |
| 22.4 | Run exit gates, review, and closeout | done | P1 | MEDIUM |

---

## Mandatory Sequence

1. Story 22.1
2. Story 22.2
3. Story 22.3
4. Story 22.4

Reason: contract parity must land before consumer migration; consumer migration must complete before direct package removal.

---

## Acceptance Gates (Epic)

### Monorepo
- [x] `npm run typecheck`
- [x] `npm run build`

### API
- [x] `npm run test:unit:critical -w @jurnapod/api`
- [x] `npm run test:unit:sync -w @jurnapod/api`

### Sync packages
- [x] `npm run test:run -w @jurnapod/pos-sync`
- [x] `npm run test:run -w @jurnapod/backoffice-sync`

### Consolidation invariants
- [x] No runtime imports of `@jurnapod/core` remain
- [x] `packages/core` removed
- [x] No stale lockfile references to removed package

---

## Risk Controls

- **P1 blocker:** posting contract drift that changes journal behavior.
- **P1 blocker:** sync push/posting integration regression.
- **P1 blocker:** tenant/outlet scoping regression in touched paths.
- **P2 actionable:** stale docs/scripts/lockfile references after package deletion.
