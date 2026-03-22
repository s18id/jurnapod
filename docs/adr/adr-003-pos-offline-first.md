# ADR-003: POS Offline-First Architecture

**Status:** Accepted  
**Date:** 2026-03-10  
**Deciders:** Epic 2 Team  

---

## Context

Point of Sale (POS) systems operate in environments where network connectivity is unreliable:

- **Restaurants** - Basements, metal buildings, crowded venues
- **Retail** - Black Friday, peak hours, rural locations
- **Events** - Temporary setups, festival grounds

### Problem Statement

If the POS cannot process transactions during network outages:

1. **Revenue Loss** - No sales during downtime
2. **Customer Frustration** - Slow checkout, failed payments
3. **Data Loss** - Transactions may be lost
4. **Reconciliation Challenges** - Online vs offline discrepancies

### Decision Drivers

1. **Availability** - POS must work regardless of connectivity
2. **Data Safety** - No transaction loss during failures
3. **Idempotency** - Safe retry when network returns
4. **Consistency** - Online and offline state must reconcile

---

## Decision

We implement an **Offline-First Event Sourcing Pattern** for POS:

### Core Principle

> **All transactions are written locally first, then synchronized to the server when online. The local database is the temporary source of truth during offline periods.**

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        POS Client                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │   Local     │───▶│   Outbox    │───▶│   Sync      │    │
│  │   SQLite    │    │   Queue     │    │   Engine    │    │
│  └─────────────┘    └─────────────┘    └─────────────┘    │
│         │                                    │            │
│         │                                    ▼            │
│         │                           ┌─────────────┐       │
│         │                           │   Server    │       │
│         │                           │   API       │       │
│         └──────────────────────────▶│   (when     │       │
│                                     │   online)   │       │
│                                     └─────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Local Database (SQLite)
- Stores all POS data locally
- Tables mirror server schema + local-only fields
- Transactional writes with ACID guarantees

#### 2. Outbox Pattern
- Every mutation creates an outbox entry
- Outbox entries are immutable once created
- Processing state tracked (pending, sent, confirmed, failed)

#### 3. Sync Engine
- Monitors network status
- Processes outbox entries in order
- Handles retries with exponential backoff
- Reconciles conflicts on reconnect

---

## Implementation Details

### Local Schema

```sql
-- Transactions table with client-side ID
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,              -- UUID generated locally
  client_tx_id TEXT UNIQUE NOT NULL, -- Idempotency key
  outlet_id INTEGER NOT NULL,
  cashdrawer_id TEXT,
  total_amount INTEGER NOT NULL,    -- Stored in cents
  tax_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed',  -- completed, synced, voided
  created_at INTEGER NOT NULL,     -- Unix ms
  synced_at INTEGER,                -- NULL until synced
  
  -- Sync metadata
  _sync_status TEXT DEFAULT 'pending',
  _sync_attempts INTEGER DEFAULT 0,
  _sync_last_error TEXT
);

-- Transaction line items
CREATE TABLE transaction_items (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  tax_rate INTEGER DEFAULT 0,
  discount_amount INTEGER DEFAULT 0,
  
  FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);
```

### Outbox Table

```sql
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,       -- 'transaction', 'payment', etc.
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,          -- 'create', 'void', 'refund'
  payload TEXT NOT NULL,           -- JSON payload
  status TEXT DEFAULT 'pending',    -- pending, processing, sent, failed
  created_at INTEGER NOT NULL,
  processed_at INTEGER,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  
  UNIQUE(entity_type, entity_id, operation)
);

-- Index for efficient polling
CREATE INDEX idx_outbox_status ON outbox(status, created_at);
```

### Sync Protocol

#### Push (POS → Server)

```
1. Transaction created locally
2. Outbox entry created
3. Sync engine picks up entry
4. POST /sync/push with client_tx_id
5. Server responds with:
   - 200 OK: Transaction accepted
   - 409 Conflict: Duplicate (idempotent - return success)
   - 4xx Error: Validation failure (mark failed, don't retry)
   - 5xx Error: Server error (retry later)
6. Outbox entry updated with result
```

#### Pull (Server → POS)

```
1. Sync engine detects online status
2. GET /sync/pull?since={last_sync_timestamp}
3. Server returns all changes since timestamp
4. Local database updated with server state
5. Conflicts resolved via "server wins" rule
```

---

## Idempotency

### Why Critical

During offline periods, the same transaction may be submitted multiple times:
- Network timeout → client retries
- User presses "Submit" twice
- POS restart after crash

### Solution: client_tx_id

```typescript
// Generate unique idempotency key per transaction
const clientTxId = crypto.randomUUID();

// Server-side deduplication
async function pushTransaction(tx: SyncPushPayload) {
  // Check if already processed
  const existing = await db.transactions.findOne({ 
    client_tx_id: tx.client_tx_id 
  });
  
  if (existing) {
    // Idempotent - return existing
    return { 
      status: 'OK', 
      transaction_id: existing.id,
      duplicate: true 
    };
  }
  
  // Process new transaction
  const created = await createTransaction(tx);
  return { 
    status: 'CREATED', 
    transaction_id: created.id,
    duplicate: false 
  };
}
```

---

## Conflict Resolution

### Strategy: Server Wins

When the same transaction exists both locally and on server:

1. **Same client_tx_id, same data** → Accept (idempotent)
2. **Same client_tx_id, different data** → Server wins, discard local
3. **Local-only, server has different tx** → Keep both (rare edge case)

### Offline Payments

Payments processed offline need special handling:

```sql
-- Payment records include offline flag
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,             -- 'cash', 'card', 'mobile'
  reference TEXT,                   -- Card/Mobile reference
  processed_offline BOOLEAN DEFAULT FALSE,
  offline_batch_id TEXT,            -- Groups offline payments
  
  FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);
```

---

## Consequences

### Positive

1. **Always Available** - POS works offline
2. **No Data Loss** - All transactions persisted locally
3. **Safe Retries** - Idempotency prevents duplicates
4. **Easy Reconciliation** - Clear sync status per transaction

### Negative

1. **Complex Sync Logic** - Significant engineering effort
2. **Offline Payments** - Handled differently than online
3. **Conflict Resolution** - May lose local changes on sync

### Mitigation

- Comprehensive sync testing with network chaos
- Clear user feedback on sync status
- Manual reconciliation tools for edge cases

---

## References

- Epic 2: POS - Offline-first Point of Sale
- Story 2.4: POS Offline Mode - Local Storage
- Story 2.5: POS Sync - Transactions When Online
- Story 2.6: Duplicate Prevention During Sync
- ADR-001: Backoffice UI Component Architecture
