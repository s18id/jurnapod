<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Story 4.7 Item Variants Implementation Plan

**Status:** Draft  
**Date:** 2026-03-18  
**Story:** `_bmad-output/implementation-artifacts/4-7-item-variants.md`

## Summary

Implement full end-to-end item variant support for catalog, API, sync, POS offline runtime, and stock flow. The implementation must preserve accounting integrity, POS idempotency, and strict tenant isolation.

## Goals

- Support variant attributes (for example size/color) and automatic variant combination generation.
- Support per-variant SKU, stock, optional barcode, and optional price override.
- Support parent-price inheritance with explicit reset to inherit.
- Expose variant management APIs and integrate with backoffice and POS flows.
- Keep sync idempotent (`client_tx_id`) while differentiating line identity by `variant_id`.

## Non-Goals

- Reworking GL posting architecture.
- Replacing existing item-level data model outside required variant extensions.
- Full barcode feature set beyond optional variant barcode field (Story 4.8 owns broader scope).

## Constraints and Guardrails

- Use MySQL/MariaDB compatible rerunnable migrations (guarded DDL via `information_schema` + dynamic SQL).
- Keep `company_id` scoping in all reads/writes and outlet access checks where relevant.
- Keep accounting/GL correctness and existing journal linkage behavior unchanged.
- Preserve offline-first guarantees and sync replay behavior.
- Use shared contracts in `packages/shared`; avoid drift between API and POS payload schemas.

## Implementation Phases

### Phase 1: Database Schema and Migration

1. Add variant tables:
   - `item_variant_attributes`
   - `item_variant_attribute_values`
   - `item_variants`
   - `item_variant_combinations`
2. Add indexes and unique constraints:
   - unique `(company_id, sku)` for `item_variants`
   - lookup indexes by `(company_id, item_id)` and active flag
3. Follow migration pattern used in:
   - `packages/db/migrations/0085_inventory_cost_layers.sql`
   - `packages/db/migrations/0086_inventory_item_costs.sql`
   - `packages/db/migrations/0087_cost_layer_consumption.sql`

### Phase 2: Shared Contracts

1. Extend/add schemas in:
   - `packages/shared/src/schemas/master-data.ts`
   - `packages/shared/src/schemas/pos-sync.ts`
2. Export all new schemas from:
   - `packages/shared/src/index.ts`
3. Add optional `variant_id` to POS sync transaction item shapes and related line structures.

### Phase 3: API Service and Endpoints

1. Create service:
   - `apps/api/src/lib/item-variants.ts`
2. Add routes:
   - `apps/api/app/api/inventory/items/[itemId]/variant-attributes/route.ts` (GET/POST)
   - `apps/api/app/api/inventory/variant-attributes/[attributeId]/route.ts` (PATCH/DELETE)
   - `apps/api/app/api/inventory/items/[itemId]/variants/route.ts` (GET)
   - `apps/api/app/api/inventory/variants/[variantId]/route.ts` (PATCH)
   - `apps/api/app/api/inventory/variants/[variantId]/stock-adjustment/route.ts` (POST)
3. Service capabilities:
   - generate variant combinations from attribute values
   - generate default SKU suffixes and validate uniqueness
   - handle custom SKU updates with uniqueness checks
   - effective price resolution: `price_override` or parent price
   - deactivate/archive behavior without destroying history

### Phase 4: Sync and Idempotency Integration

1. Update sync push logic in:
   - `apps/api/app/api/sync/push/route.ts`
2. Ensure canonical idempotency hash and replay comparison include variant identity.
3. Ensure duplicate detection does not collapse different variants of same parent item.

### Phase 5: POS Runtime and Offline DB

1. Update POS cart and runtime:
   - `apps/pos/src/features/cart/useCart.ts`
   - `apps/pos/src/services/runtime-service.ts`
2. Update offline-db types/indexes:
   - `packages/offline-db/dexie/types.ts`
   - `packages/offline-db/dexie/db.ts`
3. Replace line keys that currently collide on `order_id + item_id` so multiple variants of same item can coexist in one order.

### Phase 6: Backoffice Variant Management UI

1. Create variant management UI components under `apps/backoffice/src/features/`.
2. Integrate with items page for variant management entry point.
3. Support:
   - attribute/value editing
   - generated variant grid
   - SKU edit, price override/reset, stock edit, barcode edit, active toggle

### Phase 7: Testing and Verification

1. Unit tests:
   - combination generation
   - SKU generation/uniqueness
   - effective price inheritance/reset
2. API/integration tests:
   - tenant scoping and outlet access
   - variant CRUD and stock adjustment
   - sync replay/idempotency with `variant_id`
3. POS/offline tests:
   - line-key uniqueness with same parent item and different variants
4. Ensure DB-backed test files include pool cleanup hook:
   - `test.after(async () => { await closeDbPool(); })`

## Risks and Mitigations

- **Risk:** Sync replay mismatch after schema change  
  **Mitigation:** Add regression tests around canonical hash + replay comparison before/after `variant_id`.
- **Risk:** Offline line overwrite for same item different variant  
  **Mitigation:** update key/index strategy and add collision regression tests.
- **Risk:** Stock/COGS inconsistency if variant and item logic diverge  
  **Mitigation:** keep stock mutation path explicit and covered by integration tests that verify downstream posting expectations.

## Definition of Done Checklist

- Variant schema migration is rerunnable on MySQL and MariaDB.
- API endpoints implemented with auth, validation, and tenant scoping.
- POS and sync payloads support `variant_id` without idempotency regressions.
- Backoffice can manage attributes and variants end-to-end.
- Tests added and passing for unit + integration + sync critical paths.
- Story file remains `ready-for-dev` until implementation starts, then transitions per workflow.

## References

- `_bmad-output/implementation-artifacts/4-7-item-variants.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `apps/api/app/api/sync/push/route.ts`
- `packages/shared/src/schemas/pos-sync.ts`
- `packages/shared/src/schemas/master-data.ts`
- `apps/pos/src/features/cart/useCart.ts`
- `packages/offline-db/dexie/db.ts`
