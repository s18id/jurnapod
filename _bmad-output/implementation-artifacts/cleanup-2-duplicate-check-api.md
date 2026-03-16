# Cleanup Task: Implement Server-Side Duplicate Check API

## Status: ready-for-dev

**Type**: Technical Debt (Epic 2.6 Incomplete)  
**Priority**: P0 - Critical (Data Integrity)  
**Estimated Points**: 5  
**Estimated Hours**: 4

## Story

As a **POS system**,  
I want **to check if a transaction already exists before creating it**,  
So that **duplicate transactions are prevented during sync**.

## Background

Story 2.6 (Duplicate Prevention) was marked DONE, but only the client-side implementation exists. The server-side API to check for duplicates by `client_tx_id` was noted as "requires implementation" but never built. This creates a data integrity risk during POS sync.

## Current State

**Implemented (Client-Side):**
- POS generates `client_tx_id` (UUID v4) per transaction
- Outbox uses `dedupe_key = client_tx_id`
- Client tracks sync status (PENDING → SENT → ACKNOWLEDGED)

**Missing (Server-Side):**
- API endpoint to check if transaction exists
- Server-side validation before insert
- Idempotent response for duplicates

## Acceptance Criteria

### AC1: Check Duplicate Endpoint
**Given** a POS transaction with `client_tx_id`  
**When** the server receives a sync request  
**Then** it checks for existing transaction before inserting

**Endpoint:** `POST /api/transactions/check-duplicate`

**Request:**
```json
{
  "client_tx_id": "uuid-v4-string",
  "company_id": 123
}
```

**Response (Not Found):**
```json
{
  "success": true,
  "data": {
    "exists": false
  }
}
```

**Response (Exists):**
```json
{
  "success": true,
  "data": {
    "exists": true,
    "transaction_id": "server-generated-id",
    "created_at": "2026-03-16T10:30:00.000Z"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid client_tx_id format"
  }
}
```

### AC2: Idempotent Transaction Creation
**Given** a duplicate transaction request  
**When** the server detects existing `client_tx_id`  
**Then** it returns existing transaction without creating duplicate

**Requirements:**
- Check `pos_transactions.client_tx_id` field
- Unique constraint on `(company_id, client_tx_id)`
- Return 200 OK with existing transaction data
- Do NOT create duplicate record
- Log duplicate detection for monitoring

### AC3: Database Schema Update
**Given** the current schema  
**When** migration runs  
**Then** unique constraint is added for deduplication

**Migration Required:**
```sql
-- Add unique constraint if not exists
ALTER TABLE pos_transactions 
ADD CONSTRAINT uk_pos_transactions_client_tx_id 
UNIQUE (company_id, client_tx_id);

-- Add index for performance
CREATE INDEX idx_pos_transactions_client_tx_id 
ON pos_transactions(company_id, client_tx_id);
```

**Schema Check:**
- Verify `pos_transactions` has `client_tx_id` VARCHAR(36) column
- Add column if missing
- Apply unique constraint

### AC4: Integration with Sync Flow
**Given** the POS sync orchestrator  
**When** it sends a transaction  
**Then** the server handles duplicates gracefully

**Sync Flow:**
1. POS sends transaction with `client_tx_id`
2. Server checks for existing record
3. If exists: Return existing transaction (200 OK)
4. If not exists: Create new transaction (201 Created)
5. POS updates local status based on response

### AC5: Testing
**Given** the duplicate check API  
**When** tests run  
**Then** duplicate prevention is verified

**Test Cases:**
- Create new transaction (should succeed)
- Send duplicate `client_tx_id` (should return existing, not create new)
- Invalid `client_tx_id` format (should return 400)
- Missing `company_id` (should return 400)
- Cross-company isolation (Company A cannot see Company B transactions)
- Concurrent duplicate requests (race condition handling)

## Technical Requirements

### Files to Modify
1. `packages/db/migrations/0111_add_transaction_dedupe_constraint.sql` - Migration
2. `apps/api/app/api/transactions/check-duplicate/route.ts` - New endpoint
3. `apps/api/app/api/transactions/sync/route.ts` - Update to use check
4. `apps/api/src/lib/transactions.ts` - Duplicate check helper function

### API Implementation
```typescript
// apps/api/app/api/transactions/check-duplicate/route.ts
export async function POST(request: Request) {
  const body = await request.json();
  const { client_tx_id, company_id } = body;
  
  // Validation
  if (!client_tx_id || !company_id) {
    return errorResponse('Missing required fields', 400);
  }
  
  // Check for existing
  const existing = await checkDuplicateTransaction(client_tx_id, company_id);
  
  if (existing) {
    return successResponse({
      exists: true,
      transaction_id: existing.id,
      created_at: existing.created_at
    });
  }
  
  return successResponse({ exists: false });
}
```

### Database Query
```typescript
// apps/api/src/lib/transactions.ts
export async function checkDuplicateTransaction(
  clientTxId: string,
  companyId: number
): Promise<PosTransaction | null> {
  const [result] = await db.query(
    `SELECT * FROM pos_transactions 
     WHERE client_tx_id = ? AND company_id = ? 
     LIMIT 1`,
    [clientTxId, companyId]
  );
  return result || null;
}
```

### Integration with Existing Sync
Update existing sync endpoint to:
1. Call `checkDuplicateTransaction` before insert
2. Return existing transaction if found
3. Only insert if not exists
4. Handle race conditions (unique constraint will catch concurrent inserts)

## Implementation Notes

### Database Compatibility
- MySQL 8.0+ and MariaDB compatible
- Use `information_schema` to check if constraint exists before adding
- Idempotent migration (safe to run multiple times)

### Performance Considerations
- Index on `(company_id, client_tx_id)` ensures fast lookups
- Query should complete in < 50ms
- Monitor for slow queries after deployment

### Race Condition Handling
- Unique constraint at database level prevents duplicates
- Catch constraint violation error and return existing record
- Log race condition occurrences for monitoring

### Security
- Validate `client_tx_id` is valid UUID v4 format
- Enforce tenant isolation (company_id check)
- Log all duplicate detection events

## Dev Notes

### Dependencies
- Requires `pos_transactions` table with `client_tx_id` column
- If column missing, add it in migration first
- Epic 1 auth system for API authentication

### Testing Strategy
**Unit Tests:**
- Duplicate detection logic
- UUID validation
- Tenant isolation

**Integration Tests:**
- End-to-end sync flow with duplicates
- Race condition simulation
- Cross-company isolation verification

**Load Tests:**
- Concurrent duplicate requests
- High-volume sync scenarios

### Deployment Notes
- Migration must run before API deployment
- Zero-downtime deployment (constraint addition is fast)
- Monitor error logs for constraint violations

## Dev Agent Record

### Agent Model Used
TBD

### Debug Log References
TBD

### Completion Notes
TBD

### File List
- packages/db/migrations/0111_add_transaction_dedupe_constraint.sql (new)
- apps/api/app/api/transactions/check-duplicate/route.ts (new)
- apps/api/app/api/transactions/sync/route.ts (modify)
- apps/api/src/lib/transactions.ts (modify)
