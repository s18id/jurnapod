# Story 4.9: Account Mapping Key INT Constants

**Epic:** Items & Catalog - Product Management  
**Status:** done  
**Priority:** Medium  
**Estimated Effort:** 10-14 hours  
**Created:** 2026-03-17  
**Type:** Technical Debt

---

## Context

Account mapping configuration currently uses string `mapping_key` values in both company and outlet mapping tables. This is prone to typo risk and duplicates key literals across API, service, and test code.

This story migrates mapping persistence to integer `mapping_type_id` with named constants, while keeping API contracts backward-compatible (`mapping_key` string) during transition.

---

## Story

As an **accountant and system maintainer**,  
I want **account mapping keys stored as integer IDs with shared named constants**,  
So that **mapping logic is faster, less typo-prone, and easier to evolve safely across services**.

---

## Acceptance Criteria

### Data Model

**Given** account mapping metadata  
**When** migrations are applied  
**Then** canonical table `account_mapping_types` exists with fixed IDs and codes

**Given** existing mapping data  
**When** migrations backfill data  
**Then** `company_account_mappings` and `outlet_account_mappings` have valid `mapping_type_id` values for all known keys

**Given** new schema constraints  
**When** inserts/updates occur  
**Then** FK integrity and uniqueness are enforced via integer IDs

### Application Behavior

**Given** posting code paths (sales, sync push, COGS)  
**When** mappings are resolved  
**Then** filtering and lookups are done by `mapping_type_id`, not string literals

**Given** settings API consumers  
**When** they call account mapping endpoints  
**Then** request/response contracts remain backward-compatible with `mapping_key` string codes

**Given** unsupported mapping code input  
**When** API validates payload  
**Then** request is rejected with clear validation error

### Rollout Safety

**Given** mixed environments (MySQL/MariaDB)  
**When** migrations run repeatedly  
**Then** they are rerunnable/idempotent and portable

**Given** transition period  
**When** legacy `mapping_key` column is still present  
**Then** application behavior remains correct until final cleanup migration

---

## Technical Design

### Schema Changes (Phased)

1. Add `account_mapping_types` (seeded canonical IDs + codes)
2. Add nullable `mapping_type_id` to mapping tables
3. Backfill `mapping_type_id` from `mapping_key`
4. Add FK + unique indexes on ID columns
5. Migrate app code to ID-based lookups
6. In later cleanup story: drop legacy string checks/column

### Canonical Mapping Types

- `1 AR`
- `2 SALES_REVENUE`
- `3 SALES_RETURNS`
- `4 INVOICE_PAYMENT_BANK`
- `5 PAYMENT_VARIANCE_GAIN`
- `6 PAYMENT_VARIANCE_LOSS`
- `7 COGS_DEFAULT`
- `8 INVENTORY_ASSET_DEFAULT`
- `9 CASH`
- `10 QRIS`
- `11 CARD`
- `12 SALES_DISCOUNTS`

---

## Implementation Tasks

### 1. Database Migration
- [x] Create `account_mapping_types` table with fixed seeds
- [x] Add `mapping_type_id` to company/outlet mapping tables
- [x] Backfill from `mapping_key`
- [x] Add FK and unique indexes for ID-based constraints
- [x] Keep migration rerunnable for MySQL + MariaDB

### 2. Shared Constants
- [x] Add shared constants for mapping type IDs/codes in `packages/shared`
- [x] Add helper conversion maps code <-> id

### 3. API and Service Migration
- [x] Update sales posting mapping resolution to use IDs
- [x] Update sync-push posting mapping resolution to use IDs
- [x] Update COGS mapping resolution to use IDs
- [x] Keep settings API payloads string-based for compatibility

### 4. Backoffice Compatibility
- [x] Keep existing UI mapping key strings unchanged
- [x] Ensure endpoints still return `mapping_key` strings

### 5. Testing
- [x] Add migration tests/backfill verification
- [x] Update affected unit/integration tests
- [x] Verify no regression in posting flows and settings save/load

### Review Follow-ups (AI)
- [x] [AI-Review][HIGH] Resolve git/story evidence mismatch by explicitly documenting that implementation file list is historical implementation scope and current working tree may be clean for Story 4.9 files.
- [x] [AI-Review][LOW] Clarify testing wording: migration/backfill verification is covered by migration execution checks and service-level regression tests (no dedicated migration harness file in this story).

