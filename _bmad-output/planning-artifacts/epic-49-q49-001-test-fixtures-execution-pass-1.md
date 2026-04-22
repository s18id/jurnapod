# Q49-001 Execution Pass 1 — Test Fixtures Boundary Extraction

> **Queue Item:** Q49-001 (from `epic-49-api-lib-boundary-migration-queue.md`)  
> **Epic/Sprint:** Epic 49 / Story 49.1 intake  
> **Owner:** @bmad-dev  
> **Approver:** @bmad-architect  
> **Status:** ready-to-execute
> **Retro Link:** E48-A2 completed on 2026-04-22 (Epic 48 retrospective action item)

---

## Objective

Start extracting canonical test fixtures from:

- `apps/api/src/lib/test-fixtures.ts`

to:

- `packages/db/src/test-fixtures/**`

while preserving API test behavior and avoiding cross-layer regressions.

---

## Why this is first

`test-fixtures.ts` is a high-coupling hub used by integration tests. Keeping it in API lib blocks package-level reuse and creates ownership ambiguity.

This pass creates a stable split:

1. **portable DB fixtures** live in `@jurnapod/db/test-fixtures`
2. **API-runtime fixtures** (HTTP/token/login helpers) stay in API lib wrapper

---

## Scope for Pass 1

### In Scope

- Define fixture split (portable vs API-runtime)
- Create `packages/db/src/test-fixtures` module skeleton and export surface
- Move first portable fixture set (company/outlet/user/supplier/fiscal/AP settings + cleanup registry)
- Keep API wrapper backward-compatible
- Flip consumer shim (`apps/api/__test__/fixtures/index.ts`) to import portable fixtures from `@jurnapod/db/test-fixtures`

### Out of Scope (Pass 2+)

- Full extraction of inventory/item adapter-dependent fixtures
- Full replacement of auth/login HTTP fixtures
- Deep refactor of every helper in one PR

---

## Fixture Split Matrix (Pass 1)

| Category | Keep in API wrapper (for now) | Move to `@jurnapod/db/test-fixtures` in Pass 1 |
|---|---|---|
| HTTP/Auth runtime | `createTestCustomer` (HTTP), `loginForTest`, `getOrCreateTestCashierForPermission`, `getTestAccessToken`, `createTestRole` (HTTP) | — |
| Env-coupled sync/auth helpers | `getSeedSyncContext` (if env-coupled) | — |
| Pure/DB fixture core | — | company/outlet/user/supplier/fiscal/AP settings and cleanup registry helpers |
| ACL helper bits | optional in Pass 1 if no API-only dependency | preferred in Pass 1 |

---

## File Plan

### Create in `packages/db`

- `packages/db/src/test-fixtures/index.ts`
- `packages/db/src/test-fixtures/types.ts`
- `packages/db/src/test-fixtures/constants.ts`
- `packages/db/src/test-fixtures/registry.ts`
- `packages/db/src/test-fixtures/company.ts`
- `packages/db/src/test-fixtures/outlet.ts`
- `packages/db/src/test-fixtures/user.ts`
- `packages/db/src/test-fixtures/supplier.ts`
- `packages/db/src/test-fixtures/fiscal.ts`
- `packages/db/src/test-fixtures/ap.ts`

### Update in `packages/db`

- `packages/db/src/index.ts` (re-export fixtures)
- `packages/db/package.json` (subpath export `./test-fixtures` if needed)

### Update in `apps/api`

- `apps/api/src/lib/test-fixtures.ts` (convert to compatibility wrapper)
- `apps/api/__test__/fixtures/index.ts` (consume package fixtures first)

---

## Execution Steps

### Step 0 — Pre-flight

- [ ] Capture current exports from API `test-fixtures.ts`
- [ ] Capture consumers of `apps/api/src/lib/test-fixtures.ts`
- [ ] Freeze signature compatibility list (must not break existing tests)

### Step 1 — Package fixture core scaffold

- [ ] Create `packages/db/src/test-fixtures/*` structure
- [ ] Move shared types/constants
- [ ] Move cleanup registry and canonical fixture registry helpers

### Step 2 — Move first portable fixture group

- [ ] Move company/outlet/user portable creators
- [ ] Move supplier + purchasing account/settings helpers
- [ ] Move fiscal/AP settings fixture helpers

### Step 3 — API wrapper compatibility layer

- [ ] Keep API-runtime helpers local (HTTP/login/token)
- [ ] Re-export moved package fixtures from API wrapper to avoid immediate test churn

### Step 4 — Consumer flip

- [ ] Update `apps/api/__test__/fixtures/index.ts` to import portable fixtures from `@jurnapod/db/test-fixtures`
- [ ] Keep API-only fixture imports from API wrapper

### Step 5 — Validation

- [ ] `npm run build -w @jurnapod/db`
- [ ] `npm run typecheck -w @jurnapod/api`
- [ ] Run representative integration suites using fixtures

---

## Validation Commands

```bash
# Build/export validation
npm run build -w @jurnapod/db

# API type safety after consumer flip
npm run typecheck -w @jurnapod/api

# Core fixture-driven suites (minimum smoke)
npm run test:single -- __test__/integration/accounting/fiscal-year-close.test.ts -w @jurnapod/api
npm run test:single -- __test__/integration/purchasing/ap-reconciliation.test.ts -w @jurnapod/api
```

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Hidden dependency on API-only modules in moved fixtures | P1 | Keep API wrapper in place; move only portable fixture groups in Pass 1 |
| Export break in `@jurnapod/db` consumers | P1 | Keep explicit index exports + typecheck/build gate before flip |
| Test churn from signature changes | P2 | Preserve existing function signatures in package module |
| Over-scoping into full extraction | P2 | Pass 1 scope freeze: portable fixtures only |

---

## Done Criteria (Pass 1)

- [ ] Portable fixture core exists in `@jurnapod/db/test-fixtures`
- [ ] API wrapper remains backward compatible
- [ ] At least one consumer path flipped to package fixtures
- [ ] Build/typecheck/test evidence attached
- [ ] Remaining extraction tasks logged as Pass 2 queue items

---

## Companion Artifacts

- `_bmad-output/planning-artifacts/epic-49-api-lib-boundary-migration-queue.md`
- `_bmad-output/planning-artifacts/epic-49-1-execution-checklist.md`
- `_bmad-output/implementation-artifacts/stories/epic-49/story-49.1.md`
