# Epic 2 Retrospective: Sync Routes & POS Offline-First

**Date:** 2026-03-28  
**Epic:** Epic 2 - Sync Routes & POS Offline-First  
**Status:** Complete  
**Stories Completed:** 9/9 (100%)

---

## Epic Summary

Epic 2 successfully delivered the sync push/pull layered architecture migration and fixed three critical N+1 query performance issues in COGS and recipe composition flows.

### Stories Delivered

| Story | Title | Status |
|-------|-------|--------|
| 2.1 | Sync Push Layered Architecture | ✅ Done |
| 2.2 | Sync Pull Layered Architecture | ✅ Done |
| 2.3 | Sync Push Kysely Migration | ✅ Done |
| 2.4 | Sync Pull Kysely Migration | ✅ Done |
| 2.5 | Reports Routes Migration | ✅ Done |
| 2.6 | TD-001 COGS Posting N+1 Fix | ✅ Done |
| 2.7 | TD-002 COGS Calculation N+1 Fix | ✅ Done |
| 2.8 | TD-003 Recipe Composition N+1 Fix | ✅ Done |
| 2.9 | Epic 2 Documentation | ✅ Done |

---

## What Went Well

### 1. Layered Architecture Pattern Successfully Established

The Option A (Route + Lib) architecture was successfully implemented for both sync push and pull routes:
- **Thin HTTP layer** (`routes/sync/push/route.ts`, `routes/sync/pull/route.ts`) handles only routing, auth, request parsing, and response shaping
- **Business logic modules** (`lib/sync/push/`, `lib/sync/pull/`) have zero HTTP knowledge - they accept plain params and return typed results
- **Testability improved** - lib modules can now be tested without HTTP mocking

This pattern has become the canonical approach for API route organization in the codebase.

### 2. Offline-First Sync Idempotency Preserved

The migration maintained critical offline-first guarantees:
- `client_tx_id` idempotency remains intact across all sync operations
- Batch idempotency check implemented with `WHERE client_tx_id IN (...)` for O(1) deduplication
- Per-transaction connection ownership ensures concurrency safety under retry scenarios

### 3. Kysely Migration Strategy Validated

The hybrid approach (Kysely for simple SELECTs, raw SQL for complex operations) proved effective:
- Simple data retrieval migrated to type-safe Kysely queries
- Complex GL aggregations, stock deduction, and COGS posting preserved as raw SQL for performance
- Pattern documented in ADR-0009 for future reference

### 4. N+1 Query Fixes Significantly Improved Performance

Three technical debt items eliminated query multiplication:
- **TD-001**: COGS posting item account lookups - from N queries to 1 batch query
- **TD-002**: COGS calculation inventory lookups - from 2N queries to 2 batch queries
- **TD-003**: Recipe composition ingredient costs - from N queries to 1 batch query

### 5. Code Review Quality Maintained

Multiple review cycles caught critical issues:
- **P0 Bug**: Shared-connection concurrency risk identified and fixed
- **P1 Bug**: `processActiveOrders` migration completeness verified
- **P2 Issues**: Audit logging, orchestrator wiring, connection lifecycle all addressed

### 6. Test Coverage Maintained Throughout

All validation gates passed:
- 711 API unit tests passing (up from 692 at epic start)
- Sync route tests: 8/8 passing
- Typecheck, build, lint all clean
- Regression tests added for N+1 fixes

---

## What Could Be Improved

### 1. Initial Scope Underestimation

**Issue**: Story 2.3 (Sync Push Kysely Migration) required significantly more effort than estimated.

**Original estimate**: 1.5 days  
**Actual**: ~3 days (including P0 fixes, re-review cycles, and final polish)

**Root causes**:
- Complex transaction coordination logic in `processSyncPushTransaction` (~2300 lines originally)
- Multiple edge cases in order processing (active orders, updates, cancellations)
- Snapshot line handling added unexpected complexity

**Lesson**: Large monolithic functions require decomposition estimates, not just migration estimates.

### 2. Connection Management Complexity

**Issue**: Early implementation passed a shared connection to concurrent transaction processing.

**Impact**: P0 bug - concurrent calls on shared connection caused undefined MySQL behavior and race conditions.

**Lesson**: Connection ownership must be explicit - each concurrent operation needs its own connection from the pool.

### 3. Partial Implementation Risks

**Issue**: Story 2.1 created orchestrator placeholder that wasn't fully wired until Story 2.3.

**Impact**: Route still contained duplicate logic between stories, creating temporary technical debt.

**Lesson**: Avoid placeholder implementations that span multiple stories - either complete the wiring or defer the entire extraction.

### 4. Documentation/Spec Drift

**Issue**: Story 2.5 spec referenced non-existent files (`modules-accounting/src/reports-service.ts`).

**Impact**: Developer had to rediscover actual file locations during implementation.

**Lesson**: Pre-flight file structure verification should be standard before story implementation.

### 5. mysql2/Kysely Compatibility Edge Cases

**Issue**: `packages/db/src/connection-kysely.ts` had source/build mismatch - source had old Promise-only wrapper while dist had callback compatibility fix.

**Impact**: Post-completion bug requiring source-level fixes and re-review.

**Lesson**: Database driver wrappers need comprehensive test coverage for both callback and Promise patterns.

---

## Lessons Learned

### 1. Per-Entity Transaction Scoping is Essential

Each process module (`transactions.ts`, `orders.ts`) managing its own transaction scope proved correct:
- If orders processing fails, transactions result remains valid
- Partial failures are explicit in the response
- POS clients can handle partial success appropriately

**Application**: Apply this pattern to any batch processing with independent entities.

### 2. Tax Context Connection Lifecycle Matters

