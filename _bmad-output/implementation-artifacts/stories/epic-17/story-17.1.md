# Story 17.1: Create sync-core Package Structure

**Status:** Done
**Priority:** P0
**Epic:** Epic 17 - Resurrect Sync-Core (Sync Module Architecture)
**Story Number:** 17.1
**Completed:** 2026-03-31

---

## Summary

Establish `packages/sync-core/` as the shared sync infrastructure package containing module registry, authentication, audit logging, transport, idempotency services, and shared data queries used by both pos-sync and backoffice-sync packages.

---

## Context

The original sync architecture had all sync logic co-located in `apps/api/src/lib/sync/`. This story creates a dedicated `sync-core` package that provides shared infrastructure for all sync modules.

### Goals

1. Create a reusable sync infrastructure package
2. Provide module registry for sync module lifecycle management
3. Implement authentication, audit logging, and transport utilities
4. Create shared data queries for sync operations
5. Establish the `SyncModule` interface contract

---

## Story

As a developer building sync functionality,
I want a shared `sync-core` package with common infrastructure,
so that pos-sync and backoffice-sync can reuse registry, auth, audit, transport, and data queries without duplication.

---

## Acceptance Criteria

1. **Package Structure** (AC-1)
   - `packages/sync-core/` directory with proper TypeScript configuration
   - ESM exports via `index.ts`
   - Works with `@jurnapod/db` for database connectivity

2. **Module Registry** (AC-2)
   - `SyncModuleRegistry` class with `register()`, `registerFactory()`, `createModule()`
   - `initialize()` for setting up all modules
   - `healthCheck()` for status verification
   - `cleanup()` for resource release

3. **Authentication** (AC-3)
   - `SyncAuthenticator` class with `validateAuth()`
   - Token validation and role-based access
   - `AuthUser` and `AuthResult` types

4. **Audit Logging** (AC-4)
   - `SyncAuditor` class with event tracking
   - `startEvent()`, `completeEvent()`, `failEvent()`
   - `SyncAuditEvent` type

5. **Retry Transport** (AC-5)
   - `RetryTransport` class with exponential backoff
   - `execute()` method with configurable retries
   - `RetryConfig` type

6. **Idempotency Service** (AC-6)
   - `SyncIdempotencyService` for duplicate detection
   - `checkAndRecord()` method
   - `ERROR_CLASSIFICATION` for retryable vs non-retryable errors
   - `SyncIdempotencyMetricsCollector` for monitoring

7. **Data Queries** (AC-7)
   - Shared SQL queries in `data/` directory
   - Items, variants, orders, transactions, tables, reservations
   - Tax rates and configuration queries

8. **Types** (AC-8)
   - `SyncModule`, `SyncModuleConfig`, `SyncModuleInitContext` interfaces
   - `SyncContext`, `SyncRequest`, `SyncResponse` types
   - Zod schemas for validation

9. **WebSocket Support** (AC-9)
   - Event publisher/subscriber types
   - `createEventPayload()` utility

10. **Data Retention Jobs** (AC-10)
    - `DataRetentionJob` class
    - `runDataRetentionJob()` function
    - `DEFAULT_RETENTION_POLICIES`

---

## Tasks / Subtasks

- [x] Task 1: Create package structure and tsconfig
- [x] Task 2: Implement SyncModuleRegistry
- [x] Task 3: Implement SyncAuthenticator
- [x] Task 4: Implement SyncAuditor
- [x] Task 5: Implement RetryTransport
- [x] Task 6: Implement SyncIdempotencyService
- [x] Task 7: Create shared data queries
- [x] Task 8: Define types and interfaces
- [x] Task 9: Add WebSocket support
- [x] Task 10: Add data retention job

