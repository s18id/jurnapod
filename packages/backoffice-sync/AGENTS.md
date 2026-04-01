# AGENTS.md — @jurnapod/backoffice-sync

## Package Purpose

Backoffice sync module for Jurnapod ERP - handles comprehensive data synchronization for backoffice dashboard, analytics, and administrative operations.

**Core Capabilities:**
- **Tier-based sync**: REALTIME, OPERATIONAL, MASTER, ADMIN, ANALYTICS sync tiers
- **Dashboard data**: Live sales metrics, staff activity, system alerts
- **Business intelligence**: Sales analytics, financial reports, reconciliation data
- **Administrative sync**: Company settings, outlets, users, tax settings
- **Batch processing**: Background job queue with retry and concurrency control
- **Export scheduling**: Automated report generation and export

**Boundaries:**
- ✅ In: Backoffice data sync, batch processing, export scheduling, analytics queries
- ❌ Out: Business logic (tax calculation, COGS, journal posting stays in API layer), payment processing

## Canonical Sync Contract (MANDATORY)
- Sync request cursor must use `since_version`.
- Sync response cursor must use `data_version`.
- Do **NOT** introduce alias protocol fields like `sync_data_version` without an explicit versioned API migration plan.
- Sync version storage must use `sync_versions` as single source of truth.
- Runtime code must not depend on `sync_data_versions` or `sync_tier_versions`.

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

The `BackofficeSyncModule` implements the `SyncModule` interface from `@jurnapod/sync-core`:

```typescript
import { BackofficeSyncModule } from '@jurnapod/backoffice-sync';

const module = new BackofficeSyncModule({
  module_id: 'backoffice',
  client_type: 'BACKOFFICE',
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
const rows = await db
  .selectFrom('items')
  .select(['id', 'name', 'code'])
  .where('company_id', '=', companyId)
  .where('is_active', '=', true)
  .execute();
```

### Sync Tiers

The system uses tier-based sync to differentiate data by change frequency:

| Tier | Description | Typical Frequency |
|------|-------------|-------------------|
| **REALTIME** | Live dashboard metrics | WebSocket/SSE |
| **OPERATIONAL** | Recent transactions, alerts | 30s-2min |
| **MASTER** | Items, customers, suppliers, accounts | 5-10min |
| **ADMIN** | Users, outlets, tax settings | 30min-daily |
| **ANALYTICS** | Reports, reconciliation | Hourly-daily |

---

## Module Organization

| Module | File | Purpose |
|--------|------|---------|
| `BackofficeSyncModule` | `backoffice-sync-module.ts` | Main module implementing SyncModule interface |
| Data Service | `core/backoffice-data-service.ts` | Database queries for backoffice data |
| Batch Processor | `batch/batch-processor.ts` | Background job queue with retry logic |
| Export Scheduler | `scheduler/export-scheduler.ts` | Automated report export scheduling |
| Endpoints | `endpoints/backoffice-sync-endpoints.ts` | HTTP endpoint factory |
| WebSocket | `events/websocket-publisher.ts` | Real-time event publishing |

### File Structure

```
packages/backoffice-sync/
├── src/
│   ├── index.ts                    # Main exports
│   ├── backoffice-sync-module.ts  # Main module class
│   │
│   ├── core/
│   │   └── backoffice-data-service.ts  # BackofficeDataService with DB queries
│   │
│   ├── batch/
│   │   └── batch-processor.ts     # BatchProcessor with job queue
│   │
│   ├── scheduler/
│   │   ├── index.ts
│   │   └── export-scheduler.ts    # ExportScheduler for reports
│   │
│   ├── endpoints/
│   │   └── backoffice-sync-endpoints.ts  # HTTP endpoints
│   │
│   ├── events/
│   │   └── websocket-publisher.ts # WebSocket event publishing
│   │
│   └── types/
│       └── backoffice-data.ts     # Zod schemas and types
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
   import { BackofficeSyncModule } from './backoffice-sync-module.js';
   import type { BackofficeRealtimeData } from './types/backoffice-data.js';
   ```

2. **Use Zod for input validation** on external data:
   ```typescript
   import { BackofficeRealtimeDataSchema } from './types/backoffice-data.js';

   const data = BackofficeRealtimeDataSchema.parse(rawData);
   ```

3. **Export types from `index.ts`** for public API surface

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

---

## Batch Processing

The `BatchProcessor` handles heavy background jobs with retry logic:

```typescript
const batchProcessor = new BatchProcessor(db, {
  maxConcurrentJobs: 3,
  pollIntervalMs: 30_000,    // 30 seconds
  retryDelayMs: 60_000,       // 1 minute
  cleanupIntervalMs: 300_000  // 5 minutes
});

await batchProcessor.start();

// Job types supported:
// - SALES_REPORT
// - AUDIT_CLEANUP
// - RECONCILIATION
// - ANALYTICS_SYNC
// - SCHEDULED_EXPORT
// - FORECAST_GENERATION
// - INSIGHTS_CALCULATION
```

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

**Critical**: Integration tests require seed data (company, outlet fixtures from `JP_COMPANY_CODE`, `JP_OUTLET_CODE`, `JP_OWNER_EMAIL`).

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
npm test -w @jurnapod/backoffice-sync

# Run once (CI mode)
npm run test:run -w @jurnapod/backoffice-sync
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

2. **Validate SyncContext** on every request:
   ```typescript
   const context = SyncContextSchema.parse(request.context);
   ```

3. **No FLOAT/DOUBLE for money** — Use DECIMAL(19,4) or BIGINT for cents

---

## Review Checklist

When modifying this package:

- [ ] All database access uses pure Kysely API
- [ ] Company/outlet scoping on all queries
- [ ] Zod schemas validate all external data
- [ ] Integration tests use real DB with proper seed data
- [ ] Tests clean up Kysely instance in `afterAll()`
- [ ] No hardcoded test company/outlet IDs in source
- [ ] **NO imports from `mysql2`** - use Kysely from `@jurnapod/db` only
- [ ] Batch processor handles retry and cleanup correctly
- [ ] Export scheduler starts/stops cleanly

---

## Related Packages

- `@jurnapod/sync-core` — Sync infrastructure (SyncModule interface, registry)
- `@jurnapod/db` — Database connectivity (Kysely factory)
- `@jurnapod/api` — Uses this package for backoffice sync endpoints

For project-wide conventions, see root `AGENTS.md`.
