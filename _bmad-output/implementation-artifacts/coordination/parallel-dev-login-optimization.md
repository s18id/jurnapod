# Coordination: BeforeAll seedCtx Caching — Integration Test Optimization

## Objective
Remove async call overhead from per-test `getSeedSyncContext()` calls by caching the sync context once in `beforeAll` and using a synchronous local wrapper inside `it()` blocks. **Performance-only change — no behavior changes.**

## Background
The `getSeedSyncContext()` function has an internal Map cache, so repeated calls don't hit the DB. However, each call still creates a Promise and yields to the event loop. For files with many `it()` blocks, this async overhead accumulates. The fix is to call `getSeedSyncContext()` once in `beforeAll` and have `it()` blocks use a zero-overhead synchronous wrapper.

## Files Already Migrated (18 files) — No Action Needed ✅
- `settings/pages-list.test.ts`, `settings/public-pages.test.ts`, `settings/pages-create.test.ts`, `settings/pages-update.test.ts`, `settings/pages-unpublish.test.ts`, `settings/pages-publish.test.ts`
- `inventory/items/create.test.ts`, `inventory/items/update.test.ts`, `inventory/item-prices/active.test.ts`, `inventory/item-prices/update.test.ts`, `inventory/items/variant-stats.test.ts`
- `recipes/ingredients-list.test.ts`, `recipes/ingredients-delete.test.ts`, `recipes/ingredients-update.test.ts`, `recipes/cost.test.ts`
- `pos/item-variants.test.ts`, `inventory/item-prices/variant-prices.test.ts`, `inventory/item-prices/create.test.ts`

## Global Guardrails
- **NO business logic changes** — only mechanical refactor
- **NO assertion changes** — keep HTTP status expectations exactly as-is
- **NO token/login changes** — do not touch `tokenCache`, `tokenInFlight`, or `loginForTest`
- **NO `resetFixtureRegistry` changes** — do not add cache clears
- **NO timeout changes** — do not increase timeout values
- **NO permission changes** — preserve role semantics (CASHIER for insufficient-permission tests)
- **Preserve all negative auth semantics** (401/403 expectations)
- **Keep existing `beforeAll` setup intact** — only add the wrapper pattern on top
- After each file: run `npm run test:single -- <file>` to confirm green
- After ALL files complete: run full suite `npm test -w @jurnapod/api` (132 files)
- Run `npm run typecheck -w @jurnapod/api` after all changes

## Mechanical Pattern (must follow exactly)

### Pattern A: File has `getSeedSyncContext as loadSeedSyncContext` already in imports
Example — already has the alias, just needs the wrapper and beforeAll:

**BEFORE:**
```typescript
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  createTestItem,
  registerFixtureCleanup
} from '../../../fixtures';

let baseUrl: string;
let accessToken: string;

beforeAll(async () => {
  baseUrl = getTestBaseUrl();
  accessToken = await getTestAccessToken(baseUrl);
  seedCtx = await loadSeedSyncContext();  // ← line exists
});

it('some test', async () => {
  const ctx = await getSeedSyncContext();  // ← async overhead per test
  // ...
});
```

**AFTER:**
```typescript
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  createTestItem,
  registerFixtureCleanup
} from '../../../fixtures';

let baseUrl: string;
let accessToken: string;
let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;
const getSeedSyncContext = async () => seedCtx;  // ← zero-overhead wrapper

beforeAll(async () => {
  baseUrl = getTestBaseUrl();
  accessToken = await getTestAccessToken(baseUrl);
  seedCtx = await loadSeedSyncContext();  // ← once, here
});

it('some test', async () => {
  const ctx = await getSeedSyncContext();  // ← just returns cached value, no async
  // ...
});
```

### Pattern B: File imports `getSeedSyncContext` directly (no alias)
Example:

**BEFORE:**
```typescript
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext  // ← direct import
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let companyId: number;

beforeAll(async () => {
  baseUrl = getTestBaseUrl();
  accessToken = await getTestAccessToken(baseUrl);
  const context = await getSeedSyncContext();  // ← in beforeAll
  companyId = context.companyId;
});
```

**AFTER:**
```typescript
import {
  resetFixtureRegistry,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext  // ← alias the import
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let companyId: number;
let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;
const getSeedSyncContext = async () => seedCtx;  // ← wrapper

beforeAll(async () => {
  baseUrl = getTestBaseUrl();
  accessToken = await getTestAccessToken(baseUrl);
  seedCtx = await loadSeedSyncContext();  // ← once
  companyId = seedCtx.companyId;  // ← or use seedCtx directly
});
```

