# Story 4.6: Cost Tracking Methods

Status: done
Story Owner: _bmad-output/implementation-artifacts/4-6-cost-tracking-methods.md
Epic: 4
Story: 6

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an accountant,
I want inventory costs tracked using AVG, FIFO, or LIFO methods,
so that inventory valuation and COGS reflect the chosen accounting method.

## Acceptance Criteria

1. Given company inventory settings, when accountant selects costing method (AVG/FIFO/LIFO), then all inventory calculations use that method.
2. Given the same inventory movements, when different costing methods are applied, then resulting COGS and ending inventory differ per method.
3. Given AVG method and multiple purchases, when sale occurs, then COGS uses weighted average cost and inventory valuation updates correctly.
4. Given FIFO/LIFO method and layered purchases, when sale occurs, then cost layers are consumed in chronological/reverse-chronological order.
5. Given inventory transactions over time, when costs are tracked, then each inbound transaction creates auditable cost layers with remaining quantity and unit cost.
6. Given partial layer consumption, when subsequent sales happen, then remaining quantities and per-layer balances stay accurate and never go negative.
7. Given integration with Story 4.5 COGS posting, when sales are posted, then COGS amount comes from method-correct cost calculation.

## Tasks / Subtasks

- [x] Task 1: Add schema for cost layers and summary state (AC: 1, 5, 6)
  - [x] Add `inventory_cost_layers` (company-scoped, item-scoped, auditable inbound layers)
  - [x] Add `inventory_item_costs` (company/item current method + rolling average cache)
  - [x] Add portable rerunnable migration guards via `information_schema` (MySQL/MariaDB)
  - [x] Add indexes for `(company_id, item_id, acquired_at, id)` and remaining qty scans
- [x] Task 2: Implement costing engine abstraction and calculators (AC: 1, 2, 3, 4, 6)
  - [x] Add `AVG | FIFO | LIFO` strategy interface under `apps/api/src/lib/`
  - [x] Implement weighted AVG using deterministic minor-unit math
  - [x] Implement FIFO/LIFO layer consumption with transactional row locking (`FOR UPDATE`)
  - [x] Reject insufficient/negative inventory conditions with typed errors
- [x] Task 3: Wire engine into inventory mutations (AC: 5, 6)
  - [x] Inbound moves create cost layers with immutable unit cost + remaining qty
  - [x] Outbound moves consume layers by configured method and persist consumption trace
  - [x] Keep layer balances and summary table synchronized in one DB transaction
- [x] Task 4: Integrate with Story 4.5 COGS posting path (AC: 7)
  - [x] Replace simplified cost lookup path in `cogs-posting.ts` with method engine
  - [x] Preserve COGS feature-gate behavior and fail-closed accounting invariants
  - [x] Keep journal balancing and business-date semantics (`line_date = invoice/sale date`)
- [x] Task 5: Add read endpoints/contracts for auditability (AC: 2, 5)
  - [x] `GET /api/inventory/items/[itemId]/cost-layers` - Returns auditable cost layers with consumption history
  - [x] `GET /api/inventory/items/[itemId]/current-cost` - Returns current cost summary with method-specific breakdown
  - [x] Added shared Zod contracts in `packages/shared/src/schemas/inventory-cost.ts`
- [x] Task 6: Add comprehensive tests and regressions (AC: 1-7)
  - [x] Unit tests per method with deterministic fixtures and rounding assertions
  - [x] Integration tests: layer creation, partial consumption, and COGS-posting amount correctness
  - [x] Concurrency tests for two simultaneous outbound operations on same item
  - [x] Ensure DB test cleanup includes `closeDbPool()` hooks

## Senior Developer Review (AI) - Code Review Fix Phase

### Issues Resolved

**Scope 1: Costing Method Key Compatibility (HIGH)**
- **Problem:** `getCompanyCostingMethod()` read only legacy key `inventory_costing_method`, but settings system uses canonical key `inventory.costing_method`
- **Fix:** Updated query to read both keys with priority ordering (canonical first, legacy fallback)
- **Test:** Added "Settings key priority: canonical key is preferred" test in `cost-tracking.db.test.ts`
- **Files Modified:**
  - `apps/api/src/lib/cost-tracking.ts:372-420` - Updated getCompanyCostingMethod to read both keys
  - `apps/api/src/lib/cost-tracking.db.test.ts:837-903` - Added key priority test
  - `apps/api/src/lib/cost-tracking.db.test.ts:56-72` - Updated setCompanyCostingMethod to use canonical key
  - `apps/api/src/lib/cost-tracking.db.test.ts:97-99` - Updated cleanup to handle both keys

