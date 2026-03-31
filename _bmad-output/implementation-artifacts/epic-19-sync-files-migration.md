# Epic 19: API Kysely Migration - Sync Files Coordination

## Context

Epic 18 migrated `@jurnapod/db` to pure Kysely, breaking the API package (~150+ type errors).
Epic 17 Story 17-6 is blocked because Phase 2 functions depend on mysql2 patterns.

## Goal

Migrate sync-related API files to Kysely to unblock Story 17-6 and contribute to Epic 19.

## Files to Migrate

### Phase 2 Dependencies (Critical Path for Story 17-6)

1. **`apps/api/src/lib/stock.ts`**
   - Uses: `PoolConnection`, `getDbPool().getConnection()`, `conn.execute()`
   - Key functions: `resolveAndDeductStockForTransaction`
   - Complexity: HIGH (uses transactions, FOR UPDATE locks)

2. **`apps/api/src/lib/cogs-posting.ts`**
   - Uses: `DbConn`, `getDbConn()`, `conn.execute()`
   - Key functions: `postCogsForSale`
   - Complexity: MEDIUM (uses transactions)

3. **`apps/api/src/lib/sync-push-posting.ts`**
   - Uses: `PoolConnection`, `QueryExecutor` type
   - Key functions: `runSyncPushPostingHook`
   - Complexity: MEDIUM (complex posting logic, depends on cogs-posting)

4. **`apps/api/src/lib/sync/push/transactions.ts`**
   - Status: PARTIALLY migrated
   - Uses: `KyselySchema` (good), but calls unmigrated functions
   - Complexity: LOW (already uses Kysely, just needs the callees migrated)

### Supporting Sync Files

5. **`apps/api/src/lib/sync/push/orders.ts`**
   - Uses: `DbConn`, `newKyselyConnection`, `DB` type
   - Complexity: MEDIUM

6. **`apps/api/src/lib/sync/push/idempotency.ts`**
   - Uses: `newKyselyConnection`
   - Complexity: LOW

## Migration Pattern

Follow the established pattern from `packages/auth`:
- Import `createKysely`, `getKysely`, `type KyselySchema` from `@jurnapod/db`
- Use `sql` template tag for raw SQL
- Use Kysely query builder for type-safe queries
- Use `withTransaction()` for transaction-bound operations

## Key Patterns to Replace

| Old Pattern | New Pattern |
|-------------|-------------|
| `import { DbConn } from '@jurnapod/db'` | `import type { KyselySchema } from '@jurnapod/db'` |
| `getDbPool().getConnection()` | `getDb()` (KyselySchema) |
| `conn.execute(sql, params)` | `sql\`${sql}\`.execute(db)` |
| `conn.queryAll(sql, params)` | `sql\`${sql}\`.execute(db)` |
| `conn.beginTransaction()` | `withTransaction(db, async (trx) => {...})` |
| `newKyselyConnection(conn)` | Use `db` directly or `withTransaction` |

## Test Impact

After migration, run:
```bash
npm run test:unit:sync -w @jurnapod/api
npm run test:unit:stock -w @jurnapod/api  # if stock tests exist
```

## Coordination Notes

- Migrate in dependency order: idempotency → orders → transactions → stock → cogs-posting → sync-push-posting
- `transactions.ts` depends on all others, so it should be last
- `sync-push-posting.ts` depends on `cogs-posting.ts`

## Stories Tracking

This work contributes to Epic 19:
- 19-1: migrate-api-lib-shared (partial)
- 19-2: migrate-api-lib-foundation (partial - stock.ts)
- 19-4: migrate-api-lib-business (partial - sync-push-posting, cogs-posting)
- 19-12: migrate-api-routes (partial - sync routes)

## Status

- [ ] idempotency.ts
- [ ] orders.ts  
- [ ] transactions.ts (already partially done)
- [ ] stock.ts
- [ ] cogs-posting.ts
- [ ] sync-push-posting.ts