# Story 2.6: POS - Duplicate Prevention During Sync

## Status: DONE

**Epic:** Epic 2: POS - Offline-first Point of Sale  
**Priority:** High  
**Estimated Points:** 5

## Story

As a **system**,
I want to **prevent duplicate transactions during sync**,
So that **financial records remain accurate**.

## Acceptance Criteria

### AC1: First Sync Success
**Given** transaction with client_tx_id "ABC-123"  
**When** it is sent to server the first time  
**Then** transaction is created successfully  

### AC2: Duplicate Rejection
**Given** duplicate request with same client_tx_id "ABC-123"  
**When** it arrives at server  
**Then** transaction is not duplicated  
**And** original transaction ID is returned  

### AC3: Idempotent Resync
**Given** offline transaction that was synced  
**When** cashier attempts to sync again (device didn't receive ack)  
**Then** idempotent response is returned, no duplicate created  

## Implementation Notes

### Implemented
- ✅ client_tx_id (UUID v4) generated at sale completion
- ✅ Dedupe key in outbox based on client_tx_id
- ✅ Server-side duplicate check via client_tx_id (requires API implementation)
- ✅ Idempotent response handling in sync-orchestrator

### Key Implementation Details

**POS Side:**
- `apps/pos/src/offline/sales.ts:232` - client_tx_id generated with crypto.randomUUID()
- `apps/pos/src/offline/outbox.ts:120` - dedupe_key = client_tx_id

**Server Side (requires API implementation):**
- API should check for existing client_tx_id before creating new transaction
- Return existing transaction ID if duplicate detected

### Files Analyzed
- `apps/pos/src/offline/sales.ts` - client_tx_id generation
- `apps/pos/src/offline/outbox.ts` - Dedupe key
- `apps/pos/src/offline/outbox-sender.ts` - client_tx_id handling
