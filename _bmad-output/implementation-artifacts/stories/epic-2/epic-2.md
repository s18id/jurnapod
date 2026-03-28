# Epic 2: Sync Routes & POS Offline-First

**Status:** Done  
**Theme:** Sync push/pull layered architecture and POS offline-first support  
**Dependencies:** Epic 1 (Kysely patterns established)  
**Completed:** 2026-03-28  
**Stories:** 9/9 (100%)

---

## Summary

Epic 2 successfully delivered the sync push/pull layered architecture migration and fixed three critical N+1 query performance issues in COGS and recipe composition flows. The epic established the canonical Option A (Route + Lib) architecture pattern that separates HTTP handling from business logic, validated Kysely migration strategies for offline-first operations, and eliminated significant performance bottlenecks.

---

## Goals

1. **Layered Architecture**: Separate sync routes into thin HTTP layers and business logic modules with zero HTTP knowledge
2. **Kysely Migration**: Migrate sync push/pull to Kysely while preserving idempotency via `client_tx_id`
3. **N+1 Query Fixes**: Eliminate query multiplication in COGS posting, COGS calculation, and recipe composition
4. **Offline-First Preservation**: Maintain POS sync idempotency and conflict resolution guarantees

---

## Stories

| Story | Description | Status | Key Achievement |
|-------|-------------|--------|-----------------|
| 2.1 | Sync Push Layered Architecture | Done | Established Route + Lib pattern for push route |
| 2.2 | Sync Pull Layered Architecture | Done | Established Route + Lib pattern for pull route |
| 2.3 | Sync Push Kysely Migration | Done | Full migration with per-transaction connection ownership |
| 2.4 | Sync Pull Kysely Migration | Done | Simple SELECTs migrated, complex queries preserved as raw SQL |
| 2.5 | Reports Routes Migration | Done | Kysely for data retrieval, raw SQL for GL aggregations |
| 2.6 | TD-001 COGS Posting N+1 Fix | Done | Batch item account lookup (N queries → 1 query) |
| 2.7 | TD-002 COGS Calculation N+1 Fix | Done | Batch inventory lookup (2N queries → 2 batch queries) |
| 2.8 | TD-003 Recipe Composition N+1 Fix | Done | Batch ingredient cost resolution (N queries → 1 query) |
| 2.9 | Epic 2 Documentation | Done | ADR-0009 updated with patterns and lessons |

---

### Story 2.1: Sync Push Layered Architecture

**Status:** Done  
**Description:** Separate sync push route into HTTP handling (`routes/sync/push/route.ts`) and business logic (`lib/sync/push/`).

**Acceptance Criteria:**
- Route.ts is thin HTTP layer (routing, auth, parsing, response shaping)
- lib/ modules have zero HTTP knowledge (plain params, typed results)
- lib/index.ts orchestrates transactions, orders, idempotency modules
- All 692 tests pass

**Files Created:**
- `apps/api/src/lib/sync/push/types.ts`
- `apps/api/src/lib/sync/push/idempotency.ts`
- `apps/api/src/lib/sync/push/stock.ts`
- `apps/api/src/lib/sync/push/orders.ts`
- `apps/api/src/lib/sync/push/transactions.ts`
- `apps/api/src/lib/sync/push/index.ts`
- `apps/api/src/routes/sync/push/route.ts`

---

### Story 2.2: Sync Pull Layered Architecture

**Status:** Done  
**Description:** Separate sync pull route into HTTP handling and business logic layers.

**Acceptance Criteria:**
- route.ts is thin HTTP layer
- lib/sync/pull/master-data.ts contains data building logic
- lib/sync/pull/index.ts orchestrates with audit lifecycle
- All tests pass

**Files Created:**
- `apps/api/src/lib/sync/pull/types.ts`
- `apps/api/src/lib/sync/pull/index.ts`
- `apps/api/src/routes/sync/pull/route.ts`

---

### Story 2.3: Sync Push Kysely Migration

**Status:** Done  
**Description:** Migrate sync push process modules to Kysely while preserving offline-first guarantees.

**Acceptance Criteria:**
- Transactions module uses Kysely for SELECTs, raw SQL for complex writes
- Orders module migrated with INSERT ... ON DUPLICATE KEY UPDATE patterns
- Idempotency batch check uses `WHERE client_tx_id IN (...)`
- Per-transaction connection ownership (no shared connection concurrency bugs)

**Key Technical Achievements:**
- Fixed P0 bug: shared-connection concurrency risk eliminated
- Batch idempotency check: O(1) batch query instead of N individual lookups
- Tax context connection released before orchestration (pool efficiency)

