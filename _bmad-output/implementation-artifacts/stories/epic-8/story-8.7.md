# Story 8.7: Variant Stock Tracking

**Status:** done

## Story

As a **store manager**,
I want stock levels tracked per variant (not just per item),
So that I can accurately monitor inventory levels for each size, color, or configuration of an item.

---

## Context

Epic 8 extends the POS and sync system to support variant-level operations. Story 8.7 introduces variant-level stock tracking so that each variant maintains its own stock balance, distinct from the parent item's aggregate stock.

**Dependencies:** Stories 8.5 (variant price sync) and 8.6 (variant selection at POS) must be complete.

---

## Acceptance Criteria

**AC1: Variant Stock Records**
Each variant has an independent stock record scoped to `(company_id, outlet_id, variant_id)`.

**AC2: Stock Deduction on Sale**
When a POS sale includes a variant line item, the corresponding variant's stock is deducted.

**AC3: Stock Levels in Sync Pull**
Variant stock levels are included in the POS sync pull response so offline devices have current stock data.

**AC4: Integration Tests**
Integration tests verify stock deduction per variant and verify no cross-contamination between variants of the same item.

---

## Dev Notes

_Created retroactively — implementation completed as part of Epic 8 execution._
