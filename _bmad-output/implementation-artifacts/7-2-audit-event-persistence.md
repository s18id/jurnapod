# Story 7.2: Implement Audit Event Persistence

## Status: ready-for-dev

**Epic:** Epic 7: Sync Infrastructure - Technical Debt Fixes  
**Priority:** P0 - Critical  
**Estimated Points:** 5

## Story

As an **administrator**,
I want **sync operations to be audit-logged persistently**,
So that **I can investigate issues and track system behavior after restarts**.

## Acceptance Criteria

### AC1: Sync Operations Written to Database
**Given** a sync operation (push/pull)  
**When** the operation completes  
**Then** an audit event is written to the database  
**And** includes: timestamp, operation_type, tier, status, duration_ms, company_id

### AC2: Audit Events Survive Restart
**Given** a server restart  
**When** the system comes back online  
**Then** previous audit events are still queryable from the database

### AC3: Query Performance
**Given** an audit log query  
**When** filtering by company_id and date range  
**Then** results are returned within 500ms (indexed properly)

### AC4: sync_operations Table Populated
**Given** a sync operation  
**When** it starts and completes  
**Then** the sync_operations table is populated with start/end times and status

## Implementation Notes

### Problem Analysis
- `packages/sync-core/src/audit/sync-audit.ts` has 6 TODOs for DB persistence:
  - Line 79: TODO: Persist to database
  - Line 101: TODO: Persist to database
  - Line 119: TODO: Persist to database
  - Line 147: TODO: Implement database query for statistics
  - Line 168-172: TODO: Implement actual database persistence
- Events stored in-memory only (`this.events = new Map()`)
- sync_operations table exists but is never written to

### Files to Modify
1. `packages/sync-core/src/audit/sync-audit.ts` - Implement persistEvent()
2. `packages/sync-core/src/versioning/version-manager.ts` - Ensure DB integration works (depends on 7.1)

### Implementation Approach
1. Use existing `sync_operations` table (don't create new table)
2. Add write to sync_operations in audit methods
3. Ensure connection pooling is safe for async audit writes
4. Add indexes if needed for query performance

### Testing Standards
- Unit tests for audit persistence
- Integration test verifying events survive restart
- Verify query performance with large audit log

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
- packages/sync-core/src/audit/sync-audit.ts (modify)
- packages/sync-core/src/versioning/version-manager.ts (may need updates)