**Files Modified:**
- `apps/api/src/lib/sync/push/idempotency.ts`
- `apps/api/src/lib/sync/push/transactions.ts`
- `apps/api/src/lib/sync/push/orders.ts`
- `apps/api/src/lib/sync/push/types.ts`
- `apps/api/src/lib/sync/push/index.ts`
- `apps/api/src/routes/sync/push.ts`

---

### Story 2.4: Sync Pull Kysely Migration

**Status:** Done  
**Description:** Extract sync pull helpers to `lib/sync/master-data.ts` and migrate simple SELECTs to Kysely.

**Acceptance Criteria:**
- `buildSyncPullPayload` extracted from monolith
- Simple SELECTs migrated: `listItems`, `listItemGroups`, `listOutletTables`, `listActiveReservations`
- Complex queries preserved: `listEffectiveItemPricesForOutlet`, `readOpenOrderSyncPayload`
- All sync pull tests pass

**Files Created:**
- `apps/api/src/lib/sync/master-data.ts`
- `apps/api/src/lib/master-data.sync-regression.test.ts`

**Files Modified:**
- `packages/db/src/connection-kysely.ts` (callback compatibility fix)
- `apps/api/src/routes/sync/pull.ts`
- `apps/api/src/lib/sync/pull/index.ts`

---

### Story 2.5: Reports Routes Migration

**Status:** Done  
**Description:** Migrate reports routes to Kysely for data retrieval while preserving raw SQL for GL aggregations.

**Acceptance Criteria:**
- Account lookups use Kysely
- GL aggregation queries preserved as raw SQL
- Trial balance, P&L, balance sheet endpoints migrated
- All tests pass

**Files Modified:**
- `apps/api/src/lib/reports.ts`

---

### Story 2.6: TD-001 COGS Posting N+1 Fix

**Status:** Done  
**Description:** Fix N+1 query pattern in COGS posting item account lookups.

**Acceptance Criteria:**
- Batch item account lookup replaces per-item queries
- Same behavior preserved (item-specific → default fallback)
- All COGS posting tests pass

**Technical Change:**
- Before: N queries for N items
- After: 1 batch query + Map lookup

**Files Modified:**
- `apps/api/src/lib/cogs-posting.ts`
- `apps/api/src/lib/cogs-posting.test.ts`

---

### Story 2.7: TD-002 COGS Calculation N+1 Fix

**Status:** Done  
**Description:** Fix N+1 query pattern in COGS calculation inventory lookups.

**Acceptance Criteria:**
- Batch inventory lookup replaces per-item queries
- Fallback price lookup also batched
- Same COGS calculation behavior preserved

**Technical Change:**
- Before: Up to 2N queries for N items
- After: 2 batch queries + Map lookups

**Files Modified:**
- `apps/api/src/lib/cogs-posting.ts`
- `apps/api/src/lib/cogs-posting.test.ts`

---

### Story 2.8: TD-003 Recipe Composition N+1 Fix

**Status:** Done  
**Description:** Fix N+1 query pattern in recipe composition ingredient cost resolution.

**Acceptance Criteria:**
- Batch ingredient cost resolution replaces per-ingredient queries
- Same recipe cost calculation behavior preserved
- All recipe composition tests pass

**Technical Change:**
- Before: N queries for N ingredients
- After: 1 batch query + Map lookup

**Files Modified:**
- `apps/api/src/lib/recipe-composition.ts`
- `apps/api/src/lib/recipe-composition.test.ts`

---

### Story 2.9: Epic 2 Documentation

**Status:** Done  
**Description:** Document Epic 2 lessons in ADR-0009 and epic summary.

**Acceptance Criteria:**
- ADR-0009 updated with sync patterns
- Offline-first batch upsert patterns documented
- N+1 batch fetch patterns documented
- Epic 2 summary added to planning artifacts

**Files Modified:**
- `docs/adr/ADR-0009-kysely-type-safe-query-builder.md`
- `_bmad-output/planning-artifacts/epics.md`

---

## Acceptance Criteria

### AC1: Layered Architecture
- [x] Sync push route follows Route + Lib pattern
- [x] Sync pull route follows Route + Lib pattern
- [x] Business logic modules have zero HTTP knowledge

### AC2: Kysely Migration
- [x] Sync push uses Kysely for SELECTs, raw SQL for financial-critical writes
- [x] Sync pull simple queries migrated, complex queries preserved
- [x] Reports routes use Kysely for retrieval, raw SQL for aggregations

### AC3: N+1 Query Fixes
- [x] TD-001: COGS posting batch lookup implemented
- [x] TD-002: COGS calculation batch lookup implemented
- [x] TD-003: Recipe composition batch lookup implemented

### AC4: Offline-First Preservation
- [x] `client_tx_id` idempotency preserved
- [x] Batch idempotency check implemented
- [x] Per-transaction connection ownership established

