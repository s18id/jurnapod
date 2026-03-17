# Story 4.9: Account Mapping Key INT Constants

**Epic:** Items & Catalog - Product Management  
**Status:** backlog -> ready-for-dev  
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
- [ ] Create `account_mapping_types` table with fixed seeds
- [ ] Add `mapping_type_id` to company/outlet mapping tables
- [ ] Backfill from `mapping_key`
- [ ] Add FK and unique indexes for ID-based constraints
- [ ] Keep migration rerunnable for MySQL + MariaDB

### 2. Shared Constants
- [ ] Add shared constants for mapping type IDs/codes in `packages/shared`
- [ ] Add helper conversion maps code <-> id

### 3. API and Service Migration
- [ ] Update sales posting mapping resolution to use IDs
- [ ] Update sync-push posting mapping resolution to use IDs
- [ ] Update COGS mapping resolution to use IDs
- [ ] Keep settings API payloads string-based for compatibility

### 4. Backoffice Compatibility
- [ ] Keep existing UI mapping key strings unchanged
- [ ] Ensure endpoints still return `mapping_key` strings

### 5. Testing
- [ ] Add migration tests/backfill verification
- [ ] Update affected unit/integration tests
- [ ] Verify no regression in posting flows and settings save/load

---

## Definition of Done

- [ ] Integer mapping type model implemented and seeded
- [ ] Existing mapping data successfully backfilled
- [ ] Posting and settings paths use shared constants + IDs internally
- [ ] API contract compatibility preserved
- [ ] Tests pass (unit + integration for touched areas)
- [ ] Story moved to `review` with evidence
