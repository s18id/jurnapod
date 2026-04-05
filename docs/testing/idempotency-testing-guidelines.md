# Idempotency Testing Guidelines

> **Epic 32 Retrospective Action**: These guidelines address the P0 bug where `executeCloseWithLocking` returned a timestamp-based `closeRequestId` instead of the caller's request ID, breaking the idempotency contract.

---

## 1. What is Idempotency?

An operation is **idempotent** when multiple identical requests produce the same result as a single request. The system recognizes duplicate attempts and returns the original outcome without re-executing side effects.

**When it matters:**
- **Payments** — Preventing double charges when retries occur
- **Fiscal year close** — Ensuring a fiscal year closes exactly once, even with retries
- **Inventory deduction** — Preventing double-counting stock movements
- **Sync push operations** — POS transactions must not duplicate on retry

---

## 2. Idempotency Contract for Retry-Based Operations

### The Three Rules

1. **The returned `request_id` MUST equal the caller's `request_id`**
   - ❌ WRONG: Returning a server-generated ID that differs from the caller's key
   - ✅ CORRECT: Echo the caller's idempotency key back in the response

2. **Duplicate calls MUST return identical responses**
   - Same success/failure status
   - Same data payload
   - Same error messages (for failures)

3. **Non-idempotent failures MUST still return the same error**
   - Validation errors, business rule violations, precondition failures
   - The second call should return the same error as the first

---

## 3. Testing Patterns

### Pattern A: Basic Idempotency — Call Operation Twice

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closeFiscalYear } from '@jurnapod/modules-accounting/fiscal-year';
import { createKysely } from '@jurnapod/db';

