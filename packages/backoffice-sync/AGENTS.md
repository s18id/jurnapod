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
  database: dbConn,  // DbConn instance
  logger: console,
  config: { env: 'test' },
});
```

### Database Connection Pattern

Uses `DbConn` from `@jurnapod/db` for all database operations:

```typescript
import { createDbPool, DbConn } from '@jurnapod/db';

const pool = createDbPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const db = new DbConn(pool);
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

2. **Always use parameterized queries** — never string concatenation:
   ```typescript
   // CORRECT
   await db.queryAll('SELECT * FROM items WHERE company_id = ?', [companyId]);
   
   // WRONG
   await db.queryAll(`SELECT * FROM items WHERE company_id = ${companyId}`);
   ```

3. **Never wrap indexed columns in SQL functions**:
   ```sql
   -- WRONG: Prevents index usage
   WHERE DATE(created_at) = '2024-01-01'
   
   -- CORRECT
   WHERE created_at >= '2024-01-01' AND created_at < '2024-01-02'
   ```

### ⚠️ MANDATORY: DbConn-Only Standard

**ALL database access MUST use `DbConn`. Direct `mysql2/promise` usage is STRICTLY FORBIDDEN.**

| Pattern | Status |
|---------|--------|
| `import { DbConn } from '@jurnapod/db'` | ✅ **REQUIRED** |
| `const db = new DbConn(pool)` | ✅ **REQUIRED** |
| `db.query()`, `db.queryAll()`, `db.execute()` | ✅ **REQUIRED** |
| `import ... from 'mysql2/promise'` | ❌ **ABSOLUTELY FORBIDDEN** |
| `import type { Pool } from 'mysql2/promise'` | ❌ **ABSOLUTELY FORBIDDEN** |

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

1. **Company ID scoping** — All queries MUST filter by `company_id`:
   ```typescript
   // CORRECT
   WHERE company_id = ? AND outlet_id = ?
   
   // WRONG - missing company scoping
   WHERE outlet_id = ?
   ```

2. **Validate SyncContext** on every request:
   ```typescript
   const context = SyncContextSchema.parse(request.context);
   ```

3. **No FLOAT/DOUBLE for money** — Use DECIMAL(19,4) or BIGINT for cents

---

## Review Checklist

When modifying this package:

- [ ] All SQL uses parameterized queries
- [ ] Company/outlet scoping on all queries
- [ ] Zod schemas validate all external data
- [ ] Integration tests use real DB with proper seed data
- [ ] Tests close database pool in `afterAll()`
- [ ] No hardcoded test company/outlet IDs in source
- [ ] **NO imports from `mysql2/promise`** - use `DbConn` from `@jurnapod/db` only
- [ ] Batch processor handles retry and cleanup correctly
- [ ] Export scheduler starts/stops cleanly

---

## Related Packages

- `@jurnapod/sync-core` — Sync infrastructure (SyncModule interface, registry)
- `@jurnapod/db` — Database connectivity (DbConn)
- `@jurnapod/api` — Uses this package for backoffice sync endpoints

For project-wide conventions, see root `AGENTS.md`.