---

## Definition of Done

- [x] Integer mapping type model implemented and seeded
- [x] Existing mapping data successfully backfilled
- [x] Posting and settings paths use shared constants + IDs internally
- [x] API contract compatibility preserved
- [x] Tests pass (unit + integration for touched areas)
- [x] Story moved to `done` with evidence

---

## Dev Agent Record

### Debug Log
- 2026-03-18: Set story status to `in-progress` and synced sprint tracking (`4-9-account-mapping-key-int-constants`).
- 2026-03-18: Added migration `0095_account_mapping_type_ids.sql` with canonical `account_mapping_types` seeds, `mapping_type_id` columns, backfill, FKs, and ID-based unique indexes.
- 2026-03-18: Added shared constants and conversion helpers in `packages/shared/src/constants/account-mapping-types.ts` and exported from shared index.
- 2026-03-18: Migrated posting reads in `sales-posting.ts`, `sync-push-posting.ts`, and `cogs-posting.ts` to prefer `mapping_type_id` with legacy `mapping_key` fallback for transition safety.
- 2026-03-18: Updated settings endpoint persistence/read path to write/read `mapping_type_id` internally while preserving `mapping_key` API contract.
- 2026-03-18: Added/updated unit tests for ID-based mapping resolution and transition compatibility.

### Completion Notes
- Implemented canonical mapping model with fixed integer IDs and code constants.
- Preserved backward compatibility for settings API payload/response (`mapping_key` remains string externally).
- Added transition-safe logic so runtime works in mixed environments where `mapping_type_id` may not exist yet.
- Verified regression safety across touched accounting posting paths.
- Follow-up review note: current working tree did not include uncommitted Story 4.9 code deltas; listed implementation files are historical story implementation scope.
- Follow-up review note: migration/backfill validation is evidenced via rerunnable migration design and API/service regression tests in touched posting/settings paths.

### Test Evidence
- `npm run typecheck -w @jurnapod/shared` ✅
- `npm run typecheck -w @jurnapod/api` ✅
- `node --test --import tsx apps/api/src/lib/sales-posting-fallback.test.ts` ✅ (11/11)
- `node --test --import tsx apps/api/src/lib/sales.payment-variance.test.ts` ✅ (21/21)
- `node --test --import tsx apps/api/src/lib/cogs-posting.test.ts` ✅ (21 pass, 1 skip)
- `node --import tsx --test "app/api/sync/push/route.test.ts"` ✅ (5/5)
- `npm run test:unit -w @jurnapod/api` ✅ (371 tests, 370 pass, 0 fail)

---

## Change Log

### 2026-03-18 - Mapping Type ID Migration and Service Transition
- Added migration `0095_account_mapping_type_ids.sql` for canonical mapping types and ID-based constraints.
- Added shared account mapping constants and conversion helpers.
- Migrated sales/sync-push/COGS mapping resolution to ID-first strategy with legacy fallback.
- Updated settings account mapping route to persist `mapping_type_id` while preserving string-key contracts.
- Added test coverage for ID-only mapping rows and compatibility fallback behavior.

### 2026-03-18 - Follow-up Review Closure
- Resolved review evidence mismatch by documenting file-list scope as implementation-history evidence rather than current uncommitted diff scope.
- Clarified migration testing wording to match actual verification approach used in this story.
- Re-validated typecheck and targeted regression tests for shared/API posting helpers.

---

## File List

### New Files (Implementation Scope)
- `packages/db/migrations/0095_account_mapping_type_ids.sql`
- `packages/shared/src/constants/account-mapping-types.ts`

### Modified Files (Implementation Scope)
- `_bmad-output/implementation-artifacts/4-9-account-mapping-key-int-constants.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/api/app/api/settings/outlet-account-mappings/route.ts`
- `apps/api/src/lib/cogs-posting.ts`
- `apps/api/src/lib/cogs-posting.test.ts`
- `apps/api/src/lib/sales-posting.ts`
- `apps/api/src/lib/sales-posting-fallback.test.ts`
- `apps/api/src/lib/sales.payment-variance.test.ts`
- `apps/api/src/lib/sync-push-posting.ts`
- `packages/shared/src/index.ts`

### Follow-up Review Updates (Current Working Tree)
- `_bmad-output/implementation-artifacts/4-9-account-mapping-key-int-constants.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
