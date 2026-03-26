# Story 7.2: Import Session Persistence (MySQL)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a system administrator,
I want import sessions to be persisted in MySQL instead of in-memory storage,
so that import operations survive server restarts and work correctly in multi-instance deployments.

## Context

TD-026: Import sessions are stored in an in-memory `Map` in `apps/api/src/routes/import.ts`. This has three production risks:
- Sessions are lost on server restart (users mid-import lose progress)
- Sessions are not shared across instances (multi-instance deployments fail)
- Memory leak risk if cleanup timer misfires

**Decision:** MySQL session table (not Redis) — no new infrastructure dependency; horizontal scaling can be revisited when required.

## Acceptance Criteria

### AC1: Session Table Migration
- Create migration: `import_sessions` table with `session_id`, `company_id`, `payload` (JSON), `created_at`, `expires_at`
- InnoDB engine, `DECIMAL(18,2)` for any money fields in payload
- Index on `(company_id, session_id)` and `expires_at` for cleanup queries
- Migration must be rerunnable/idempotent (use `information_schema` check — no `IF NOT EXISTS` in ALTER)

### AC2: Session Service
- Create `apps/api/src/lib/import/session-store.ts`
- Interface: `createSession()`, `getSession()`, `updateSession()`, `deleteSession()`, `cleanupExpired()`
- 30-minute TTL enforced via `expires_at` column — no in-memory timer
- Company ID required on all operations (tenant isolation)

### AC3: Route Migration
- Replace in-memory `uploadSessions` Map in `import.ts` with session service
- Remove runtime warning about session count threshold (no longer needed)
- Maintain identical API surface — no breaking changes to import endpoints

### AC4: Cleanup Job
- Background cleanup of expired sessions on API startup (and optionally on cron schedule)
- Log count of cleaned sessions at INFO level

### AC5: Integration Tests
- Session survives simulated restart (new service instance reads existing session from DB)
- Concurrent sessions from different company IDs remain isolated
- Expired session returns 404 / appropriate error
- Cleanup removes only expired sessions

## Tasks / Subtasks

- [x] Create database migration (AC1)
  - [x] Create import_sessions table with required columns
  - [x] Add indexes on (company_id, session_id) and expires_at
  - [x] Ensure migration is rerunnable/idempotent
- [x] Implement session store service (AC2)
  - [x] Create apps/api/src/lib/import/session-store.ts
  - [x] Implement createSession() with 30-min TTL
  - [x] Implement getSession() with company_id validation
  - [x] Implement updateSession()
  - [x] Implement deleteSession()
  - [x] Implement cleanupExpired()
- [x] Migrate import routes (AC3)
  - [x] Replace uploadSessions Map with session store
  - [x] Remove session count threshold warning
  - [x] Verify API surface unchanged
- [x] Add cleanup job (AC4)
  - [x] Implement startup cleanup
  - [x] Add logging for cleanup count
- [x] Write integration tests (AC5)
  - [x] Test session survives restart simulation
  - [x] Test company ID isolation
  - [x] Test expired session handling
  - [x] Test cleanup functionality

## Dev Notes

### Technical Requirements
- MySQL 8.0+ and MariaDB compatibility required
- Use Kysely for database operations (existing pattern)
- Tenant isolation via company_id is mandatory
- No breaking API changes

### Database Schema
```sql
CREATE TABLE import_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  company_id INT NOT NULL,
  payload JSON NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  INDEX idx_company_session (company_id, session_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB;
```

### Files to Modify
- `apps/api/src/routes/import.ts` - Replace in-memory Map with session service

### Files to Create
- `apps/api/src/lib/import/session-store.ts` - Session store service
- Database migration for import_sessions table

### Project Structure Notes
- Follow existing Kysely patterns in apps/api/src/lib/
- Import-related utilities go in apps/api/src/lib/import/
- Use DECIMAL(18,2) for any monetary values in JSON payload

### Testing Notes
- All unit tests must close database pool after completion (see AGENTS.md)
- Integration tests should simulate restart by creating new service instance
- Verify tenant isolation with concurrent company sessions

### References

- [Source: _bmad-output/planning-artifacts/epic-7.md] - Epic 7 full specification
- [Source: apps/api/src/routes/import.ts] - Current import routes with in-memory Map
- [Source: AGENTS.md] - Database compatibility and testing requirements

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- [COMPLETED 2026-03-28] All acceptance criteria met
- Migration 0119_import_sessions.sql created with InnoDB, JSON payload, proper indexes
- Session store service implemented with 30-min TTL via expires_at column
- Import routes migrated from in-memory Map to session-store.ts
- Startup cleanup job implemented with INFO level logging
- Integration tests: session-store.test.ts (6124 bytes)
- TD-026 marked RESOLVED in TECHNICAL-DEBT.md

### File List

**Created:**
- `packages/db/migrations/0119_import_sessions.sql` (37 lines)
- `apps/api/src/lib/import/session-store.ts` (126 lines)
- `apps/api/src/lib/import/session-store.test.ts` (6124 bytes)

**Modified:**
- `apps/api/src/routes/import.ts` - Replaced uploadSessions Map with session-store imports and cleanup job
