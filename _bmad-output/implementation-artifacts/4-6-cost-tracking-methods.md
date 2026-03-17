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

- [ ] Task 1: Add cost-layer schema and migration guardrails (AC: 1, 5, 6)
  - [ ] Create `inventory_cost_layers` table without DB enum (use varchar/int code for layer type)
  - [ ] Create `inventory_item_costs` summary table for fast AVG lookups
  - [ ] Add MySQL/MariaDB-safe rerunnable DDL using `information_schema` checks
  - [ ] Add indexes for `(company_id, item_id, acquired_at)` and remaining-quantity lookups
- [ ] Task 2: Implement costing engine in API service layer (AC: 1, 2, 3, 4, 6)
  - [ ] Create calculator abstraction for `AVG | FIFO | LIFO`
  - [ ] Implement weighted AVG computation from inbound layers/summary table
  - [ ] Implement FIFO and LIFO layer consumption with transactional updates
  - [ ] Enforce no negative remaining quantity at layer level
- [ ] Task 3: Integrate cost updates with inventory mutations (AC: 5, 6)
  - [ ] On purchase/receiving or positive adjustment: create inbound cost layer
  - [ ] On negative adjustment/sale: consume layers according to active method
  - [ ] Recalculate/update summary cost table after each relevant mutation
- [ ] Task 4: Wire Story 4.5 COGS path to method-correct calculator (AC: 7)
  - [ ] Replace placeholder/simple cost fallback path in COGS service with calculator
  - [ ] Keep COGS feature-gated behavior: skip when disabled, non-blocking
  - [ ] Preserve journal balancing and tenant scoping invariants
- [ ] Task 5: Add API read endpoints for transparency and debugging (AC: 2, 5)
  - [ ] `GET /inventory/items/[itemId]/cost-layers`
  - [ ] `GET /inventory/items/[itemId]/current-cost`
  - [ ] Validate auth, company/outlet access, and response contracts
- [ ] Task 6: Add tests and regression coverage (AC: 1-7)
  - [ ] Unit tests per method (AVG/FIFO/LIFO) with deterministic fixtures
  - [ ] Integration tests for layer creation/consumption and COGS posting amount
  - [ ] Edge cases: insufficient inventory, zero-cost rows, concurrent sales
  - [ ] Ensure DB pool cleanup in all DB-using test files

## Dev Notes

- Build on existing Story 4.5 foundation; do not create parallel costing logic in multiple places.
- Money and cost precision must remain deterministic (`DECIMAL` in DB, minor-unit-safe math in service).
- Keep accounting invariant: COGS postings must reconcile with journal totals.
- Keep POS/sales resilience invariant: if COGS path fails, revenue posting should remain non-blocking where feature-gated behavior requires.

### Technical Requirements

- Use `@/` import aliases in API code (no deep relative `../../` imports). [Source: `AGENTS.md` Import path conventions]
- Avoid DB `ENUM` for new schema additions; represent method/type using `VARCHAR` or integer code.
- Migrations must be rerunnable and portable for MySQL 8.0+ and MariaDB (non-atomic DDL safe).
- No `FLOAT/DOUBLE` for monetary/cost fields.
- All write paths must enforce `company_id`; enforce `outlet_id` where relevant.

### Architecture Compliance

- Accounting/GL stays source of truth for financial effects. [Source: `docs/adr/ADR-0001-gl-as-source-of-truth.md`]
- POS/sales offline and retry safety must not regress due to costing changes. [Source: `docs/project-context.md`]
- Shared contracts go through `packages/shared/src/schemas/*` for API boundaries.
- COGS remains feature-gated (optional) per inventory module config.

### Library / Framework Requirements

- Runtime and language: Node.js 20.x + TypeScript.
- DB access: existing `mysql2` transaction patterns in `apps/api/src/lib/*`.
- Validation: Zod schemas in `packages/shared` and route-level parse.
- Keep existing test stack (`node:test`, API integration style in repo).

### File Structure Requirements

- DB migrations: `packages/db/migrations/*.sql`
- Cost service implementation: `apps/api/src/lib/` (follow `cogs-posting.ts` and `recipe-composition.ts` structure)
- Routes: `apps/api/app/api/inventory/**/route.ts`
- Shared contracts: `packages/shared/src/schemas/`
- Backoffice display hooks/components only if required by ACs; avoid unnecessary UI churn in this story.

### Testing Requirements

- Unit tests for calculator methods with table-driven scenarios.
- Integration tests around posting boundary (sales -> COGS amount correctness).
- Validate idempotent behavior for retried operations where applicable.
- Ensure every DB-using test file closes pool:
  - `test.after(async () => { await closeDbPool(); });`

### Previous Story Intelligence (4.5)

- Story 4.5 already introduced `cogs-posting.ts` and sales integration hook points; reuse those extension seams.
- Current system has feature-gated COGS behavior in sales posting path; keep optional behavior intact.
- Existing COGS implementation and tests surfaced schema-contract mismatch risks; align migrations first, then code.

### Git Intelligence Summary

- Recent commits show active refactoring in items/prices and heavy API typing cleanup; maintain established patterns rather than introducing new architectural style.
- Test hygiene fixes were recently needed in integration tests; prioritize deterministic cleanup and fixture isolation.

### Latest Tech Information

- MySQL CHECK constraints are enforced from MySQL 8.0.16+; name constraints explicitly for maintainability. [Source: MySQL 8.0 manual: CHECK Constraints]
- MariaDB supports CHECK constraints and allows `ALTER TABLE ... DROP CONSTRAINT`; syntax differs from MySQL in some versions, so guarded dynamic DDL remains safest. [Source: MariaDB KB: CONSTRAINT / CHECK]

### Project Structure Notes

- Existing repo has both planning and implementation artifacts; this file is implementation-ready context, not product spec prose.
- Costing implementation should avoid adding duplicate domain modules unless required; prefer extending current API lib + shared contract flow first.

### References

- Epic baseline and FR mapping: [Source: `_bmad-output/planning-artifacts/epics.md#Epic 4`]
- Product requirements and NFRs: [Source: `_bmad-output/planning-artifacts/prd.md#Functional Requirements`]
- Architecture constraints and stack: [Source: `_bmad-output/planning-artifacts/architecture.md#Established Patterns`]
- Previous story learnings: [Source: `_bmad-output/implementation-artifacts/4-5-cogs-integration.md`]
- Repo operational guardrails: [Source: `AGENTS.md`]
- Project context summary: [Source: `docs/project-context.md`]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Loaded and analyzed: config, sprint status, template, checklist, epics/prd/architecture, project-context, Story 4.5, existing Story 4.6 draft.
- Reviewed recent git commits and touched files for implementation pattern continuity.
- Added latest MySQL/MariaDB CHECK constraint references to migration guardrails.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story reshaped from high-level draft into implementation-ready blueprint with explicit guardrails.

### File List

- `_bmad-output/implementation-artifacts/4-6-cost-tracking-methods.md`
