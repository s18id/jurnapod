# Epic 52: Datetime Standardization + Idempotency Hardening

## Context

The codebase has accumulated multiple inconsistent datetime handling patterns and idempotency models. This creates risk of:
- Wrong business time windows due to mixed DATETIME/BIGINT storage
- Duplicate financial posting from inconsistent idempotency enforcement
- Timezone mis-resolution (UTC fallback violations)
- Utility drift across duplicated conversion layers

## Standards Declared

| Standard | Rule |
|----------|------|
| Datetime storage | `BIGINT` Unix milliseconds (epoch ms) for all business timestamps |
| API boundary format | Epoch ms number for canonical fields; RFC3339 ISO string for display |
| Timezone resolution | `outlet.timezone` → `company.timezone` (no UTC fallback) |
| Idempotency | DB-atomic unique keys; `client_tx_id` for POS, `idempotency_key` for AP |
| Sync response semantics | `OK \| DUPLICATE \| ERROR` only (no alias status values) |
| Prohibited | Native `Date` in business logic; legacy alias fields in sync contracts |

## Scope

- `apps/api` + core packages (`packages/db`, `packages/shared`, `packages/auth`, `packages/modules/*`, `packages/pos-sync`, `packages/sync-core`)
- `apps/backoffice` and `apps/pos`: **frozen** except explicit emergency/regulatory/security exception
- Hard cutover after backfill (no permanent dual-read fallback)

## Stories

| Story | Title | Risk |
|-------|-------|------|
| 52-1 | Audit & Consolidate Datetime Utility Surface | P1 |
| 52-2 | Reservation `reservation_at` Legacy Fallback Removal | P0 |
| 52-3 | POS Server-Side Timestamp Alignment | P1 |
| 52-4 | Fiscal Close Idempotency DB-Atomic Hardening | P0 |
| 52-5 | AP Idempotency Key Standardization | P1 |
| 52-6 | Sync Contract: Standardize OK/DUPLICATE/ERROR Semantics | P0 |
| 52-7 | Sync Idempotency: Duplicate vs Error Differentiation | P0 |
| 52-8 | AP Payment + Journal Atomicity Verification | P0 |
| 52-9 | Observability: Idempotency Metrics | P2 |
| 52-10 | Integration Test Gate: End-to-End Idempotency Proof Suite | P0 |

## Success Criteria

1. All datetime conversions use single canonical surface in `packages/shared`
2. All business timestamp fields use `BIGINT` epoch ms storage
3. All idempotency mechanisms use DB-atomic unique keys
4. All sync responses use `OK | DUPLICATE | ERROR` only
5. Hard cutover completed for reservation timestamps (no `reservation_at` write paths)
6. Integration test suite proves zero duplicate financial effects
7. Observability metrics track idempotency outcomes per tenant

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Duplicate financial posting on retries/races | P0 | DB unique keys + transactional writes |
| Tenant scope missing in idempotency key | P0 | Composite unique keys include company_id |
| Timezone mis-resolution (UTC fallback) | P1 | Strict outlet→company resolution; explicit tests |
| Backfill parity gaps silently ignored | P1 | Hard gate with parity report; zero tolerance |
| Contract drift across API/shared packages | P2 | Shared Zod contracts; CI contract checks |
| Migration non-portable SQL | P2 | Guarded DDL via information_schema |