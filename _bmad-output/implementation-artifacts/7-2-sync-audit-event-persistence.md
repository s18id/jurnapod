# Story 7.2: Implement Audit Event Persistence

**Epic:** Epic 7 - Sync Infrastructure - Technical Debt Fixes  
**Status:** ready-for-dev  
**Priority:** CRITICAL  
**Estimated Effort:** 6-8 hours  
**Created:** 2026-03-16  
**Type:** Technical Debt / Compliance  
**Risk:** Compliance gaps, inability to debug sync issues  

---

## Context

Sync operations (push/pull) currently may not persist audit events to the database. When the server restarts, any in-memory audit logs are lost. This creates:
- Compliance gaps (no persistent audit trail)
- Debugging nightmares (can't investigate issues after restart)
- Security concerns (can't track who did what)
- Operational blindness (no visibility into sync health)

This is a **production blocker** - we cannot deploy without reliable audit trails.

---

## Story

As a **system administrator**,  
I want **sync operations audit-logged persistently**,  
So that **I can investigate issues and track system behavior after restarts**.

---

## Acceptance Criteria

### Audit Event Creation

**Given** a sync push operation completes  
**When** the operation finishes (success or failure)  
**Then** an audit event is written to the database  
**And** includes: timestamp, operation_type='PUSH', tier, status, duration_ms, company_id

**Given** a sync pull operation completes  
**When** the operation finishes  
**Then** an audit event is written to the database  
**And** includes: timestamp, operation_type='PULL', tier, status, items_count, company_id

**Given** a sync operation fails  
**When** the error occurs  
**Then** an audit event is written with status='FAILED'  
**And** includes error details

### Data Persistence

**Given** a server restart occurs  
**When** the system comes back online  
**Then** all previous audit events are still queryable from the database

**Given** audit logs older than 90 days  
**When** the retention job runs  
**Then** old logs are archived (not deleted) for compliance

### Query Performance

**Given** an audit log query by company_id and date range  
**When** querying 30 days of data  
**Then** results return within 500ms (indexed properly)

**Given** a high-volume outlet (1000+ syncs/day)  
**When** querying last 7 days  
**Then** query completes without timeout

---

## Technical Design

### Database Schema

```sql
-- Migration: 0XXX_create_sync_audit_events.sql
CREATE TABLE sync_audit_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED, -- NULL for company-level operations
  operation_type VARCHAR(20) NOT NULL, -- 'PUSH', 'PULL', 'VERSION_BUMP'
  tier_name VARCHAR(50) NOT NULL, -- 'REALTIME', 'DAILY', 'MASTER_DATA'
  status VARCHAR(20) NOT NULL, -- 'SUCCESS', 'FAILED', 'PARTIAL'
  
  -- Timing
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  duration_ms INT UNSIGNED,
  
  -- Operation details
  items_count INT UNSIGNED, -- Number of items synced
  version_before BIGINT UNSIGNED,
  version_after BIGINT UNSIGNED,
  
  -- Error information (for failed operations)
  error_code VARCHAR(50),
  error_message TEXT,
  
  -- Client information
  client_device_id VARCHAR(255),
  client_version VARCHAR(50),
  
  -- Request metadata
  request_size_bytes INT UNSIGNED,
  response_size_bytes INT UNSIGNED,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign keys
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
  
  -- Indexes for common queries
  INDEX idx_company_time (company_id, created_at),
  INDEX idx_outlet_time (outlet_id, created_at),
  INDEX idx_operation (operation_type, status),
  INDEX idx_tier (tier_name, created_at),
  INDEX idx_status_time (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (YEAR(created_at)) (
  PARTITION p2024 VALUES LESS THAN (2025),
  PARTITION p2025 VALUES LESS THAN (2026),
  PARTITION p2026 VALUES LESS THAN (2027),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- Archive table for old events
CREATE TABLE sync_audit_events_archive LIKE sync_audit_events;
```

### Audit Service

```typescript
// packages/modules-platform/src/sync/audit-service.ts

interface SyncAuditEvent {
  id?: bigint;
  companyId: number;
  outletId?: number;
  operationType: 'PUSH' | 'PULL' | 'VERSION_BUMP' | 'HEALTH_CHECK';
  tierName: string;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'IN_PROGRESS';
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  itemsCount?: number;
  versionBefore?: bigint;
  versionAfter?: bigint;
  errorCode?: string;
  errorMessage?: string;
  clientDeviceId?: string;
  clientVersion?: string;
  requestSizeBytes?: number;
  responseSizeBytes?: number;
}

interface AuditQuery {
  companyId?: number;
  outletId?: number;
  operationType?: string;
  tierName?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

class SyncAuditService {
  // Start an audit event (returns event ID to complete later)
  async startEvent(event: Omit<SyncAuditEvent, 'id'>): Promise<bigint>;
  
  // Complete an event with results
  async completeEvent(
    eventId: bigint,
    updates: Partial<SyncAuditEvent>
  ): Promise<void>;
  
  // Create a complete event in one call
  async logEvent(event: SyncAuditEvent): Promise<bigint>;
  
  // Query events
  async queryEvents(query: AuditQuery): Promise<{
    events: SyncAuditEvent[];
    total: number;
  }>;
  
  // Get event statistics
  async getStats(
    companyId: number,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalOperations: number;
    successRate: number;
    avgDurationMs: number;
    operationsByType: Record<string, number>;
    operationsByStatus: Record<string, number>;
  }>;
  
  // Archive old events
  async archiveEvents(olderThanDays: number): Promise<number>;
}
```

### Integration Points

1. **Sync Push Handler** - Log PUSH operations
2. **Sync Pull Handler** - Log PULL operations  
3. **Version Bumper** - Log VERSION_BUMP operations
4. **Health Check** - Log HEALTH_CHECK operations
5. **Admin API** - Query audit logs
6. **Monitoring Dashboard** - Display sync statistics

---

## Implementation Tasks

### 1. Database Migration (30 min)
- [ ] Create `sync_audit_events` table with partitioning
- [ ] Create archive table
- [ ] Add indexes for performance
- [ ] Test migration on MySQL and MariaDB

### 2. Audit Service (2 hours)
- [ ] Create `SyncAuditService` class
- [ ] Implement `startEvent()` for async operations
- [ ] Implement `completeEvent()` for finalizing
- [ ] Implement `logEvent()` for synchronous logging
- [ ] Implement `queryEvents()` with filtering
- [ ] Implement `getStats()` for dashboards
- [ ] Add connection pooling for high-frequency logging

### 3. Integration (2 hours)
- [ ] Instrument sync push handler
- [ ] Instrument sync pull handler
- [ ] Instrument version bumper
- [ ] Add audit logging to health checks
- [ ] Create admin API endpoints for querying
- [ ] Add middleware for automatic logging

### 4. Retention & Archival (1 hour)
- [ ] Create retention job (runs daily)
- [ ] Archive events older than 90 days
- [ ] Compress archived data
- [ ] Add monitoring for archival success/failure

### 5. Testing (1.5 hours)
- [ ] Unit tests for audit service
- [ ] Integration test: event survives restart
- [ ] Performance test: 1000 events/minute
- [ ] Query performance test (< 500ms)
- [ ] Archival test

### 6. UI & Monitoring (1 hour)
- [ ] Create audit log viewer page
- [ ] Add sync statistics dashboard
- [ ] Add alerts for failed operations
- [ ] Export functionality for compliance

---

## Files to Create/Modify

### New Files
```
packages/db/migrations/0XXX_create_sync_audit_events.sql
packages/modules-platform/src/sync/audit-service.ts
packages/modules-platform/src/sync/audit-service.test.ts
apps/api/app/api/admin/audit-logs/route.ts
apps/backoffice/src/features/sync-audit-page.tsx
```

### Modified Files
```
apps/api/app/api/sync/push/route.ts
  - Add audit logging around push operations

apps/api/app/api/sync/pull/route.ts
  - Add audit logging around pull operations

packages/modules-platform/src/sync/version-bumper.ts
  - Log version bump events

packages/modules-platform/src/sync/index.ts
  - Export audit service

apps/api/src/lib/sync-health.ts
  - Log health check events
```

---

## Dependencies

- ✅ Database connection (exists)
- ✅ Sync operations (exists)
- 🔧 Partitioning support (MySQL 5.7+, MariaDB 10.2+)

---

## Testing Strategy

### Unit Tests
```typescript
// Test event creation
test('logEvent creates database record', async () => {
  const eventId = await auditService.logEvent({
    companyId: 1,
    operationType: 'PUSH',
    tierName: 'REALTIME',
    status: 'SUCCESS',
    startedAt: new Date(),
    durationMs: 100
  });
  
  const event = await auditService.getEvent(eventId);
  expect(event.status).toBe('SUCCESS');
});

// Test persistence across restart
test('events survive server restart', async () => {
  const eventId = await auditService.logEvent({...});
  
  // Simulate restart
  const newService = new SyncAuditService();
  const event = await newService.getEvent(eventId);
  
  expect(event).toBeDefined();
});
```

### Performance Test
```typescript
// 1000 events per minute
test('handles high-frequency logging', async () => {
  const start = Date.now();
  const promises = Array(1000).fill(null).map(() =>
    auditService.logEvent({...})
  );
  await Promise.all(promises);
  const duration = Date.now() - start;
  
  expect(duration).toBeLessThan(60000); // Under 1 minute
});
```

---

## Definition of Done

- [ ] Database table with partitioning
- [ ] Audit service with CRUD operations
- [ ] All sync operations logged
- [ ] Events survive server restart
- [ ] Query performance < 500ms
- [ ] Retention job archiving old events
- [ ] Admin UI for viewing logs
- [ ] Tests passing (unit + integration + performance)
- [ ] Documentation updated
- [ ] Compliance requirements met

---

## Risk Mitigation

### Risk: Performance impact on sync operations
**Mitigation:** Async logging (fire-and-forget). Don't block sync operations on audit writes.

### Risk: Database growth (unbounded)
**Mitigation:** Partitioning + archival. Old events moved to archive table.

### Risk: PII in audit logs
**Mitigation:** Don't log sensitive data. Only operation metadata, not content.

---

**Story Status:** Ready for Development 🚀  
**Priority:** CRITICAL - Compliance/Operational Requirement  
**Next Step:** Delegate to `bmad-dev-story` for implementation
