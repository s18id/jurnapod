# AGENTS.md — @jurnapod/pos-sync

## Package Purpose

POS sync module for Jurnapod ERP - handles offline-first data synchronization between POS clients and the central database.

**Core Capabilities:**
- **PULL sync**: Fetch master data (items, variants, prices, tables, reservations, open orders)
- **PUSH sync**: Upload transactions, active orders, order updates, item cancellations, variant sales, variant stock adjustments
- **Idempotency**: Client-side `client_tx_id` prevents duplicate processing
- **Tier-based versioning**: MASTER/OPERATIONAL/REALTIME tier sync with version tracking
- **Offline-first**: Designed for unreliable networks with retry logic

**Boundaries:**
- ✅ In: POS data sync, order processing, inventory tracking
- ❌ Out: Real-time WebSocket/SSE (handled at API layer), payment processing

## Canonical Sync Contract (MANDATORY)
- POS pull request cursor must use `since_version`.
- POS pull response cursor must use `data_version`.
- Do **NOT** add alias fields (e.g. `sync_data_version`) in transport, schemas, or module payloads unless there is an explicit versioned API migration plan.
- Version storage authority is `sync_versions` only (`tier IS NULL` for data version).
- Do **NOT** reintroduce runtime dependency on legacy tables `sync_data_versions` or `sync_tier_versions`.

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | TypeScript check |
| `npm run build` | Compile TypeScript to dist/ |
| `npm run lint` | Lint code |
| `npm run test` | Run all tests |
| `npm run test:run` | Run tests once (no watch) |

---

## Architecture Patterns

### Module Structure

The `PosSyncModule` implements the `SyncModule` interface from `@jurnapod/sync-core`:

```typescript
import { PosSyncModule } from '@jurnapod/pos-sync';

const module = new PosSyncModule({
  module_id: 'pos',
  client_type: 'POS',
  enabled: true,
});

await module.initialize({
  db,  // Kysely instance
  logger: console,
  config: { env: 'test' },
});
```

### Database Connection Pattern

Uses pure Kysely from `@jurnapod/db` for all database operations:

```typescript
import { createKysely, getKysely, type KyselySchema, withTransaction } from '@jurnapod/db';

// Factory function for new instances (tests)
const db = createKysely({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Singleton for server
const db = getKysely();

// Type-safe queries using Kysely's query builder
const items = await db
  .selectFrom('items')
  .select(['id', 'name', 'code'])
  .where('company_id', '=', companyId)
  .where('is_active', '=', true)
  .execute();
```

### Sync Flow

**PULL sync** (POS fetches data):
```typescript
const result = await module.handlePullSync({
  companyId: 1,
  outletId: 1,
  sinceVersion: 0,  // 0 = full sync
});
```

**PUSH sync** (POS uploads data):
```typescript
const result = await module.handlePushSync({
  db,
  companyId: 1,
  outletId: 1,
  transactions: [transaction],
  activeOrders: [],
  orderUpdates: [],
  itemCancellations: [],
  variantSales: [],
  variantStockAdjustments: [],
  correlationId: 'unique-id',
});
```

---

## Module Organization

| Module | File | Purpose |
|--------|------|---------|
| `PosSyncModule` | `pos-sync-module.ts` | Main module implementing SyncModule interface |
| PULL | `pull/index.ts` | Pull sync business logic |
| PULL types | `pull/types.ts` | Pull sync TypeScript types |
| PUSH | `push/index.ts` | Push sync business logic |
| PUSH types | `push/types.ts` | Push sync TypeScript types |
| Endpoints | `endpoints/pos-sync-endpoints.ts` | HTTP endpoint factory |
| Data Service | `core/pos-data-service.ts` | Database queries for POS data |

### File Structure

