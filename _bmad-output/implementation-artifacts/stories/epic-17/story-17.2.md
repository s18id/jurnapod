# Story 17.2: Create pos-sync Package Structure

**Status:** Done
**Priority:** P0
**Epic:** Epic 17 - Resurrect Sync-Core (Sync Module Architecture)
**Story Number:** 17.2
**Completed:** 2026-03-31

---

## Summary

Establish `packages/pos-sync/` as the POS-specific sync module package containing the main `PosSyncModule` class, type definitions for pull/push operations, endpoints factory, and data services.

---

## Context

Building on the `sync-core` infrastructure from Story 17.1, this story creates the `pos-sync` package that implements the `SyncModule` interface for POS clients.

### Goals

1. Create POS-specific sync module package
2. Define pull/push operation types
3. Create endpoints factory for HTTP integration
4. Implement `PosDataService` for database queries

---

## Story

As a developer building POS sync functionality,
I want a dedicated `pos-sync` package that implements `SyncModule`,
so that POS clients can synchronize data with the central database using a clean, typed interface.

---

## Acceptance Criteria

1. **Package Structure** (AC-1)
   - `packages/pos-sync/` directory with TypeScript configuration
   - Depends on `@jurnapod/sync-core` and `@jurnapod/db`
   - Proper exports via `index.ts`

2. **Type Definitions** (AC-2)
   - `PullSyncParams` and `PullSyncResult` types for pull operations
   - `PushSyncParams` and `PushSyncResult` types for push operations
   - `TransactionPush`, `ActiveOrderPush`, `OrderUpdatePush` types
   - `ItemCancellationPush`, `VariantSalePush`, `VariantStockAdjustmentPush` types

3. **PosSyncModule Class** (AC-3)
   - Implements `SyncModule` interface from sync-core
   - `moduleId = "pos"`
   - `clientType = "POS"`
   - `initialize()`, `healthCheck()`, `cleanup()` methods

4. **Endpoints Factory** (AC-4)
   - `createPosSyncEndpoints()` function
   - Returns `SyncEndpoint[]` for HTTP routing
   - Supports PULL and PUSH operations

5. **PosDataService** (AC-5)
   - Database query service for POS data
   - Uses `DbConn` from `@jurnapod/db`
   - Company/outlet scoped queries

---

## Tasks / Subtasks

- [x] Task 1: Create package structure and dependencies
- [x] Task 2: Define pull sync types (`pull/types.ts`)
- [x] Task 3: Define push sync types (`push/types.ts`)
- [x] Task 4: Create `PosSyncModule` skeleton class
- [x] Task 5: Create endpoints factory
- [x] Task 6: Create `PosDataService`

---

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `packages/pos-sync/package.json` | Package configuration | ~40 |
| `packages/pos-sync/tsconfig.json` | TypeScript configuration | ~20 |
| `packages/pos-sync/vitest.config.ts` | Test configuration | ~15 |
| `packages/pos-sync/.env` | Environment config | ~6 |
| `packages/pos-sync/src/index.ts` | Main exports | ~14 |
| `packages/pos-sync/src/pos-sync-module.ts` | Main module class | ~184 |
| `packages/pos-sync/src/pos-sync-module.integration.test.ts` | Integration tests | ~200 |
| `packages/pos-sync/src/pull/types.ts` | Pull types | ~50 |
| `packages/pos-sync/src/pull/index.ts` | Pull exports stub | ~10 |
| `packages/pos-sync/src/push/types.ts` | Push types | ~200 |
| `packages/pos-sync/src/push/index.ts` | Push exports stub | ~10 |
| `packages/pos-sync/src/endpoints/pos-sync-endpoints.ts` | Endpoints factory | ~100 |
| `packages/pos-sync/src/core/pos-data-service.ts` | Data service | ~100 |
| `packages/pos-sync/src/core/pos-data-service.test.ts` | Data service tests | ~50 |
| `packages/pos-sync/src/types/pos-data.ts` | POS data types | ~50 |
| `packages/pos-sync/src/example-api-integration.ts` | Integration example | ~50 |
| `packages/pos-sync/README.md` | Documentation | ~250 |
| `packages/pos-sync/AGENTS.md` | Agent guidelines | ~400 |

---

## PosSyncModule Class Structure

