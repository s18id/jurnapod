# Story 13.1: Create lib/import/batch-operations.ts

**Status:** backlog  
**Epic:** Epic 13: Complete Library Migration for Deferred Routes  
**Story ID:** 13-1-create-import-batch-library  
**Estimated Effort:** 6 hours

---

## Context

The `import.ts` route has complex batch import operations that need to be moved to a library. This includes:
- Checking for existing items
- Inserting/updating items in batches
- Handling transactions
- Managing import sessions

---

## Current Code Analysis

**SQL Operations in import.ts:**
1. Check existing items by code/sku (line 399)
2. Get items by IDs (line 434)
3. Check existing items in batch (line 513)
4. Insert items (line 541)
5. Update items (line 552)
6. Get items for price import (line 631)
7. Check existing prices (line 645)
8. Insert prices (line 678)
9. Update prices (line 684)

---

## Acceptance Criteria

### AC1: Batch Item Operations

```typescript
// Check for existing items by codes
export async function findExistingItemsByCodes(
  companyId: number,
  codes: string[],
  connection?: PoolConnection
): Promise<Map<string, number>;

// Batch insert items
export async function batchInsertItems(
  companyId: number,
  items: ItemInsertData[],
  connection: PoolConnection
): Promise<number[]>;

// Batch update items
export async function batchUpdateItems(
  companyId: number,
  updates: ItemUpdateData[],
  connection: PoolConnection
): Promise<void>
```

### AC2: Batch Price Operations

```typescript
// Check existing prices
export async function findExistingPrices(
  companyId: number,
  itemIds: number[],
  outletId: number | null,
  connection?: PoolConnection
): Promise<Map<string, number>;

// Batch insert prices
export async function batchInsertPrices(
  companyId: number,
  prices: PriceInsertData[],
  connection: PoolConnection
): Promise<void>

// Batch update prices
export async function batchUpdatePrices(
  companyId: number,
  updates: PriceUpdateData[],
  connection: PoolConnection
): Promise<void>
```

### AC3: Transaction Support

All batch operations:
- Accept required `PoolConnection` parameter
- Participate in existing transaction
- Don't commit/rollback (caller manages transaction)

### AC4: Error Handling

```typescript
export class BatchImportError extends Error {
  constructor(
    message: string,
    public readonly rowNumber: number,
    public readonly field?: string
  ) {
    super(message);
    this.name = "BatchImportError";
  }
}
```

---

## Files to Create

1. `apps/api/src/lib/import/batch-operations.ts`
2. `apps/api/src/lib/import/batch-operations.test.ts`

---

## Implementation Notes

- Use existing `lib/import/` patterns
- Follow batch processing patterns from `lib/import/batch-processor.ts`
- Ensure proper TypeScript types
- Test with transaction rollback

---

## Definition of Done

- [ ] All batch operations implemented
- [ ] Transaction support working
- [ ] Error classes exported
- [ ] Unit tests with 80%+ coverage
- [ ] TypeScript compilation passes

---

*Ready for implementation.*
