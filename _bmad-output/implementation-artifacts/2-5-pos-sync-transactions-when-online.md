# Story 2.5: POS - Sync Transactions When Online

## Status: DONE

**Epic:** Epic 2: POS - Offline-first Point of Sale  
**Priority:** High  
**Estimated Points:** 8

## Story

As a **cashier**,
I want to **automatically sync queued transactions when connectivity returns**,
So that **all sales are recorded in the central database**.

## Acceptance Criteria

### AC1: Auto-Sync on Reconnect
**Given** queued transactions and network connectivity restored  
**When** POS detects online status  
**Then** sync process begins automatically  

### AC2: Concurrent New Sales During Sync
**Given** sync in progress  
**When** new sale is completed  
**Then** new transaction is added to queue (not blocking sync)  

### AC3: Server Duplicate Check
**Given** transaction syncing  
**When** server receives transaction with client_tx_id  
**Then** duplicate check prevents double-posting  

### AC4: Successful Sync Mark
**Given** successful sync  
**When** transaction is acknowledged by server  
**Then** transaction is marked as synced in local storage  

### AC5: Sync Failure Handling
**Given** sync failure  
**When** server returns error  
**Then** transaction remains in queue for retry  
**And** error is logged for investigation  

## Implementation Notes

### Implemented
- ✅ Network status change triggers sync via scheduleRefresh()
- ✅ Outbox pattern allows concurrent new transactions
- ✅ client_tx_id for duplicate detection
- ✅ Sync status tracked (PENDING, SENT, FAILED, ACKNOWLEDGED)
- ✅ Retry logic with exponential backoff
- ✅ Error logging

### Files Analyzed
- `apps/pos/src/router/Router.tsx` - Network change triggers sync
- `apps/pos/src/services/sync-orchestrator.ts` - Sync orchestration
- `apps/pos/src/offline/outbox-drainer.ts` - Outbox processing
- `apps/pos/src/offline/outbox-sender.ts` - Server communication
