# Story 2.4: Sync Pull Kysely Migration

Status: done

## Story

As a **Jurnapod developer**,
I want **the sync pull process migrated to Kysely**,
So that **POS master data queries use type-safe queries**.

## Context

This story follows Story 2.2 (layered architecture). The sync pull data building logic (`buildSyncPullPayload`) is extracted to `lib/sync/master-data.ts` and migrated to Kysely.

**Scope decision (Synthesis from Party Mode):**
- `master-data.ts` is a 2829-line monolith serving DUAL purposes: (A) POS sync-pull and (B) backoffice CRUD
- This story handles ONLY the sync-pull portion: extracting `buildSyncPullPayload` + its helper SELECTs to `lib/sync/master-data.ts`
- Full domain extraction (items → `lib/items/`, prices → `lib/item-prices/`, etc.) is deferred to TD-004 (Story 2.10)

## Functions Extracted from `master-data.ts` → `lib/sync/master-data.ts`

| Function | Lines | Type | Purpose |
|----------|-------|------|---------|
| `buildSyncPullPayload` | 2593-2680 | READ | Sync payload assembly — calls all helpers |
| `getCompanyDataVersion` | 2508-2519 | READ | Gets current sync data version |
| `readSyncConfig` (internal) | 2521-2546 | READ | Reads company modules + feature flags |
| `readOpenOrderSyncPayload` (internal) | 2548-2591 | READ | Reads open order snapshots |
| `listOutletTables` | 778-788 | READ | Lists outlet tables for POS |
| `listActiveReservations` | 790-803 | READ | Lists active reservations |
| `listItems` | 742-758 | READ | Lists items for company |
| `listEffectiveItemPricesForOutlet` | 1498-1551 | READ | Effective prices for POS (complex JOINs — preserves raw SQL) |
| `listItemGroups` | 760-776 | READ | Lists item groups |

**NOT extracted** (stay in `master-data.ts` for backoffice CRUD):
- All `create*`, `update*`, `delete*` functions
- All `find*` functions (used by backoffice routes)
- `listItemPrices` (backoffice price listing)
- All supply and fixed-asset functions

## Acceptance Criteria

1. **AC1: Module Extraction**
   - Given the `master-data.ts` monolith
   - When `buildSyncPullPayload` and its helper SELECTs are extracted
   - Then they live in `lib/sync/master-data.ts`
   - And the HTTP route `routes/sync/pull.ts` imports from `lib/sync/master-data.ts`

2. **AC2: Kysely Migration (Simple SELECTs)**
   - Given the extracted helpers in `lib/sync/master-data.ts`
   - When migrated to Kysely
   - Then `listOutletTables`, `listActiveReservations`, `listItems`, `listItemGroups`, `getCompanyDataVersion` use Kysely query builder
   - And `readSyncConfig` uses Kysely for module lookup (raw SQL for feature flags)
   - And `readOpenOrderSyncPayload` preserves raw SQL (complex snapshot queries — consistent with AC3)

3. **AC3: Raw SQL Preserved for Complex Aggregations**
   - Given `listEffectiveItemPricesForOutlet` has complex JOIN + COALESCE logic
   - Then it preserves raw SQL (migration deferred to TD-004)
   - And `buildSyncPullPayload` still calls it correctly

4. **AC4: Test Validation**
   - Given migration is complete
   - When tests run
   - Then `npm run test:unit -w @jurnapod/api` passes (sync pull tests)
   - And `npm run typecheck -w @jurnapod/api` passes
   - And `npm run lint -w @jurnapod/api` passes
   - And payload shape is regression-tested

## Tasks / Subtasks

- [x] **Task 1: Extract sync helpers to `lib/sync/master-data.ts`**
  - [x] 1.1 Create `lib/sync/master-data.ts` with `buildSyncPullPayload` + helper functions
  - [x] 1.2 Copy `getCompanyDataVersion`, `readSyncConfig`, `readOpenOrderSyncPayload` from `lib/master-data.ts`
  - [x] 1.3 Copy `listOutletTables`, `listActiveReservations`, `listItems`, `listItemGroups` from `lib/master-data.ts`
  - [x] 1.4 Copy `listEffectiveItemPricesForOutlet` from `lib/master-data.ts` (preserves raw SQL)
  - [x] 1.5 Update `routes/sync/pull.ts` and `lib/sync/pull/index.ts` to import from `lib/sync/master-data.ts`

- [x] **Task 2: Migrate simple SELECTs to Kysely**
  - [x] 2.1 Migrate `listOutletTables` to Kysely SELECT
  - [x] 2.2 Migrate `listActiveReservations` to Kysely SELECT
  - [x] 2.3 Migrate `listItems` to Kysely SELECT
  - [x] 2.4 Migrate `listItemGroups` to Kysely SELECT
  - [x] 2.5 Migrate `getCompanyDataVersion` to Kysely SELECT
  - [x] 2.6 Migrate `readSyncConfig` to Kysely SELECTs (module lookup via Kysely, feature flags via raw SQL)

- [x] **Task 3: Preserve raw SQL for complex aggregations**
  - [x] 3.1 Keep `listEffectiveItemPricesForOutlet` as raw SQL (complex LEFT JOIN + COALESCE)
  - [x] 3.2 Keep `readOpenOrderSyncPayload` as raw SQL (snapshot/line snapshot queries)

