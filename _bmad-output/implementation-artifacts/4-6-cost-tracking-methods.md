# Story 4.6: Cost Tracking Methods

Status: ready-for-dev

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

- [ ] Task 1: Add schema for cost layers and summary state (AC: 1, 5, 6)
  - [ ] Add `inventory_cost_layers` (company-scoped, item-scoped, auditable inbound layers)
  - [ ] Add `inventory_item_costs` (company/item current method + rolling average cache)
  - [ ] Add portable rerunnable migration guards via `information_schema` (MySQL/MariaDB)
  - [ ] Add indexes for `(company_id, item_id, acquired_at, id)` and remaining qty scans
- [ ] Task 2: Implement costing engine abstraction and calculators (AC: 1, 2, 3, 4, 6)
  - [ ] Add `AVG | FIFO | LIFO` strategy interface under `apps/api/src/lib/`
  - [ ] Implement weighted AVG using deterministic minor-unit math
  - [ ] Implement FIFO/LIFO layer consumption with transactional row locking (`FOR UPDATE`)
  - [ ] Reject insufficient/negative inventory conditions with typed errors
- [ ] Task 3: Wire engine into inventory mutations (AC: 5, 6)
  - [ ] Inbound moves create cost layers with immutable unit cost + remaining qty
  - [ ] Outbound moves consume layers by configured method and persist consumption trace
  - [ ] Keep layer balances and summary table synchronized in one DB transaction
- [ ] Task 4: Integrate with Story 4.5 COGS posting path (AC: 7)
  - [ ] Replace simplified cost lookup path in `cogs-posting.ts` with method engine
  - [ ] Preserve COGS feature-gate behavior and fail-closed accounting invariants
  - [ ] Keep journal balancing and business-date semantics (`line_date = invoice/sale date`)
- [ ] Task 5: Add read endpoints/contracts for auditability (AC: 2, 5)
  - [ ] `GET /api/inventory/items/[itemId]/cost-layers`
  - [ ] `GET /api/inventory/items/[itemId]/current-cost`
  - [ ] Add/align shared Zod contracts in `packages/shared/src/schemas/`
- [ ] Task 6: Add comprehensive tests and regressions (AC: 1-7)
  - [ ] Unit tests per method with deterministic fixtures and rounding assertions
  - [ ] Integration tests: layer creation, partial consumption, and COGS-posting amount correctness
  - [ ] Concurrency tests for two simultaneous outbound operations on same item
  - [ ] Ensure DB test cleanup includes `closeDbPool()` hooks

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