## Work Split

### Worker A — Simple files (0-2 per-test getSeedSyncContext calls, top-level vars used in beforeAll)
Files where `getSeedSyncContext()` is already called in `beforeAll` but a local wrapper is needed:
1. `apps/api/__test__/integration/import/apply.test.ts` — 1 per-test call
2. `apps/api/__test__/integration/users/create.test.ts` — 1 per-test call
3. `apps/api/__test__/integration/companies/list.test.ts` — 0 per-test calls (already fine)
4. `apps/api/__test__/integration/companies/get-by-id.test.ts` — 0 per-test calls (already fine)
5. `apps/api/__test__/integration/companies/update.test.ts` — 0 per-test calls (already fine)
6. `apps/api/__test__/integration/outlets/create.test.ts` — 0 per-test calls (already fine)
7. `apps/api/__test__/integration/outlets/list.test.ts` — 0 per-test calls (already fine)
8. `apps/api/__test__/integration/outlets/get-by-id.test.ts` — 0 per-test calls (already fine)
9. `apps/api/__test__/integration/outlets/delete.test.ts` — 0 per-test calls (already fine)
10. `apps/api/__test__/integration/outlets/tenant-scope.test.ts` — 0 per-test calls (already fine)
11. `apps/api/__test__/integration/outlets/access.test.ts` — 0 per-test calls (already fine)
12. `apps/api/__test__/integration/admin-dashboards/trial-balance.test.ts` — 0 per-test calls (already fine)

**Note:** Files with 0 per-test calls still need the wrapper added for consistency — but verify first before editing. If a file truly has no `getSeedSyncContext()` calls inside `it()` blocks, it doesn't need the wrapper.

### Worker B — Medium files (3-5 per-test calls, already have beforeAll + wrapper)
13. `apps/api/__test__/integration/inventory/items/create.test.ts` — 2 per-test calls (add wrapper if missing)
14. `apps/api/__test__/integration/inventory/items/update.test.ts` — 4 per-test calls
15. `apps/api/__test__/integration/inventory/item-prices/active.test.ts` — 2 per-test calls
16. `apps/api/__test__/integration/inventory/item-prices/update.test.ts` — 3 per-test calls
17. `apps/api/__test__/integration/recipes/ingredients-list.test.ts` — 3 per-test calls
18. `apps/api/__test__/integration/recipes/ingredients-delete.test.ts` — 2 per-test calls
19. `apps/api/__test__/integration/recipes/ingredients-update.test.ts` — 4 per-test calls
20. `apps/api/__test__/integration/recipes/cost.test.ts` — 4 per-test calls
21. `apps/api/__test__/integration/inventory/items/variant-stats.test.ts` — 2 per-test calls
22. `apps/api/__test__/integration/pos/item-variants.test.ts` — 4 per-test calls
23. `apps/api/__test__/integration/supplies/list.test.ts` — 2 per-test calls

**Verify before editing** — many of these may already have the wrapper pattern. Check imports and `beforeAll` carefully.

### Worker C — High-call files (6-9 per-test calls, verify wrapper is correct)
24. `apps/api/__test__/integration/settings/config-get.test.ts` — 9 per-test calls
25. `apps/api/__test__/integration/settings/config-update.test.ts` — 7 per-test calls
26. `apps/api/__test__/integration/pos/cart-validate.test.ts` — 9 per-test calls
27. `apps/api/__test__/integration/pos/cart-line.test.ts` — 7 per-test calls
28. `apps/api/__test__/integration/inventory/item-prices/variant-prices.test.ts` — 4 per-test calls
29. `apps/api/__test__/integration/inventory/item-prices/create.test.ts` — 5 per-test calls
30. `apps/api/__test__/integration/recipes/ingredients-create.test.ts` — 9 per-test calls

**These files likely already have the pattern but should be verified.**

## Validation Steps

For each file after editing:
```bash
npm run test:single -- apps/api/__test__/integration/<path>/<file>.test.ts
```

After ALL workers complete:
```bash
npm test -w @jurnapod/api
npm run typecheck -w @jurnapod/api
```

## Status
- Worker A: PENDING
- Worker B: PENDING
- Worker C: PENDING
- Full suite run: PENDING
- Commit: PENDING
