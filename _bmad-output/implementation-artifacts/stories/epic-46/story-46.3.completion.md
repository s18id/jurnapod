# Story 46.3 — Purchase Orders CRUD — Completion Report

## Story
**ID:** 46.3
**Title:** Purchase Orders CRUD
**Epic:** 46 — Purchasing / Accounts Payable Module
**Status:** ✅ DONE

## Implementation Summary

### What was built

Full Purchase Orders CRUD API with:

1. **Database schema** (`migrations/0172`, `0173`):
   - `purchase_orders` table with tinyint status, tenant-scoped (company_id + outlet_id)
   - `purchase_order_lines` table with foreign key to PO, unit price as DECIMAL(19,4)
   - ACL entries for `purchasing.orders` across all 6 roles

2. **Shared constants** (`packages/shared/src/constants/purchasing.ts`):
   - Status codes: DRAFT(10), SENT(20), PARTIAL_RECEIVED(30), RECEIVED(40), CLOSED(50)
   - Label mapping and code-from-label utility
   - Re-exported in `packages/shared/src/index.ts`

3. **API routes** (`apps/api/src/routes/purchasing/purchase-orders.ts`):
   - `POST /purchasing/orders` — transactional create with item validation
   - `GET /purchasing/orders` — paginated list with date range filter
   - `GET /purchasing/orders/:id` — single PO with lines
   - `PATCH /purchasing/orders/:id` — full-line replacement + total recomputation
   - `DELETE /purchasing/orders/:id` — hard delete (only DRAFT status)

4. **Business rules enforced**:
   - Status transitions: DRAFT→SENT (unlocked), SENT→CLOSED (unlocked), SENT/PARTIAL_RECEIVED→RECEIVED blocked unless all lines fully received
   - Receipt-aware gating: RECEIVED transition requires every PO line to have `received_qty >= qty`
   - Delete: only DRAFT POs
   - Item validation: `item_id` existence + tenant ownership verified inside transaction

### Critical decisions made

| Decision | Rationale |
|----------|-----------|
| Status as TINYINT not ENUM | Project standard for state/status columns |
| BigInt scaled arithmetic for monetary math | Avoids floating-point rounding errors |
| PATCH full-line replacement, not partial line edits | Simpler, AC2 requirement |
| Empty `lines: []` rejected via Zod schema | Zod parses before route; non-array rejected by `.min(1)` |
| FK constraints deferred to app-layer | Production DB type mismatch needs separate investigation |

## Test Results

| Suite | Tests | Passed | Duration |
|-------|-------|--------|----------|
| Purchase Orders (`purchase-orders.test.ts`) | 27 | ✅ 27/27 | 9.15s |
| Exchange Rates (`exchange-rates.test.ts`) | 26 | ✅ 26/26 | 6.88s |
| **Total** | **53** | **✅ 53/53** | **~16s** |

### Key test coverage

- Create with valid items and computed total_amount
- 404 on non-existent item_id (create and PATCH both)
- Transaction rollback on failed item validation
- PATCH replaces lines and recomputes total_amount
- PATCH rejects empty lines array (400)
- Status transitions blocked when receipt conditions not met (SENT→RECEIVED, PARTIAL_RECEIVED→RECEIVED)
- Unlocked transitions pass (DRAFT→SENT, SENT→CLOSED)
- Delete only on DRAFT (400 on non-DRAFT)
- Auth and ACL enforced

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| AC1 | Create PO with line items, auto-computed total | ✅ |
| AC2 | Line item mutations via PATCH (full replacement) | ✅ |
| AC3 | Status transitions (DRAFT↔SENT↔CLOSED) | ✅ |
| AC4 | Receipt-aware status gating | ✅ |
| AC5 | PO status reflects GR progress via GR integration | ✅ (validated with Story 46.4 tests) |

> **Update:** Story 46.4 is completed; GR now increments `received_qty` and exercises PO status progression end-to-end.

## Files Created/Modified

### Created
- `packages/db/migrations/0172_purchase_orders.sql`
- `packages/db/migrations/0173_acl_purchasing_orders.sql`
- `packages/db/migrations/0174_purchase_orders_status_tinyint.sql`
- `packages/shared/src/constants/purchasing.ts`
- `packages/shared/src/index.ts` (added purchasing constants export)
- `apps/api/src/routes/purchasing/purchase-orders.ts`
- `apps/api/__test__/integration/purchasing/purchase-orders.test.ts`
- `_bmad-output/implementation-artifacts/stories/epic-46/story-46.3.completion.md`

### Modified
- `packages/db/src/kysely/schema.ts` — added PO tables + Suppliers + ExchangeRates interfaces
- `packages/shared/src/constants/roles.defaults.json` — ACL entries for purchasing.orders
- `apps/api/src/routes/purchasing/index.ts` — registered PO routes
- `apps/api/src/lib/test-fixtures.ts` — ACL seeding for purchasing.orders
- `apps/api/src/app.ts` — mounted `/api/purchasing`

## Open Issues

| Priority | Issue | Owner | Notes |
|----------|-------|-------|-------|
| P2 | FK constraints not added to DB | Future | Production DB type mismatch; app-layer only for now |
| P2 | currency_code not validated against known list | Future | Accept any 3-char code |

## Dependencies

- **Blocked by:** Story 46.2 (Exchange Rates) — ✅ done
- **Blocks:** Story 46.4 (Goods Receipt) — dependency satisfied (46.4 complete)

## Dev Notes

- Status ENUM→TINYINT migration was added mid-session after review surfaced project convention
- BigInt scaled arithmetic (scale-4) replaces all parseFloat in monetary paths
- ACL test fixtures use custom roles (not system roles) per ACL cleanup policy
- Integration tests use real DB via `.env`; no mock DB for DB-backed tests
