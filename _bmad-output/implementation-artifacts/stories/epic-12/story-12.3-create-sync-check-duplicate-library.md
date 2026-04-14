# Story 12.3: Create `lib/sync/check-duplicate.ts` Library

**Status:** done  
**Epic:** Epic 12: Standardize Library Usage for All Routes  
**Story ID:** 12-3-create-sync-check-duplicate-library  
**Estimated Effort:** 3 hours

---

## Context

The `sync/check-duplicate.ts` route has 1 direct SQL query for checking duplicate client transactions. This needs to be moved to a library module in the `lib/sync/` directory.

---

## Acceptance Criteria

### AC1: Library Function

Create `apps/api/src/lib/sync/check-duplicate.ts` with:

```typescript
/**
 * Check if a client transaction ID already exists (duplicate detection)
 * @param companyId - Company ID
 * @param clientTxId - Client transaction ID (UUID from POS)
 * @param outletId - Optional outlet ID for additional scoping
 * @param connection - Optional database connection for transactions
 * @returns Duplicate check result with existing transaction details if found
 */
async function checkDuplicateClientTx(
  companyId: number,
  clientTxId: string,
  outletId?: number | null,
  connection?: PoolConnection
): Promise<DuplicateCheckResult>
```

### AC2: Return Type

```typescript
export interface DuplicateCheckResult {
  /** Whether this is a duplicate transaction */
  isDuplicate: boolean;
  /** Existing transaction ID if duplicate */
  existingId?: number;
  /** When the existing transaction was created */
  createdAt?: Date;
  /** Server-generated transaction ID if exists */
  serverTxId?: string;
}
```

### AC3: SQL Query (from route)

```sql
SELECT 
  id, 
  created_at, 
  server_tx_id
FROM pos_transactions
WHERE company_id = ?
  AND client_tx_id = ?
  AND (outlet_id = ? OR outlet_id IS NULL)
LIMIT 1
```

**Parameters:**
- `companyId` - Company ID
- `clientTxId` - Client transaction UUID
- `outletId` - Outlet ID (can be null for cross-outlet checks)

### AC4: Logic Requirements

1. Query `pos_transactions` table
2. Match `company_id` and `client_tx_id`
3. If `outletId` provided, also match `outlet_id`
4. If `outletId` is null/undefined, match any outlet
5. Return first match (LIMIT 1)
6. Transform database row to `DuplicateCheckResult`

### AC5: Connection Parameter Support

```typescript
async function checkDuplicateClientTx(
  companyId: number,
  clientTxId: string,
  outletId?: number | null,
  connection?: PoolConnection
): Promise<DuplicateCheckResult> {
  const db = connection || getDbPool();
  // ... use db for query
}
```

### AC6: Empty Result Handling

When no duplicate found:
```typescript
return {
  isDuplicate: false
  // other fields undefined
};
```

When duplicate found:
```typescript
return {
  isDuplicate: true,
  existingId: row.id,
  createdAt: new Date(row.created_at),
  serverTxId: row.server_tx_id
};
```

### AC7: Test Coverage

Create `apps/api/src/lib/sync/check-duplicate.test.ts` with:

1. **No duplicate found**
   - Insert company, outlet
   - Call with non-existent clientTxId
   - Assert `isDuplicate: false`

2. **Duplicate found with outlet**
   - Insert transaction with companyId, clientTxId, outletId
   - Call with same parameters
   - Assert `isDuplicate: true`
   - Assert correct `existingId` and `createdAt`

3. **Duplicate found without outlet**
   - Insert transaction with companyId, clientTxId, null outletId
   - Call with outletId: null
   - Assert `isDuplicate: true`

4. **Cross-outlet duplicate (edge case)**
   - Insert transaction with outlet A
   - Call with outlet B
   - Assert `isDuplicate: false` (if outlet-specific)

5. **Transaction support**
   - Pass connection parameter
   - Verify query uses provided connection

---

## Files to Create

1. `apps/api/src/lib/sync/check-duplicate.ts` - Library implementation
2. `apps/api/src/lib/sync/check-duplicate.test.ts` - Unit tests

---

## Implementation Notes

- Follow existing sync library patterns (see `lib/sync/push/`)
- Use proper TypeScript types
- Handle date conversion (MySQL dates to JavaScript Date objects)
- Include JSDoc comments
- Export both the function and the result interface

---

## Definition of Done

- [ ] Library file created with function
- [ ] Type interface exported
- [ ] Test file created with all test cases
- [ ] All tests pass
- [ ] TypeScript compilation passes
- [ ] Function handles null/undefined outletId correctly

---

## Dependencies

- `lib/db.ts` - For `getDbPool()`
- `mysql2/promise` - For types
- `lib/items/index.js` or similar - For test fixtures (create company, outlet, transaction)

---

## Completion Notes

**Completed by:** bmad-agent-dev (delegated agent)
**Completion Date:** 2026-03-28
**Actual Effort:** ~3 hours

### Files Created

1. `apps/api/src/lib/sync/check-duplicate.ts` (82 lines)
   - `checkDuplicateClientTx()` - Check for duplicate transactions
   - Returns `DuplicateCheckResult` with isDuplicate, existingId, createdAt

2. `apps/api/src/lib/sync/check-duplicate.test.ts` (244 lines)
   - 7 comprehensive tests

### Implementation Details

- Query `pos_transactions` table for duplicates
- Match by `company_id` and `client_tx_id`
- Optional outlet scoping
- Returns first match (LIMIT 1)
- Proper date conversion (MySQL → JavaScript Date)

### Test Results

```
✓ 7 tests passed
- No duplicate found
- Duplicate found with outlet
- Duplicate found without outlet
- Cross-outlet duplicate (edge case)
- Transaction support
- Interface contract
```

### Acceptance Criteria

- [x] Library function created
- [x] Type interface exported
- [x] Test file created with all test cases
- [x] All tests pass
- [x] TypeScript compilation passes
- [x] Function handles null/undefined outletId correctly

*Story completed successfully.*
