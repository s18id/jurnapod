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
| PUSH | `push/index.ts` | Push sync business logic (1097 lines) |
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

### TypeScript Conventions

1. **Use `.js` extensions in imports** (ESM compliance):
   ```typescript
   import { PosSyncModule } from './pos-sync-module.js';
   import type { PullSyncParams } from './pull/types.js';
   ```

2. **Use `@/` alias for imports from `apps/api/src`**:
   ```typescript
   import { getDbPool } from "@/lib/db";
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

### Test Fixtures

```typescript
beforeAll(async () => {
  // Seed pos_order_snapshots for FK-dependent tests
  const seedOrders = ['test-seed-order-1', 'test-seed-order-2'];
  for (const orderId of seedOrders) {
    await fixtures.db.execute(
      `INSERT IGNORE INTO pos_order_snapshots 
       (order_id, company_id, outlet_id, service_type, order_status, order_state, is_finalized, opened_at, updated_at) 
       VALUES (?, ?, ?, 'TAKEAWAY', 'OPEN', 'OPEN', false, NOW(), NOW())`,
      [orderId, fixtures.testCompanyId, fixtures.testOutletId]
    );
  }
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

1. **Company ID scoping** — All queries MUST filter by `company_id`:
   ```typescript
   // CORRECT
   WHERE company_id = ? AND outlet_id = ?
   
   // WRONG - missing company scoping
   WHERE outlet_id = ?
   ```

2. **Reject mismatched company_id at entry point**:
   Transactions with `company_id` not matching authenticated user are filtered before processing.

3. **No FLOAT/DOUBLE for money** — Use DECIMAL(19,4) or BIGINT for cents

4. **Offline-safe idempotency** — Use `client_tx_id` for deduplication

---

## Review Checklist

When modifying this package:

- [ ] All SQL uses parameterized queries
- [ ] Company/outlet scoping on all queries
- [ ] `order_state` validated as 'OPEN' or 'CLOSED'
- [ ] `service_type` validated as 'TAKEAWAY' or 'DINE_IN'
- [ ] `service_type: 'DINE_IN'` requires `table_id`
- [ ] Integration tests use real DB with proper seed data
- [ ] Tests close database pool in `afterAll()`
- [ ] No hardcoded test company/outlet IDs in source
- [ ] Idempotency keys (`client_tx_id`, etc.) properly handled

---

## Related Packages

- `@jurnapod/sync-core` — Sync infrastructure (SyncModule interface, registry)
- `@jurnapod/db` — Database connectivity (DbConn)
- `@jurnapod/api` — Uses this package for POS sync endpoints

For project-wide conventions, see root `AGENTS.md`.