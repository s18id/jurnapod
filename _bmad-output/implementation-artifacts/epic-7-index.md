# Epic 7: Sync Infrastructure - Technical Debt Fixes

**Status:** 📋 SPECS CREATED (Ready for Implementation)  
**Stories:** 0/4 Implemented  
**Epic Type:** Technical Debt / Infrastructure  
**Dependencies:** Epic 1 (Auth), Epic 2 (Sync System)

---

## 🚨 CRITICAL PRIORITY

**This epic contains PRODUCTION BLOCKERS that must be resolved before deployment.**

---

## 📋 STORIES

### 📋 Story 7.1: Fix Sync Version Manager Database Integration
**Status:** READY FOR DEV - SPEC CREATED
**Priority:** 🔴 CRITICAL
**Effort:** 4-6 hours

**Problem:**
- Versions stored in memory (lost on server restart)
- Data inconsistency between POS devices and backend
- Duplicate data sync after restart

**Solution:**
- Persist versions to `sync_tier_versions` table
- BIGINT for high-volume outlets (9.2 quintillion max)
- Atomic increment operations
- Database as source of truth

**Acceptance Criteria:**
- [ ] Versions survive server restart
- [ ] Atomic increment (no duplicates)
- [ ] BIGINT column type
- [ ] Query returns actual DB value (not hardcoded)

**Files:**
```
NEW: packages/db/migrations/0XXX_create_sync_tier_versions.sql
NEW: packages/modules-platform/src/sync/version-manager.ts
MOD: packages/sync-core/src/versioning/version-manager.ts
```

**Story File:** [7-1-sync-version-manager-db-integration.md](./7-1-sync-version-manager-db-integration.md)

---

### 📋 Story 7.2: Implement Audit Event Persistence
**Status:** READY FOR DEV - SPEC CREATED
**Priority:** 🔴 CRITICAL
**Effort:** 6-8 hours

**Problem:**
- Audit events may not persist to database
- Lost on server restart
- Compliance gaps
- Cannot debug sync issues

**Solution:**
- Database-backed audit logging
- Partitioned table for performance
- 90-day retention with archival
- Query performance < 500ms

**Acceptance Criteria:**
- [ ] All sync operations logged (PUSH, PULL, VERSION_BUMP)
- [ ] Events survive restart
- [ ] 90-day retention with archival
- [ ] Query by company/date in < 500ms

**Files:**
```
NEW: packages/db/migrations/0XXX_create_sync_audit_events.sql
NEW: packages/modules-platform/src/sync/audit-service.ts
NEW: apps/api/app/api/admin/audit-logs/route.ts
NEW: apps/backoffice/src/features/sync-audit-page.tsx
```

**Story File:** [7-2-sync-audit-event-persistence.md](./7-2-sync-audit-event-persistence.md)

---

### 📋 Story 7.3: Add Authentication & Rate Limiting to Sync API
**Status:** READY FOR DEV - SPEC CREATED
**Priority:** 🔴 CRITICAL
**Effort:** 4-6 hours

**Problem:**
- Sync endpoints may be unsecured
- No protection against abuse
- Security vulnerabilities

**Solution:**
- JWT authentication required
- Tier-based rate limits:
  - REALTIME: 120 req/min
  - DAILY: 30 req/min
  - MASTER_DATA: 10 req/min
- Rate limit headers in responses
- Company/outlet scoping

**Acceptance Criteria:**
- [ ] All `/sync/*` endpoints require auth
- [ ] Rate limits enforced
- [ ] Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
- [ ] 429 returned when exceeded

**Files:**
```
NEW: packages/modules-platform/src/sync/rate-limiter.ts
NEW: apps/api/src/middleware/sync-auth.ts
MOD: apps/api/app/api/sync/pull/route.ts
MOD: apps/api/app/api/sync/push/route.ts
MOD: apps/api/app/api/sync/health/route.ts
```

**Story File:** [7-3-sync-api-auth-rate-limiting.md](./7-3-sync-api-auth-rate-limiting.md)

---

### 📋 Story 7.4: Fix Database Schema & Data Retention
**Status:** READY FOR DEV - SPEC CREATED
**Priority:** 🟠 HIGH
**Effort:** 4-6 hours

**Problem:**
- Missing composite indexes
- No data retention policies
- Tables grow unbounded
- Query performance degrades

**Solution:**
- Composite indexes for common queries
- Retention jobs:
  - backoffice_sync_queue: 7 days
  - sync_operations: 30 days
  - audit_logs: 90 days (archived)
- Daily retention job
- Performance monitoring

**Acceptance Criteria:**
- [ ] Composite indexes created
- [ ] No full table scans on large tables
- [ ] Retention job runs daily
- [ ] Query performance < 100ms for 1M records

**Files:**
```
NEW: packages/db/migrations/0XXX_add_sync_composite_indexes.sql
NEW: packages/modules-platform/src/sync/retention-job.ts
NEW: apps/api/src/lib/db-health-monitor.ts
```

**Story File:** [7-4-sync-schema-indexes-retention.md](./7-4-sync-schema-indexes-retention.md)

---

## 📊 TECHNICAL SPECIFICATIONS

### Version Management
- **Storage:** Database (not memory)
- **Data Type:** BIGINT UNSIGNED
- **Increment:** Atomic (INSERT ... ON DUPLICATE KEY UPDATE)
- **Scope:** Company + Outlet + Tier

### Audit System
- **Storage:** Partitioned MySQL table
- **Retention:** 90 days active, archived after
- **Partitioning:** By year for query performance
- **Query Time:** < 500ms for 30-day range

### Rate Limiting
- **Algorithm:** Sliding window
- **Storage:** Redis (primary), Database (fallback)
- **Tiers:**
  - REALTIME: 120/min
  - DAILY: 30/min
  - MASTER_DATA: 10/min

### Data Retention
- **Scheduler:** Daily at 2 AM
- **Batch Size:** 10,000 records per delete
- **Archival:** Audit logs to archive table
- **Monitoring:** Job success/failure tracking

---

## 🔗 DEPENDENCIES

**Requires:**
- Epic 1 (Auth) - JWT, permissions
- Epic 2 (Sync) - Existing sync system to harden

**Used By:**
- All future epics (foundation for production)

---

## ✅ DEFINITION OF DONE

### Epic 7 Complete When:
- [ ] All 4 stories implemented
- [ ] Versions persist to database
- [ ] Audit events persist and queryable
- [ ] Sync API requires authentication
- [ ] Rate limiting enforced
- [ ] Indexes optimized
- [ ] Retention jobs running
- [ ] Production security review passed
- [ ] Load testing passed
- [ ] Documentation updated

---

## 🚀 IMPLEMENTATION ORDER

**Recommended Sequence:**
1. **Story 7.1** - Version Manager (prevents data loss)
2. **Story 7.3** - Auth & Rate Limiting (security)
3. **Story 7.2** - Audit Persistence (compliance)
4. **Story 7.4** - Schema & Retention (performance)

**Total Effort:** 18-26 hours

---

## ⚠️ PRODUCTION READINESS

**Epic 7 is REQUIRED for production deployment.**

Without these fixes:
- ❌ Data loss on server restart
- ❌ Security vulnerabilities
- ❌ Compliance gaps
- ❌ Performance degradation over time

**Ahmad, Epic 7 specs are ready. Shall we start implementation?**

---

**Epic 7 Status: SPECS COMPLETE 📋**  
**Ready for implementation. All 4 stories documented.**