Holding a connection across full sync processing blocked the pool. The fix:
```typescript
// Acquire, use, release BEFORE orchestration
const taxContext = await loadTaxContext(kysely, companyId);
await kysely.destroy(); // Release immediately

// Then orchestrate with fresh connections per transaction
const results = await orchestrateSyncPush({ ...params, taxContext });
```

**Application**: Always minimize connection hold time; pass context, not connections.

### 3. Batch Fetch Pattern is Reusable

The N+1 fix pattern proved consistent across three different domains:

```typescript
// 1. Collect all IDs
const ids = items.map(i => i.id);

// 2. Single batch query
const rows = await kysely.selectFrom('table')
  .where('id', 'in', ids)
  .execute();

// 3. Build Map for O(1) lookup
const lookup = new Map(rows.map(r => [r.id, r]));

// 4. Iterate with constant-time access
for (const item of items) {
  const data = lookup.get(item.id);
  // ...
}
```

**Application**: Any per-item database query should be batch-candidate reviewed.

### 4. Raw SQL Boundaries Need Explicit Documentation

The decision to preserve raw SQL for certain operations was correct but needs clear criteria:

**Use Kysely**:
- Simple SELECT with WHERE clauses
- Account lookups, list operations
- asOfId subqueries

**Preserve Raw SQL**:
- INSERT with dynamic batch values (unknown count at compile time)
- SUM/GROUP BY aggregations across many rows
- Financial-critical operations (stock deduction, COGS posting)
- Complex multi-table JOINs with conditional logic

### 5. Orchestrator Pattern Scales Well

The orchestrator design pattern demonstrated clear benefits:
- Single entry point for complex operations
- Consistent error handling and result aggregation
- Testable without HTTP layer
- Enables independent module evolution

---

## Action Items

### Immediate (Before Next Epic)

| Item | Owner | Description |
|------|-------|-------------|
| A-001 | Tech Lead | Review any remaining N+1 patterns in COGS/recipe flows using query logging |
| A-002 | Dev Team | Add connection lifecycle check to code review checklist |
| A-003 | QA | Add performance regression tests for batch fetch patterns |

### Process Improvements

| Item | Owner | Description |
|------|-------|-------------|
| P-001 | Scrum Master | Include decomposition assessment for stories > 2 days estimated |
| P-002 | Tech Lead | Create pre-flight script for story file structure verification |
| P-003 | Dev Team | Document "complete wiring" vs "placeholder" story boundaries |

### Technical Debt Tracking

| Item | Priority | Description |
|------|----------|-------------|
| TD-004 | P3 | Full domain extraction from master-data.ts (items, prices, etc.) |
| TD-005 | P3 | mysql2/Kysely wrapper comprehensive test coverage |

---

## Metrics

### Test Results

| Metric | Value |
|--------|-------|
| API Unit Tests | 711/711 passing (+19 from epic start) |
| Sync Route Tests | 8/8 passing |
| Type Check | ✅ Pass |
| Build | ✅ Pass |
| Lint | ✅ Pass |

### Code Changes

| Category | Count |
|----------|-------|
| Files Created | 12+ |
| Files Modified | 8+ |
| N+1 Fixes Applied | 3 |
| Review Rounds (Story 2.3) | 3 |

---

## Significant Discoveries

### Discovery 1: Shared Connection Concurrency Risk

**Finding**: Passing a single connection to concurrent `processSyncPushTransaction` calls creates undefined MySQL behavior.

**Resolution**: Each transaction acquires its own connection from the pool.

**Impact on Future**: Any batch processing with concurrency must use pool-based connection acquisition.

### Discovery 2: Tax Context Connection Blocking

**Finding**: Holding a connection for tax context across full sync processing starves the connection pool.

**Resolution**: Load tax context, release connection, then pass context to orchestrator.

**Impact on Future**: Context loading should always be separated from transaction processing.

### Discovery 3: Kysely Date Type Ambiguity

**Finding**: Kysely surfaces DATETIME columns as either `Date` objects or mysql2 strings depending on configuration.

**Resolution**: `toMySqlDateTime()` now accepts `Date | string` for API contract preservation.

**Impact on Future**: All date handling utilities must be polymorphic for Kysely compatibility.

---

## Next Epic Readiness

### Dependencies on Epic 2

Epic 3 (Master Data Domain Extraction) depends on:
- ✅ Sync pull master-data.ts extraction (Story 2.4)
- ✅ Kysely migration patterns established
- ✅ Layered architecture proven

### Preparation Required

| Task | Effort | Owner |
|------|--------|-------|
| Review master-data.ts remaining functions | 2h | Dev Team |
| Define domain boundary contracts | 4h | Tech Lead |
| Identify backoffice route dependencies | 2h | Dev Team |

### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| master-data.ts is 2829-line monolith | Medium | Extract incrementally, story per domain |
| Backoffice routes share CRUD functions | Medium | Keep shared functions in lib/master-data.ts temporarily |
| Domain extraction may break sync | Low | Sync already extracted to lib/sync/master-data.ts |

---

## Retrospective Conclusion

Epic 2 delivered significant architectural improvements:
1. **Established canonical layered architecture** for API routes
2. **Preserved offline-first guarantees** through careful idempotency handling
3. **Fixed critical performance issues** via batch query patterns
4. **Validated Kysely migration strategy** with clear boundaries

The team demonstrated strong code review discipline, catching a P0 concurrency bug before production. The primary learning is around estimation - large monolithic extractions require decomposition planning, not just migration effort estimates.

**Epic Status**: ✅ Complete and ready for Epic 3

---

*Retrospective conducted following BMAD retrospective workflow*  
*Document: epic-2.retrospective.md*
