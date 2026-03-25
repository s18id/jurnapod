<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# ADR-0002: Item Types Taxonomy

**Status:** Accepted
**Date:** 2026-03-25
**Deciders:** Ahmad Faruk (Signal18 ID)

---

## Context

Jurnapod supports multiple business types — cafes, restaurants, service businesses — where the nature of "things sold" varies significantly. A coffee shop sells physical drinks (consumed on-site), uses raw ingredients (beans, milk), follows recipes, and may offer services (delivery, table service). An accounting or service firm sells only non-tangible services.

We needed a taxonomy that:

1. Covers all item forms without forcing every business to use inventory.
2. Keeps stock tracking optional but explicit — no implicit behavior based on category names.
3. Works cleanly at the POS sync boundary (offline-first) and the GL posting layer.
4. Supports Bill of Materials (BOM) for recipe costing without conflating templates with sellable goods.

---

## Decision

Four item types are defined and enforced via a `type` column (`ENUM` in the database, `z.enum` in shared Zod schemas):

| Type | Purpose | Stock Tracked | Sellable at POS |
|------|---------|:---:|:---:|
| `SERVICE` | Non-tangible offerings (labor, delivery, table charges) | Never | Yes |
| `PRODUCT` | Finished goods for sale (drinks, pastries, packaged goods) | Optional | Yes |
| `INGREDIENT` | Raw materials consumed in production | Yes (when inventory enabled) | No |
| `RECIPE` | Bill of Materials template used for costing and production | Never | No |

### Type Semantics

**SERVICE**
- Cannot carry stock at any inventory level.
- Revenue posts to a service revenue account (configurable via account mapping).
- Typical uses: delivery fee, corkage, labor charge, table service fee.

**PRODUCT**
- May carry stock when the `inventory` module is enabled at level 1+.
- Without the inventory module, stock tracking is disabled (field ignored).
- Revenue posts to a product revenue account.
- Typical uses: bottled drinks, pastries, packaged retail goods.

**INGREDIENT**
- Always tracked when inventory is enabled; never sold directly at POS.
- Consumed via recipe deduction on POS transaction posting.
- COGS posts via the ingredient's cost layer (FIFO-based, see Epic 4.6).
- Typical uses: coffee beans, fresh milk, sugar, flour.

**RECIPE**
- Pure template — no stock, no direct sale, no GL effect on its own.
- Defines the BOM (ingredient quantities and yield) for a finished PRODUCT.
- COGS resolution for a PRODUCT with an attached RECIPE uses cost-basis-first resolution: the recipe cost becomes the product's effective cost.
- Typical uses: "Latte recipe" (defines: espresso shot × 2, milk × 200ml, cup × 1).

---

## Inventory Level Gate

Stock tracking for `PRODUCT` is gated on the company's active inventory level:

| Inventory Level | PRODUCT stock tracked | INGREDIENT stock tracked |
|---|:---:|:---:|
| 0 (disabled) | No | No |
| 1+ (enabled) | Yes | Yes |

This gate is evaluated at sync pull and at GL posting time — not at item creation time.

---

## Alternatives Considered

### Single `is_stockable` flag

Rejected. A boolean flag cannot express the difference between an ingredient that must always be tracked (when inventory is enabled) and a product that optionally tracks stock. It also cannot capture the recipe-as-template concept.

### Free-form category with stock override

Rejected. Relying on business-defined categories to drive stock behavior creates brittle rules that vary between tenants. The enum makes behavior predictable and enforceable at the API and database layers.

### Separate `BUNDLE` type for composed products

Deferred. Multi-component bundles (combo meals) can be modeled as a PRODUCT with an attached RECIPE. A dedicated BUNDLE type may be introduced if distinct GL or POS behavior is needed in a future epic.

---

## Consequences

### Positive

- Stock behavior is deterministic: type + inventory level → clear behavior, no hidden flags.
- POS sync payload is unambiguous: `INGREDIENT` and `RECIPE` items are never included in the sellable catalog sync.
- COGS resolution is explicit: PRODUCT with RECIPE uses cost-basis-first; PRODUCT without RECIPE uses direct cost layer.
- Enforced at schema level (`ENUM` constraint), shared Zod schema, and API validation.

### Negative / Trade-offs

- Adding a fifth type requires a schema migration and shared contract update across all apps.
- Items cannot change type after creation (type is part of the financial audit trail). Type corrections require void + recreate.

---

## References

- [Architecture — Item Types Taxonomy](../ARCHITECTURE.md#item-types-taxonomy)
- Epic 4.3: Multiple item types (DISCOVERED — implemented before BMAD tracking)
- Epic 4.4: Recipe/BOM composition
- Epic 4.5: COGS integration
- Epic 4.6: Cost tracking methods (FIFO cost layers)
