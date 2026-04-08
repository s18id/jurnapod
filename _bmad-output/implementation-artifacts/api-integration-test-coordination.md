# API Integration Test Coverage - Coordination File

> **Purpose:** Track parallel implementation of API integration test stories.
> **Generated:** 2026-04-08
> **Coordination rule:** Each agent owns one story, creates files ONLY in its assigned directory.
> **Conflict resolution:** Files are unique per story (one directory per module).

---

## Status Dashboard

| Story | Module | Files | Status | Notes |
|-------|--------|-------|--------|-------|
| API-INT-001 | users | 10 files | ✅ DONE | |
| API-INT-002 | roles | 5 files | ✅ DONE | |
| API-INT-003 | outlets | 7 files | ✅ DONE | |
| API-INT-004 | inventory | 19 files | ⚠️ PARTIAL | Some tests fail due to route implementation bugs (404/409 handling) |
| API-INT-005 | stock | 4 files | 🔲 QUEUED | Not started |
| API-INT-006 | tax-rates | 7 files | ✅ DONE | |
| API-INT-007 | cash-bank | 4 files | ✅ DONE | |
| API-INT-008 | reports | 9 files | ✅ DONE | |
| API-INT-009 | import | 6 files | ✅ DONE | |
| API-INT-010 | companies | 4 files | ✅ DONE | |
| API-INT-011 | settings-modules | 5 files | ✅ DONE | |
| API-INT-012 | settings-config | 2 files | ✅ DONE | |
| API-INT-013 | settings-pages | 6 files | ✅ DONE | |
| API-INT-014 | supplies | 5 files | ✅ DONE | Fixed: PATCH/DELETE 404, duplicate SKU 409 |
| API-INT-015 | recipes | 5 files | ⚠️ PARTIAL | MySQL deadlocks under parallel execution |
| API-INT-016 | dinein | 2 files | ⚠️ PARTIAL | Route has auth middleware bug |
| API-INT-017 | pos | 3 files | ⚠️ PARTIAL | MySQL deadlocks; use --no-file-parallelism |
| API-INT-018 | export | 1 file | ✅ DONE | |
| API-INT-019 | progress | 1 file | ✅ DONE | |
| API-INT-020 | audit | 1 file | ✅ DONE | |
| API-INT-021 | health | 1 file | ✅ DONE | |
| API-INT-022 | admin-dashboards | 3 files | ✅ DONE | |

## P1 Route Bug Fixes — Parallel Streams

| Stream | Module | Status | File Allowlist | Goal |
|--------|--------|--------|----------------|------|
| A | inventory variant-prices | 🔲 IN_PROGRESS | `apps/api/src/routes/inventory.ts`, `apps/api/__test__/integration/inventory/item-prices/variant-prices.test.ts` | Parse itemId and include in query |
| B | supplies 409/404 | ✅ DONE | `apps/api/src/routes/supplies.ts`, `apps/api/src/lib/supplies/index.ts`, `apps/api/__test__/integration/supplies/{create,update,delete}.test.ts` | Correct error status codes |
| C | dinein auth | 🔲 QUEUED | `apps/api/src/routes/dinein.ts`, `apps/api/__test__/integration/dinein/{sessions,tables}.test.ts` | Fix auth middleware |
| D | deadlock mitigation | 🔲 QUEUED | test runner config only | Stable parallel execution |
| E | assertion normalization | 🔲 QUEUED | newly added integration tests | No brittle strict-403 |

---

## Known Issues Summary

### Route Implementation Bugs (should be fixed by @bmad-dev)
1. **inventory variant-prices route** - `itemId` param not parsed/filtered; returns 200 for invalid item IDs
2. **~~supplies routes~~** - ✅ FIXED: `updateSupply` returns 200 for non-existent IDs; `deleteSupply` always returns success; duplicate SKU throws wrong error type (500 vs 409)
3. **dinein routes** - Auth middleware bug: `requireAccess()` result used as Response directly; `authenticateRequest` never called

### Infrastructure Issues
1. **MySQL deadlocks** - Parallel test execution causes lock contention for shared seed company data. Workaround: use `--no-file-parallelism` flag
2. **Route auth bypass** - OWNER/SUPER_ADMIN tokens bypass module permissions, causing tests expecting 403 to get 200

## Full Suite Results
```
npm test -w @jurnapod/api
Test Files: 22 failed | 103 passed (125)
Tests: 57 failed | 801 passed | 3 skipped (861)
```

---

## Coordination Rules

1. **File isolation**: Each story writes ONLY to its assigned directory under `apps/api/__test__/integration/<module>/`.
2. **No cross-story files**: Do NOT create or modify files outside your assigned directory.
3. **Shared helpers**: Use `apps/api/__test__/fixtures` and `apps/api/__test__/helpers` — do NOT create new shared utilities.
4. **Fixture pattern**: Always use `getSeedSyncContext()` for tenant context, `resetFixtureRegistry()` in afterAll.
5. **Permission tests**: Expect 200/403/400 etc. based on actual route behavior. OWNER/SUPER_ADMIN tokens bypass module permissions.
6. **No cleanup side-effects**: Other stories may have left data. Use unique identifiers (timestamps, UUIDs) to avoid collisions.
7. **No hardcoded IDs**: Use fixture helpers or query helpers. No `company_id: 1`, `outlet_id: 1`, etc.
8. **Coordination file update**: Mark your story as DONE in this file when complete.

---

## Shared Fixtures Reference

```typescript
// Available from apps/api/__test__/fixtures
import {
  getTestAccessToken,      // Get access token via JP env credentials
  getSeedSyncContext,      // Get companyId, outletId, cashierUserId from env seed
  createTestCompany,       // Create unique test company
  createTestUser,          // Create unique test user
  createTestItem,          // Create unique test item
  resetFixtureRegistry,    // Non-destructive cleanup (use in afterAll)
  registerFixtureCleanup,  // For side-effect cleanup (API-created records)
  getRoleIdByCode,         // Look up system role IDs
} from '../../fixtures';

// From apps/api/__test__/helpers/db
import { closeTestDb } from '../../helpers/db';
```

## Test Template Per File

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext } from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('module.operation', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => { /* ... */ });
});
```

---

## Verification

After completing your story, run:
```bash
npm test -w @jurnapod/api -- --run __test__/integration/<your-module>/
```

Expected: all test files for your module pass.