---

## Outcomes

### Completed Deliverables

| Deliverable | Description | Status |
|-------------|-------------|--------|
| Sync Push Architecture | Layered architecture for push route | Done |
| Sync Pull Architecture | Layered architecture for pull route | Done |
| Kysely Migration | Type-safe queries for simple operations | Done |
| N+1 Fixes | 3 technical debt items eliminated | Done |
| ADR-0009 Update | Patterns documented | Done |

### Quality Metrics

| Metric | Value |
|--------|-------|
| Stories Completed | 9/9 (100%) |
| Tests Passing | 711/711 (100%) (+19 from epic start) |
| Type Check | Pass |
| Build | Pass |
| Lint | Pass |
| Production Incidents | 0 |
| N+1 Query Fixes | 3 |

---

## Key Patterns Established

### 1. Route + Lib Architecture (Option A)

```
apps/api/src/
├── lib/sync/push/
│   ├── types.ts      # Shared types (zero HTTP knowledge)
│   ├── idempotency.ts
│   ├── stock.ts
│   ├── orders.ts
│   ├── transactions.ts
│   └── index.ts      # Orchestrator
└── routes/sync/push/
    └── route.ts      # HTTP thin layer only
```

### 2. Per-Transaction Connection Ownership

```typescript
// Each transaction gets its own connection
const connection = await dbPool.getConnection();
try {
  await processTransaction(connection);
} finally {
  connection.release();
}
```

### 3. Batch Idempotency Check

```typescript
const clientTxIds = transactions.map(tx => tx.client_tx_id);
const existing = await db.kysely
  .selectFrom('pos_transactions')
  .where('client_tx_id', 'in', clientTxIds)
  .where('company_id', '=', companyId)
  .execute();
```

### 4. Batch Fetch Pattern (N+1 Fix)

```typescript
// 1. Collect all IDs
const ids = items.map(i => i.id);

// 2. Single batch query
const rows = await kysely.selectFrom('table')
  .where('id', 'in', ids)
  .execute();

// 3. Build Map for O(1) lookup
const lookup = new Map(rows.map(r => [r.id, r]));
```

### 5. Kysely vs Raw SQL Boundaries

**Use Kysely:**
- Simple SELECT with WHERE clauses
- Account lookups, list operations
- asOfId subqueries

**Preserve Raw SQL:**
- INSERT with dynamic batch values
- SUM/GROUP BY aggregations
- Financial-critical operations (stock deduction, COGS posting)
- Complex multi-table JOINs

---

## Dependencies

| Dependency | Epic | Status | Notes |
|------------|------|--------|-------|
| Kysely Patterns | Epic 1 | Done | Journals/account-types migration validated patterns |
| DbClient Integration | Epic 0 | Done | Connection pooling infrastructure |

---

## Lessons Learned

### Technical Lessons

1. **Per-entity transaction scoping**: Each process module manages its own transaction scope — partial failures are explicit
2. **Connection lifecycle matters**: Holding connections across full sync processing starves the pool
3. **Kysely date type ambiguity**: DATETIME columns may surface as Date or string — utilities must be polymorphic

### Process Lessons

1. **Large monolithic functions require decomposition estimates**: Story 2.3 took ~3 days vs 1.5 estimated
2. **Placeholder implementations spanning stories create debt**: Avoid partial wiring
3. **Pre-flight file verification**: Story 2.5 spec referenced non-existent files

---

## Risks Encountered

| Risk | Severity | Status | Mitigation |
|------|----------|--------|------------|
| Shared-connection concurrency | P0 | Resolved | Each transaction acquires own connection |
| Snapshot line handling complexity | P1 | Resolved | processActiveOrders fully migrated |
| mysql2/Kysely compatibility | P2 | Resolved | Callback-compatible pool wrapper |

---

## Next Epic Preparation

**Epic 3:** Master Data Domain Extraction

**Epic 2 Enables:**
- Sync master-data extraction (lib/sync/master-data.ts already extracted)
- Kysely migration patterns proven for domain modules
- Layered architecture pattern established

---

## Retrospective Reference

Full retrospective available at: `epic-2.retrospective.md`

---

## Definition of Done Verification

- [x] All Acceptance Criteria implemented with evidence
- [x] No known technical debt (N+1 fixes complete)
- [x] Code follows repo-wide operating principles
- [x] No breaking changes without cross-package alignment
- [x] Unit tests written and passing (711 tests)
- [x] Error path/happy path testing completed
- [x] Code review completed (3 rounds on Story 2.3)
- [x] AI review conducted
- [x] ADR updated with patterns
- [x] API contracts preserved
- [x] Feature is deployable
- [x] Completion evidence documented

---

*Epic 2 completed successfully. Ready for Epic 3.*