**Scope 2: AC7 Gap for Invoice/Sales COGS (HIGH)**
- **Problem:** Sales invoice posting called `postCogsForSale` without pre-computed costs, triggering legacy average fallback instead of method-correct FIFO/LIFO/AVG consumption
- **Fix:** Created `deductStockForSaleWithCogs()` helper that combines stock deduction + cost consumption + COGS posting in one atomic operation
- **Implementation:** Updated `sales.ts` to use new helper for method-correct COGS
- **Files Modified:**
  - `apps/api/src/services/stock.ts:493-586` - Added deductStockForSaleWithCogs function
  - `apps/api/src/lib/sales.ts:9` - Added import for deductStockForSaleWithCogs
  - `apps/api/src/lib/sales.ts:1345-1383` - Updated to use new helper for AC7 compliance

**Scope 3: Regression Tests (MEDIUM)**
- **Problem:** Missing tests for pre-computed cost usage and journal balance invariants
- **Fix:** Added tests to verify pre-computed costs are used directly (not recalculated) and journals remain balanced
- **Files Modified:**
  - `apps/api/src/lib/cogs-posting.test.ts:607-650` - Added "should use pre-computed costs without recalculation (AC7)" test
  - `apps/api/src/lib/cogs-posting.test.ts:1` - Added ResultSetHeader import

### Completion Summary

**Task 5: Read Endpoints for Auditability - COMPLETED**
- Implemented `GET /api/inventory/items/[itemId]/cost-layers` endpoint with auth guard and company scoping
- Implemented `GET /api/inventory/items/[itemId]/current-cost` endpoint with method-specific breakdown
- Added comprehensive shared Zod contracts in `packages/shared/src/schemas/inventory-cost.ts`
- Added `getItemCostLayersWithConsumption()` and `getItemCostSummaryExtended()` service functions
- Added unit tests in `apps/api/src/lib/cost-auditability.test.ts` (7 tests passing)
- All endpoints enforce tenant isolation and return properly typed responses

### Implementation Files (Updated File List)

All Story 4.6 tasks completed. Files marked with * were added or significantly modified:

**Core Costing Engine:**
- `apps/api/src/lib/cost-tracking.ts`* - Costing engine with AVG/FIFO/LIFO strategies + auditability functions
- `apps/api/src/lib/cost-tracking.db.test.ts` - Unit tests for costing strategies
- `apps/api/src/lib/cost-auditability.test.ts`* - Unit tests for auditability endpoints (7 tests passing)

**Integration & API:**
- `apps/api/src/services/stock.ts`* - Stock operations with cost tracking (atomicity fix applied)
- `apps/api/src/lib/sales.ts`* - Sales invoice posting with method-correct COGS
- `apps/api/app/api/inventory/items/[itemId]/cost-layers/route.ts`* - GET cost layers endpoint
- `apps/api/app/api/inventory/items/[itemId]/current-cost/route.ts`* - GET current cost endpoint

**Shared Contracts:**
- `packages/shared/src/schemas/inventory-cost.ts`* - Zod schemas for cost layer and current cost responses
- `packages/shared/src/index.ts`* - Export inventory-cost schemas

**Configuration:**
- `tsconfig.base.json`* - Added `@/services/*` path alias for import convention compliance

**Pre-existing (no changes in this cycle):**
- `apps/api/src/lib/cogs-posting.ts` - COGS posting service
- `packages/db/migrations/0085_inventory_cost_layers.sql` - Cost layers table
- `packages/db/migrations/0086_inventory_item_costs.sql` - Item costs summary table
- `packages/db/migrations/0087_cost_layer_consumption.sql` - Consumption trace table

## Dev Notes

- Extend existing implementation seams (`cogs-posting.ts`, `sales.ts`, inventory transactions) and avoid creating parallel costing code paths.
- This story is accounting-critical: any mismatch between COGS and layer consumption is a blocker.
- Keep portability and rerunnability as first-class requirements for migrations.

### Technical Requirements