---

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `packages/sync-core/package.json` | Package configuration | ~30 |
| `packages/sync-core/tsconfig.json` | TypeScript configuration | ~20 |
| `packages/sync-core/vitest.config.ts` | Test configuration | ~15 |
| `packages/sync-core/src/index.ts` | Main exports | ~70 |
| `packages/sync-core/src/types/index.ts` | Core types and Zod schemas | ~97 |
| `packages/sync-core/src/types/module.ts` | SyncModule interface | ~80 |
| `packages/sync-core/src/types/services.js` | Service types | ~50 |
| `packages/sync-core/src/registry/module-registry.ts` | Module registry | ~146 |
| `packages/sync-core/src/auth/sync-auth.ts` | Authenticator | ~134 |
| `packages/sync-core/src/auth/index.ts` | Auth exports | ~10 |
| `packages/sync-core/src/audit/sync-audit.ts` | Auditor | ~150 |
| `packages/sync-core/src/audit/index.ts` | Audit exports | ~10 |
| `packages/sync-core/src/transport/retry-transport.ts` | Retry transport | ~200 |
| `packages/sync-core/src/transport/index.ts` | Transport exports | ~10 |
| `packages/sync-core/src/idempotency/sync-idempotency.ts` | Idempotency service | ~400 |
| `packages/sync-core/src/idempotency/metrics-collector.ts` | Metrics | ~100 |
| `packages/sync-core/src/idempotency/index.ts` | Idempotency exports | ~33 |
| `packages/sync-core/src/data/item-queries.ts` | Item queries | ~100 |
| `packages/sync-core/src/data/variant-queries.ts` | Variant queries | ~150 |
| `packages/sync-core/src/data/order-*.ts` | Order queries | ~200 |
| `packages/sync-core/src/data/transaction-queries.ts` | Transaction queries | ~150 |
| `packages/sync-core/src/data/table-queries.ts` | Table queries | ~50 |
| `packages/sync-core/src/data/reservation-queries.ts` | Reservation queries | ~100 |
| `packages/sync-core/src/data/tax-queries.ts` | Tax queries | ~50 |
| `packages/sync-core/src/data/config-queries.ts` | Config queries | ~50 |
| `packages/sync-core/src/data/sync-version-queries.ts` | Version queries | ~30 |
| `packages/sync-core/src/data/order-snapshot-queries.ts` | Order snapshot queries | ~100 |
| `packages/sync-core/src/data/order-update-queries.ts` | Order update queries | ~80 |
| `packages/sync-core/src/data/item-cancellation-queries.ts` | Cancellation queries | ~80 |
| `packages/sync-core/src/data/variant-sale-queries.ts` | Variant sale queries | ~80 |
| `packages/sync-core/src/data/variant-stock-adjustment-queries.ts` | Stock adj queries | ~80 |
| `packages/sync-core/src/data/user-queries.ts` | User queries | ~30 |
| `packages/sync-core/src/data/index.ts` | Data exports | ~18 |
| `packages/sync-core/src/websocket/types.ts` | WebSocket types | ~50 |
| `packages/sync-core/src/websocket/publisher.ts` | Event publisher | ~100 |
| `packages/sync-core/src/websocket/index.ts` | WebSocket exports | ~10 |
| `packages/sync-core/src/jobs/data-retention.job.ts` | Retention job | ~200 |
| `packages/sync-core/src/jobs/data-retention.test.ts` | Retention tests | ~100 |
| `packages/sync-core/src/jobs/index.ts` | Jobs exports | ~10 |
| `packages/sync-core/src/example.ts` | Example usage | ~50 |
| `packages/sync-core/README.md` | Documentation | ~280 |
| `packages/sync-core/AGENTS.md` | Agent guidelines | ~400 |

---

## SyncModule Interface

```typescript
// packages/sync-core/src/types/module.ts
export interface SyncModule {
  readonly moduleId: string;
  readonly clientType: SyncClientType;
  readonly endpoints: ReadonlyArray<SyncEndpoint>;
  
  initialize(context: SyncModuleInitContext): Promise<void>;
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;
  cleanup(): Promise<void>;
}

export interface SyncModuleInitContext {
  database: DbConn | any;
  logger: any;
  config: Record<string, any>;
}

export type SyncModuleFactory = (config: SyncModuleConfig) => SyncModule;
```

---

## Module Registry Usage

```typescript
import { syncModuleRegistry } from "@jurnapod/sync-core";
import { PosSyncModule } from "@jurnapod/pos-sync";

// Register with factory
syncModuleRegistry.registerFactory('pos', (config) => new PosSyncModule(config));

// Create and initialize
const module = await syncModuleRegistry.createModule('pos', {
  module_id: 'pos',
  client_type: 'POS',
  enabled: true,
});

// Initialize all modules
await syncModuleRegistry.initialize({
  database: dbConn,
  logger: console,
  config: { env: 'production' }
});

// Health check
const health = await syncModuleRegistry.healthCheck();
```

---

## Dependencies

- `@jurnapod/db` - Database connectivity (DbConn)
- `@jurnapod/shared` - Zod schemas, date helpers
- TypeScript 5.x

---

## Dev Notes

### SQL Patterns

All data queries follow these rules:
1. **Parameterized queries** - Never string concatenation
2. **snake_case** - Column names in MySQL format
3. **No functions on indexed columns** - Apply functions to constants, not columns
4. **Company/outlet scoping** - All queries filter by context

### ESM Compliance

Imports use `.js` extensions for ESM compliance:
```typescript
import { SyncModuleRegistry } from "./registry/module-registry.js";
import type { SyncContext } from "../types/index.js";
```

### Testing

```bash
npm test -w @jurnapod/sync-core
npm run test:run -w @jurnapod/sync-core  # CI mode
```

---

## Definition of Done

- [x] Package builds successfully (`npm run build -w @jurnapod/sync-core`)
- [x] TypeScript checks pass (`npm run typecheck -w @jurnapod/sync-core`)
- [x] Tests pass (`npm test -w @jurnapod/sync-core`)
- [x] All components exported from `index.ts`
- [x] SyncModule interface contract established
- [x] Documentation complete (README.md, AGENTS.md)

---

## References

- [SyncModule Interface](./packages/sync-core/src/types/module.ts)
- [Module Registry](./packages/sync-core/src/registry/module-registry.ts)
- [Idempotency Service](./packages/sync-core/src/idempotency/)
- [Data Queries](./packages/sync-core/src/data/)

---

## Dev Agent Record

**Completed:** 2026-03-31
**Status:** Done
**Files Created:** ~35 files, ~2,500 lines

---

*Story 17.1 - Create sync-core package structure*