```typescript
// packages/pos-sync/src/pos-sync-module.ts
import type {
  SyncModule,
  SyncEndpoint,
  SyncModuleInitContext,
  SyncModuleConfig,
} from "@jurnapod/sync-core";

export class PosSyncModule implements SyncModule {
  readonly moduleId = "pos";
  readonly clientType = "POS" as const;
  readonly endpoints: ReadonlyArray<SyncEndpoint>;

  private dataService?: PosDataService;
  private dbConn?: DbConn;
  private logger?: any;

  constructor(public readonly config: SyncModuleConfig) {
    this.endpoints = createPosSyncEndpoints(
      this.handleSync.bind(this),
      this.handlePushSync.bind(this)
    );
  }

  async initialize(context: SyncModuleInitContext): Promise<void> {
    this.dataService = new PosDataService(context.database);
    this.dbConn = context.database as DbConn;
    this.logger = context.logger;
  }

  async handlePullSync(params: PullSyncParams): Promise<PullSyncResult> {
    if (!this.dbConn) {
      throw new Error("POS sync module not initialized");
    }
    return await handlePullSync(this.dbConn, params);
  }

  async handlePushSync(params: PushSyncParams): Promise<PushSyncResult> {
    if (!this.dbConn) {
      throw new Error("POS sync module not initialized");
    }
    return await handlePushSync({
      ...params,
      db: this.dbConn,
    });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    // ...
  }

  async cleanup(): Promise<void> {
    // ...
  }
}
```

---

## Pull Sync Types

```typescript
// packages/pos-sync/src/pull/types.ts
export interface PullSyncParams {
  companyId: number;
  outletId: number;
  sinceVersion?: number;
  ordersCursor?: number;
}

export interface PullSyncResult {
  payload: SyncPullPayload;
  currentVersion: number;
}
```

---

## Push Sync Types

```typescript
// packages/pos-sync/src/push/types.ts
export interface PushSyncParams {
  db: DbConn;
  companyId: number;
  outletId: number;
  transactions: TransactionPush[];
  activeOrders: ActiveOrderPush[];
  orderUpdates: OrderUpdatePush[];
  itemCancellations: ItemCancellationPush[];
  variantSales: VariantSalePush[];
  variantStockAdjustments: VariantStockAdjustmentPush[];
  correlationId: string;
}

export interface TransactionPush {
  client_tx_id: string;
  company_id: number;
  outlet_id: number;
  user_id: number;
  service_type: 'TAKEAWAY' | 'DINE_IN';
  table_id?: number;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  net_amount: number;
  payment_method: string;
  tx_at: string;
  items: TransactionItemPush[];
}

export interface ActiveOrderPush {
  order_id: string;
  company_id: number;
  outlet_id: number;
  service_type: 'TAKEAWAY' | 'DINE_IN';
  table_id?: number;
  order_status: 'OPEN' | 'CLOSED';
  order_state: 'OPEN' | 'CLOSED';
  // ...
}
```

---

## Dependencies

- `@jurnapod/sync-core` - SyncModule interface, registry, auth, audit
- `@jurnapod/db` - Database connectivity (DbConn)
- `@jurnapod/shared` - Zod schemas, date helpers

---

## Dev Notes

### SyncModule Contract

The `PosSyncModule` MUST implement the `SyncModule` interface:

```typescript
interface SyncModule {
  readonly moduleId: string;
  readonly clientType: 'POS' | 'BACKOFFICE';
  readonly endpoints: SyncEndpoint[];
  
  initialize(context: SyncModuleInitContext): Promise<void>;
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;
  cleanup(): Promise<void>;
}
```

### Validation Rules

| Field | Validation |
|-------|------------|
| `company_id` | Must match authenticated company's ID |
| `service_type: 'DINE_IN'` | Requires `table_id` |
| `order_state` | Must be 'OPEN' or 'CLOSED' |

### Testing

```bash
npm test -w @jurnapod/pos-sync
npm run test:run -w @jurnapod/pos-sync  # CI mode
```

Integration tests require seed data (company, outlet, POS user with CASHIER role).

---

## Definition of Done

- [x] Package builds successfully (`npm run build -w @jurnapod/pos-sync`)
- [x] TypeScript checks pass (`npm run typecheck -w @jurnapod/pos-sync`)
- [x] `PosSyncModule` implements `SyncModule` interface
- [x] Pull/push types defined
- [x] Endpoints factory created
- [x] `PosDataService` implemented
- [x] Tests pass

---

## References

- [PosSyncModule](./packages/pos-sync/src/pos-sync-module.ts)
- [Pull Types](./packages/pos-sync/src/pull/types.ts)
- [Push Types](./packages/pos-sync/src/push/types.ts)
- [SyncModule Interface in sync-core](./packages/sync-core/src/types/module.ts)

---

## Dev Agent Record

**Completed:** 2026-03-31
**Status:** Done
**Files Created:** ~18 files, ~1,500 lines

---

*Story 17.2 - Create pos-sync package structure*