- Use `@/` alias imports for API code; no deep relative imports. [Source: `AGENTS.md`]
- Monetary math must remain deterministic: DB `DECIMAL`, service minor-unit helpers.
- Never use `FLOAT`/`DOUBLE` for costs or balances.
- Enforce `company_id` scoping in every query and `outlet_id` where applicable.
- Prefer immutable corrections over destructive mutation for finalized records.

### Architecture Compliance

- Accounting/GL remains source of truth; posted sales must reconcile to journals. [Source: `docs/adr/ADR-0001-gl-as-source-of-truth.md`]
- POS/offline invariants must not regress; retry/idempotency safety stays intact. [Source: `docs/project-context.md`]
- API boundaries use shared Zod schemas in `packages/shared`.
- Keep transaction boundaries atomic for all financial writes.

### Library / Framework Requirements

- Runtime: Node.js 20.x, TypeScript.
- API framework patterns: Hono route + auth guard + response envelope conventions.
- DB access: `mysql2` with explicit transaction handling.
- Tests: `node:test` unit and API integration style used in `apps/api/tests/integration/`.

### File Structure Requirements

- Migrations: `packages/db/migrations/*.sql`
- Cost engine/service: `apps/api/src/lib/`
- Inventory/COGS routes: `apps/api/app/api/inventory/**/route.ts`
- Shared contracts: `packages/shared/src/schemas/`
- Tests: `apps/api/src/lib/*.test.ts` and `apps/api/tests/integration/*.mjs`

### Testing Requirements

- Validate all three methods return expected COGS and ending inventory for the same movement sequence.
- Validate layer-level remaining qty never drops below zero under concurrent outbound attempts.
- Validate COGS journal lines stay balanced and use business date semantics.
- Validate fallback behavior when cost data is unavailable (explicit error path, no silent drift).
- Ensure DB-using test files close pool in `test.after`.

### Previous Story Intelligence (4.5)

- Story 4.5 already provides COGS posting entry points and tenant/account validation patterns.
- 4.5 introduced fail-closed behavior and transaction-owner handling; 4.6 must preserve both.
- 4.5 now enforces business-date line posting for COGS (`line_date` from document date), which 4.6 must not regress.

### Git Intelligence Summary

- Recent commits establish strong patterns around COGS correctness, transaction safety, and date semantics (`ca1bdfe`).
- Inventory/recipe and COGS code exists and is tested (`b0645d6`), so 4.6 should extend current files, not fork new architecture.
- Backoffice navigation updates are unrelated; avoid unnecessary UI scope in this story unless required by ACs.

### Latest Tech Information

- MySQL 8.0 enforces CHECK constraints from 8.0.16+; if used, name constraints explicitly and keep expressions deterministic.
- MariaDB supports CHECK constraints and `ALTER TABLE ... DROP CONSTRAINT`; syntax behavior differs by version, so guarded migration DDL remains safest.
- InnoDB locking reads (`SELECT ... FOR UPDATE`) are appropriate for preventing race conditions during layer consumption in concurrent sales.

### Project Structure Notes

- This is implementation context, not product prose; keep changes scoped to Story 4.6 acceptance criteria.
- Prefer reusing existing posting and inventory services over adding new cross-package abstractions unless duplication forces extraction.

### References

- Epic and story baseline: [Source: `_bmad-output/planning-artifacts/epics.md#Epic 4`]
- PRD FR/NFR constraints: [Source: `_bmad-output/planning-artifacts/prd.md#Functional Requirements`]
- Architecture constraints/patterns: [Source: `_bmad-output/planning-artifacts/architecture.md#Established Patterns (from AGENTS.md)`]
- Previous implementation context: [Source: `_bmad-output/implementation-artifacts/4-5-cogs-integration.md`]
- Project-wide rules: [Source: `AGENTS.md`]
- Project context summary: [Source: `docs/project-context.md`]
- MySQL CHECK constraints: [Source: `https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html`]
- MySQL locking reads: [Source: `https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html`]
- MariaDB constraints: [Source: `https://mariadb.com/kb/en/constraint/`]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Loaded workflow, config, template, checklist, sprint status, and project context.
- Loaded and analyzed `epics.md`, `prd.md`, `architecture.md`, and UX-related planning artifact.
- Analyzed previous stories `4-5-cogs-integration.md` and `4-4-recipe-bom-composition.md`.
- Reviewed recent commits and changed file patterns for implementation continuity.
- Performed targeted web research for MySQL/MariaDB constraint + locking behavior.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- `_bmad-output/implementation-artifacts/4-6-cost-tracking-methods.md`