describe('closeFiscalYear idempotency', () => {
  const db = createKysely({ /* connection config */ });
  const companyId = 1;
  const fiscalYearId = 100;
  
  // Use a unique request ID for each test run
  const requestId = `test-close-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  afterAll(async () => {
    await db.destroy();
  });

  it('should return identical result on duplicate calls', async () => {
    const context = {
      companyId,
      requestedByUserId: 1,
      requestedAtEpochMs: Date.now()
    };

    // First call
    const result1 = await closeFiscalYear(fiscalYearId, requestId, context);
    
    // Second call with SAME requestId
    const result2 = await closeFiscalYear(fiscalYearId, requestId, context);

    // Assertions
    expect(result2.closeRequestId).toBe(result1.closeRequestId);
    expect(result2.closeRequestId).toBe(requestId);  // CRITICAL: Must match caller's key
    expect(result2.status).toBe(result1.status);
    expect(result2.success).toBe(result1.success);
  });
});
```

### Pattern B: Response Key Must Match Caller Key

```typescript
it('must return the callers request_id, not a generated one', async () => {
  const requestId = 'my-custom-idempotency-key-12345';
  
  const result = await closeFiscalYear(fiscalYearId, requestId, context);
  
  // This was the Epic 32 bug: returning `${Date.now()}-${random}` instead
  expect(result.closeRequestId).toBe(requestId);
  expect(result.closeRequestId).not.toMatch(/^\d{13}-/);  // Not a timestamp prefix
});
```

### Pattern C: Failure Idempotency

```typescript
it('should return same error on duplicate failed calls', async () => {
  // Use a request ID for a fiscal year that is already closed
  const requestId = `test-fail-${Date.now()}`;
  
  // First call should fail
  await expect(
    closeFiscalYear(alreadyClosedFiscalYearId, requestId, context)
  ).rejects.toThrow(FiscalYearAlreadyClosedError);
  
  // Second call with same key should throw the SAME error
  await expect(
    closeFiscalYear(alreadyClosedFiscalYearId, requestId, context)
  ).rejects.toThrow(FiscalYearAlreadyClosedError);
});
```

### Pattern D: Different Keys Are Independent

```typescript
it('should treat different request IDs as separate operations', async () => {
  const requestId1 = 'first-attempt-001';
  const requestId2 = 'second-attempt-002';
  
  // First call succeeds
  const result1 = await closeFiscalYear(fiscalYearId, requestId1, context);
  expect(result1.success).toBe(true);
  
  // Second call with DIFFERENT key should fail (already closed)
  await expect(
    closeFiscalYear(fiscalYearId, requestId2, context)
  ).rejects.toThrow(FiscalYearAlreadyClosedError);
});
```

---

## 4. Specific Test Cases for Fiscal Year Close

These tests serve as the worked example for idempotency-critical operations.

### Test Suite Structure

```typescript
describe('Fiscal Year Close Idempotency Contract', () => {
  let db: KyselySchema;
  let companyId: number;
  let fiscalYearId: number;
  
  beforeAll(async () => {
    // Setup with real database
    db = createKysely({ /* config */ });
    
    // Create test fixtures via API or lib functions
    const company = await createTestCompanyMinimal();
    companyId = company.id;
    
    const fiscalYear = await createTestFiscalYear(companyId, { status: 'OPEN' });
    fiscalYearId = fiscalYear.id;
  });
  
  afterAll(async () => {
    // Cleanup
    await cleanupFiscalYearCloseRequests(companyId, fiscalYearId);
    await db.destroy();
  });
  
  afterEach(async () => {
    // Clean idempotency records between tests
    await cleanupFiscalYearCloseRequests(companyId, fiscalYearId);
  });

  describe('Happy Path', () => {
    it('call close → succeeds → call again with same key → returns same result', async () => {
      const requestId = `happy-path-${Date.now()}`;
      const context = {
        companyId,
        requestedByUserId: 1,
        requestedAtEpochMs: Date.now()
      };

      // First call
      const result1 = await closeFiscalYear(fiscalYearId, requestId, context);
      expect(result1.success).toBe(true);
      expect(result1.status).toBe('SUCCEEDED');
      expect(result1.closeRequestId).toBe(requestId);

      // Second call with same key
      const result2 = await closeFiscalYear(fiscalYearId, requestId, context);
      expect(result2.success).toBe(true);
      expect(result2.status).toBe('SUCCEEDED');
      
      // CRITICAL: Same result
      expect(result2.closeRequestId).toBe(result1.closeRequestId);
      expect(result2.fiscalYearId).toBe(result1.fiscalYearId);
    });
  });

  describe('Conflict Path', () => {
    it('call close → succeeds → different key → new close attempt fails', async () => {
      const requestId1 = `conflict-first-${Date.now()}`;
      const requestId2 = `conflict-second-${Date.now()}`;
      const context = {
        companyId,
        requestedByUserId: 1,
        requestedAtEpochMs: Date.now()
      };

      // First close succeeds
      const result1 = await closeFiscalYear(fiscalYearId, requestId1, context);
      expect(result1.success).toBe(true);

      // Second close with DIFFERENT key fails (already closed)
      await expect(
        closeFiscalYear(fiscalYearId, requestId2, context)
      ).rejects.toThrow(FiscalYearAlreadyClosedError);
    });
  });

  describe('Failure Recovery', () => {
    it('call close → fails partway → retry with same key → safe re-execution', async () => {
      // Simulate a partial failure scenario
      const requestId = `failure-recovery-${Date.now()}`;
      
      // This test requires a way to inject failure or inspect intermediate state
      // One approach: mock a transient failure, then retry
      
      const context = {
        companyId,
        requestedByUserId: 1,
        requestedAtEpochMs: Date.now()
      };

      // The idempotency mechanism should allow safe retry
      // First attempt (might fail due to transient issue)
      try {
        await closeFiscalYear(fiscalYearId, requestId, context);
      } catch (e) {
        // Expected in failure scenario
      }

      // Retry should either:
      // 1. Complete the operation if it was interrupted, OR
      // 2. Return the final state if it actually completed
      const retryResult = await closeFiscalYear(fiscalYearId, requestId, context);
      
      // Should eventually succeed
      expect(['SUCCEEDED', 'PENDING', 'IN_PROGRESS']).toContain(retryResult.status);
    });
  });

  describe('Request ID Echo Contract', () => {
    it('NEVER returns a generated timestamp-based ID', async () => {
      const requestId = 'my-predictable-key-abc123';
      
      const result = await closeFiscalYear(fiscalYearId, requestId, {
        companyId,
        requestedByUserId: 1,
        requestedAtEpochMs: Date.now()
      });
      
      // This catches the Epic 32 bug
      expect(result.closeRequestId).toBe(requestId);
      expect(result.closeRequestId).not.toMatch(/^\d{13}-/);  // No timestamp prefix
      expect(result.closeRequestId).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/i);  // Not UUID format
    });
  });
});
```

### Database Cleanup Helper

```typescript
async function cleanupFiscalYearCloseRequests(
  db: KyselySchema,
  companyId: number,
  fiscalYearId: number
): Promise<void> {
  await db
    .deleteFrom('fiscal_year_close_requests')
    .where('company_id', '=', companyId)
    .where('fiscal_year_id', '=', fiscalYearId)
    .execute();
}
```

---

## 5. Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Generating New IDs in Response

```typescript
// WRONG - This breaks the idempotency contract
async function closeFiscalYear(...): Promise<CloseResult> {
  const closeRequestId = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
  // ...
  return {
    closeRequestId,  // Caller gets a DIFFERENT ID than they sent!
    // ...
  };
}
```

**Why it's wrong:** The caller cannot correlate the response with their request. Retries appear to be new operations.

### ❌ Anti-Pattern 2: Using Timestamps as Idempotency Keys

```typescript
// WRONG - Server generating the key from timestamp
const closeRequestId = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
```

**Why it's wrong:** Every call gets a different key, making true idempotency impossible. The caller must provide the key.

### ❌ Anti-Pattern 3: Missing Duplicate Detection Queries

```typescript
// WRONG - No check for existing request before inserting
async function closeFiscalYear(fiscalYearId, requestId, context) {
  // Always inserts - no duplicate check!
  await db.insertInto('close_requests').values({ ... }).execute();
  // ...
}
```

**Why it's wrong:** Database constraint violations bubble up as errors instead of returning the existing result gracefully.

### ❌ Anti-Pattern 4: Wrong Return on Duplicate

```typescript
// WRONG - Returns success but doesn't echo the request ID
if (existingRequest) {
  return {
    success: true,
    closeRequestId: existingRequest.id,  // Returns DB ID, not caller's key!
    // ...
  };
}
```

**Why it's wrong:** The caller sent `closeRequestId: "my-key-123"` but gets back `closeRequestId: 4567`. Contract broken.

---

## 6. Integration Test Requirements

### 6.1 Use Real Database (No Mocks)

Idempotency relies on database constraints (unique indexes, transaction isolation). Mocking hides real behavior.

```typescript
// ✅ CORRECT - Real database
import { createKysely } from '@jurnapod/db';

const db = createKysely({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// ❌ WRONG - Mocked database
const db = {
  insertInto: vi.fn().mockReturnValue({ ... })
};
```

### 6.2 Clean Up Idempotency Records Between Tests

Idempotency keys persist across calls. Tests must clean up to avoid interference.

```typescript
afterEach(async () => {
  // Clean up specific test records
  await db
    .deleteFrom('fiscal_year_close_requests')
    .where('close_request_id', 'like', 'test-%')
    .execute();
});
```

### 6.3 Test with Concurrent Calls

Idempotency must hold under concurrent access:

```typescript
it('should handle concurrent calls with same key', async () => {
  const requestId = `concurrent-${Date.now()}`;
  const context = { companyId, requestedByUserId: 1, requestedAtEpochMs: Date.now() };
  
  // Fire multiple concurrent requests
  const promises = Array(5).fill(null).map(() =>
    closeFiscalYear(fiscalYearId, requestId, context)
  );
  
  const results = await Promise.allSettled(promises);
  
  // All should succeed or return the same result
  const successful = results.filter(r => r.status === 'fulfilled');
  expect(successful.length).toBeGreaterThanOrEqual(1);
  
  // All successful results should have the same request ID
  const requestIds = successful.map(r => (r as PromiseFulfilledResult<CloseResult>).value.closeRequestId);
  expect(new Set(requestIds).size).toBe(1);
  expect(requestIds[0]).toBe(requestId);
});
```

### 6.4 Verify Database State

Don't just check return values — verify the database:

```typescript
it('should create exactly one close request record', async () => {
  const requestId = `db-check-${Date.now()}`;
  
  // Call twice
  await closeFiscalYear(fiscalYearId, requestId, context);
  await closeFiscalYear(fiscalYearId, requestId, context);
  
  // Verify exactly one record exists
  const records = await db
    .selectFrom('fiscal_year_close_requests')
    .where('close_request_id', '=', requestId)
    .selectAll()
    .execute();
  
  expect(records).toHaveLength(1);
});
```

---

## 7. Reference Implementation

See the fixed fiscal year close code for the correct pattern:

- **Service**: `packages/modules/accounting/src/fiscal-year/service.ts`
  - Lines 404-561: `closeFiscalYear()` method with idempotency handling
  - Lines 811-897: `executeCloseWithLocking()` returning caller's `closeRequestId`
  - Lines 899-1046: `closeFiscalYearWithTransaction()` atomic implementation

- **Route**: `apps/api/src/routes/accounts.ts`
  - Lines 1092-1197: `POST /accounts/fiscal-years/:id/close` endpoint
  - Lines 1199-1360: `POST /accounts/fiscal-years/:id/close/approve` endpoint

---

## 8. Checklist for Idempotency-Critical Operations

When implementing or reviewing idempotency-critical operations:

- [ ] Caller provides the idempotency key (not server-generated)
- [ ] Response echoes the caller's key exactly
- [ ] Duplicate detection query exists (before or via constraint)
- [ ] Duplicate calls return identical response (success case)
- [ ] Failed operations return same error on retry
- [ ] Integration tests use real database
- [ ] Tests verify the request ID echo contract
- [ ] Tests clean up idempotency records between runs
- [ ] Concurrent access is tested
- [ ] Database state is verified (exactly one record per key)
