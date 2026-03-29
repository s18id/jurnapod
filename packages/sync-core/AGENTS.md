# AGENTS.md — @jurnapod/sync-core

## Package Purpose

Shared sync infrastructure for Jurnapod ERP - provides the module registry, authentication, audit logging, transport, and idempotency services used by POS and backoffice sync modules.

**Core Capabilities:**
- **SyncModuleRegistry**: Central registry for sync modules with factory pattern
- **SyncAuthenticator**: Token validation and role-based access for sync operations
- **SyncAuditor**: Audit logging for all sync operations
- **RetryTransport**: HTTP client with exponential backoff for sync calls
- **SyncIdempotencyService**: Idempotency tracking to prevent duplicate processing
- **Tier-based versioning**: MASTER/OPERATIONAL/REALTIME tier sync with version tracking
- **WebSocket support**: Event publishing for real-time sync notifications
- **Data retention jobs**: Automatic cleanup of old sync data

**Boundaries:**
- ✅ In: Sync infrastructure, module registration, authentication, audit, transport, idempotency
- ❌ Out: Business logic (in pos-sync or backoffice-sync), HTTP handling

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | TypeScript check |
| `npm run build` | Compile TypeScript to dist/ |
| `npm run lint` | Lint code |
| `npm run test` | Run unit tests |
| `npm run test:run` | Run tests once (CI mode) |

---

## Architecture Patterns

### Module Interface

All sync modules must implement `SyncModule`:

```typescript
import type { SyncModule, SyncModuleInitContext } from "@jurnapod/sync-core";

export class MySyncModule implements SyncModule {
  readonly moduleId = "my-module";
  readonly clientType = "POS";
  readonly endpoints: SyncEndpoint[] = [];

  constructor(public config: SyncModuleConfig) {}

  async initialize(context: SyncModuleInitContext): Promise<void> {
    // Set up database, cache, etc.
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true, message: "OK" };
  }

  async cleanup(): Promise<void> {
    // Release resources
  }
}
```

### Module Registration

```typescript
import { syncModuleRegistry } from "@jurnapod/sync-core";
import { MySyncModule } from "./my-sync-module.js";

// Register with factory (recommended for lazy loading)
syncModuleRegistry.registerFactory('my-module', (config) => new MySyncModule(config));

// Or register instance directly
const module = new MySyncModule({ module_id: 'my-module', client_type: 'POS', enabled: true });
syncModuleRegistry.register(module);

// Initialize all modules
await syncModuleRegistry.initialize({
  database: dbConn,
  logger: console,
  config: { env: 'production' }
});

// Health check all modules
const health = await syncModuleRegistry.healthCheck();
```

### Sync Context

Every sync request carries context about the requester:

```typescript
interface SyncContext {
  company_id: number;
  outlet_id?: number;      // Optional for admin operations
  user_id?: number;
  client_type: 'POS' | 'BACKOFFICE';
  request_id: string;      // UUID for tracing
  timestamp: string;       // ISO 8601
}
```

---

## Module Organization

| Module | File | Purpose |
|--------|------|---------|
| Registry | `registry/module-registry.ts` | Central module registration and lifecycle |
| Auth | `auth/sync-auth.ts` | Token validation, role checking |
| Audit | `audit/sync-audit.ts` | Audit event logging |
| Transport | `transport/retry-transport.ts` | HTTP client with retry logic |
| Idempotency | `idempotency/sync-idempotency.ts` | Duplicate detection and prevention |
| Data Queries | `data/*.ts` | Shared SQL queries for sync data |
| WebSocket | `websocket/publisher.ts` | Real-time event publishing |
| Jobs | `jobs/data-retention.job.ts` | Data cleanup jobs |

### File Structure