```
packages/pos-sync/
├── src/
│   ├── index.ts                    # Main exports (PosSyncModule)
│   ├── pos-sync-module.ts          # Main module class
│   │
│   ├── pull/
│   │   ├── index.ts                # Pull sync implementation
│   │   └── types.ts                # PullSyncParams, PullSyncResult
│   │
│   ├── push/
│   │   ├── index.ts                # Push sync implementation
│   │   └── types.ts                # Push types (TransactionPush, etc.)
│   │
│   ├── endpoints/
│   │   └── pos-sync-endpoints.ts   # HTTP endpoint creation
│   │
│   ├── core/
│   │   └── pos-data-service.ts     # PosDataService with DB queries
│   │
│   └── types/
│       └── pos-data.ts             # Shared POS data types
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env                            # Test database config
├── README.md
└── AGENTS.md (this file)
```

---

## Coding Standards

### Database Access: Pure Kysely

**All database access MUST use pure Kysely API. No mysql2-style patterns.**

```typescript
// REQUIRED: Import from @jurnapod/db
import { createKysely, getKysely, type KyselySchema, withTransaction } from '@jurnapod/db';

// Factory function for new instances (tests)
const db = createKysely({ uri: 'mysql://user:pass@host:3306/database' });

// Singleton for server (reuse connection)
const db = getKysely();

// Type-safe queries using Kysely's query builder
const rows = await db
  .selectFrom('items')
  .select(['id', 'name', 'code'])
  .where('company_id', '=', companyId)
  .where('is_active', '=', true)
  .execute();

// Insert with returning
const newItem = await db
  .insertInto('items')
  .values({ company_id: companyId, name, code, is_active: true })
  .returningAll()
  .executeTakeFirst();

// Update with returning
const updated = await db
  .updateTable('items')
  .set({ name: newName })
  .where('id', '=', itemId)
  .returningAll()
  .executeTakeFirst();

// Delete
await db.deleteFrom('items').where('id', '=', itemId).execute();

// Transactions
await withTransaction(db, async (trx) => {
  await trx.insertInto('orders').values({ ... }).execute();
  await trx.updateTable('inventory').set({ quantity: newQty }).where('item_id', '=', itemId).execute();
});
```

### ⚠️ MANDATORY: No mysql2 Direct Usage

| Pattern | Status |
|---------|--------|
| `import { Kysely, type KyselySchema } from '@jurnapod/db'` | ✅ **REQUIRED** |
| `db.selectFrom().where().execute()` | ✅ **REQUIRED** |
| `db.insertInto().values().returningAll().execute()` | ✅ **REQUIRED** |
| `db.updateTable().set().where().execute()` | ✅ **REQUIRED** |
| `db.deleteFrom().where().execute()` | ✅ **REQUIRED** |
| `withTransaction(db, async (trx) => {...})` | ✅ **REQUIRED** |
| `import ... from 'mysql2'` | ❌ **ABSOLUTELY FORBIDDEN** |
| `import type { Pool } from 'mysql2'` | ❌ **ABSOLUTELY FORBIDDEN** |
| `db.queryAll(sql, params)` | ❌ **DEPRECATED** |

### TypeScript Conventions

1. **Use `.js` extensions in imports** (ESM compliance):
   ```typescript
   import { PosSyncModule } from './pos-sync-module.js';
   import type { PullSyncParams } from './pull/types.js';
   ```

2. **Export types from `index.ts`** for public API surface

### SQL Patterns

1. **Use snake_case for SQL column names** (MySQL/MariaDB compatibility)

2. **Never wrap indexed columns in SQL functions**:
   ```sql
   -- WRONG: Prevents index usage
   WHERE DATE(created_at) = '2024-01-01'

   -- CORRECT
   WHERE created_at >= '2024-01-01' AND created_at < '2024-01-02'
   ```

3. **Use Kysely's query builder** - never raw SQL strings for data access

### Push Sync Validation Rules

