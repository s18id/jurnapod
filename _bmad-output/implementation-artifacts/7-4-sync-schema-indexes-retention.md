# Story 7.4: Fix Database Schema & Data Retention

## Status: ready-for-dev

**Epic:** Epic 7: Sync Infrastructure - Technical Debt Fixes  
**Priority:** P1 - High  
**Estimated Points:** 5

## Story

As an **operator**,
I want **database indexes optimized and retention policies enforced**,
So that **the system performs well at scale and data doesn't grow unbounded**.

## Acceptance Criteria

### AC1: Composite Indexes on backoffice_sync_queue
**Given** a query on backoffice_sync_queue by company and status  
**When** filtering by company_id and sync_status  
**Then** the query uses composite index (not separate index scans)

### AC2: sync_operations Retention (30 days)
**Given** sync_operations records older than 30 days  
**When** the retention job runs  
**Then** those records are automatically purged

### AC3: Audit Log Retention (90 days)
**Given** audit logs older than 90 days  
**When** the retention job runs  
**Then** those records are archived or purged

### AC4: backoffice_sync_queue Retention (7 days)
**Given** backoffice_sync_queue records completed more than 7 days ago  
**When** the retention job runs  
**Then** those records are automatically purged

## Implementation Notes

### Problem Analysis
- Current indexes are single-column, spec requires composite:
  - Current: `idx_company`, `idx_status`, `idx_tier`
  - Required: `(company_id, sync_status)`, `(tier, sync_status)`
- No data retention jobs exist - tables will grow unbounded
- sync_operations table exists but not populated (depends on 7.2)

### Files to Modify
1. `packages/db/migrations/` - Add composite indexes
2. New: `packages/sync-core/src/jobs/data-retention.job.ts` - Create retention job
3. `packages/sync-core/src/audit/sync-audit.ts` - May need updates for retention

### Implementation Approach
1. Create migration to add composite indexes to backoffice_sync_queue
2. Create cron job for data retention:
   - Use node-cron or similar scheduler
   - DELETE with WHERE clause on dates
   - Log purge activity for auditing
3. Run job daily at off-peak hours

### Testing Standards
- Unit tests for retention logic
- Integration test verifying old records are purged
- Verify indexes are used in query plan

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
- packages/db/migrations/0110_add_sync_composite_indexes.sql (new)
- packages/sync-core/src/jobs/data-retention.job.ts (new)
- packages/sync-core/src/audit/sync-audit.ts (may modify)