```
packages/sync-core/
├── src/
│   ├── index.ts                    # Main exports
│   │
│   ├── registry/
│   │   └── module-registry.ts     # SyncModuleRegistry class
│   │
│   ├── auth/
│   │   └── sync-auth.ts           # Authentication
│   │
│   ├── audit/
│   │   └── sync-audit.ts          # Audit logging
│   │
│   ├── transport/
│   │   └── retry-transport.ts    # HTTP client with retry
│   │
│   ├── idempotency/
│   │   ├── index.ts               # Exports and re-exports
│   │   ├── sync-idempotency.ts    # Core idempotency logic
│   │   └── metrics-collector.ts   # Metrics collection
│   │
│   ├── data/
│   │   ├── index.ts               # Data query exports
│   │   ├── variant-queries.ts    # Variant sync queries
│   │   ├── item-queries.ts       # Item sync queries
│   │   ├── order-*.ts             # Order-related queries
│   │   ├── transaction-queries.ts # Transaction sync queries
│   │   └── ...                    # Other data queries
│   │
│   ├── websocket/
│   │   ├── index.ts
│   │   ├── publisher.ts           # Event publisher
│   │   └── types.ts               # WebSocket types
│   │
│   ├── jobs/
│   │   ├── data-retention.job.ts # Retention policies
│   │   └── data-retention.test.ts
│   │
│   └── types/
│       ├── index.ts               # Core types (SyncContext, etc.)
│       └── module.ts              # SyncModule interface
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── AGENTS.md (this file)
```

---

## Sync Tiers

The system uses tier-based sync to differentiate data by change frequency:

| Tier | Description | Typical Frequency |
|------|-------------|-------------------|
| **REALTIME** | Critical operations | WebSocket/SSE |
| **OPERATIONAL** | High-frequency data | 30s-2min |
| **MASTER** | Core reference data | 5-10min |
| **ADMIN** | Configuration | 30min-daily |
| **ANALYTICS** | Reporting | Hourly-daily |

---

## Coding Standards

### TypeScript Conventions

1. **Use `.js` extensions in imports** (ESM compliance):
   ```typescript
   import { SyncModuleRegistry } from "./registry/module-registry.js";
   import type { SyncContext } from "../types/index.js";
   ```

2. **Use Zod for input validation** on external data:
   ```typescript
   import { SyncContextSchema } from "./types/index.js";
   
   const context = SyncContextSchema.parse(input);
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

4. **Use `DbConn` from `@jurnapod/db`** for ALL database access:
   ```typescript
   import { createDbPool, DbConn } from "@jurnapod/db";
   
   // CORRECT - use DbConn
   const pool = createDbPool({ host: '...', port: 3306, user: '...', password: '...', database: '...' });
   const db = new DbConn(pool);
   await db.query('SELECT * FROM items WHERE company_id = ?', [companyId]);
   
   // WRONG - never use mysql2/promise directly
   import type { Pool } from 'mysql2/promise'; // FORBIDDEN
   ```

### ⚠️ MANDATORY: DbConn-Only Standard

**ALL database access MUST use `DbConn`. Direct `mysql2/promise` usage is STRICTLY FORBIDDEN.**

| Pattern | Status |
|---------|--------|
| `import { DbConn } from '@jurnapod/db'` | ✅ **REQUIRED** |
| `const db = new DbConn(pool)` | ✅ **REQUIRED** |
| `db.query()`, `db.execute()`, `db.beginTransaction()` | ✅ **REQUIRED** |
| `import ... from 'mysql2/promise'` | ❌ **ABSOLUTELY FORBIDDEN** |
| `import type { Pool } from 'mysql2/promise'` | ❌ **ABSOLUTELY FORBIDDEN** |
| `pool.execute()`, `pool.query()` | ❌ **ABSOLUTELY FORBIDDEN** |

**Legacy Code Warning**: The `DataRetentionJob` currently uses `mysql2/promise` Pool directly. This is being migrated to use `DbConn` for consistency with project standards.

### Error Handling

Use the idempotency service for retryable vs non-retryable errors:

```typescript
import { ERROR_CLASSIFICATION, SyncIdempotencyService } from "./idempotency/index.js";

const classification = ERROR_CLASSIFICATION.classify(error);
if (classification.retryable) {
  // Retry with backoff
} else {
  // Don't retry, fail immediately
}
```

---

## Idempotency Service

The `SyncIdempotencyService` prevents duplicate processing of sync operations:

### Key Features
- **Error classification**: Distinguishes retryable vs non-retryable errors
- **Metrics collection**: Tracks success/failure/latency
- **Configurable retries**: Per-module retry policies

### Usage

```typescript
import { syncIdempotencyService } from "@jurnapod/sync-core";

