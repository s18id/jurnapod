# ADR-0003 Step 3 Implementation: Repository Abstraction for Local Persistence

**Status**: ✅ COMPLETED (via Step 2)  
**Date**: 2026-03-06  
**Related ADR**: ADR-0003: POS App Boundary and Capacitor-Ready Architecture

## Objective

Keep local persistence behind repository abstractions (ADR-0003 Follow-Up Action #3).

## Summary

**Step 3 was achieved as part of Step 2 implementation.**

The `PosStoragePort` interface created in Step 2 serves as the complete repository abstraction for POS local persistence. All persistence operations are accessed through this interface, ensuring business logic does not directly depend on IndexedDB, Dexie, or any specific storage implementation.

## Repository Abstraction Pattern

### What is a Repository Abstraction?

A repository abstraction is a design pattern that:
1. Encapsulates data access logic
2. Provides a collection-like interface for domain objects
3. Decouples business logic from data storage technology
4. Allows swapping storage implementations without affecting business logic

### POS Repository Implementation

**Interface**: `PosStoragePort` (`apps/pos/src/ports/storage-port.ts`)  
**Implementation**: `WebStorageAdapter` (`apps/pos/src/platform/web/storage.ts`)

## Repository Operations Coverage

### ✅ Product Cache Repository
```typescript
interface ProductCacheRepository {
  getProductsByOutlet(scope): Promise<ProductCacheRow[]>;
  upsertProducts(products): Promise<void>;
}
```

**Operations**:
- Query products by outlet with active filter
- Bulk upsert product cache entries

**Encapsulates**: Dexie collection queries, compound indexes

### ✅ Sales Repository
```typescript
interface SalesRepository {
  createSale(sale): Promise<void>;
  getSale(sale_id): Promise<SaleRow | undefined>;
  updateSaleStatus(sale_id, status, sync_status?): Promise<void>;
}
```

**Operations**:
- Create new sale transaction
- Retrieve sale by ID
- Update sale status and sync status

**Encapsulates**: IndexedDB add/get/update operations

### ✅ Sale Items Repository
```typescript
interface SaleItemsRepository {
  createSaleItems(items): Promise<void>;
  getSaleItems(sale_id): Promise<SaleItemRow[]>;
}
```

**Operations**:
- Bulk create sale line items
- Query line items by sale ID

**Encapsulates**: Bulk add, indexed queries

### ✅ Payments Repository
```typescript
interface PaymentsRepository {
  createPayments(payments): Promise<void>;
  getPayments(sale_id): Promise<PaymentRow[]>;
}
```

**Operations**:
- Bulk create payment records
- Query payments by sale ID

**Encapsulates**: Bulk add, indexed queries

### ✅ Outbox Repository
```typescript
interface OutboxRepository {
  createOutboxJob(job): Promise<void>;
  getOutboxJob(job_id): Promise<OutboxJobRow | undefined>;
  listPendingOutboxJobs(limit?): Promise<OutboxJobRow[]>;
  listDueOutboxJobs(input): Promise<OutboxJobRow[]>;
  updateOutboxJob(job_id, updates): Promise<void>;
  countPendingOutboxJobs(): Promise<number>;
  countGlobalDueOutboxJobs(now): Promise<number>;
}
```

**Operations**:
- Create outbox sync job
- Retrieve job by ID
- List jobs by status
- List jobs due for retry
- Update job status and metadata
- Count pending/due jobs

**Encapsulates**: Complex status queries, compound indexes, date comparisons

### ✅ Sync Metadata Repository
```typescript
interface SyncMetadataRepository {
  getSyncMetadata(scope): Promise<SyncMetadataRow | undefined>;
  upsertSyncMetadata(metadata): Promise<void>;
}
```

**Operations**:
- Get sync metadata for outlet
- Upsert sync version tracking

**Encapsulates**: Compound key queries

### ✅ Sync Config Repository
```typescript
interface SyncConfigRepository {
  getSyncScopeConfig(scope): Promise<SyncScopeConfigRow | undefined>;
  upsertSyncScopeConfig(config): Promise<void>;
}
```

**Operations**:
- Get checkout config for outlet
- Upsert outlet-specific config

**Encapsulates**: Compound key queries, JSON serialization

### ✅ Transaction Support
```typescript
interface TransactionSupport {
  transaction<T>(
    mode: "readonly" | "readwrite",
    tables: string[],
    callback: (tx: unknown) => Promise<T>
  ): Promise<T>;
}
```

**Operations**:
- Execute multi-table transactions with ACID guarantees

**Encapsulates**: IndexedDB transaction API

## Architecture Benefits

### 1. Storage Independence ✅

Business logic does NOT depend on:
- ❌ IndexedDB API
- ❌ Dexie library
- ❌ Browser storage APIs
- ❌ Database schema details

Business logic ONLY depends on:
- ✅ `PosStoragePort` interface
- ✅ Domain entity types (`SaleRow`, `ProductCacheRow`, etc.)

### 2. Platform Flexibility ✅

The same repository interface can be implemented with:
- ✅ **Web**: IndexedDB via Dexie (`WebStorageAdapter`)
- 🔄 **Capacitor/Android**: SQLite via `@capacitor/sqlite`
- 🔄 **Native iOS**: Core Data or Realm
- 🔄 **Testing**: In-memory store or mock implementation

### 3. Testability ✅

Services can be tested with:
- Mock repository implementations (no IndexedDB needed)
- In-memory repositories for fast tests
- Fake repositories with predictable data

Example:
```typescript
const mockStorage: PosStoragePort = {
  getProductsByOutlet: async () => [mockProduct1, mockProduct2],
  createSale: async () => {},
  // ... other methods
};

const runtime = new RuntimeService(mockStorage, mockNetwork);
const catalog = await runtime.getProductCatalog(scope);
// Test catalog without IndexedDB
```

### 4. Clear Contracts ✅

The `PosStoragePort` interface documents:
- All persistence operations available
- Input/output types for each operation
- Async/Promise contracts
- No hidden dependencies on globals

## Repository vs Direct Database Access

### ❌ Before (Direct Database Access)
```typescript
// Business logic directly coupled to Dexie
async function getProducts(scope: Scope) {
  const db = new PosOfflineDb();
  const rows = await db.products_cache
    .toCollection()
    .filter(row => 
      row.company_id === scope.company_id &&
      row.outlet_id === scope.outlet_id &&
      row.is_active
    )
    .toArray();
  return rows;
}
```

**Problems**:
- Business logic depends on Dexie API
- Testing requires IndexedDB mocking
- Can't swap storage without changing business logic
- Database implementation leaks into business layer

### ✅ After (Repository Abstraction)
```typescript
// Business logic depends only on repository interface
class RuntimeService {
  constructor(private storage: PosStoragePort) {}

  async getProductCatalog(scope: Scope) {
    const rows = await this.storage.getProductsByOutlet({
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      is_active: true
    });
    return rows;
  }
}
```

**Benefits**:
- Business logic depends only on interface
- Testing uses mock repository (no IndexedDB)
- Storage can be swapped by providing different adapter
- Clean separation of concerns

## Repository Implementation Details

### WebStorageAdapter Implementation

The `WebStorageAdapter` class implements `PosStoragePort` using Dexie:

```typescript
export class WebStorageAdapter implements PosStoragePort {
  constructor(private db: PosOfflineDb) {}

  async getProductsByOutlet(input: {
    company_id: number;
    outlet_id: number;
    is_active?: boolean;
  }): Promise<ProductCacheRow[]> {
    const isActive = input.is_active ?? true;
    const rows = await this.db.products_cache
      .toCollection()
      .filter((row) => 
        row.company_id === input.company_id && 
        row.outlet_id === input.outlet_id && 
        row.is_active === isActive
      )
      .toArray();

    return rows;
  }

  // ... other methods implement PosStoragePort
}
```

**Encapsulation**:
- Dexie-specific code isolated in adapter
- Business logic never sees `db.products_cache.toCollection()`
- Compound index queries hidden behind clean interface

## Alternative Implementations

### Future: Capacitor SQLite Adapter

When Android support is needed:

```typescript
export class CapacitorStorageAdapter implements PosStoragePort {
  constructor(private sqlite: CapacitorSQLite) {}

  async getProductsByOutlet(input: {
    company_id: number;
    outlet_id: number;
    is_active?: boolean;
  }): Promise<ProductCacheRow[]> {
    const isActive = input.is_active ?? 1;
    const result = await this.sqlite.query({
      statement: `
        SELECT * FROM products_cache 
        WHERE company_id = ? 
          AND outlet_id = ? 
          AND is_active = ?
      `,
      values: [input.company_id, input.outlet_id, isActive]
    });

    return result.values as ProductCacheRow[];
  }

  // ... other methods implement PosStoragePort
}
```

**No business logic changes required!** Services continue to work with the same interface.

### Testing: Mock Repository

```typescript
export class MockStorageAdapter implements PosStoragePort {
  private products: ProductCacheRow[] = [];
  private sales: SaleRow[] = [];

  async getProductsByOutlet(input: {
    company_id: number;
    outlet_id: number;
    is_active?: boolean;
  }): Promise<ProductCacheRow[]> {
    return this.products.filter(p =>
      p.company_id === input.company_id &&
      p.outlet_id === input.outlet_id &&
      p.is_active === (input.is_active ?? true)
    );
  }

  // ... in-memory implementation for testing
}
```

**No IndexedDB, no browser, just pure JavaScript for tests.**

## Compliance Verification

### ✅ Repository Pattern Requirements

| Requirement | Status |
|-------------|--------|
| Encapsulates data access | ✅ All DB ops in adapter |
| Collection-like interface | ✅ getProducts, createSale, etc. |
| Technology agnostic | ✅ Interface has no Dexie/IndexedDB types |
| Swappable implementations | ✅ Can provide different adapters |
| Supports transactions | ✅ transaction() method provided |

### ✅ Business Logic Isolation

Services in `apps/pos/src/services/` do NOT:
- ❌ Import Dexie
- ❌ Import IndexedDB types
- ❌ Use `db.table.where()` syntax
- ❌ Depend on database schema

Services in `apps/pos/src/services/` ONLY:
- ✅ Import `PosStoragePort` interface
- ✅ Import domain entity types
- ✅ Call repository methods
- ✅ Work with domain objects

## Example Usage in Services

### RuntimeService using PosStoragePort

```typescript
export class RuntimeService {
  constructor(
    private storage: PosStoragePort,
    private network: NetworkPort
  ) {}

  async getProductCatalog(
    scope: RuntimeOutletScope
  ): Promise<RuntimeProductCatalogItem[]> {
    // Use repository abstraction
    const rows = await this.storage.getProductsByOutlet({
      company_id: scope.company_id,
      outlet_id: scope.outlet_id,
      is_active: true
    });

    // Business logic (sorting, mapping)
    rows.sort((left, right) => left.name.localeCompare(right.name));

    return rows.map((row) => ({
      item_id: row.item_id,
      sku: row.sku,
      name: row.name,
      item_type: row.item_type,
      price_snapshot: row.price_snapshot
    }));
  }
}
```

**Clean separation**: Business logic focuses on domain rules, repository handles persistence.

### SyncService using PosStoragePort

```typescript
export class SyncService {
  constructor(
    private storage: PosStoragePort,
    private transport: SyncTransport
  ) {}

  async pull(scope: RuntimeOutletScope): Promise<SyncPullResult> {
    // Get current version from repository
    const metadata = await this.storage.getSyncMetadata(scope);
    
    // Pull from server
    const response = await this.transport.pull({...});
    
    // Update repository
    await this.storage.upsertProducts(productRows);
    await this.storage.upsertSyncMetadata({...});
    
    return result;
  }
}
```

**Repository is the single source of truth for persistence operations.**

## Repository Abstraction Checklist

- [x] Interface defined (`PosStoragePort`)
- [x] All persistence operations covered
- [x] Web implementation created (`WebStorageAdapter`)
- [x] Services depend only on interface, not implementation
- [x] No business logic directly calls database
- [x] Transaction support included
- [x] Platform-agnostic (can swap implementations)
- [x] Testable without real database

## Conclusion

**Step 3 of ADR-0003 is COMPLETE.**

Local persistence is properly abstracted behind the repository pattern:

- ✅ `PosStoragePort` interface serves as repository abstraction
- ✅ All persistence operations encapsulated
- ✅ Business logic isolated from storage technology
- ✅ Platform-agnostic (web, Capacitor, testing)
- ✅ Swappable implementations
- ✅ Clean contracts and clear boundaries

The repository abstraction was achieved as part of the Step 2 port/adapter architecture implementation.

---

**Document Version**: 1.0  
**Last Updated**: 2026-03-06  
**Achievement**: Completed via Step 2 implementation  
**Related**: [ADR-0003-step-2-implementation.md](./ADR-0003-step-2-implementation.md)
