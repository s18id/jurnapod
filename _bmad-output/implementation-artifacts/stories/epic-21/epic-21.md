# Epic 21: API Sync Runtime Consolidation (Package-First)

**Status:** done  
**Epic Number:** 21  
**Story Count:** 4  
**Priority:** P1  
**Risk:** MEDIUM (runtime ownership consolidation)

---

## Definitive Decisions (Immutable)

1. **Canonical sync protocol is fixed**
   - Request cursor: `since_version`
   - Response cursor: `data_version`
   - Alias fields (for example `sync_data_version`) are forbidden unless approved via explicit versioned migration ADR.

2. **Canonical sync storage is fixed**
   - Runtime source of truth: `sync_versions`
   - Data sync cursor row: `tier IS NULL`
   - Tier cursor rows: explicit tier values (`MASTER`, `OPERATIONAL`, `REALTIME`, `ADMIN`, `ANALYTICS`).

3. **Runtime ownership is fixed**
   - Sync runtime behavior lives in sync packages (`@jurnapod/pos-sync`, `@jurnapod/sync-core`).
   - API routes are thin orchestration/adaptation layers only.

4. **`/sync/check-duplicate` stays**
   - It is a **preflight helper only**.
   - Authoritative idempotency remains in push processing with `client_tx_id`.

---

## Objective

Remove redundant sync runtime code in API and enforce package-first ownership without changing sync protocol behavior.

---

## In Scope

- Centralize `PosSyncModule` lifecycle for API sync pull/push.
- Extract push payload adapters out of route files.
- Retire API runtime dependency on legacy pull builder implementation.
- Keep and explicitly bound `/sync/check-duplicate` semantics.
- Preserve tenant/outlet scope, auth, idempotency, and contract behavior.

## Out of Scope

- Protocol version changes.
- New sync payload alias fields.
- Sync package semantic redesign.
- Frontend sync behavior redesign.

---

## Stories

| Story | Title | Status | Priority | Risk |
|-------|-------|--------|----------|------|
| 21.1 | Centralize PosSyncModule lifecycle | done | P1 | LOW |
| 21.2 | Extract sync push adapters from route | done | P1 | MEDIUM |
| 21.3 | Retire legacy API pull builder runtime path | done | P1 | HIGH |
| 21.4 | Keep and bound `/sync/check-duplicate` semantics | done | P2 | LOW |

---

## Mandatory Sequence

1. Story 21.1
2. Story 21.2
3. Story 21.4
4. Story 21.3

Reason: establish stable shared route infrastructure and endpoint boundaries first, then remove high-risk duplicate runtime path.

---

## Acceptance Gates (Epic)

### API
- [x] `npm run test:unit:sync -w @jurnapod/api`
- [x] `npm run test:unit:critical -w @jurnapod/api`

### Sync packages
- [x] `npm run typecheck -w @jurnapod/sync-core && npm run build -w @jurnapod/sync-core`
- [x] `npm run test:run -w @jurnapod/pos-sync`
- [x] `npm run test:run -w @jurnapod/backoffice-sync`

### Contract/Storage invariants
- [x] No runtime usage of `sync_data_version` as protocol field
- [x] No runtime usage of legacy tables `sync_data_versions` / `sync_tier_versions`
- [x] `since_version`/`data_version` behavior unchanged

---

## Risk Controls

- **P1 blocker:** any protocol drift from `since_version` / `data_version`.
- **P1 blocker:** any tenant/outlet scoping or auth regression in sync routes.
- **P1 blocker:** any idempotency regression in push flow.
- **P2 actionable:** coverage drop when retiring legacy pull builder tests.

---

## Definition of Done

- All four stories marked done with passing evidence.
- API sync and critical suites pass.
- Sync packages pass.
- Runtime ownership is package-first and route-thin.
- No dual source-of-truth reintroduced in protocol or storage.