const result = await syncIdempotencyService.checkAndRecord({
  operationId: 'tx-123',       // Client-provided ID
  companyId: 1,
  operation: 'PUSH',
  payload: JSON.stringify(transaction),
  maxRetries: 3
});

if (result.alreadyProcessed) {
  return { status: 'DUPLICATE', existingResult: result.existingResult };
}
```

---

## Testing Approach

### Integration Tests

Sync-core uses Vitest for testing with real database connections via `DbConn`. Tests are co-located with source:

```
src/
├── idempotency/
│   ├── sync-idempotency.ts
│   ├── sync-idempotency.test.ts
│   └── metrics-collector.test.ts
└── jobs/
    ├── data-retention.job.ts
    └── data-retention.integration.test.ts
```

**Critical**: All integration tests MUST use `DbConn` from `@jurnapod/db` - never use `mysql2/promise` directly.

### Running Tests

```bash
# Run all tests (from workspace root)
npm test -w @jurnapod/sync-core

# Run once (CI mode)
npm run test:run -w @jurnapod/sync-core
```

### Test Configuration

Integration tests use environment variables from `.env`:

```bash
DB_HOST=172.18.0.2
DB_PORT=3306
DB_USER=root
DB_PASSWORD=mariadb
DB_NAME=jurnapod_test
```

**Critical**: Integration tests require seed data (company, outlet fixtures from `JP_COMPANY_CODE`, `JP_OUTLET_CODE`, `JP_OWNER_EMAIL`).

### Test Patterns

Mock external dependencies (database, cache) for unit tests:

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('SyncIdempotencyService', () => {
  it('should classify network errors as retryable', () => {
    const error = new Error('ECONNRESET');
    const classification = ERROR_CLASSIFICATION.classify(error);
    expect(classification.retryable).toBe(true);
  });
});
```

Integration tests with real database:

```typescript
import { createDbPool, DbConn } from '@jurnapod/db';
import type { Pool } from 'mysql2';  // Type only, for pool.end() callback

// Load .env before other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

const pool = createDbPool({ host: process.env.DB_HOST, ... });
const db = new DbConn(pool);

// Use db.query(), db.execute(), etc. - NEVER pool.execute() directly

// CRITICAL: Clean up pool in afterAll
afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    pool.end((err) => err ? reject(err) : resolve());
  });
});
```

---

## Security Rules

### Critical Constraints

1. **Company/outlet scoping** — All queries MUST filter by context:
   ```typescript
   // CORRECT
   WHERE company_id = ? AND outlet_id = ?
   
   // WRONG - missing scoping
   WHERE id = ?
   ```

2. **Validate SyncContext** on every request:
   ```typescript
   const context = SyncContextSchema.parse(request.context);
   ```

3. **No secrets in logs** — Use structured logging with sanitized data

4. **Authenticate before processing** — Use `SyncAuthenticator`:
   ```typescript
   const authResult = await syncAuthenticator.authenticate(token);
   if (!authResult.valid) {
     throw new UnauthorizedError();
   }
   ```

---

## Review Checklist

When modifying this package:

- [ ] All SQL uses parameterized queries
- [ ] Company/outlet scoping on all queries
- [ ] SyncContext validated with Zod schema
- [ ] No hardcoded company/outlet IDs
- [ ] Error classification for idempotency service
- [ ] Audit events logged for operations
- [ ] Unit tests for new functionality
- [ ] No breaking changes to SyncModule interface
- [ ] No secrets in log statements
- [ ] **NO imports from `mysql2/promise`** - use `DbConn` from `@jurnapod/db` only

---

## Related Packages

- `@jurnapod/pos-sync` — POS-specific sync module using this package
- `@jurnapod/db` — Database connectivity (DbConn)
- `@jurnapod/api` — HTTP API using this package
- `@jurnapod/shared` — Shared utilities (Zod schemas, date helpers)

For project-wide conventions, see root `AGENTS.md`.