| Field | Validation |
|-------|------------|
| `company_id` | Must match the authenticated company's ID (rejected at push entry) |
| `service_type: 'DINE_IN'` | Requires `table_id` to be set |
| `order_state` | Must be `'OPEN'` or `'CLOSED'` (CHECK constraint) |
| `service_type` | Must be `'TAKEAWAY'` or `'DINE_IN'` (CHECK constraint) |

### Idempotency Pattern

All push operations use `client_tx_id` for idempotency:
- Transactions: `client_tx_id` - unique per transaction
- Order updates: `update_id` - unique per update
- Item cancellations: `cancellation_id` - unique per cancellation
- Variant sales: `client_tx_id` on variant sale record

Duplicate pushes return `result: 'DUPLICATE'` instead of reprocessing.

---

## Testing Approach

### Integration Tests

Integration tests use real database connections. Configure via `.env`:

```bash
DB_HOST=172.18.0.2
DB_PORT=3306
DB_USER=root
DB_PASSWORD=mariadb
DB_NAME=jurnapod_test
```

**Critical**: Integration tests require seed data:
- POS user with CASHIER role
- Test orders in `pos_order_snapshots` with valid `order_state` ('OPEN'/'CLOSED')
- Required `service_type` on all order snapshots

### Test Patterns

Integration tests with real database:

```typescript
import { createKysely, type KyselySchema } from '@jurnapod/db';

// Load .env before other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

const db = createKysely({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Use db.selectFrom().where().execute() - NEVER mysql2 directly

// CRITICAL: Clean up in afterAll
afterAll(async () => {
  await db.destroy();
});
```

### Test File Naming

- Integration tests: `src/**/*.integration.test.ts`

### Running Tests

```bash
# Run all tests
npm test -w @jurnapod/pos-sync

# Run once (CI mode)
npm run test:run -w @jurnapod/pos-sync
```

---

## Security Rules

### Critical Constraints

1. **Company ID scoping** — All queries MUST filter by context:
   ```typescript
   // CORRECT
   await db.selectFrom('items')
     .where('company_id', '=', companyId)
     .where('outlet_id', '=', outletId)
     .execute();

   // WRONG - missing scoping
   await db.selectFrom('items')
     .where('id', '=', itemId)
     .execute();
   ```

2. **Reject mismatched company_id at entry point**:
   Transactions with `company_id` not matching authenticated user are filtered before processing.

3. **No FLOAT/DOUBLE for money** — Use DECIMAL(19,4) or BIGINT for cents

4. **Offline-safe idempotency** — Use `client_tx_id` for deduplication

---

## Review Checklist

When modifying this package:

- [ ] All database access uses pure Kysely API
- [ ] Company/outlet scoping on all queries
- [ ] `order_state` validated as 'OPEN' or 'CLOSED'
- [ ] `service_type` validated as 'TAKEAWAY' or 'DINE_IN'
- [ ] `service_type: 'DINE_IN'` requires `table_id`
- [ ] Integration tests use real DB with proper seed data
- [ ] Tests clean up Kysely instance in `afterAll()`
- [ ] No hardcoded test company/outlet IDs in source
- [ ] Idempotency keys (`client_tx_id`, etc.) properly handled
- [ ] **NO imports from `mysql2`** - use Kysely from `@jurnapod/db` only

---

## Related Packages

- `@jurnapod/sync-core` — Sync infrastructure (SyncModule interface, registry)
- `@jurnapod/db` — Database connectivity (Kysely factory)
- `@jurnapod/api` — Uses this package for POS sync endpoints

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB via `.env`.

Mocking database interactions for code that reads/writes SQL tables creates a **false sense of security** and introduces **severe production risk**:

- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks hide transaction isolation issues that only manifest under real concurrency
- Mocks mask performance problems that only appear with real data volumes
- Integration tests with real DB catch these issues early, before production

**What may still be mocked:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic** (pure computation) may use unit tests without database.

Any DB mock found in DB-backed tests is a P0 risk and must be treated as a blocker.

For project-wide conventions, see root `AGENTS.md`.