- [x] **Task 4: Update `lib/master-data.ts` imports if needed**
  - [x] 4.1 Ensure `lib/master-data.ts` still exports functions used by backoffice routes
  - [x] 4.2 No changes to CRUD functions in `lib/master-data.ts`

- [x] **Task 5: Regression test sync payload shape**
  - [x] 5.1 Verify `buildSyncPullPayload` output structure unchanged (via existing unit tests)
  - [x] 5.2 Run full API unit test suite (692 tests pass)

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/lib/sync/master-data.ts` | Extracted sync helpers + buildSyncPullPayload |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/sync/pull.ts` | Modify | Update import from `lib/master-data.ts` to `lib/sync/master-data.ts` |
| `apps/api/src/lib/sync/pull/index.ts` | Modify | Update import from `lib/master-data.ts` to `lib/sync/master-data.ts` |

## Dependencies

- Story 2.2 (Sync Pull Layered Architecture)

## Estimated Effort

0.5 days

## Risk Level

Low (master data distribution, no financial side effects)

## Dev Agent Record

### Debug Log

**Key technical decisions:**

1. **Connection management for Kysely**: Each Kysely query function (`listItems`, `listItemGroups`, `listOutletTables`, `listActiveReservations`, `getCompanyDataVersion`) acquires a connection from the pool, uses it, then releases it in a `finally` block. This mirrors the pattern used in `newKyselyConnection` — each query gets its own short-lived connection.

2. **readSyncConfig connection scoping**: `readSyncConfig` acquires a single connection and uses it for BOTH the Kysely module lookup AND the raw SQL tax rate queries. This is more efficient than acquiring separate connections.

3. **Date handling for reservation_at (P1 review fix)**: Kysely may surface DATETIME columns as either `Date` objects or mysql2 date strings, but the `SyncPullPayload` schema expects a MySQL DATETIME string. `toMySqlDateTime()` now accepts `Date | string`, preserving the original sync contract for POS clients.

4. **Type safety for normalizers**: Since Kysely returns plain objects (not `RowDataPacket`), the normalizers were inlined within each query function rather than trying to cast through `RowDataPacket`. This avoids the `RowDataPacket` constructor.name type incompatibility.

5. **readSyncConfig structure preserved**: Kysely for `company_modules` lookup, raw SQL for `feature_flags` legacy query and tax rate helpers.

6. **readOpenOrderSyncPayload kept as raw SQL**: Intentionally preserved as raw SQL (per AC3). Complex multi-table snapshot queries with JOINs would not benefit from Kysely migration at this stage.

### Post-Completion Bug Fix

**Critical source-level issues found and fixed:**

1. `packages/db/src/connection-kysely.ts` still had the old Promise-only wrapper in source, while the built `dist/` output had the callback compatibility fix.
2. `apps/api/src/routes/sync/pull.ts` still imported `../../lib/master-data.js` instead of `../../lib/sync/master-data.js`.

**Kysely/mysql2 compatibility fix:**

- `newKyselyConnection` now supports both `getConnection()` and `getConnection(callback)`
- the wrapper now passes Kysely the underlying mysql2 callback connection via `connection.connection`
- `query` and `execute` are forwarded to the raw callback connection
- `end(callback?)` also supports both callback and Promise forms

### Completion Notes

**Story 2.4 complete (after source fixes and re-review).** All acceptance criteria met:

- ✅ AC1: `buildSyncPullPayload` + helpers extracted to `lib/sync/master-data.ts`, and `routes/sync/pull.ts` now imports from `lib/sync/master-data.ts`
- ✅ AC2: Simple SELECTs migrated to Kysely (`listItems`, `listItemGroups`, `listOutletTables`, `listActiveReservations`, `getCompanyDataVersion`, `readSyncConfig` module lookup); `readOpenOrderSyncPayload` preserved as raw SQL
- ✅ AC3: Complex aggregations preserved as raw SQL (`listEffectiveItemPricesForOutlet`, `readOpenOrderSyncPayload`)
- ✅ AC4: Regression tests pass, full API test suite passes, typecheck/build/lint clean

**Files created:**
- `apps/api/src/lib/sync/master-data.ts` — extracted + migrated sync pull helpers
- `apps/api/src/lib/master-data.sync-regression.test.ts` — regression coverage for payload shape and timestamp format

**Files modified:**
- `packages/db/src/connection-kysely.ts` — callback-compatible pool wrapper for Kysely
- `apps/api/src/routes/sync/pull.ts` — import corrected to `lib/sync/master-data.ts`
- `apps/api/src/lib/sync/pull/index.ts` — updated import

**Validation after re-review fixes:**
- `timeout 20s npm run test:single apps/api/src/lib/master-data.sync-regression.test.ts` → **19/19 pass**
- `timeout 60s npm run typecheck -w @jurnapod/api` → **pass**
- `timeout 60s npm run build -w @jurnapod/api` → **pass**
- `timeout 60s npm run lint -w @jurnapod/api` → **pass**
- `timeout 180s npm run test:unit -w @jurnapod/api` → **711/711 pass**

### AI Review

- Review date: 2026-03-25
- Reviewer: BMAD Code Review workflow
- Final result: **Clean after fixes**
- Findings remaining: **0 P0/P1, 0 P2, 0 P3**

**Architecture note:** `lib/master-data.ts` still exists with all CRUD functions + shared read helpers. Full domain extraction deferred to TD-004 (Story 2.10).
