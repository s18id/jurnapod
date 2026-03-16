# Story 7.1: Fix Sync Version Manager Database Integration

## Status: ready-for-dev

**Epic:** Epic 7: Sync Infrastructure - Technical Debt Fixes  
**Priority:** P0 - Critical  
**Estimated Points:** 5

## Story

As a **system**,
I want **version tracking to persist to the database**,
So that **version numbers survive server restarts and scale to high-volume outlets**.

## Acceptance Criteria

### AC1: Database Schema Uses BIGINT
**Given** the sync_tier_versions table  
**When** checking the current_version column type  
**Then** it is BIGINT UNSIGNED (not INT UNSIGNED)

### AC2: Version Query Reads from Database
**Given** a request for current version  
**When** queryDatabaseVersion(company_id, tier) is called  
**Then** the actual database value is returned  
**And** NOT a hardcoded value

### AC3: Version Increment Updates Database
**Given** incrementing a tier version  
**When** incrementDatabaseVersion(company_id, tier) is called  
**Then** the database is atomically updated  
**And** the new value is returned

### AC4: pos_sync_metadata.last_version Consistency
**Given** the pos_sync_metadata table  
**When** checking the last_version column type  
**Then** it is BIGINT UNSIGNED for consistency

## Implementation Notes

### Problem Analysis
- Migration `0106_modular_sync_architecture.sql` uses `INT UNSIGNED` for current_version
- `packages/sync-core/src/versioning/version-manager.ts` has 9 TODOs:
  - Line 28: TODO: Query database for current version
  - Line 41: TODO: Atomically increment in database
  - Line 54: TODO: Use database transaction to atomically update all tiers
  - Line 66: TODO: Query database for all tier versions
  - Line 76: TODO: Get actual last updated time from DB
  - Line 156-173: queryDatabaseVersion() returns hardcoded 1
  - Line 166-173: incrementDatabaseVersion() returns hardcoded 2

### Files to Modify
1. `packages/db/migrations/` - Add migration to alter column to BIGINT
2. `packages/sync-core/src/versioning/version-manager.ts` - Implement actual DB queries

### Implementation Approach
1. Create new migration file: `0109_fix_sync_version_bigint.sql`
2. Alter `sync_tier_versions.current_version` to BIGINT UNSIGNED
3. Alter `pos_sync_metadata.last_version` to BIGINT UNSIGNED
4. Implement `queryDatabaseVersion()` using getDbPool()
5. Implement `incrementDatabaseVersion()` with UPDATE ... SET current_version = current_version + 1

### Testing Standards
- Unit tests for version manager methods
- Integration test verifying version survives restart
- Verify atomic increment under concurrent load

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
- packages/db/migrations/0109_fix_sync_version_bigint.sql (new)
- packages/sync-core/src/versioning/version-manager.ts (modify)
